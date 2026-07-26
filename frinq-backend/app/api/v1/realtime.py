"""WebSocket ticket issuance + the community realtime chat WebSocket route.

POST /community/ws-ticket — authenticated, mints a single-use 60s ticket.
WS   /ws/community?ticket=<ticket> — the ticket is the only credential;
access/refresh tokens never appear in the URL.

CORS middleware does not protect WebSocket handshakes, so Origin is
validated manually here before the ticket is even consumed — allowing a
same-host or explicitly-allowlisted Origin (never a raw "browser-only"
assumption; see community_websocket's own comment for why).
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.api.deps import CurrentAccount, get_pool, require_current_legal
from app.config import settings
from app.core import metrics
from app.core.communities import get_user_community
from app.core.moderation import blocked_terms_from_settings
from app.core.rate_limit import RateLimitUnavailable, check_rate_limit
from app.core.realtime import (
    ACTIVITY_TIMEOUT_SECONDS,
    CLOSE_FORBIDDEN,
    CLOSE_INVALID_TICKET,
    CLOSE_MALFORMED_FRAME,
    MAX_INBOUND_FRAME_BYTES,
    PING_INTERVAL_SECONDS,
    ConnectionManager,
    LocalConnection,
    consume_ticket,
    create_ticket,
    persist_before_publish,
    server_ready_frame,
)
from app.core.redis_client import get_pubsub_redis, get_redis
from app.database import get_pool as get_db_pool
from app.schemas.realtime import WsTicketResponse
from app.utils.logger import logger
from app.workers.queue import enqueue_community_push

router = APIRouter(tags=["realtime"])

_manager: ConnectionManager | None = None
_manager_lock = asyncio.Lock()


async def get_connection_manager() -> ConnectionManager | None:
    """Lazily-created per-process singleton — None if Redis is unreachable.

    Uses get_pubsub_redis() (no socket read-timeout), not get_redis() — the
    manager's whole job is long-lived `listen()` subscriptions that block
    waiting for the next message, which the regular fast-command client's
    short socket_timeout would kill the moment traffic goes quiet."""
    global _manager
    if _manager is not None:
        return _manager
    async with _manager_lock:
        if _manager is None:
            redis = await get_pubsub_redis()
            if redis is None:
                return None
            manager = ConnectionManager(redis, get_db_pool)
            await manager.start()
            _manager = manager
    return _manager


async def shutdown_realtime() -> None:
    """Stop the connection manager's background pub/sub listener tasks —
    called from app.main's lifespan shutdown."""
    global _manager
    if _manager is not None:
        await _manager.stop()
        _manager = None


def _allowed_origins() -> set[str]:
    return {o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()}


@router.post("/community/ws-ticket", response_model=WsTicketResponse)
async def issue_ws_ticket(
    account: CurrentAccount = Depends(require_current_legal),
    pool: asyncpg.Pool = Depends(get_pool),
) -> WsTicketResponse:
    if account.community_slug is None:
        raise HTTPException(status_code=404, detail="no community assigned yet")

    redis = await get_redis()
    try:
        limit_result = await check_rate_limit("ws_ticket", str(account.id), redis)
    except RateLimitUnavailable:
        raise HTTPException(status_code=503, detail="realtime service unavailable")
    if not limit_result.allowed:
        raise HTTPException(
            status_code=429,
            detail="too many ticket requests",
            headers={"Retry-After": str(limit_result.retry_after)},
        )

    ticket = await create_ticket(
        redis, user_id=account.id, community_slug=account.community_slug, session_id=account.session_id
    )
    return WsTicketResponse(ticket=ticket)


@router.websocket("/ws/community")
async def community_websocket(websocket: WebSocket, ticket: str = Query(...)) -> None:
    # Origin's real purpose here is catching a malicious THIRD-PARTY web page
    # embedding JS that opens a cross-origin WS to us with a stolen ticket —
    # that page's Origin would differ from both our host and the allowlist.
    # It does NOT reliably signal "browser vs native": confirmed via a real
    # Android device test that React Native's OkHttp-based WebSocket client
    # sends an Origin header too, defaulted to the target's own scheme+host
    # (e.g. "http://10.0.2.2:8000" when connecting to that same host) — not
    # "no origin" as a naive browser-only assumption would expect, and not
    # any web frontend's real origin either. So: allow when Origin is same-
    # host as this request (covers both that native-client quirk AND a
    # legitimate same-origin browser page) or explicitly allowlisted (a
    # legitimate cross-origin web frontend on a different host); reject only
    # a genuine cross-origin mismatch.
    origin = websocket.headers.get("origin")
    if origin is not None:
        origin_host = urlparse(origin).netloc
        request_host = websocket.headers.get("host", "")
        if origin_host != request_host and origin not in _allowed_origins():
            await websocket.close(code=CLOSE_FORBIDDEN)
            return

    # Best-effort — behind a reverse proxy terminating TLS, uvicorn only
    # sees "wss" here if --proxy-headers/X-Forwarded-Proto is configured to
    # rewrite the scope. Documented limitation, not a code gap.
    if settings.APP_ENV == "production" and websocket.url.scheme != "wss":
        await websocket.close(code=CLOSE_FORBIDDEN)
        return

    redis = await get_redis()
    if redis is None:
        await websocket.close(code=1011)
        return

    payload = await consume_ticket(redis, ticket)
    if payload is None:
        await websocket.close(code=CLOSE_INVALID_TICKET)
        return

    try:
        pool = get_db_pool()
    except RuntimeError:
        await websocket.close(code=1011)
        return

    async with pool.acquire() as conn:
        session_row = await conn.fetchrow(
            "SELECT * FROM user_sessions WHERE id = $1", payload.session_id
        )
        if session_row is None or session_row["revoked_at"] is not None:
            await websocket.close(code=CLOSE_INVALID_TICKET)
            return
        if session_row["user_id"] != payload.user_id:
            # Defense in depth, same as deps.py's get_current_account — sid
            # and user_id are minted together and never expected to
            # diverge, but never trust one without the other.
            await websocket.close(code=CLOSE_INVALID_TICKET)
            return
        expires_at = session_row["expires_at"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(tz=timezone.utc):
            await websocket.close(code=CLOSE_INVALID_TICKET)
            return

        user_row = await conn.fetchrow(
            "SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL", payload.user_id
        )
        if user_row is None or user_row["banned"]:
            await websocket.close(code=CLOSE_FORBIDDEN)
            return
        suspended_until = user_row["suspended_until"]
        if suspended_until is not None:
            su = suspended_until if suspended_until.tzinfo else suspended_until.replace(tzinfo=timezone.utc)
            if su > datetime.now(tz=timezone.utc):
                await websocket.close(code=CLOSE_FORBIDDEN)
                return

        # Ticket issuance already required current acceptance, but a new
        # legal version could have gone into effect in the seconds since —
        # the handshake itself rechecks, per the plan's explicit requirement.
        if (
            user_row["terms_version"] != settings.CURRENT_TERMS_VERSION
            or user_row["privacy_version"] != settings.CURRENT_PRIVACY_VERSION
        ):
            await websocket.close(code=CLOSE_FORBIDDEN)
            return

        membership = await get_user_community(conn, payload.user_id)
        if membership is None or membership.archetype_slug != payload.community_slug:
            await websocket.close(code=CLOSE_INVALID_TICKET)
            return

    manager = await get_connection_manager()
    if manager is None:
        await websocket.close(code=1011)
        return

    await websocket.accept()
    conn_state = LocalConnection(user_id=payload.user_id, community_slug=payload.community_slug)
    manager.register(conn_state)
    metrics.active_websockets.inc()
    logger.info("realtime.connected", user_id=str(payload.user_id), community_slug=payload.community_slug)

    try:
        await websocket.send_json(server_ready_frame(payload.community_slug))
        reader = asyncio.create_task(_reader_loop(websocket, conn_state, pool, redis, manager))
        sender = asyncio.create_task(_sender_loop(websocket, conn_state))
        _done, pending = await asyncio.wait({reader, sender}, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        # Await the cancelled peer so it isn't "destroyed while pending", and
        # retrieve the finished task's exception so a non-disconnect error
        # (e.g. send_json on a half-closed socket) is logged here instead of
        # surfacing as an untracked "task exception was never retrieved".
        await asyncio.gather(*pending, return_exceptions=True)
        for t in _done:
            exc = t.exception()
            if exc is not None and not isinstance(exc, WebSocketDisconnect):
                logger.warning(
                    "realtime.task_error",
                    user_id=str(payload.user_id),
                    error_type=type(exc).__name__,
                )
    except WebSocketDisconnect:
        pass
    finally:
        manager.unregister(conn_state)
        metrics.active_websockets.dec()
        logger.info("realtime.disconnected", user_id=str(payload.user_id))


async def _reader_loop(
    websocket: WebSocket, conn_state: LocalConnection, pool: asyncpg.Pool, redis: object,
    manager: ConnectionManager,
) -> None:
    last_activity = time.monotonic()
    try:
        while True:
            if conn_state.banned:
                await websocket.close(code=CLOSE_FORBIDDEN)
                return
            if conn_state.overflowed:
                await websocket.close(code=1013)  # try again later
                return
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=PING_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                if time.monotonic() - last_activity > ACTIVITY_TIMEOUT_SECONDS:
                    await websocket.close(code=1000)
                    return
                await websocket.send_json({"type": "ping"})
                continue

            last_activity = time.monotonic()
            if len(raw.encode("utf-8")) > MAX_INBOUND_FRAME_BYTES:
                logger.warning("realtime.frame_too_large", user_id=str(conn_state.user_id))
                await websocket.close(code=CLOSE_MALFORMED_FRAME)
                return
            try:
                data = json.loads(raw)
                frame_type = data.get("type")
            except (ValueError, AttributeError):
                logger.warning("realtime.malformed_frame", user_id=str(conn_state.user_id))
                await websocket.close(code=CLOSE_MALFORMED_FRAME)
                return

            if frame_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif frame_type == "message.send":
                try:
                    client_message_id = UUID(str(data["client_message_id"]))
                    body = str(data["body"])
                except (KeyError, ValueError):
                    logger.warning("realtime.malformed_frame", user_id=str(conn_state.user_id))
                    await websocket.close(code=CLOSE_MALFORMED_FRAME)
                    return
                result = await persist_before_publish(
                    pool, redis,
                    community_slug=conn_state.community_slug,
                    author_id=conn_state.user_id,
                    client_message_id=client_message_id,
                    body=body,
                    blocked_terms=blocked_terms_from_settings(),
                )
                if not result.accepted:
                    await websocket.send_json({
                        "type": "message.rejected",
                        "client_message_id": str(client_message_id),
                        "code": result.code,
                        "retry_after": result.retry_after,
                    })
                else:
                    # Best-effort, never awaited for its result — a push
                    # provider hiccup must never affect this WS response.
                    # exclude_user_ids is a snapshot at send time; a
                    # recipient connecting a moment later just gets a push
                    # too, an accepted race given push is inherently
                    # best-effort.
                    active = manager.connected_user_ids(conn_state.community_slug)
                    await enqueue_community_push(conn_state.community_slug, conn_state.user_id, active)
            else:
                logger.warning("realtime.unknown_frame_type", user_id=str(conn_state.user_id), frame_type=frame_type)
                await websocket.close(code=CLOSE_MALFORMED_FRAME)
                return
    except WebSocketDisconnect:
        return


async def _sender_loop(websocket: WebSocket, conn_state: LocalConnection) -> None:
    try:
        while True:
            envelope = await conn_state.queue.get()
            await websocket.send_json(envelope)
    except WebSocketDisconnect:
        return

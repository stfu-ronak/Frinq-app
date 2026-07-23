"""WebSocket ticket issuance/consumption, message persist-before-publish,
and the local connection manager for Redis-pub/sub-backed community chat.

Ticket: 32 random bytes (secrets.token_urlsafe(32)), stored in Redis only as
a plain SHA-256 hash — not HMAC+pepper like refresh tokens, since this is a
materially different threat model (single-use, 60s TTL, ephemeral Redis
storage, not a 30-day Postgres secret). GETDEL makes consumption atomic —
a replayed ticket is a guaranteed miss.

ConnectionManager: one shared Redis subscription per community (never one
per socket), via a background listener task per community plus one shared
listener for the ban control channel. persist_before_publish is the only
path that ever writes a message — PUBLISH only happens after a successful,
committed insert.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg

from app.core.moderation import moderate
from app.core.rate_limit import check_rate_limit
from app.utils.logger import logger

TICKET_TTL_SECONDS = 60
PING_INTERVAL_SECONDS = 25
ACTIVITY_TIMEOUT_SECONDS = 60
MAX_OUTBOUND_QUEUE = 100
MAX_INBOUND_FRAME_BYTES = 8 * 1024

# Application WebSocket close codes (4000-4999 is the app-reserved range).
CLOSE_INVALID_TICKET = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_MALFORMED_FRAME = 4400

BAN_CHANNEL = "control:ban"


def channel_for_community(community_slug: str) -> str:
    return f"community:{community_slug}"


def _ticket_hash(ticket: str) -> str:
    return hashlib.sha256(ticket.encode()).hexdigest()


@dataclass(frozen=True, slots=True)
class TicketPayload:
    user_id: UUID
    community_slug: str
    session_id: UUID


async def create_ticket(redis: Any, *, user_id: UUID, community_slug: str, session_id: UUID) -> str:
    ticket = secrets.token_urlsafe(32)
    payload = json.dumps({
        "user_id": str(user_id),
        "community_slug": community_slug,
        "session_id": str(session_id),
    })
    await redis.set(f"ws_ticket:{_ticket_hash(ticket)}", payload, ex=TICKET_TTL_SECONDS)
    return ticket


async def consume_ticket(redis: Any, ticket: str) -> TicketPayload | None:
    """Atomic single-use consumption — GETDEL guarantees a replay is a miss."""
    raw = await redis.getdel(f"ws_ticket:{_ticket_hash(ticket)}")
    if raw is None:
        return None
    data = json.loads(raw)
    return TicketPayload(
        user_id=UUID(data["user_id"]),
        community_slug=data["community_slug"],
        session_id=UUID(data["session_id"]),
    )


@dataclass(frozen=True, slots=True)
class PersistResult:
    accepted: bool
    code: str  # "ok" | moderation reason | "rate_limited"
    retry_after: int | None = None
    message: dict[str, Any] | None = None  # present only when accepted


async def persist_before_publish(
    pool: asyncpg.Pool,
    redis: Any,
    *,
    community_slug: str,
    author_id: UUID,
    client_message_id: UUID,
    body: str,
    blocked_terms: frozenset[str] = frozenset(),
) -> PersistResult:
    """normalize -> moderate -> rate-limit -> insert (idempotent) -> publish.
    Never publishes an uncommitted message."""
    limit_result = await check_rate_limit("chat_send", str(author_id), redis)
    if not limit_result.allowed:
        logger.info("realtime.message_rate_limited", user_id=str(author_id))
        return PersistResult(accepted=False, code="rate_limited", retry_after=limit_result.retry_after)

    verdict = moderate(body, blocked_terms=blocked_terms)
    if verdict.verdict != "accepted":
        logger.info(
            "realtime.message_rejected",
            user_id=str(author_id),
            reason=verdict.reason,
        )
        return PersistResult(accepted=False, code=verdict.reason)

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO messages (client_message_id, archetype_slug, user_id, body)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (user_id, client_message_id) DO NOTHING
                   RETURNING id, client_message_id, body, created_at""",
                client_message_id, community_slug, author_id, verdict.normalized_body,
            )
            if row is None:
                # Retry of an already-persisted send — return the existing row,
                # never a duplicate (client_message_id + author is the
                # idempotency key).
                row = await conn.fetchrow(
                    """SELECT id, client_message_id, body, created_at FROM messages
                       WHERE user_id = $1 AND client_message_id = $2""",
                    author_id, client_message_id,
                )
            author_row = await conn.fetchrow(
                "SELECT id, display_name FROM users WHERE id = $1", author_id
            )

        message = {
            "id": row["id"],
            "client_message_id": str(row["client_message_id"]),
            "body": row["body"],
            "created_at": row["created_at"].isoformat(),
            "author": {
                "id": str(author_row["id"]) if author_row else str(author_id),
                "display_name": author_row["display_name"] if author_row else None,
            },
        }
        envelope = json.dumps({"type": "message.created", "message": message})
        await redis.publish(channel_for_community(community_slug), envelope)
    except Exception as exc:  # noqa: BLE001 — a transient DB/Redis failure must
        # surface as a clean rejection to the sender, never crash the
        # caller's reader loop (the message may still be durably persisted
        # even if the subsequent publish failed — client can retry safely
        # since client_message_id makes the insert idempotent).
        logger.error("realtime.persist_or_publish_failed", user_id=str(author_id), error=type(exc).__name__)
        return PersistResult(accepted=False, code="internal_error")

    return PersistResult(accepted=True, code="ok", message=message)


@dataclass(slots=True, eq=False)
class LocalConnection:
    user_id: UUID
    community_slug: str
    queue: "asyncio.Queue[dict]" = field(default_factory=lambda: asyncio.Queue(maxsize=MAX_OUTBOUND_QUEUE))
    overflowed: bool = False
    banned: bool = False


async def blocked_counterparts_for_fanout(
    pool: asyncpg.Pool, author_id: UUID, recipient_ids: set[UUID]
) -> set[UUID]:
    """Recipients connected to `author_id` by a block row in either
    direction — queried once per publish, not once per recipient."""
    if not recipient_ids:
        return set()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT CASE WHEN blocker_user_id = $1 THEN blocked_user_id ELSE blocker_user_id END AS other_id
               FROM user_blocks
               WHERE (blocker_user_id = $1 AND blocked_user_id = ANY($2::uuid[]))
                  OR (blocked_user_id = $1 AND blocker_user_id = ANY($2::uuid[]))""",
            author_id, list(recipient_ids),
        )
    return {r["other_id"] for r in rows}


class ConnectionManager:
    """One instance per API process. Shares one Redis pub/sub subscription
    per community across every locally-connected socket in that community,
    plus one shared subscription for the ban control channel."""

    def __init__(self, redis: Any, pool_getter: Any) -> None:
        self._redis = redis
        self._pool_getter = pool_getter  # zero-arg callable -> asyncpg.Pool
        self._by_community: dict[str, set[LocalConnection]] = {}
        self._by_user: dict[UUID, set[LocalConnection]] = {}
        self._pubsub_tasks: dict[str, asyncio.Task] = {}
        self._ban_task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._ban_task is None:
            self._ban_task = asyncio.create_task(self._listen_ban_channel())

    async def stop(self) -> None:
        if self._ban_task is not None:
            self._ban_task.cancel()
            self._ban_task = None
        for task in list(self._pubsub_tasks.values()):
            task.cancel()
        self._pubsub_tasks.clear()
        self._by_community.clear()
        self._by_user.clear()

    def register(self, conn: LocalConnection) -> None:
        self._by_community.setdefault(conn.community_slug, set()).add(conn)
        self._by_user.setdefault(conn.user_id, set()).add(conn)
        existing = self._pubsub_tasks.get(conn.community_slug)
        if existing is None or existing.done():
            # existing.done() covers a listener that died (e.g. an
            # unhandled error) while other local connections in this
            # community were still registered — without this check a dead
            # task's stale dict entry would permanently block fan-out for
            # everyone until the community emptied out completely.
            self._pubsub_tasks[conn.community_slug] = asyncio.create_task(
                self._listen_community(conn.community_slug)
            )

    def unregister(self, conn: LocalConnection) -> None:
        self._by_community.get(conn.community_slug, set()).discard(conn)
        self._by_user.get(conn.user_id, set()).discard(conn)
        if not self._by_community.get(conn.community_slug):
            task = self._pubsub_tasks.pop(conn.community_slug, None)
            if task is not None:
                task.cancel()

    async def _listen_community(self, community_slug: str) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(channel_for_community(community_slug))
        try:
            async for raw in pubsub.listen():
                if raw.get("type") != "message":
                    continue
                try:
                    envelope = json.loads(raw["data"])
                except (TypeError, ValueError):
                    continue
                try:
                    await self._fan_out(community_slug, envelope)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001 — one bad publish must never kill this community's listener
                    logger.error("realtime.fanout_error", community_slug=community_slug, error=type(exc).__name__)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel_for_community(community_slug))

    async def _fan_out(self, community_slug: str, envelope: dict[str, Any]) -> None:
        conns = list(self._by_community.get(community_slug, ()))
        if not conns:
            return
        author_id = UUID(envelope["message"]["author"]["id"])
        recipient_ids = {c.user_id for c in conns}
        blocked = await blocked_counterparts_for_fanout(self._pool_getter(), author_id, recipient_ids)
        for c in conns:
            if c.user_id in blocked:
                continue
            try:
                c.queue.put_nowait(envelope)
            except asyncio.QueueFull:
                # Slow consumer — mark for the connection's own sender task
                # to close it, rather than growing memory unbounded here.
                c.overflowed = True
                logger.warning("realtime.queue_overflow", user_id=str(c.user_id), community_slug=community_slug)

    async def _listen_ban_channel(self) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(BAN_CHANNEL)
        try:
            async for raw in pubsub.listen():
                if raw.get("type") != "message":
                    continue
                try:
                    data = json.loads(raw["data"])
                    user_id = UUID(data["user_id"])
                except (TypeError, ValueError, KeyError):
                    continue
                for c in list(self._by_user.get(user_id, ())):
                    c.banned = True
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(BAN_CHANNEL)


async def publish_ban_event(redis: Any, user_id: UUID) -> None:
    await redis.publish(BAN_CHANNEL, json.dumps({"user_id": str(user_id)}))


def server_ready_frame(community_slug: str) -> dict[str, Any]:
    return {
        "type": "ready",
        "community_slug": community_slug,
        "server_time": datetime.now(tz=timezone.utc).isoformat(),
    }


def normalize_body_for_frame_check(body: str) -> str:
    return unicodedata.normalize("NFKC", body)

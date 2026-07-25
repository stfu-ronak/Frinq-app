"""ARQ background task: send_community_push

Fires after a chat message is persisted + published (app/api/v1/realtime.py's
reader loop enqueues it, never awaiting the result — provider failure must
never affect the sender's WS response). Generic, privacy-safe copy only:
no message body, author name, or phone ever leaves the server in a push
payload. Suppresses the author, muted members, banned/deleted users, and
anyone already actively connected to this community over a live socket
(they're already seeing it in-app). Throttled to one push per user per
community per 15 minutes.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from app.config import settings
from app.core import metrics
from app.core.push import eligible_recipient_tokens, invalidate_token
from app.core.rate_limit import check_rate_limit, hash_identifier
from app.core.redis_client import get_redis
from app.database import get_pool
from app.utils.logger import logger

_PUSH_TITLE = "Frinq"
_PUSH_BODY = "New activity in your community"
_SEND_TIMEOUT_SECONDS = 10.0

_firebase_app: Any = None


def _get_firebase_app() -> Any | None:
    """None when FCM isn't configured — push send becomes a logged no-op,
    same "absent config = feature off" convention as the Twilio WhatsApp
    send path. Lazy + cached so a missing credential at import time never
    crashes the worker process."""
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app
    if not settings.FCM_SERVICE_ACCOUNT_JSON:
        return None
    import firebase_admin
    from firebase_admin import credentials

    cred = credentials.Certificate(json.loads(settings.FCM_SERVICE_ACCOUNT_JSON))
    _firebase_app = firebase_admin.initialize_app(cred, name="frinq-push")
    return _firebase_app


def _send_sync(app: Any, token: str) -> str:
    """Runs in a thread (firebase-admin's SDK is synchronous). Returns
    'success', 'invalid_token' (permanent — the caller removes the token), or
    'error' (transient — worth retrying next time, not now)."""
    from firebase_admin import messaging

    message = messaging.Message(
        notification=messaging.Notification(title=_PUSH_TITLE, body=_PUSH_BODY),
        token=token,
        data={"type": "community_activity"},
    )
    try:
        messaging.send(message, app=app)
        return "success"
    except messaging.UnregisteredError:
        return "invalid_token"
    except Exception as exc:  # noqa: BLE001 — a provider hiccup must never crash the worker
        logger.warning("push.send_failed", error=type(exc).__name__)
        return "error"


async def send_community_push(
    ctx: dict[str, Any], community_slug: str, author_id: str, active_user_ids: list[str],
) -> None:
    from uuid import UUID

    if settings.PUSH_SENDS_DISABLED:
        metrics.feature_disabled_rejections_total.labels(feature="push_send").inc()
        logger.warning("push.sends_disabled")
        return

    pool = get_pool()
    redis = await get_redis()

    async with pool.acquire() as conn:
        recipients = await eligible_recipient_tokens(
            conn, community_slug=community_slug, author_id=UUID(author_id),
            exclude_user_ids={UUID(u) for u in active_user_ids},
        )
    if not recipients:
        return

    app = _get_firebase_app()
    to_invalidate: list[str] = []
    for r in recipients:
        if redis is not None:
            key = hash_identifier(f"{r.user_id}:{community_slug}")
            result = await check_rate_limit("push_community", key, redis)
            if not result.allowed:
                continue
        if app is None:
            logger.info("push.skipped_no_credentials", user_id=str(r.user_id))
            continue
        try:
            outcome = await asyncio.wait_for(
                asyncio.to_thread(_send_sync, app, r.token), timeout=_SEND_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            metrics.push_send_outcomes_total.labels(outcome="timeout").inc()
            logger.warning("push.send_timeout", user_id=str(r.user_id))
            continue
        if outcome in ("success", "invalid_token", "error"):
            metrics.push_send_outcomes_total.labels(outcome=outcome).inc()
        if outcome == "invalid_token":
            to_invalidate.append(r.token_hash)

    if to_invalidate:
        async with pool.acquire() as conn:
            for token_hash in to_invalidate:
                await invalidate_token(conn, token_hash)

"""Lazy singleton Redis clients for rate limiting / pub-sub — deliberately
separate from app/workers/queue.py's ARQ pool (that one is ARQ's own job
queue, not meant to be shared with unrelated Redis usage). Same lazy-
create/swallow-connection-errors/return-None convention as get_queue()."""

from __future__ import annotations

import time

import redis.asyncio as redis_asyncio

from app.config import settings
from app.core import metrics
from app.utils.logger import logger

_client: redis_asyncio.Redis | None = None
_pubsub_client: redis_asyncio.Redis | None = None
_last_failure: float = 0.0
_pubsub_last_failure: float = 0.0
# Don't retry a fresh connection more than once per this window — otherwise
# every single request pays a full connect timeout while Redis is down,
# which is worse than the outage itself.
_FAILURE_COOLDOWN_SECONDS = 5.0


async def get_redis() -> redis_asyncio.Redis | None:
    """Returns the shared Redis client for regular request/response commands
    (rate limiting, tickets, publish), or None if unreachable. Callers must
    treat None as "Redis unavailable" and apply their own fail-open/fail-
    closed policy — this function never raises.

    NOT for pub/sub subscriptions — see get_pubsub_redis()."""
    global _client, _last_failure
    if _client is not None:
        return _client
    if time.monotonic() - _last_failure < _FAILURE_COOLDOWN_SECONDS:
        return None
    try:
        client = redis_asyncio.from_url(
            settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2
        )
        await client.ping()
        _client = client
        logger.info("redis_client.connected", url=settings.REDIS_URL)
        return _client
    except Exception as exc:  # noqa: BLE001 — any connection failure is equally "unavailable"
        metrics.redis_failures_total.labels(source="redis_client.connect").inc()
        logger.warning("redis_client.connect_failed", error=str(exc))
        _last_failure = time.monotonic()
        return None


async def get_pubsub_redis() -> redis_asyncio.Redis | None:
    """Returns a SEPARATE shared client dedicated to long-lived pub/sub
    subscriptions (ConnectionManager's per-community listeners).

    A live device test found the real bug this avoids: get_redis()'s
    socket_timeout=2 is a hard per-read deadline on the underlying socket —
    fine for a quick request/response command, but a pub/sub `listen()` call
    blocks on that SAME socket waiting for the next published message, which
    can easily be quiet for well over 2 seconds. That deadline fired,
    silently killing the listener task (an unhandled TimeoutError) with no
    error surfaced anywhere except an untouched "Task exception was never
    retrieved" — every message sent afterward was persisted successfully but
    its confirmation never reached any client, forever, until a new
    WebSocket connection happened to recreate the listener.

    socket_timeout=None here means the read blocks indefinitely, which is
    correct for a call that's SUPPOSED to block until a message arrives.
    health_check_interval then covers detecting a genuinely dead connection
    (redis-py pings periodically and the write side will fail if the
    connection is actually gone) instead of relying on a read deadline."""
    global _pubsub_client, _pubsub_last_failure
    if _pubsub_client is not None:
        return _pubsub_client
    if time.monotonic() - _pubsub_last_failure < _FAILURE_COOLDOWN_SECONDS:
        return None
    try:
        client = redis_asyncio.from_url(
            settings.REDIS_URL,
            socket_connect_timeout=2,
            socket_timeout=None,
            health_check_interval=30,
        )
        await client.ping()
        _pubsub_client = client
        logger.info("redis_client.pubsub_connected", url=settings.REDIS_URL)
        return _pubsub_client
    except Exception as exc:  # noqa: BLE001 — any connection failure is equally "unavailable"
        metrics.redis_failures_total.labels(source="redis_client.pubsub_connect").inc()
        logger.warning("redis_client.pubsub_connect_failed", error=str(exc))
        _pubsub_last_failure = time.monotonic()
        return None


async def close_redis() -> None:
    global _client, _pubsub_client
    if _client is not None:
        await _client.close()
        _client = None
    if _pubsub_client is not None:
        await _pubsub_client.close()
        _pubsub_client = None

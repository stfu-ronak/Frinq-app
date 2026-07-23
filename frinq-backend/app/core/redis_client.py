"""Lazy singleton Redis client for rate limiting / pub-sub — deliberately
separate from app/workers/queue.py's ARQ pool (that one is ARQ's own job
queue, not meant to be shared with unrelated Redis usage). Same lazy-
create/swallow-connection-errors/return-None convention as get_queue()."""

from __future__ import annotations

import time

import redis.asyncio as redis_asyncio

from app.config import settings
from app.utils.logger import logger

_client: redis_asyncio.Redis | None = None
_last_failure: float = 0.0
# Don't retry a fresh connection more than once per this window — otherwise
# every single request pays a full connect timeout while Redis is down,
# which is worse than the outage itself.
_FAILURE_COOLDOWN_SECONDS = 5.0


async def get_redis() -> redis_asyncio.Redis | None:
    """Returns the shared Redis client, or None if unreachable. Callers
    must treat None as "Redis unavailable" and apply their own fail-open/
    fail-closed policy — this function never raises."""
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
        logger.warning("redis_client.connect_failed", error=str(exc))
        _last_failure = time.monotonic()
        return None


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None

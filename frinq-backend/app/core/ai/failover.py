"""Small, shared circuit breaker for AI primary-model failures.

Redis is preferred so multiple API/worker processes share the cooldown. The
local map keeps the safety behavior working when Redis itself is unavailable.
Only a one-way hash of the provider/model is used as the Redis key.
"""

from __future__ import annotations

import hashlib
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.redis_client import get_redis

COOLDOWN_SECONDS = 300
_PREFIX = "ai:primary-failure:"
_local_down_until: dict[str, float] = {}
# Wall-clock mirror of _local_down_until (which is keyed on time.monotonic(),
# with no fixed epoch relationship to real time) — kept only so get_status()
# can report a real cooldown expiry instead of "now" (a prior bug).
_local_down_until_wall: dict[str, datetime] = {}
_redis: Any | bool | None = None


def _key(provider: str, model_id: str) -> str:
    digest = hashlib.sha256(f"{provider}:{model_id}".encode()).hexdigest()
    return f"{_PREFIX}{digest}"


async def _client() -> Any | None:
    if _redis is False:  # test seam; production always uses get_redis()
        return None
    if _redis is not None:
        return _redis
    return await get_redis()


async def is_primary_suppressed(route_key: str) -> bool:
    now = time.monotonic()
    local_until = _local_down_until.get(route_key, 0.0)
    if local_until > now:
        return True
    _local_down_until.pop(route_key, None)
    _local_down_until_wall.pop(route_key, None)

    client = await _client()
    if client is None:
        return False
    try:
        return bool(await client.exists(_key(*route_key.split(":", 1))))
    except Exception:  # noqa: BLE001 - fail open to per-request fallback
        return False


async def mark_primary_failure(route_key: str) -> None:
    _local_down_until[route_key] = time.monotonic() + COOLDOWN_SECONDS
    _local_down_until_wall[route_key] = datetime.now(timezone.utc) + timedelta(seconds=COOLDOWN_SECONDS)
    client = await _client()
    if client is None:
        return
    try:
        await client.set(_key(*route_key.split(":", 1)), "1", ex=COOLDOWN_SECONDS)
    except Exception:  # noqa: BLE001 - local state remains protective
        return


async def mark_primary_success(route_key: str) -> None:
    _local_down_until.pop(route_key, None)
    _local_down_until_wall.pop(route_key, None)
    client = await _client()
    if client is None:
        return
    try:
        await client.delete(_key(*route_key.split(":", 1)))
    except Exception:  # noqa: BLE001 - a future failure can still trip fallback
        return


async def get_status(provider: str, model_id: str) -> dict[str, Any]:
    route_key = f"{provider}:{model_id}"
    suppressed = await is_primary_suppressed(route_key)
    expiry = _local_down_until_wall.get(route_key)
    return {
        "key": _key(provider, model_id),
        "active_route": "fallback" if suppressed else "primary",
        "primary_suppressed": suppressed,
        "cooldown_seconds": COOLDOWN_SECONDS,
        "suppressed_until": (
            expiry.isoformat().replace("+00:00", "Z") if expiry else None
        ),
    }


def reset_for_tests() -> None:
    _local_down_until.clear()
    _local_down_until_wall.clear()

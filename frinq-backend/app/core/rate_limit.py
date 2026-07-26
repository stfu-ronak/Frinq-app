"""Redis-backed rate limiting. One atomic increment-and-expire-if-new Lua
script per check (INCR is atomic on its own; the EXPIRE-only-when-the-key-
is-new step must run in the same script or a second request between the two
calls could reset the window early). Phone/IP values are HMAC-peppered
before ever becoming Redis key material — same "separate pepper per
purpose" reasoning as SESSION_HASH_PEPPER.

Fail-open vs fail-closed per limiter: the plan is explicit that OTP and
WS-ticket creation fail closed (deny) when Redis is unreachable, and
"ordinary authenticated reads" fail open. Chat-send/report aren't named
explicitly — treated as fail-open-with-error-metric here too: a brief Redis
outage taking down all of chat would be a much larger regression than the
small abuse window it risks.

Only `report` is wired to a live endpoint this task (Task 17's moderation.py).
`chat_send`/`ws_ticket` are wired in Task 19 once those endpoints exist;
`otp_request`/`otp_verify`/`rest_authenticated` are defined (and tested) but
deliberately not wired into any route yet — see the Phase 5 plan's scope
notes.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass

from app.config import settings
from app.core import metrics

_INCR_EXPIRE_SCRIPT = """
local current = redis.call("INCR", KEYS[1])
if tonumber(current) == 1 then
    redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current
"""


@dataclass(frozen=True, slots=True)
class LimiterConfig:
    name: str
    limit: int
    window_seconds: int
    fail_closed: bool


LIMITERS: dict[str, LimiterConfig] = {
    "otp_request": LimiterConfig("otp_request", limit=5, window_seconds=15 * 60, fail_closed=True),
    "otp_request_ip": LimiterConfig("otp_request_ip", limit=20, window_seconds=60 * 60, fail_closed=True),
    "otp_verify": LimiterConfig("otp_verify", limit=10, window_seconds=15 * 60, fail_closed=True),
    "otp_verify_ip": LimiterConfig("otp_verify_ip", limit=40, window_seconds=60 * 60, fail_closed=True),
    "rest_authenticated": LimiterConfig("rest_authenticated", limit=120, window_seconds=60, fail_closed=False),
    "chat_send": LimiterConfig("chat_send", limit=10, window_seconds=10, fail_closed=False),
    "chat_send_minute": LimiterConfig("chat_send_minute", limit=60, window_seconds=60, fail_closed=False),
    "report": LimiterConfig("report", limit=10, window_seconds=24 * 60 * 60, fail_closed=False),
    "ws_ticket": LimiterConfig("ws_ticket", limit=10, window_seconds=60, fail_closed=True),
    # At most one push per (user, community) per 15 minutes — fail-open:
    # if Redis is briefly unreachable, sending an extra push is far cheaper
    # than silently dropping real-time notifications app-wide.
    "push_community": LimiterConfig("push_community", limit=1, window_seconds=15 * 60, fail_closed=False),
    # Anonymous quiz creation — IP-keyed. Generous (India CGNAT shares one IP
    # across many real users, so a tight cap would lock them out) but low
    # enough to stop bulk phone-enumeration against the pre-auth /quiz/start.
    # Fail-open: blocking the top of the signup funnel on a brief Redis outage
    # is worse than the short enumeration window it prevents.
    "quiz_start_ip": LimiterConfig("quiz_start_ip", limit=100, window_seconds=60 * 60, fail_closed=False),
    # Authenticated quiz submission enqueues a paid AI job and (unlike
    # complete/retry) inserts a fresh submission every call — the one unbounded
    # AI-cost path. Far above any real user's need (they submit once); tight
    # enough to cap a scripted cost attack. Fail-open.
    "quiz_submit": LimiterConfig("quiz_submit", limit=30, window_seconds=60 * 60, fail_closed=False),
}


@dataclass(frozen=True, slots=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int


class RateLimitUnavailable(Exception):
    """Raised when Redis is unreachable and the limiter's policy is fail-closed."""


def hash_identifier(value: str) -> str:
    """Phone/IP -> Redis-key-safe material. Peppered so raw values never
    appear in Redis keys (visible via MONITOR, slowlog, or backups otherwise)."""
    return hmac.new(settings.RATE_LIMIT_PEPPER.encode(), value.encode(), hashlib.sha256).hexdigest()


def _unavailable_result(config: LimiterConfig) -> RateLimitResult:
    metrics.redis_failures_total.labels(source=f"rate_limit.{config.name}").inc()
    if config.fail_closed:
        raise RateLimitUnavailable(config.name)
    return RateLimitResult(allowed=True, limit=config.limit, remaining=config.limit, retry_after=0)


async def check_rate_limit(limiter_name: str, key_material: str, redis: object | None) -> RateLimitResult:
    config = LIMITERS[limiter_name]
    if redis is None:
        return _unavailable_result(config)

    redis_key = f"ratelimit:{limiter_name}:{key_material}"
    try:
        current = await redis.eval(_INCR_EXPIRE_SCRIPT, 1, redis_key, config.window_seconds)  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001 — any failure here means "treat as unavailable"
        return _unavailable_result(config)

    current = int(current)
    if current > config.limit:
        try:
            ttl = int(await redis.ttl(redis_key))  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            ttl = config.window_seconds
        retry_after = ttl if ttl > 0 else config.window_seconds
        return RateLimitResult(allowed=False, limit=config.limit, remaining=0, retry_after=retry_after)

    return RateLimitResult(
        allowed=True, limit=config.limit, remaining=config.limit - current, retry_after=0
    )

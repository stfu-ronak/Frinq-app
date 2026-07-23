from __future__ import annotations

import pytest

from app.core.rate_limit import (
    LIMITERS,
    RateLimitUnavailable,
    check_rate_limit,
    hash_identifier,
)
from tests.conftest import FakeClock, FakeRedis


def test_limiter_configs_match_production_defaults() -> None:
    assert LIMITERS["otp_request"].limit == 5
    assert LIMITERS["otp_request"].window_seconds == 15 * 60
    assert LIMITERS["otp_request_ip"].limit == 20
    assert LIMITERS["otp_request_ip"].window_seconds == 60 * 60
    assert LIMITERS["otp_verify"].limit == 10
    assert LIMITERS["otp_verify"].window_seconds == 15 * 60
    assert LIMITERS["otp_verify_ip"].limit == 40
    assert LIMITERS["otp_verify_ip"].window_seconds == 60 * 60
    assert LIMITERS["rest_authenticated"].limit == 120
    assert LIMITERS["rest_authenticated"].window_seconds == 60
    assert LIMITERS["chat_send"].limit == 10
    assert LIMITERS["chat_send"].window_seconds == 10
    assert LIMITERS["chat_send_minute"].limit == 60
    assert LIMITERS["chat_send_minute"].window_seconds == 60
    assert LIMITERS["report"].limit == 10
    assert LIMITERS["report"].window_seconds == 24 * 60 * 60
    assert LIMITERS["ws_ticket"].limit == 10
    assert LIMITERS["ws_ticket"].window_seconds == 60


def test_fail_closed_limiters_are_otp_and_ws_ticket_only() -> None:
    fail_closed_names = {name for name, cfg in LIMITERS.items() if cfg.fail_closed}
    assert fail_closed_names == {"otp_request", "otp_request_ip", "otp_verify", "otp_verify_ip", "ws_ticket"}


async def test_allows_up_to_limit_then_rejects(fake_redis: FakeRedis) -> None:
    for _ in range(10):
        result = await check_rate_limit("report", "user-1", fake_redis)
        assert result.allowed is True
    rejected = await check_rate_limit("report", "user-1", fake_redis)
    assert rejected.allowed is False
    assert rejected.remaining == 0


async def test_different_keys_have_independent_counters(fake_redis: FakeRedis) -> None:
    for _ in range(10):
        assert (await check_rate_limit("report", "user-1", fake_redis)).allowed
    # A different key material (different user) is unaffected.
    assert (await check_rate_limit("report", "user-2", fake_redis)).allowed


async def test_window_resets_after_expiry(fake_redis: FakeRedis, fake_clock: FakeClock) -> None:
    for _ in range(10):
        assert (await check_rate_limit("ws_ticket", "user-1", fake_redis)).allowed
    assert (await check_rate_limit("ws_ticket", "user-1", fake_redis)).allowed is False
    fake_clock.advance(61)  # ws_ticket window is 60s
    assert (await check_rate_limit("ws_ticket", "user-1", fake_redis)).allowed is True


async def test_retry_after_reflects_remaining_ttl(fake_redis: FakeRedis, fake_clock: FakeClock) -> None:
    for _ in range(10):
        await check_rate_limit("ws_ticket", "user-1", fake_redis)
    fake_clock.advance(20)
    result = await check_rate_limit("ws_ticket", "user-1", fake_redis)
    assert result.allowed is False
    assert 0 < result.retry_after <= 40  # 60s window minus ~20s elapsed


async def test_fail_closed_limiter_raises_when_redis_unavailable(fake_redis: FakeRedis) -> None:
    fake_redis.unavailable = True
    with pytest.raises(RateLimitUnavailable):
        await check_rate_limit("ws_ticket", "user-1", fake_redis)


async def test_fail_closed_limiter_raises_when_redis_is_none() -> None:
    with pytest.raises(RateLimitUnavailable):
        await check_rate_limit("otp_request", "phone-hash", None)


async def test_fail_open_limiter_allows_when_redis_unavailable(fake_redis: FakeRedis) -> None:
    fake_redis.unavailable = True
    result = await check_rate_limit("report", "user-1", fake_redis)
    assert result.allowed is True


async def test_fail_open_limiter_allows_when_redis_is_none() -> None:
    result = await check_rate_limit("chat_send", "user-1", None)
    assert result.allowed is True


def test_hash_identifier_is_stable_and_peppered() -> None:
    h1 = hash_identifier("9999999999")
    h2 = hash_identifier("9999999999")
    h3 = hash_identifier("8888888888")
    assert h1 == h2
    assert h1 != h3
    assert "9999999999" not in h1
    assert len(h1) == 64

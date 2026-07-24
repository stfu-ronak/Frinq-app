"""OTP endpoint rate limiting (app/api/v1/otp.py's _enforce_otp_limit).

The limiter is skipped for bypassed numbers (dev/test/review) — those make
no Twilio call — so every test here forces the bypass OFF and injects a
FakeRedis, exercising the real per-phone/per-IP fail-closed path that runs
against a live Redis in production.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from typing import Any

from tests.conftest import FakePool, FakeRedis


@pytest.fixture(autouse=True)
def _real_otp_path(monkeypatch: pytest.MonkeyPatch) -> None:
    # Bypass off (so the limiter actually runs) and the Twilio calls stubbed
    # to succeed (so only the limiter decides the outcome).
    monkeypatch.setattr("app.api.v1.otp.otp_bypass_active", lambda phone: False)

    async def _ok_send(phone: str) -> None:
        return None

    async def _ok_verify(phone: str, code: str) -> None:
        return None

    monkeypatch.setattr("app.api.v1.otp.send_otp", _ok_send)
    monkeypatch.setattr("app.api.v1.otp.verify_otp", _ok_verify)


async def test_send_allows_up_to_limit_then_429(
    client: AsyncClient, fake_redis: FakeRedis, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.v1.otp.get_redis", lambda: _async(fake_redis))
    # otp_request limit is 5 per 15 min (rate_limit.py LIMITERS).
    for _ in range(5):
        resp = await client.post("/api/v1/otp/send", json={"phone": "9990001111"})
        assert resp.status_code == 200, resp.text
    resp = await client.post("/api/v1/otp/send", json={"phone": "9990001111"})
    assert resp.status_code == 429
    assert resp.headers.get("Retry-After") is not None


async def test_verify_allows_up_to_limit_then_429(
    client: AsyncClient, fake_pool: FakePool, fake_redis: FakeRedis,
    user_row: dict[str, Any], monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.v1.otp.get_redis", lambda: _async(fake_redis))

    def _handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        # Existing, non-banned account for the users lookup; no prior submission.
        return dict(user_row) if "FROM users" in query else None

    fake_pool.store.fetchrow_handler = _handler

    # otp_verify limit is 10 per 15 min — clean 200s up to the cap.
    for _ in range(10):
        resp = await client.post(
            "/api/v1/otp/verify", json={"phone": "9990002222", "code": "123456", "platform": "android"}
        )
        assert resp.status_code == 200, resp.text
    resp = await client.post(
        "/api/v1/otp/verify", json={"phone": "9990002222", "code": "123456", "platform": "android"}
    )
    assert resp.status_code == 429


async def test_send_fails_closed_when_redis_unavailable(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # get_redis returns None (unreachable) → fail-closed → 503, never a silent
    # allow that would leave SMS cost unbounded in production.
    monkeypatch.setattr("app.api.v1.otp.get_redis", lambda: _async(None))
    resp = await client.post("/api/v1/otp/send", json={"phone": "9990003333"})
    assert resp.status_code == 503


async def test_separate_phones_have_separate_buckets(
    client: AsyncClient, fake_redis: FakeRedis, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.v1.otp.get_redis", lambda: _async(fake_redis))
    for _ in range(5):
        assert (await client.post("/api/v1/otp/send", json={"phone": "9990004444"})).status_code == 200
    # A different phone is unaffected by the first phone's exhausted bucket
    # (per-phone keying). NOTE: they share the test client's IP bucket
    # (otp_request_ip=20/hr), which 10 sends stays under.
    assert (await client.post("/api/v1/otp/send", json={"phone": "9990005555"})).status_code == 200


async def _async(value: object):
    """Wrap a plain value as the awaitable get_redis() returns."""
    return value

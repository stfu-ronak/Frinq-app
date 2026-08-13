from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.config import settings
from app.core.test_fixtures import TEST_RESET_PHONE
from tests.conftest import FakePool


@pytest.fixture(autouse=True)
def _bypass_otp_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    """These tests exercise account/session creation, not rate limiting.
    Force the OTP bypass on so they're deterministic regardless of the
    ambient .env SKIP_OTP flag or whether a live Redis is reachable — the
    rate limiter itself is covered in test_otp_rate_limit.py."""
    monkeypatch.setattr("app.api.v1.otp.otp_bypass_active", lambda phone: True)


def _user_row(**overrides: Any) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    row: dict[str, Any] = {
        "id": uuid4(),
        "supabase_uid": None,
        "phone": "9990000001",
        "display_name": None,
        "gender": None,
        "age": None,
        "ncr_zone": None,
        "max_travel_km": 15,
        "schedule": [],
        "onboarding_complete": False,
        "onboarding_state": "quiz_in_progress",
        "banned": False,
        "banned_reason": None,
        "banned_at": None,
        "last_seen_at": None,
        "terms_version": None,
        "terms_accepted_at": None,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    }
    row.update(overrides)
    return row


async def test_otp_verify_creates_user_and_session(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.v1.otp.verify_otp", lambda phone, code: _ok())

    new_user = _user_row()

    def _handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if query.strip().startswith("SELECT * FROM users WHERE"):
            return None  # no existing account for this phone
        if query.strip().startswith("INSERT INTO users"):
            return new_user
        return None  # both prior_session lookups: no submissions yet

    fake_pool.store.fetchrow_handler = _handler

    response = await client.post(
        "/api/v1/otp/verify",
        json={"phone": "9990000001", "code": "123456", "platform": "android"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["onboarding_state"] == "quiz_in_progress"
    assert body["user"]["id"] == str(new_user["id"])
    assert body["prior_session"] is None


async def test_verify_maps_twilio_outage_to_503_not_wrong_code(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A Twilio 5xx/429/auth failure must NOT be reported to the user as an
    # incorrect code (400) — it's a 503 so the client says "try again" and it
    # shows up as an outage in monitoring, not a spike of "wrong code".
    async def _boom(phone: str, code: str) -> None:
        raise RuntimeError("twilio_unavailable")

    monkeypatch.setattr("app.api.v1.otp.verify_otp", _boom)

    response = await client.post(
        "/api/v1/otp/verify",
        json={"phone": "9990000001", "code": "123456", "platform": "android"},
    )
    assert response.status_code == 503, response.text


async def test_verify_wrong_code_still_400(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _wrong(phone: str, code: str) -> None:
        raise ValueError("invalid_code")

    monkeypatch.setattr("app.api.v1.otp.verify_otp", _wrong)

    response = await client.post(
        "/api/v1/otp/verify",
        json={"phone": "9990000001", "code": "000000", "platform": "android"},
    )
    assert response.status_code == 400, response.text


async def test_verify_same_phone_reuses_user_but_creates_new_session(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.v1.otp.verify_otp", lambda phone, code: _ok())
    existing_user = _user_row()

    def _handler_new(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if query.strip().startswith("SELECT * FROM users WHERE"):
            return None
        if query.strip().startswith("INSERT INTO users"):
            return existing_user
        return None

    fake_pool.store.fetchrow_handler = _handler_new
    first = await client.post(
        "/api/v1/otp/verify",
        json={"phone": "9990000001", "code": "123456", "platform": "android"},
    )
    assert first.status_code == 200, first.text

    def _handler_existing(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if query.strip().startswith("SELECT * FROM users WHERE"):
            return existing_user  # account already exists this time
        return None

    fake_pool.store.fetchrow_handler = _handler_existing
    second = await client.post(
        "/api/v1/otp/verify",
        json={"phone": "9990000001", "code": "123456", "platform": "ios"},
    )
    assert second.status_code == 200, second.text

    first_body, second_body = first.json(), second.json()
    assert first_body["user"]["id"] == second_body["user"]["id"]
    assert first_body["refresh_token"] != second_body["refresh_token"]


async def test_verify_auto_resets_the_reset_test_phone_before_issuing_a_session(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The whole point of TEST_RESET_PHONE: a tester clears the app's local
    storage, signs back in with this number, and lands on a genuinely fresh
    quiz — because the SERVER resets the account before the session is even
    created, not because the client forgot anything. If this stops firing,
    the tester just resumes wherever the account was left (done/error/mid-
    quiz), which reads as "the reset button does nothing" and burns a real
    debugging session before anyone suspects the auto-reset path."""
    monkeypatch.setattr("app.api.v1.otp.verify_otp", lambda phone, code: _ok())
    monkeypatch.setattr(settings, "APP_ENV", "development")
    existing_user = _user_row(phone=TEST_RESET_PHONE, onboarding_state="active", display_name="Old Name")
    reset_calls: list[Any] = []

    async def _fake_reset(conn: Any, user_id: Any) -> None:
        reset_calls.append(user_id)

    monkeypatch.setattr("app.api.v1.otp.reset_test_account", _fake_reset)

    def _handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        q = query.strip()
        if q.startswith("SELECT * FROM users WHERE"):
            return existing_user
        if q.startswith("UPDATE quiz_submissions SET user_id"):
            return None
        return None

    fake_pool.store.fetchrow_handler = _handler

    response = await client.post(
        "/api/v1/otp/verify",
        json={"phone": TEST_RESET_PHONE, "code": "123456", "platform": "android"},
    )
    assert response.status_code == 200, response.text
    assert reset_calls == [existing_user["id"]]


async def test_verify_does_not_reset_a_non_test_phone_even_with_the_same_shape(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Negative case for the test above — an ordinary account must never be
    silently wiped just because it verifies successfully."""
    monkeypatch.setattr("app.api.v1.otp.verify_otp", lambda phone, code: _ok())
    monkeypatch.setattr(settings, "APP_ENV", "development")
    existing_user = _user_row(phone="9990000001", onboarding_state="active")
    reset_calls: list[Any] = []

    async def _fake_reset(conn: Any, user_id: Any) -> None:
        reset_calls.append(user_id)

    monkeypatch.setattr("app.api.v1.otp.reset_test_account", _fake_reset)

    def _handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if query.strip().startswith("SELECT * FROM users WHERE"):
            return existing_user
        return None

    fake_pool.store.fetchrow_handler = _handler

    response = await client.post(
        "/api/v1/otp/verify",
        json={"phone": "9990000001", "code": "123456", "platform": "android"},
    )
    assert response.status_code == 200, response.text
    assert reset_calls == []


async def test_verify_auto_reset_is_blocked_in_production_without_the_flag(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.v1.otp.verify_otp", lambda phone, code: _ok())
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "ALLOW_TEST_OTP_IN_PROD", False)
    existing_user = _user_row(phone=TEST_RESET_PHONE, onboarding_state="active")
    reset_calls: list[Any] = []

    async def _fake_reset(conn: Any, user_id: Any) -> None:
        reset_calls.append(user_id)

    monkeypatch.setattr("app.api.v1.otp.reset_test_account", _fake_reset)

    def _handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if query.strip().startswith("SELECT * FROM users WHERE"):
            return existing_user
        return None

    fake_pool.store.fetchrow_handler = _handler

    response = await client.post(
        "/api/v1/otp/verify",
        json={"phone": TEST_RESET_PHONE, "code": "123456", "platform": "android"},
    )
    assert response.status_code == 200, response.text
    assert reset_calls == []


async def test_verify_auto_reset_works_in_production_when_the_flag_is_on(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The deployed review app runs with APP_ENV=production. Without this,
    the reset test phone would work locally and silently stop working the
    moment it's tested against the real deploy."""
    monkeypatch.setattr("app.api.v1.otp.verify_otp", lambda phone, code: _ok())
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "ALLOW_TEST_OTP_IN_PROD", True)
    existing_user = _user_row(phone=TEST_RESET_PHONE, onboarding_state="active")
    reset_calls: list[Any] = []

    async def _fake_reset(conn: Any, user_id: Any) -> None:
        reset_calls.append(user_id)

    monkeypatch.setattr("app.api.v1.otp.reset_test_account", _fake_reset)

    def _handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if query.strip().startswith("SELECT * FROM users WHERE"):
            return existing_user
        return None

    fake_pool.store.fetchrow_handler = _handler

    response = await client.post(
        "/api/v1/otp/verify",
        json={"phone": TEST_RESET_PHONE, "code": "123456", "platform": "android"},
    )
    assert response.status_code == 200, response.text
    assert reset_calls == [existing_user["id"]]


async def test_verify_links_only_same_normalized_phone_submissions(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.v1.otp.verify_otp", lambda phone, code: _ok())
    existing_user = _user_row()

    def _handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if query.strip().startswith("SELECT * FROM users WHERE"):
            return existing_user
        return None

    fake_pool.store.fetchrow_handler = _handler

    response = await client.post(
        "/api/v1/otp/verify",
        json={"phone": "9990000001", "code": "123456", "platform": "web"},
    )
    assert response.status_code == 200, response.text

    link_queries = [
        (q, a) for q, a in fake_pool.store.queries
        if q.strip().startswith("UPDATE quiz_submissions SET user_id")
    ]
    assert len(link_queries) == 1
    query, args = link_queries[0]
    assert "= $2 AND user_id IS NULL" in query
    assert "regexp_replace(phone" in query  # normalized match, not bare equality
    linked_user_id, linked_phone = args
    assert linked_user_id == existing_user["id"]
    assert linked_phone == "9990000001"
    # The filter clause itself (normalized phone match AND user_id IS NULL) is
    # what keeps a submission under a *different* phone or already-owned
    # untouched — there is no separate branch that could accidentally widen
    # the match.


async def test_banned_user_cannot_verify_otp(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.v1.otp.verify_otp", lambda phone, code: _ok())
    banned_user = _user_row(banned=True)

    def _handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if query.strip().startswith("SELECT * FROM users WHERE"):
            return banned_user
        return None

    fake_pool.store.fetchrow_handler = _handler

    response = await client.post(
        "/api/v1/otp/verify",
        json={"phone": "9990000001", "code": "123456", "platform": "web"},
    )
    assert response.status_code == 403


async def _ok() -> None:
    return None

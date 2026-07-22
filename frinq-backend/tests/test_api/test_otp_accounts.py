from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.conftest import FakePool


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

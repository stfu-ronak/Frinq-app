from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app as fastapi_app
from tests.conftest import FakePool


@pytest.fixture(autouse=True)
def no_real_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    """These tests exercise the report endpoint's own logic, not rate
    limiting — never let it reach for a real Redis connection (the `report`
    limiter fails open on None, so this is equivalent to Redis being down)."""
    async def _no_redis() -> None:
        return None

    monkeypatch.setattr("app.api.v1.moderation.get_redis", _no_redis)


async def test_report_requires_a_valid_access_token(fake_pool: FakePool) -> None:
    from app.api.deps import get_pool

    async def _override_pool() -> FakePool:
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/v1/messages/1/report", json={"reason": "spam"})
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)
    assert resp.status_code == 401


async def test_report_reason_is_a_closed_enum(client: AsyncClient, fake_pool: FakePool) -> None:
    other_author = uuid4()
    fake_pool.store.fetchrow_handler = lambda q, a: {"user_id": other_author}
    resp = await client.post("/api/v1/messages/1/report", json={"reason": "not_a_real_reason"})
    assert resp.status_code == 422


async def test_details_over_500_chars_rejected(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/messages/1/report", json={"reason": "spam", "details": "x" * 501}
    )
    assert resp.status_code == 422


async def test_cannot_report_own_message(
    client: AsyncClient, fake_pool: FakePool, current_account
) -> None:
    fake_pool.store.fetchrow_handler = lambda q, a: {"user_id": current_account.id}
    resp = await client.post("/api/v1/messages/1/report", json={"reason": "spam"})
    assert resp.status_code == 400


async def test_report_missing_message_returns_404(client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.fetchrow_handler = lambda q, a: None
    resp = await client.post("/api/v1/messages/999/report", json={"reason": "spam"})
    assert resp.status_code == 404


async def test_reporting_same_message_twice_returns_existing_state_not_a_duplicate(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    other_author = uuid4()
    report_id = uuid4()
    state: dict[str, Any] = {"created": False}

    def handler(query: str, args: tuple[Any, ...]):
        if query.strip().startswith("SELECT user_id FROM messages"):
            return {"user_id": other_author}
        if query.strip().startswith("INSERT INTO message_reports"):
            if state["created"]:
                return None  # ON CONFLICT DO NOTHING — already reported
            state["created"] = True
            return {"id": report_id, "status": "open"}
        if query.strip().startswith("SELECT id, status FROM message_reports"):
            return {"id": report_id, "status": "open"}
        return None

    fake_pool.store.fetchrow_handler = handler

    resp1 = await client.post("/api/v1/messages/1/report", json={"reason": "spam"})
    resp2 = await client.post("/api/v1/messages/1/report", json={"reason": "spam"})

    assert resp1.status_code == 201
    assert resp2.status_code == 201
    assert resp1.json()["report_id"] == resp2.json()["report_id"] == str(report_id)
    # Exactly one INSERT attempt created a row; the second hit the conflict path.
    inserts = [q for q, _ in fake_pool.store.queries if q.strip().startswith("INSERT INTO message_reports")]
    assert len(inserts) == 2  # both attempted, only the first "created"


async def test_report_response_never_includes_reporter_identity(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    other_author = uuid4()

    def handler(query: str, args: tuple[Any, ...]):
        if query.strip().startswith("SELECT user_id FROM messages"):
            return {"user_id": other_author}
        if query.strip().startswith("INSERT INTO message_reports"):
            return {"id": uuid4(), "status": "open"}
        return None

    fake_pool.store.fetchrow_handler = handler
    resp = await client.post("/api/v1/messages/1/report", json={"reason": "harassment"})
    body = resp.json()
    assert "reporter_user_id" not in body
    assert "reporter_id" not in body


async def test_report_rate_limited_returns_429_with_retry_after(
    client: AsyncClient, fake_pool: FakePool, fake_redis, monkeypatch: pytest.MonkeyPatch
) -> None:
    other_author = uuid4()

    def handler(query: str, args: tuple[Any, ...]):
        if query.strip().startswith("SELECT user_id FROM messages"):
            return {"user_id": other_author}
        if query.strip().startswith("INSERT INTO message_reports"):
            return {"id": uuid4(), "status": "open"}
        return None

    fake_pool.store.fetchrow_handler = handler

    async def _fake_redis():
        return fake_redis

    monkeypatch.setattr("app.api.v1.moderation.get_redis", _fake_redis)

    # Exhaust the "report" limit (10 per user per day) before the 11th call.
    from app.core.rate_limit import LIMITERS

    for _ in range(LIMITERS["report"].limit):
        resp = await client.post("/api/v1/messages/1/report", json={"reason": "spam"})
        assert resp.status_code == 201

    resp = await client.post("/api/v1/messages/1/report", json={"reason": "spam"})
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) > 0

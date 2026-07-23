from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_pool
from app.config import settings
from app.main import app as fastapi_app
from tests.conftest import FakePool

_ADMIN_HEADERS = {
    "Authorization": f"Bearer {settings.ADMIN_KEY}",
    "X-Action-Password": settings.ADMIN_ACTION_PASSWORD,
}
_ADMIN_ONLY_HEADERS = {"Authorization": f"Bearer {settings.ADMIN_KEY}"}


@pytest.fixture
async def admin_client(fake_pool: FakePool):
    async def _override_pool() -> FakePool:
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test", headers=_ADMIN_HEADERS) as ac:
        yield ac
    fastapi_app.dependency_overrides.pop(get_pool, None)


async def test_list_reports_requires_admin_key(fake_pool: FakePool) -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/admin/reports")
    assert resp.status_code == 401


async def test_list_reports_paginated(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    report_id = uuid4()
    author_id = uuid4()
    now = datetime.now(timezone.utc)

    def handler(query: str, args: tuple[Any, ...]):
        if query.strip().startswith("SELECT mr.id, mr.message_id"):
            return [{
                "id": report_id, "message_id": 1, "reporter_user_id": uuid4(),
                "reason": "spam", "details": None, "status": "open",
                "created_at": now, "archetype_slug": "quiet-storm", "author_id": author_id,
            }]
        return None

    fake_pool.store.fetch_handler = handler
    fake_pool.store.fetchval_handler = lambda q, a: 1  # COUNT(*)

    resp = await admin_client.get("/api/v1/admin/reports")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["reports"][0]["id"] == str(report_id)
    assert body["reports"][0]["reason"] == "spam"


async def test_list_reports_default_filter_is_open(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.fetch_handler = lambda q, a: []
    fake_pool.store.fetchval_handler = lambda q, a: 0
    await admin_client.get("/api/v1/admin/reports")
    query, args = fake_pool.store.queries[0]
    assert args[0] == "open"


async def test_report_detail_returns_message_context_and_prior_count(
    admin_client: AsyncClient, fake_pool: FakePool
) -> None:
    report_id = uuid4()
    author_id = uuid4()
    now = datetime.now(timezone.utc)

    def fetchrow_handler(query: str, args: tuple[Any, ...]):
        if query.strip().startswith("SELECT mr.id, mr.reason"):
            return {
                "id": report_id, "reason": "harassment", "details": "rude", "status": "open",
                "reporter_user_id": uuid4(), "message_id": 5, "body": "hey there",
                "message_created_at": now, "archetype_slug": "quiet-storm", "author_id": author_id,
            }
        if query.strip().startswith("SELECT id, display_name FROM users"):
            return {"id": author_id, "display_name": "Alice"}
        return None

    def fetch_handler(query: str, args: tuple[Any, ...]):
        return [{"id": 5, "user_id": author_id, "body": "hey there", "created_at": now}]

    fake_pool.store.fetchrow_handler = fetchrow_handler
    fake_pool.store.fetch_handler = fetch_handler
    fake_pool.store.fetchval_handler = lambda q, a: 2  # prior_action_count

    resp = await admin_client.get(f"/api/v1/admin/reports/{report_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["message"]["body"] == "hey there"
    assert body["message"]["author"]["display_name"] == "Alice"
    assert len(body["context"]) == 1
    assert "reporter_user_id" in body  # visible to moderators, unlike the reported user
    assert "phone" not in str(body)  # no phone number anywhere by default


async def test_report_detail_context_query_scoped_to_same_community(
    admin_client: AsyncClient, fake_pool: FakePool
) -> None:
    """Regression guard for the highest-priority leak check: the nearby-
    messages context query must filter by the reported message's OWN
    archetype_slug — messages.id is a global BIGSERIAL, so without this
    filter an ID-distance ORDER BY could surface another community's
    messages purely by numeric proximity."""
    report_id = uuid4()
    author_id = uuid4()
    now = datetime.now(timezone.utc)

    fake_pool.store.fetchrow_handler = lambda q, a: (
        {
            "id": report_id, "reason": "harassment", "details": None, "status": "open",
            "reporter_user_id": uuid4(), "message_id": 5, "body": "hey",
            "message_created_at": now, "archetype_slug": "quiet-storm", "author_id": author_id,
        } if q.strip().startswith("SELECT mr.id, mr.reason")
        else {"id": author_id, "display_name": "Alice"}
    )
    fake_pool.store.fetch_handler = lambda q, a: []
    fake_pool.store.fetchval_handler = lambda q, a: 0

    resp = await admin_client.get(f"/api/v1/admin/reports/{report_id}")
    assert resp.status_code == 200

    context_calls = [item for item in fake_pool.store.queries if "ORDER BY ABS(id -" in item[0]]
    assert len(context_calls) == 1
    query, args = context_calls[0]
    assert "WHERE archetype_slug = $1" in query
    assert args[0] == "quiet-storm"  # the reported message's own community, never client-supplied
    assert args[1] == 5  # the reported message's own id


async def test_report_detail_invalid_id_returns_400(admin_client: AsyncClient) -> None:
    resp = await admin_client.get("/api/v1/admin/reports/not-a-uuid")
    assert resp.status_code == 400


async def test_report_detail_missing_returns_404(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.fetchrow_handler = lambda q, a: None
    resp = await admin_client.get(f"/api/v1/admin/reports/{uuid4()}")
    assert resp.status_code == 404


async def test_resolve_report_requires_action_password(fake_pool: FakePool) -> None:
    async def _override_pool() -> FakePool:
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                f"/api/v1/admin/reports/{uuid4()}/resolve",
                headers=_ADMIN_ONLY_HEADERS, json={"reason": "not spam after all"},
            )
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)
    assert resp.status_code == 403


async def test_resolve_report_writes_audit_row_and_resolves(
    admin_client: AsyncClient, fake_pool: FakePool
) -> None:
    report_id = uuid4()
    author_id = uuid4()
    fake_pool.store.fetchrow_handler = lambda q, a: {"message_id": 1, "author_id": author_id}

    resp = await admin_client.post(
        f"/api/v1/admin/reports/{report_id}/resolve",
        headers=_ADMIN_HEADERS, json={"reason": "checked, not spam"},
    )
    assert resp.status_code == 200

    inserts = [q for q, a in fake_pool.store.queries if q.strip().startswith("INSERT INTO moderation_actions")]
    assert len(inserts) == 1
    _, insert_args = [item for item in fake_pool.store.queries if item[0].strip().startswith("INSERT INTO moderation_actions")][0]
    assert insert_args[4] == settings.ADMIN_ACTOR_ID  # actor_id server-derived, never from the request
    assert insert_args[5] == "resolve_no_action"

    resolves = [q for q, a in fake_pool.store.queries if "UPDATE message_reports SET status = 'resolved'" in q]
    assert len(resolves) == 1


async def test_delete_message_requires_action_password() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/admin/messages/1/delete", headers=_ADMIN_ONLY_HEADERS, json={"reason": "spam"}
        )
    assert resp.status_code == 403


async def test_delete_message_sets_deleted_at_and_writes_audit_row(
    admin_client: AsyncClient, fake_pool: FakePool
) -> None:
    author_id = uuid4()
    fake_pool.store.fetchrow_handler = lambda q, a: {"user_id": author_id}

    resp = await admin_client.post(
        "/api/v1/admin/messages/1/delete", headers=_ADMIN_HEADERS, json={"reason": "spam"}
    )
    assert resp.status_code == 200

    updates = [q for q, a in fake_pool.store.queries if q.strip().startswith("UPDATE messages SET deleted_at")]
    assert len(updates) == 1
    inserts = [item for item in fake_pool.store.queries if item[0].strip().startswith("INSERT INTO moderation_actions")]
    assert inserts[0][1][5] == "delete_message"


async def test_delete_message_missing_returns_404(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.fetchrow_handler = lambda q, a: None
    resp = await admin_client.post(
        "/api/v1/admin/messages/999/delete", headers=_ADMIN_HEADERS, json={"reason": "spam"}
    )
    assert resp.status_code == 404


async def test_suspend_user_requires_action_password() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/admin/users/{uuid4()}/suspend",
            headers=_ADMIN_ONLY_HEADERS,
            json={"reason": "cooldown", "until": "2027-01-01T00:00:00+00:00"},
        )
    assert resp.status_code == 403


async def test_suspend_user_revokes_sessions_and_writes_audit_row(
    admin_client: AsyncClient, fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _no_redis():
        return None
    monkeypatch.setattr("app.api.v1.admin.get_redis", _no_redis)

    user_id = uuid4()
    fake_pool.store.execute_handler = lambda q, a: "UPDATE 1"

    resp = await admin_client.post(
        f"/api/v1/admin/users/{user_id}/suspend",
        headers=_ADMIN_HEADERS,
        json={"reason": "cooldown", "until": "2027-01-01T00:00:00+00:00"},
    )
    assert resp.status_code == 200

    suspend_updates = [q for q, a in fake_pool.store.queries if q.strip().startswith("UPDATE users SET suspended_until")]
    assert len(suspend_updates) == 1
    revokes = [q for q, a in fake_pool.store.queries if "UPDATE user_sessions SET revoked_at" in q]
    assert len(revokes) == 1
    inserts = [item for item in fake_pool.store.queries if item[0].strip().startswith("INSERT INTO moderation_actions")]
    assert inserts[0][1][5] == "suspend_user"


async def test_suspend_user_not_found_returns_404(
    admin_client: AsyncClient, fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _no_redis():
        return None
    monkeypatch.setattr("app.api.v1.admin.get_redis", _no_redis)
    fake_pool.store.execute_handler = lambda q, a: "UPDATE 0"

    resp = await admin_client.post(
        f"/api/v1/admin/users/{uuid4()}/suspend",
        headers=_ADMIN_HEADERS, json={"reason": "cooldown", "until": "2027-01-01T00:00:00+00:00"},
    )
    assert resp.status_code == 404


async def test_ban_user_requires_action_password() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/admin/users/{uuid4()}/ban", headers=_ADMIN_ONLY_HEADERS, json={"reason": "abuse"}
        )
    assert resp.status_code == 403


async def test_ban_user_sets_banned_revokes_sessions_and_writes_audit_row(
    admin_client: AsyncClient, fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _no_redis():
        return None
    monkeypatch.setattr("app.api.v1.admin.get_redis", _no_redis)

    user_id = uuid4()
    fake_pool.store.execute_handler = lambda q, a: "UPDATE 1"

    resp = await admin_client.post(
        f"/api/v1/admin/users/{user_id}/ban", headers=_ADMIN_HEADERS, json={"reason": "repeated harassment"}
    )
    assert resp.status_code == 200

    ban_updates = [q for q, a in fake_pool.store.queries if q.strip().startswith("UPDATE users SET banned")]
    assert len(ban_updates) == 1
    revokes = [q for q, a in fake_pool.store.queries if "UPDATE user_sessions SET revoked_at" in q]
    assert len(revokes) == 1
    inserts = [item for item in fake_pool.store.queries if item[0].strip().startswith("INSERT INTO moderation_actions")]
    assert inserts[0][1][5] == "ban_user"
    assert inserts[0][1][4] == settings.ADMIN_ACTOR_ID


async def test_ban_publishes_control_event_after_commit(
    admin_client: AsyncClient, fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch, fake_redis
) -> None:
    published = []

    async def _fake_redis():
        return fake_redis

    monkeypatch.setattr("app.api.v1.admin.get_redis", _fake_redis)
    fake_pool.store.execute_handler = lambda q, a: "UPDATE 1"

    user_id = uuid4()
    resp = await admin_client.post(
        f"/api/v1/admin/users/{user_id}/ban", headers=_ADMIN_HEADERS, json={"reason": "abuse"}
    )
    assert resp.status_code == 200
    publishes = [c for c in fake_redis.calls if c[0] == "publish"]
    assert len(publishes) == 1
    channel, message = publishes[0][1]
    assert channel == "control:ban"
    assert str(user_id) in message

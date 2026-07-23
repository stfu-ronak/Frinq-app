from __future__ import annotations

import base64
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import CurrentAccount, get_current_account, get_pool
from app.main import app as fastapi_app
from tests.conftest import FakePool


@pytest.fixture
def current_account(user_row: dict[str, Any]) -> CurrentAccount:
    """Override conftest's default (community_slug=None) — most of these
    tests need an assigned community."""
    return CurrentAccount(
        id=user_row["id"],
        phone=user_row["phone"],
        row=user_row,
        session_id=uuid4(),
        onboarding_state=user_row["onboarding_state"],
        community_slug="quiet-storm",
        banned=user_row["banned"],
    )


async def test_every_route_requires_a_valid_access_token(fake_pool: FakePool) -> None:
    # get_pool must be stubbed (get_current_account depends on it to resolve
    # at all) — get_current_account itself is deliberately left un-overridden
    # so the missing-bearer rejection actually runs, same pattern as
    # test_quiz_ownership.py::test_unauthenticated_cannot_complete_summarize_or_submit.
    async def _override_pool() -> FakePool:
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            assert (await ac.get("/api/v1/community/me")).status_code == 401
            assert (await ac.get("/api/v1/community/messages")).status_code == 401
            assert (await ac.patch("/api/v1/community/preferences", json={"muted": True})).status_code == 401
            assert (await ac.post(f"/api/v1/users/{uuid4()}/block")).status_code == 401
            assert (await ac.delete(f"/api/v1/users/{uuid4()}/block")).status_code == 401
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)


async def test_get_my_community_returns_own_archetype_only(client: AsyncClient, fake_pool: FakePool) -> None:
    joined = datetime(2026, 1, 1, tzinfo=timezone.utc)
    fake_pool.store.fetchrow_handler = lambda q, a: {
        "archetype_slug": "quiet-storm", "name": "Quiet Storm",
        "description": "...", "muted": True, "joined_at": joined,
    }
    resp = await client.get("/api/v1/community/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["archetype_slug"] == "quiet-storm"
    # community_slug came from the authenticated account, never a query param —
    # there is no way to ask for anyone else's community via this endpoint.


async def test_get_my_community_404_when_no_membership(client: AsyncClient, fake_pool: FakePool) -> None:
    fastapi_app.dependency_overrides[get_current_account] = lambda: CurrentAccount(
        id=uuid4(), phone=None, row={}, session_id=uuid4(),
        onboarding_state="active", community_slug=None, banned=False,
    )
    try:
        resp = await client.get("/api/v1/community/me")
    finally:
        del fastapi_app.dependency_overrides[get_current_account]
    assert resp.status_code == 404


async def test_messages_limit_defaults_to_50_and_is_clamped(client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.fetch_handler = lambda q, a: []
    await client.get("/api/v1/community/messages")
    _, args = fake_pool.store.queries[-1]
    assert args[-1] == 50  # default

    assert (await client.get("/api/v1/community/messages?limit=0")).status_code == 422
    assert (await client.get("/api/v1/community/messages?limit=101")).status_code == 422
    fake_pool.store.queries.clear()
    await client.get("/api/v1/community/messages?limit=100")
    _, args = fake_pool.store.queries[-1]
    assert args[-1] == 100


async def test_history_is_reversed_to_oldest_first_for_rendering(client: AsyncClient, fake_pool: FakePool) -> None:
    t = datetime(2026, 1, 1, tzinfo=timezone.utc)
    author = uuid4()
    # FakeConnection.fetch returns rows in whatever order the handler gives —
    # simulate the DB's newest-first (DESC) result.
    db_rows_newest_first = [
        {"id": 3, "client_message_id": uuid4(), "body": "third", "created_at": t, "author_id": author, "author_name": "A"},
        {"id": 2, "client_message_id": uuid4(), "body": "second", "created_at": t, "author_id": author, "author_name": "A"},
        {"id": 1, "client_message_id": uuid4(), "body": "first", "created_at": t, "author_id": author, "author_name": "A"},
    ]

    def handler(query: str, args: tuple[Any, ...]):
        if query.strip().startswith("SELECT CASE WHEN blocker_user_id"):
            return []
        return db_rows_newest_first

    fake_pool.store.fetch_handler = handler
    resp = await client.get("/api/v1/community/messages")
    bodies = [m["body"] for m in resp.json()["messages"]]
    assert bodies == ["first", "second", "third"]


async def test_query_excludes_deleted_messages(client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.fetch_handler = lambda q, a: []
    await client.get("/api/v1/community/messages")
    query, _ = fake_pool.store.queries[-1]
    assert "deleted_at IS NULL" in query


async def test_blocked_authors_absent_from_history(client: AsyncClient, fake_pool: FakePool) -> None:
    t = datetime(2026, 1, 1, tzinfo=timezone.utc)
    blocked_author = uuid4()
    ok_author = uuid4()

    def handler(query: str, args: tuple[Any, ...]):
        if query.strip().startswith("SELECT CASE WHEN blocker_user_id"):
            return [{"other_id": blocked_author}]
        return [
            {"id": 2, "client_message_id": uuid4(), "body": "from blocked", "created_at": t,
             "author_id": blocked_author, "author_name": "Blocked"},
            {"id": 1, "client_message_id": uuid4(), "body": "from ok", "created_at": t,
             "author_id": ok_author, "author_name": "OK"},
        ]

    fake_pool.store.fetch_handler = handler
    resp = await client.get("/api/v1/community/messages")
    bodies = [m["body"] for m in resp.json()["messages"]]
    assert bodies == ["from ok"]


async def test_garbage_cursor_returns_400(client: AsyncClient, fake_pool: FakePool) -> None:
    resp = await client.get("/api/v1/community/messages?before=not-valid-base64!!!")
    assert resp.status_code == 400


async def test_cursor_roundtrip_is_opaque_base64url() -> None:
    from app.api.v1.communities import _decode_cursor, _encode_cursor

    t = datetime(2026, 3, 1, 12, 30, tzinfo=timezone.utc)
    cursor = _encode_cursor(t, 42)
    # Never an offset — decode and confirm it's timestamp+id, not a bare int.
    assert not cursor.isdigit()
    base64.urlsafe_b64decode(cursor + "==")  # doesn't raise
    decoded_t, decoded_id = _decode_cursor(cursor)
    assert decoded_id == 42
    assert decoded_t == t


async def test_preferences_only_touches_muted(client: AsyncClient, fake_pool: FakePool) -> None:
    resp = await client.patch("/api/v1/community/preferences", json={"muted": False})
    assert resp.status_code == 200
    query, args = fake_pool.store.queries[-1]
    assert "UPDATE community_members SET muted" in query
    assert "role" not in query.lower()


async def test_preferences_rejects_unknown_fields(client: AsyncClient) -> None:
    resp = await client.patch(
        "/api/v1/community/preferences", json={"muted": True, "archetype_slug": "hack"}
    )
    assert resp.status_code == 422


async def test_cannot_block_self(client: AsyncClient, current_account: CurrentAccount) -> None:
    resp = await client.post(f"/api/v1/users/{current_account.id}/block")
    assert resp.status_code == 400


async def test_block_is_idempotent(client: AsyncClient, fake_pool: FakePool) -> None:
    target = uuid4()
    resp1 = await client.post(f"/api/v1/users/{target}/block")
    resp2 = await client.post(f"/api/v1/users/{target}/block")
    assert resp1.status_code == 201
    assert resp2.status_code == 201
    assert resp1.json() == resp2.json() == {"blocked": True}
    for query, _ in fake_pool.store.queries:
        assert "ON CONFLICT" in query or "block" not in query.lower()


async def test_unblock_is_idempotent(client: AsyncClient) -> None:
    target = uuid4()
    resp1 = await client.delete(f"/api/v1/users/{target}/block")
    resp2 = await client.delete(f"/api/v1/users/{target}/block")
    assert resp1.status_code == 200 == resp2.status_code
    assert resp1.json() == {"blocked": False}

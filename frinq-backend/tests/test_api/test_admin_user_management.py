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


def _exec_users_update(result: str):
    """execute_handler that returns `result` for the `UPDATE users ...` mutation
    and a plain OK for everything else (the moderation_actions INSERT, session
    revoke, etc.)."""
    def handler(q: str, a: tuple[Any, ...]) -> str:
        if q.strip().startswith("UPDATE users"):
            return result
        return "OK"
    return handler


# ─── list / search ──────────────────────────────────────────────────────────

async def test_list_users_requires_admin_key(fake_pool: FakePool) -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/admin/users")
    assert resp.status_code == 401


async def test_list_users_masks_phone_and_returns_total(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    now = datetime.now(timezone.utc)
    fake_pool.store.fetch_handler = lambda q, a: [{
        "id": uuid4(), "phone": "+919999912345", "display_name": "Asha",
        "onboarding_state": "chat", "banned": False, "banned_reason": None,
        "suspended_until": None, "created_at": now, "last_seen_at": now,
    }]
    fake_pool.store.fetchval_handler = lambda q, a: 1

    resp = await admin_client.get("/api/v1/admin/users?q=asha")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["users"][0]["phone"] == "****2345"  # masked in the list view
    assert "+919999912345" not in resp.text  # full number never in a bulk list


async def test_list_users_status_filter_adds_banned_predicate(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.fetch_handler = lambda q, a: []
    fake_pool.store.fetchval_handler = lambda q, a: 0
    await admin_client.get("/api/v1/admin/users?status=banned")
    select = [q for q, a in fake_pool.store.queries if q.strip().startswith("SELECT id, phone, display_name")][0]
    assert "banned = TRUE" in select


async def test_list_users_exact_uuid_query_matches_by_id(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.fetch_handler = lambda q, a: []
    fake_pool.store.fetchval_handler = lambda q, a: 0
    uid = uuid4()
    await admin_client.get(f"/api/v1/admin/users?q={uid}")
    select = [q for q, a in fake_pool.store.queries if q.strip().startswith("SELECT id, phone, display_name")][0]
    assert "id = $1" in select  # UUID -> exact id match, not an ILIKE substring


# ─── detail ─────────────────────────────────────────────────────────────────

async def test_user_detail_returns_full_phone_and_counts(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    now = datetime.now(timezone.utc)
    uid = uuid4()
    fake_pool.store.fetchrow_handler = lambda q, a: {
        "id": uid, "phone": "+919999912345", "display_name": "Asha", "gender": "female",
        "age": 27, "onboarding_state": "chat", "banned": False, "banned_reason": None,
        "banned_at": None, "suspended_until": None, "created_at": now, "updated_at": now,
        "last_seen_at": now,
    }
    fake_pool.store.fetchval_handler = lambda q, a: 3

    resp = await admin_client.get(f"/api/v1/admin/users/{uid}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["phone"] == "+919999912345"  # full number on the single-user view
    assert body["active_sessions"] == 3
    assert body["submission_count"] == 3
    assert body["moderation_action_count"] == 3


async def test_user_detail_invalid_id_400(admin_client: AsyncClient) -> None:
    resp = await admin_client.get("/api/v1/admin/users/not-a-uuid")
    assert resp.status_code == 400


async def test_user_detail_missing_404(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.fetchrow_handler = lambda q, a: None
    resp = await admin_client.get(f"/api/v1/admin/users/{uuid4()}")
    assert resp.status_code == 404


# ─── unban / unsuspend / force-logout ────────────────────────────────────────

async def test_unban_requires_action_password() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/admin/users/{uuid4()}/unban", headers=_ADMIN_ONLY_HEADERS, json={"reason": "mistake"}
        )
    assert resp.status_code == 403


async def test_unban_clears_ban_and_writes_audit_row(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.execute_handler = _exec_users_update("UPDATE 1")
    resp = await admin_client.post(
        f"/api/v1/admin/users/{uuid4()}/unban", headers=_ADMIN_HEADERS, json={"reason": "ban was wrong"}
    )
    assert resp.status_code == 200
    updates = [q for q, a in fake_pool.store.queries if q.strip().startswith("UPDATE users SET banned = FALSE")]
    assert len(updates) == 1
    inserts = [item for item in fake_pool.store.queries if item[0].strip().startswith("INSERT INTO moderation_actions")]
    assert inserts[0][1][5] == "unban_user"
    assert inserts[0][1][4] == settings.ADMIN_ACTOR_ID  # actor server-derived


async def test_unban_when_not_banned_returns_404(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.execute_handler = _exec_users_update("UPDATE 0")
    resp = await admin_client.post(
        f"/api/v1/admin/users/{uuid4()}/unban", headers=_ADMIN_HEADERS, json={"reason": "x"}
    )
    assert resp.status_code == 404


async def test_unsuspend_clears_suspension_and_writes_audit_row(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.execute_handler = _exec_users_update("UPDATE 1")
    resp = await admin_client.post(
        f"/api/v1/admin/users/{uuid4()}/unsuspend", headers=_ADMIN_HEADERS, json={"reason": "served enough"}
    )
    assert resp.status_code == 200
    updates = [q for q, a in fake_pool.store.queries if "suspended_until = NULL" in q]
    assert len(updates) == 1
    inserts = [item for item in fake_pool.store.queries if item[0].strip().startswith("INSERT INTO moderation_actions")]
    assert inserts[0][1][5] == "unsuspend_user"


async def test_force_logout_revokes_sessions_and_audits(
    admin_client: AsyncClient, fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _no_redis():
        return None
    monkeypatch.setattr("app.api.v1.admin.get_redis", _no_redis)
    fake_pool.store.fetchval_handler = lambda q, a: 1  # user exists

    resp = await admin_client.post(
        f"/api/v1/admin/users/{uuid4()}/force-logout", headers=_ADMIN_HEADERS, json={"reason": "lost phone"}
    )
    assert resp.status_code == 200
    revokes = [q for q, a in fake_pool.store.queries if "UPDATE user_sessions SET revoked_at" in q]
    assert len(revokes) == 1
    inserts = [item for item in fake_pool.store.queries if item[0].strip().startswith("INSERT INTO moderation_actions")]
    assert inserts[0][1][5] == "force_logout"


async def test_force_logout_missing_user_404(
    admin_client: AsyncClient, fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _no_redis():
        return None
    monkeypatch.setattr("app.api.v1.admin.get_redis", _no_redis)
    fake_pool.store.fetchval_handler = lambda q, a: None  # user does not exist

    resp = await admin_client.post(
        f"/api/v1/admin/users/{uuid4()}/force-logout", headers=_ADMIN_HEADERS, json={"reason": "x"}
    )
    assert resp.status_code == 404


# ─── audit log ───────────────────────────────────────────────────────────────

async def test_audit_log_lists_actions_with_target_name(admin_client: AsyncClient, fake_pool: FakePool) -> None:
    now = datetime.now(timezone.utc)
    target = uuid4()
    fake_pool.store.fetch_handler = lambda q, a: [{
        "id": uuid4(), "action": "ban_user", "reason": "abuse", "actor_id": "dhairya",
        "target_user_id": target, "message_id": None, "report_id": None,
        "created_at": now, "target_display_name": "Asha",
    }]
    fake_pool.store.fetchval_handler = lambda q, a: 1

    resp = await admin_client.get("/api/v1/admin/audit-log?action=ban_user")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["actions"][0]["action"] == "ban_user"
    assert body["actions"][0]["target_display_name"] == "Asha"
    # the action filter is bound as a parameter, not string-interpolated
    select = [q for q, a in fake_pool.store.queries if "FROM moderation_actions ma" in q and "SELECT ma.id" in q][0]
    assert "ma.action = $1" in select

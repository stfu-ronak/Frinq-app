from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.core.reverify import ACCOUNT_DELETE_ACTION, create_reauth_token
from app.main import app as fastapi_app
from tests.conftest import FakePool, FakeRedis


async def _ok() -> None:
    return None


@pytest.fixture(autouse=True)
def no_real_redis_for_auth(monkeypatch: pytest.MonkeyPatch, fake_redis: FakeRedis) -> None:
    """otp_request/otp_verify are fail-closed limiters — these tests must
    not depend on whether a real Redis happens to be reachable."""
    async def _fake_redis():
        return fake_redis

    monkeypatch.setattr("app.api.v1.auth.get_redis", _fake_redis)


# ─── /legal/current, /legal/accept ──────────────────────────────────────

async def test_get_current_legal_returns_draft_versions(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/legal/current")
    assert resp.status_code == 200
    body = resp.json()
    assert body["terms_version"] == settings.CURRENT_TERMS_VERSION
    assert body["privacy_version"] == settings.CURRENT_PRIVACY_VERSION


async def test_legal_current_requires_no_auth() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/legal/current")
    assert resp.status_code == 200


async def test_accept_legal_requires_auth(fake_pool: FakePool) -> None:
    from app.api.deps import get_pool

    async def _override_pool() -> FakePool:
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/v1/legal/accept", json={
                "terms_version": "draft-1", "privacy_version": "draft-1", "locale": "en-IN", "source": "web",
            })
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)
    assert resp.status_code == 401


async def test_accept_legal_stores_acceptance_and_stamps_user(client: AsyncClient, fake_pool: FakePool) -> None:
    resp = await client.post("/api/v1/legal/accept", json={
        "terms_version": "draft-1", "privacy_version": "draft-1", "locale": "en-IN", "source": "web",
    })
    assert resp.status_code == 201
    inserts = [q for q, a in fake_pool.store.queries if q.strip().startswith("INSERT INTO legal_acceptances")]
    assert len(inserts) == 1
    updates = [q for q, a in fake_pool.store.queries if q.strip().startswith("UPDATE users SET terms_version")]
    assert len(updates) == 1


async def test_accept_legal_rejects_unknown_fields(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/legal/accept", json={
        "terms_version": "draft-1", "privacy_version": "draft-1", "locale": "en-IN", "source": "web", "extra": "x",
    })
    assert resp.status_code == 422


# ─── require_current_legal gates chat, not everything else ──────────────

async def test_community_messages_blocked_without_current_legal_acceptance(
    client: AsyncClient, user_row: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.deps import CurrentAccount, get_current_account

    stale_row = {**user_row, "terms_version": "old-version", "privacy_version": "old-version"}
    account = CurrentAccount(
        id=stale_row["id"], phone=stale_row["phone"], row=stale_row, session_id=uuid4(),
        onboarding_state="active", community_slug="quiet-storm", banned=False,
    )
    fastapi_app.dependency_overrides[get_current_account] = lambda: account
    try:
        resp = await client.get("/api/v1/community/messages")
    finally:
        del fastapi_app.dependency_overrides[get_current_account]
    assert resp.status_code == 403
    assert "legal_acceptance_required" in resp.text


async def test_community_messages_allowed_with_current_legal_acceptance(
    client: AsyncClient, fake_pool: FakePool, user_row: dict[str, Any]
) -> None:
    from app.api.deps import CurrentAccount, get_current_account

    current_row = {**user_row, "terms_version": settings.CURRENT_TERMS_VERSION, "privacy_version": settings.CURRENT_PRIVACY_VERSION}
    account = CurrentAccount(
        id=current_row["id"], phone=current_row["phone"], row=current_row, session_id=uuid4(),
        onboarding_state="active", community_slug="quiet-storm", banned=False,
    )
    fastapi_app.dependency_overrides[get_current_account] = lambda: account
    fake_pool.store.fetch_handler = lambda q, a: []
    try:
        resp = await client.get("/api/v1/community/messages")
    finally:
        del fastapi_app.dependency_overrides[get_current_account]
    assert resp.status_code == 200


async def test_community_me_not_gated_by_legal_acceptance(
    client: AsyncClient, fake_pool: FakePool, user_row: dict[str, Any]
) -> None:
    """GET /community/me stays reachable even without current acceptance —
    only history/preferences/ws-ticket are gated, per the plan."""
    from app.api.deps import CurrentAccount, get_current_account

    stale_row = {**user_row, "terms_version": "old", "privacy_version": "old"}
    account = CurrentAccount(
        id=stale_row["id"], phone=stale_row["phone"], row=stale_row, session_id=uuid4(),
        onboarding_state="active", community_slug="quiet-storm", banned=False,
    )
    fastapi_app.dependency_overrides[get_current_account] = lambda: account
    fake_pool.store.fetchrow_handler = lambda q, a: {
        "archetype_slug": "quiet-storm", "name": "Quiet Storm", "description": "", "muted": True,
        "joined_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc),
    }
    try:
        resp = await client.get("/api/v1/community/me")
    finally:
        del fastapi_app.dependency_overrides[get_current_account]
    assert resp.status_code == 200


# ─── /auth/reverify/request, /auth/reverify/verify ──────────────────────

async def test_reverify_request_sends_otp_to_own_phone_only(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, current_account
) -> None:
    sent_to = {}

    async def _fake_send(phone: str) -> None:
        sent_to["phone"] = phone

    monkeypatch.setattr("app.api.v1.auth.send_otp", _fake_send)
    resp = await client.post("/api/v1/auth/reverify/request")
    assert resp.status_code == 202
    assert sent_to["phone"] == current_account.phone
    # No phone field is even accepted in the request body.


async def test_reverify_request_requires_auth(fake_pool: FakePool) -> None:
    from app.api.deps import get_pool

    async def _override_pool() -> FakePool:
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/v1/auth/reverify/request")
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)
    assert resp.status_code == 401


async def test_reverify_verify_returns_reauth_token_on_success(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.v1.auth.verify_otp", lambda phone, code: _ok())
    resp = await client.post("/api/v1/auth/reverify/verify", json={"code": "123456"})
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["reauth_token"], str) and len(body["reauth_token"]) > 20
    assert body["expires_in"] == settings.REAUTH_TOKEN_TTL_SECONDS


async def test_reverify_verify_wrong_code_returns_400(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _bad(phone: str, code: str) -> None:
        raise ValueError("invalid_code")

    monkeypatch.setattr("app.api.v1.auth.verify_otp", _bad)
    resp = await client.post("/api/v1/auth/reverify/verify", json={"code": "000000"})
    assert resp.status_code == 400


async def test_reverify_verify_expired_returns_410(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _expired(phone: str, code: str) -> None:
        raise ValueError("expired")

    monkeypatch.setattr("app.api.v1.auth.verify_otp", _expired)
    resp = await client.post("/api/v1/auth/reverify/verify", json={"code": "123456"})
    assert resp.status_code == 410


# ─── DELETE /users/me ────────────────────────────────────────────────────

async def test_delete_me_requires_reauth_token_field(client: AsyncClient) -> None:
    resp = await client.request("DELETE", "/api/v1/users/me", json={})
    assert resp.status_code == 422


async def test_delete_me_rejects_a_token_for_a_different_user(
    client: AsyncClient, fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch, fake_redis: FakeRedis
) -> None:
    async def _fake_redis():
        return fake_redis
    monkeypatch.setattr("app.api.v1.users.get_redis", _fake_redis)

    token = create_reauth_token(user_id=uuid4(), session_id=uuid4(), action=ACCOUNT_DELETE_ACTION)
    resp = await client.request("DELETE", "/api/v1/users/me", json={"reauth_token": token})
    assert resp.status_code == 401


async def test_delete_me_rejects_a_token_for_a_different_action(
    client: AsyncClient, current_account, monkeypatch: pytest.MonkeyPatch, fake_redis: FakeRedis
) -> None:
    async def _fake_redis():
        return fake_redis
    monkeypatch.setattr("app.api.v1.users.get_redis", _fake_redis)

    token = create_reauth_token(user_id=current_account.id, session_id=current_account.session_id, action="some_other_action")
    resp = await client.request("DELETE", "/api/v1/users/me", json={"reauth_token": token})
    assert resp.status_code == 401


async def test_delete_me_succeeds_with_a_valid_reauth_token_and_hard_deletes(
    client: AsyncClient, fake_pool: FakePool, current_account, monkeypatch: pytest.MonkeyPatch, fake_redis: FakeRedis
) -> None:
    async def _fake_redis():
        return fake_redis
    monkeypatch.setattr("app.api.v1.users.get_redis", _fake_redis)

    fake_pool.store.execute_handler = lambda q, a: (
        "DELETE 1" if q.strip().startswith("DELETE FROM users") else "OK"
    )

    token = create_reauth_token(user_id=current_account.id, session_id=current_account.session_id, action=ACCOUNT_DELETE_ACTION)
    resp = await client.request("DELETE", "/api/v1/users/me", json={"reauth_token": token})
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(current_account.id)
    assert "phone" not in body

    deletes = [q for q, a in fake_pool.store.queries if q.strip().startswith("DELETE FROM users")]
    assert len(deletes) == 1
    revokes = [q for q, a in fake_pool.store.queries if "UPDATE user_sessions SET revoked_at" in q]
    assert len(revokes) == 1
    tracking_deletes = [q for q, a in fake_pool.store.queries if q.strip().startswith("DELETE FROM tracking_events")]
    assert len(tracking_deletes) == 1


async def test_delete_me_reauth_token_is_single_use(
    client: AsyncClient, fake_pool: FakePool, current_account, monkeypatch: pytest.MonkeyPatch, fake_redis: FakeRedis
) -> None:
    async def _fake_redis():
        return fake_redis
    monkeypatch.setattr("app.api.v1.users.get_redis", _fake_redis)
    fake_pool.store.execute_handler = lambda q, a: (
        "DELETE 1" if q.strip().startswith("DELETE FROM users") else "OK"
    )

    token = create_reauth_token(user_id=current_account.id, session_id=current_account.session_id, action=ACCOUNT_DELETE_ACTION)
    resp1 = await client.request("DELETE", "/api/v1/users/me", json={"reauth_token": token})
    assert resp1.status_code == 200

    resp2 = await client.request("DELETE", "/api/v1/users/me", json={"reauth_token": token})
    assert resp2.status_code == 401


async def test_delete_me_publishes_ban_control_event_to_close_active_sockets(
    client: AsyncClient, fake_pool: FakePool, current_account, monkeypatch: pytest.MonkeyPatch, fake_redis: FakeRedis
) -> None:
    async def _fake_redis():
        return fake_redis
    monkeypatch.setattr("app.api.v1.users.get_redis", _fake_redis)
    fake_pool.store.execute_handler = lambda q, a: (
        "DELETE 1" if q.strip().startswith("DELETE FROM users") else "OK"
    )

    token = create_reauth_token(user_id=current_account.id, session_id=current_account.session_id, action=ACCOUNT_DELETE_ACTION)
    await client.request("DELETE", "/api/v1/users/me", json={"reauth_token": token})

    publishes = [c for c in fake_redis.calls if c[0] == "publish"]
    assert len(publishes) == 1
    channel, message = publishes[0][1]
    assert channel == "control:ban"
    assert str(current_account.id) in message

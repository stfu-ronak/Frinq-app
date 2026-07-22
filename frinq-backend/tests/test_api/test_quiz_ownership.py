from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_account
from app.core.session import (
    SessionReuseError,
    TokenPair,
    create_session,
    revoke_session,
)
from app.main import app as fastapi_app
from tests.conftest import FakePool


# ─── Task 6: refresh / logout ──────────────────────────────────────────

async def test_refresh_returns_new_token_pair(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    new_pair = TokenPair(access_token="new-access", refresh_token="new-refresh")

    async def _fake_rotate(conn: Any, refresh_token: str) -> TokenPair:
        assert refresh_token == "old-refresh"
        return new_pair

    monkeypatch.setattr("app.api.v1.sessions.rotate_session", _fake_rotate)

    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": "old-refresh"})
    assert response.status_code == 200, response.text
    assert response.json() == {"access_token": "new-access", "refresh_token": "new-refresh"}


async def test_refresh_reuse_rejected_with_401(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_rotate(conn: Any, refresh_token: str) -> TokenPair:
        raise SessionReuseError("reused")

    monkeypatch.setattr("app.api.v1.sessions.rotate_session", _fake_rotate)

    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": "old-refresh"})
    assert response.status_code == 401


async def test_logout_returns_204_and_revokes_named_session(
    client: AsyncClient,
    fake_pool: FakePool,
    current_account: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    revoked: dict[str, Any] = {}

    async def _fake_revoke(conn: Any, session_id: Any) -> None:
        revoked["session_id"] = session_id

    monkeypatch.setattr("app.api.v1.sessions.revoke_session", _fake_revoke)

    response = await client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    assert revoked["session_id"] == current_account.session_id


class _NoopTransaction:
    async def __aenter__(self) -> "_NoopTransaction":
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class _FakeAccountConnection:
    """Combined user_sessions + users fake — enough for get_current_account
    to run its real query sequence against a session create_session/
    revoke_session actually mutate."""

    def __init__(self, user_row: dict[str, Any]) -> None:
        self.session_row: dict[str, Any] | None = None
        self.user_row = user_row

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        if "user_sessions" in query:
            return dict(self.session_row) if self.session_row is not None else None
        if "FROM users WHERE id" in query:
            return dict(self.user_row)
        return None

    async def execute(self, query: str, *args: Any) -> str:
        if query.strip().startswith("INSERT INTO user_sessions"):
            session_id, user_id, secret_hash, platform, expires_at = args
            self.session_row = {
                "id": session_id,
                "user_id": user_id,
                "refresh_secret_hash": secret_hash,
                "platform": platform,
                "expires_at": expires_at,
                "revoked_at": None,
            }
        elif "SET revoked_at = now()" in query:
            assert self.session_row is not None
            self.session_row["revoked_at"] = datetime.now(timezone.utc)
        return "OK"

    def transaction(self) -> _NoopTransaction:
        return _NoopTransaction()


class _FakeCtx:
    def __init__(self, conn: Any) -> None:
        self.conn = conn

    async def __aenter__(self) -> Any:
        return self.conn

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class _FakeAccountPool:
    def __init__(self, conn: Any) -> None:
        self.conn = conn

    def acquire(self) -> _FakeCtx:
        return _FakeCtx(self.conn)


async def test_logout_then_access_token_rejected(user_row: dict[str, Any]) -> None:
    conn = _FakeAccountConnection(user_row)
    pool = _FakeAccountPool(conn)
    user_id = user_row["id"]

    pair = await create_session(conn, user_id, "web")
    account = await get_current_account(authorization=f"Bearer {pair.access_token}", pool=pool)
    assert account.id == user_id

    await revoke_session(conn, account.session_id)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_account(authorization=f"Bearer {pair.access_token}", pool=pool)
    assert exc_info.value.status_code == 401


# ─── Task 6: quiz/voice ownership ──────────────────────────────────────

async def test_user_cannot_patch_other_users_submission(
    client: AsyncClient,
    fake_pool: FakePool,
) -> None:
    def _execute_handler(query: str, args: tuple[Any, ...]) -> str:
        if query.strip().startswith("UPDATE quiz_submissions") and "last_page" in query:
            return "UPDATE 0"  # WHERE id=$1 AND user_id=$2 matched nothing
        return "OK"

    fake_pool.store.execute_handler = _execute_handler

    response = await client.patch(
        f"/api/v1/quiz/partial/{uuid4()}",
        json={"answers": {"q1": "a"}},
    )
    assert response.status_code == 404


async def test_user_cannot_complete_other_users_submission(
    client: AsyncClient,
    fake_pool: FakePool,
) -> None:
    def _execute_handler(query: str, args: tuple[Any, ...]) -> str:
        if query.strip().startswith("UPDATE quiz_submissions") and "is_complete=TRUE" in query:
            return "UPDATE 0"
        return "OK"

    fake_pool.store.execute_handler = _execute_handler

    response = await client.patch(
        f"/api/v1/quiz/complete/{uuid4()}",
        json={"answers": {"q1": "a"}},
    )
    assert response.status_code == 404


async def test_user_cannot_summarize_other_users_submission(
    client: AsyncClient,
    fake_pool: FakePool,
) -> None:
    # Ownership filter (user_id = $2) is baked into the query; a mismatch
    # naturally returns no row rather than another user's data.
    fake_pool.store.fetchrow_handler = lambda query, args: None

    response = await client.get(f"/api/v1/quiz/summary/{uuid4()}")
    assert response.status_code == 404


async def test_submit_sets_user_id_from_caller_session(
    client: AsyncClient,
    fake_pool: FakePool,
    current_account: Any,
) -> None:
    new_id = uuid4()
    fake_pool.store.fetchrow_handler = lambda query, args: {"id": new_id}

    response = await client.post(
        "/api/v1/quiz/submit",
        json={"answers": {"q1": "a"}, "is_complete": False},
    )
    assert response.status_code == 201, response.text

    insert_queries = [
        (q, a) for q, a in fake_pool.store.queries
        if q.strip().startswith("INSERT INTO quiz_submissions")
    ]
    assert len(insert_queries) == 1
    _, args = insert_queries[0]
    assert args[0] == current_account.id


async def test_user_cannot_upload_voice_to_other_users_submission(
    client: AsyncClient,
    fake_pool: FakePool,
) -> None:
    fake_pool.store.fetchrow_handler = lambda query, args: None  # ownership check finds nothing

    response = await client.post(
        "/api/v1/voice",
        data={"submission_id": str(uuid4()), "question_key": "q1", "duration_sec": "3"},
        files={"audio": ("clip.webm", b"fake-audio-bytes", "audio/webm")},
    )
    assert response.status_code == 404


async def test_unauthenticated_cannot_complete_summarize_or_submit(fake_pool: FakePool) -> None:
    # Only get_pool is stubbed (DB must be reachable for the dependency graph
    # to resolve at all) — get_current_account itself is deliberately left
    # un-overridden so the missing-bearer rejection actually runs.
    from app.api.deps import get_pool

    async def _override_pool() -> FakePool:
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            complete_resp = await ac.patch(
                f"/api/v1/quiz/complete/{uuid4()}", json={"answers": {}}
            )
            summary_resp = await ac.get(f"/api/v1/quiz/summary/{uuid4()}")
            submit_resp = await ac.post(
                "/api/v1/quiz/submit", json={"answers": {}, "is_complete": True}
            )
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)

    assert complete_resp.status_code == 401
    assert submit_resp.status_code == 401
    assert summary_resp.status_code == 401

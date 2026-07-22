from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator, Callable
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.deps import (
    CurrentAccount,
    CurrentUser,
    get_current_account,
    get_current_user,
    get_pool,
    get_supabase_claims,
)
from app.main import app as fastapi_app
from app.workers import queue as queue_module


# ─── Fake asyncpg pool ────────────────────────────────────────────────

class _NoopTransaction:
    async def __aenter__(self) -> "_NoopTransaction":
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class FakeConnection:
    """Records queries and returns canned rows.

    Tests prime `next_rows` (a deque-style list popped from the front) per
    fetchrow/fetch call. Anything more sophisticated lives in the test itself.
    """

    def __init__(self, store: "FakePoolStore") -> None:
        self.store = store

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        self.store.queries.append((query, args))
        if self.store.fetchrow_handler is not None:
            return self.store.fetchrow_handler(query, args)
        if self.store.next_rows:
            return self.store.next_rows.pop(0)
        return None

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        self.store.queries.append((query, args))
        if self.store.fetch_handler is not None:
            return self.store.fetch_handler(query, args)
        return []

    async def execute(self, query: str, *args: Any) -> str:
        self.store.queries.append((query, args))
        if self.store.execute_handler is not None:
            return self.store.execute_handler(query, args)
        return "OK"

    def transaction(self) -> _NoopTransaction:
        return _NoopTransaction()


class FakePoolStore:
    def __init__(self) -> None:
        self.queries: list[tuple[str, tuple[Any, ...]]] = []
        self.next_rows: list[dict[str, Any] | None] = []
        self.execute_handler: Callable[[str, tuple[Any, ...]], str] | None = None
        self.fetchrow_handler: Callable[[str, tuple[Any, ...]], dict[str, Any] | None] | None = None
        self.fetch_handler: Callable[[str, tuple[Any, ...]], list[dict[str, Any]]] | None = None


class FakePool:
    def __init__(self) -> None:
        self.store = FakePoolStore()

    @contextlib.asynccontextmanager
    async def acquire(self) -> AsyncIterator[FakeConnection]:
        yield FakeConnection(self.store)


# ─── Fixtures ─────────────────────────────────────────────────────────

@pytest.fixture
def fake_pool() -> FakePool:
    return FakePool()


@pytest.fixture
def user_row() -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "id": uuid4(),
        "supabase_uid": uuid4(),
        "phone": "+919999999999",
        "display_name": "Test User",
        "gender": "male",
        "age": 28,
        "ncr_zone": "gurgaon",
        "max_travel_km": 15,
        "schedule": ["saturday"],
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


@pytest.fixture
def current_user(user_row: dict[str, Any]) -> CurrentUser:
    return CurrentUser(
        id=user_row["id"],
        supabase_uid=user_row["supabase_uid"],
        row=user_row,
    )


@pytest.fixture
def supabase_claims(user_row: dict[str, Any]) -> dict[str, Any]:
    return {
        "sub": str(user_row["supabase_uid"]),
        "phone": user_row["phone"],
        "aud": "authenticated",
    }


@pytest.fixture
def current_account(user_row: dict[str, Any]) -> CurrentAccount:
    return CurrentAccount(
        id=user_row["id"],
        phone=user_row["phone"],
        row=user_row,
        session_id=uuid4(),
        onboarding_state=user_row["onboarding_state"],
        community_slug=None,
        banned=user_row["banned"],
    )


@pytest_asyncio.fixture
async def client(
    fake_pool: FakePool,
    current_user: CurrentUser,
    current_account: CurrentAccount,
    supabase_claims: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    async def _override_pool() -> FakePool:
        return fake_pool

    async def _override_user() -> CurrentUser:
        return current_user

    async def _override_account() -> CurrentAccount:
        return current_account

    async def _override_claims() -> dict[str, Any]:
        return supabase_claims

    async def _fake_enqueue(user_id: UUID) -> str | None:
        return f"job-{user_id}"

    monkeypatch.setattr(
        "app.api.v1.questionnaire.enqueue_build_profile", _fake_enqueue
    )
    monkeypatch.setattr(
        "app.api.v1.profile.enqueue_build_profile", _fake_enqueue
    )
    monkeypatch.setattr(queue_module, "enqueue_build_profile", _fake_enqueue)

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    fastapi_app.dependency_overrides[get_current_user] = _override_user
    fastapi_app.dependency_overrides[get_current_account] = _override_account
    fastapi_app.dependency_overrides[get_supabase_claims] = _override_claims

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    fastapi_app.dependency_overrides.clear()

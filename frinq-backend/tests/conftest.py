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

    async def fetchval(self, query: str, *args: Any) -> Any:
        self.store.queries.append((query, args))
        if self.store.fetchval_handler is not None:
            return self.store.fetchval_handler(query, args)
        return None

    def transaction(self) -> _NoopTransaction:
        return _NoopTransaction()


class FakePoolStore:
    def __init__(self) -> None:
        self.queries: list[tuple[str, tuple[Any, ...]]] = []
        self.next_rows: list[dict[str, Any] | None] = []
        self.execute_handler: Callable[[str, tuple[Any, ...]], str] | None = None
        self.fetchrow_handler: Callable[[str, tuple[Any, ...]], dict[str, Any] | None] | None = None
        self.fetch_handler: Callable[[str, tuple[Any, ...]], list[dict[str, Any]]] | None = None
        self.fetchval_handler: Callable[[str, tuple[Any, ...]], Any] | None = None


class FakePool:
    def __init__(self) -> None:
        self.store = FakePoolStore()

    @contextlib.asynccontextmanager
    async def acquire(self) -> AsyncIterator[FakeConnection]:
        yield FakeConnection(self.store)


# ─── Fake clock + fake Redis ────────────────────────────────────────────

class FakeClock:
    """Controllable monotonic-style clock for TTL/window tests — no real
    sleeping needed."""

    def __init__(self, start: float = 1_000_000.0) -> None:
        self.t = start

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


class FakeRedis:
    """Minimal in-memory redis.asyncio.Redis double — real dict-backed
    values + expiry so TTL-dependent logic (rate limits, WS tickets) is
    testable without a live Redis server. `eval()` only understands
    app/core/rate_limit.py's own increment-and-expire-if-new script — this
    isn't a Lua interpreter, and that's the only script this codebase runs.
    """

    def __init__(self, clock: Any = None) -> None:
        self._data: dict[str, Any] = {}
        self._expires_at: dict[str, float] = {}
        self._now = clock or (lambda: 0.0)
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        # Flip True to simulate Redis being unreachable — every method raises.
        self.unavailable = False

    def _check_available(self) -> None:
        if self.unavailable:
            raise ConnectionError("fake redis unavailable")

    def _expire_if_due(self, key: str) -> None:
        exp = self._expires_at.get(key)
        if exp is not None and self._now() >= exp:
            self._data.pop(key, None)
            self._expires_at.pop(key, None)

    async def get(self, key: str) -> Any:
        self._check_available()
        self.calls.append(("get", (key,)))
        self._expire_if_due(key)
        return self._data.get(key)

    async def set(self, key: str, value: Any, ex: int | None = None) -> bool:
        self._check_available()
        self.calls.append(("set", (key, value, ex)))
        self._data[key] = value
        if ex is not None:
            self._expires_at[key] = self._now() + ex
        return True

    async def getdel(self, key: str) -> Any:
        self._check_available()
        self.calls.append(("getdel", (key,)))
        self._expire_if_due(key)
        val = self._data.pop(key, None)
        self._expires_at.pop(key, None)
        return val

    async def expire(self, key: str, seconds: int) -> bool:
        self._check_available()
        self.calls.append(("expire", (key, seconds)))
        if key in self._data:
            self._expires_at[key] = self._now() + seconds
            return True
        return False

    async def ttl(self, key: str) -> int:
        self._check_available()
        self.calls.append(("ttl", (key,)))
        self._expire_if_due(key)
        if key not in self._data:
            return -2
        exp = self._expires_at.get(key)
        if exp is None:
            return -1
        return max(0, int(exp - self._now()))

    async def incr(self, key: str) -> int:
        self._check_available()
        self.calls.append(("incr", (key,)))
        self._expire_if_due(key)
        current = int(self._data.get(key, 0)) + 1
        self._data[key] = current
        return current

    async def publish(self, channel: str, message: str) -> int:
        self._check_available()
        self.calls.append(("publish", (channel, message)))
        return 0

    async def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any:
        self._check_available()
        self.calls.append(("eval", (script, numkeys, *keys_and_args)))
        key = keys_and_args[0]
        window_seconds = int(keys_and_args[numkeys])
        self._expire_if_due(key)
        current = int(self._data.get(key, 0)) + 1
        self._data[key] = current
        if current == 1:
            self._expires_at[key] = self._now() + window_seconds
        return current


# ─── Fixtures ─────────────────────────────────────────────────────────

@pytest.fixture
def fake_pool() -> FakePool:
    return FakePool()


@pytest.fixture
def fake_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def fake_redis(fake_clock: FakeClock) -> FakeRedis:
    return FakeRedis(clock=fake_clock)


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

    async def _fake_enqueue_quiz_insights(submission_id: UUID) -> str | None:
        return f"job-{submission_id}"

    monkeypatch.setattr(
        "app.api.v1.questionnaire.enqueue_build_profile", _fake_enqueue
    )
    monkeypatch.setattr(
        "app.api.v1.profile.enqueue_build_profile", _fake_enqueue
    )
    monkeypatch.setattr(queue_module, "enqueue_build_profile", _fake_enqueue)
    monkeypatch.setattr(
        "app.api.v1.quiz.enqueue_quiz_insights", _fake_enqueue_quiz_insights
    )

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    fastapi_app.dependency_overrides[get_current_user] = _override_user
    fastapi_app.dependency_overrides[get_current_account] = _override_account
    fastapi_app.dependency_overrides[get_supabase_claims] = _override_claims

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    fastapi_app.dependency_overrides.clear()

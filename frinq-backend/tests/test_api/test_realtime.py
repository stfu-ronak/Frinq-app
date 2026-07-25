from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.realtime import (
    LocalConnection,
    consume_ticket,
    create_ticket,
    persist_before_publish,
)
from app.api.deps import CurrentAccount
from app.config import settings
from app.main import app as fastapi_app
from tests.conftest import FakeClock, FakePool, FakeRedis


@pytest.fixture
def current_account(user_row: dict[str, Any]) -> CurrentAccount:
    """Override conftest's default (community_slug=None) — the ws-ticket
    endpoint requires an assigned community."""
    return CurrentAccount(
        id=user_row["id"],
        phone=user_row["phone"],
        row=user_row,
        session_id=uuid4(),
        onboarding_state=user_row["onboarding_state"],
        community_slug="quiet-storm",
        banned=user_row["banned"],
    )


# ─── Ticket lifecycle (pure, no HTTP) ───────────────────────────────────

async def test_ticket_is_32_random_bytes_base64url(fake_redis: FakeRedis) -> None:
    ticket = await create_ticket(
        fake_redis, user_id=uuid4(), community_slug="quiet-storm", session_id=uuid4()
    )
    # base64url of 32 bytes decodes to exactly 32 bytes.
    padded = ticket + "=" * (-len(ticket) % 4)
    decoded = base64.urlsafe_b64decode(padded)
    assert len(decoded) == 32


async def test_ticket_stored_only_as_sha256_hash_never_the_raw_value(fake_redis: FakeRedis) -> None:
    ticket = await create_ticket(
        fake_redis, user_id=uuid4(), community_slug="quiet-storm", session_id=uuid4()
    )
    # The raw ticket must never appear as a Redis key or value.
    for key in fake_redis._data:
        assert ticket not in key
    for value in fake_redis._data.values():
        assert ticket not in str(value)


async def test_ticket_scoped_to_user_and_community(fake_redis: FakeRedis) -> None:
    user_id = uuid4()
    session_id = uuid4()
    ticket = await create_ticket(
        fake_redis, user_id=user_id, community_slug="quiet-storm", session_id=session_id
    )
    payload = await consume_ticket(fake_redis, ticket)
    assert payload is not None
    assert payload.user_id == user_id
    assert payload.community_slug == "quiet-storm"
    assert payload.session_id == session_id


async def test_ticket_replay_is_rejected_getdel_is_single_use(fake_redis: FakeRedis) -> None:
    ticket = await create_ticket(fake_redis, user_id=uuid4(), community_slug="q", session_id=uuid4())
    first = await consume_ticket(fake_redis, ticket)
    second = await consume_ticket(fake_redis, ticket)
    assert first is not None
    assert second is None


async def test_expired_ticket_rejected(fake_redis: FakeRedis, fake_clock: FakeClock) -> None:
    ticket = await create_ticket(fake_redis, user_id=uuid4(), community_slug="q", session_id=uuid4())
    fake_clock.advance(61)  # TICKET_TTL_SECONDS is 60
    payload = await consume_ticket(fake_redis, ticket)
    assert payload is None


async def test_garbage_ticket_rejected(fake_redis: FakeRedis) -> None:
    payload = await consume_ticket(fake_redis, "not-a-real-ticket")
    assert payload is None


# ─── Ticket REST endpoint ────────────────────────────────────────────────

async def test_ws_ticket_requires_a_valid_access_token(fake_pool: FakePool) -> None:
    from app.api.deps import get_pool

    async def _override_pool() -> FakePool:
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/v1/community/ws-ticket")
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)
    assert resp.status_code == 401


async def test_ws_ticket_endpoint_returns_ticket_and_expiry(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, fake_redis: FakeRedis
) -> None:
    async def _fake_redis():
        return fake_redis

    monkeypatch.setattr("app.api.v1.realtime.get_redis", _fake_redis)

    resp = await client.post("/api/v1/community/ws-ticket")
    assert resp.status_code == 200
    body = resp.json()
    assert body["expires_in"] == 60
    assert isinstance(body["ticket"], str) and len(body["ticket"]) > 20
    # Never a bearer-token-shaped value, never in a URL by construction —
    # this endpoint response is the only place it appears.


async def test_ws_ticket_404_without_community(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.deps import CurrentAccount, get_current_account

    from app.config import settings

    fastapi_app.dependency_overrides[get_current_account] = lambda: CurrentAccount(
        id=uuid4(), phone=None,
        row={"terms_version": settings.CURRENT_TERMS_VERSION, "privacy_version": settings.CURRENT_PRIVACY_VERSION},
        session_id=uuid4(), onboarding_state="active", community_slug=None, banned=False,
    )
    try:
        resp = await client.post("/api/v1/community/ws-ticket")
    finally:
        del fastapi_app.dependency_overrides[get_current_account]
    assert resp.status_code == 404


async def test_connection_manager_uses_the_pubsub_client_not_the_fast_command_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: ConnectionManager's long-lived listen() subscription must
    never share get_redis()'s short socket_timeout — that exact sharing
    silently killed real-time delivery on a live device (see
    test_core/test_redis_client.py for the full story)."""
    import app.api.v1.realtime as realtime_module

    realtime_module._manager = None
    marker = object()

    async def _fake_pubsub_redis():
        return marker

    async def _fail_if_called():
        raise AssertionError("get_connection_manager must not call get_redis()")

    monkeypatch.setattr(realtime_module, "get_pubsub_redis", _fake_pubsub_redis)
    monkeypatch.setattr(realtime_module, "get_redis", _fail_if_called)
    monkeypatch.setattr(realtime_module.ConnectionManager, "start", lambda self: _noop())

    manager = await realtime_module.get_connection_manager()

    assert manager is not None
    assert manager._redis is marker
    realtime_module._manager = None


async def _noop():
    return None


# ─── persist_before_publish (core send logic, no WebSocket needed) ──────

async def test_persist_before_publish_accepts_and_publishes(
    fake_pool: FakePool, fake_redis: FakeRedis
) -> None:
    author_id = uuid4()
    cmid = uuid4()

    def handler(query: str, args: tuple[Any, ...]):
        if query.strip().startswith("INSERT INTO messages"):
            return {"id": 1, "client_message_id": cmid, "body": "hi", "created_at": datetime.now(timezone.utc)}
        if query.strip().startswith("SELECT id, display_name FROM users"):
            return {"id": author_id, "display_name": "Alice"}
        return None

    fake_pool.store.fetchrow_handler = handler

    result = await persist_before_publish(
        fake_pool, fake_redis,
        community_slug="quiet-storm", author_id=author_id,
        client_message_id=cmid, body="  hi  ",
    )
    assert result.accepted is True
    assert result.message["body"] == "hi"
    published = [c for c in fake_redis.calls if c[0] == "publish"]
    assert len(published) == 1
    channel, envelope = published[0][1]
    assert channel == "community:quiet-storm"
    assert json.loads(envelope)["type"] == "message.created"


async def test_persist_before_publish_rejects_everything_when_chat_disabled(
    fake_pool: FakePool, fake_redis: FakeRedis, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Task 46 Step 5's emergency kill switch — checked before rate-limit and
    moderation, so it works even if Redis (rate limiting) is also down."""
    monkeypatch.setattr(settings, "CHAT_DISABLED", True)
    result = await persist_before_publish(
        fake_pool, fake_redis,
        community_slug="quiet-storm", author_id=uuid4(),
        client_message_id=uuid4(), body="hello",
    )
    assert result.accepted is False
    assert result.code == "chat_disabled"
    assert not any(c[0] == "publish" for c in fake_redis.calls)
    assert not fake_pool.store.queries  # never even reached rate-limit/DB


async def test_persist_before_publish_rejects_moderation_failure_without_publishing(
    fake_pool: FakePool, fake_redis: FakeRedis
) -> None:
    result = await persist_before_publish(
        fake_pool, fake_redis,
        community_slug="quiet-storm", author_id=uuid4(),
        client_message_id=uuid4(), body="   ",  # empty after normalization
    )
    assert result.accepted is False
    assert result.code == "empty_after_normalization"
    assert not any(c[0] == "publish" for c in fake_redis.calls)
    assert not fake_pool.store.queries  # never even reached the DB


async def test_persist_before_publish_rate_limited_without_publishing(
    fake_pool: FakePool, fake_redis: FakeRedis
) -> None:
    author_id = uuid4()
    from app.core.rate_limit import LIMITERS

    for _ in range(LIMITERS["chat_send"].limit):
        fake_pool.store.fetchrow_handler = lambda q, a: {
            "id": 1, "client_message_id": uuid4(), "body": "hi",
            "created_at": datetime.now(timezone.utc),
        } if q.strip().startswith("INSERT") else {"id": author_id, "display_name": "A"}
        await persist_before_publish(
            fake_pool, fake_redis, community_slug="q", author_id=author_id,
            client_message_id=uuid4(), body="hi",
        )

    result = await persist_before_publish(
        fake_pool, fake_redis, community_slug="q", author_id=author_id,
        client_message_id=uuid4(), body="hi",
    )
    assert result.accepted is False
    assert result.code == "rate_limited"
    assert result.retry_after is not None


async def test_persist_before_publish_idempotent_on_retry(
    fake_pool: FakePool, fake_redis: FakeRedis
) -> None:
    author_id = uuid4()
    cmid = uuid4()
    created_at = datetime.now(timezone.utc)
    state = {"inserted": False}

    def handler(query: str, args: tuple[Any, ...]):
        if query.strip().startswith("INSERT INTO messages"):
            if state["inserted"]:
                return None  # ON CONFLICT DO NOTHING
            state["inserted"] = True
            return {"id": 42, "client_message_id": cmid, "body": "hi", "created_at": created_at}
        if query.strip().startswith("SELECT id, client_message_id, body, created_at FROM messages"):
            return {"id": 42, "client_message_id": cmid, "body": "hi", "created_at": created_at}
        if query.strip().startswith("SELECT id, display_name FROM users"):
            return {"id": author_id, "display_name": "Alice"}
        return None

    fake_pool.store.fetchrow_handler = handler

    r1 = await persist_before_publish(fake_pool, fake_redis, community_slug="q", author_id=author_id, client_message_id=cmid, body="hi")
    r2 = await persist_before_publish(fake_pool, fake_redis, community_slug="q", author_id=author_id, client_message_id=cmid, body="hi")
    assert r1.accepted and r2.accepted
    assert r1.message["id"] == r2.message["id"] == 42


# ─── LocalConnection / manager basics (unit-level, no real sockets) ─────

def test_local_connection_queue_capped_at_100() -> None:
    conn = LocalConnection(user_id=uuid4(), community_slug="q")
    assert conn.queue.maxsize == 100

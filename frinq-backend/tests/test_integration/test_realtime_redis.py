"""Real Postgres + real Redis two-instance integration test for Task 19.

Not run as part of the default `pytest -q` suite in CI — it requires a
live Redis (docker run -d --name frinq-redis -p 6379:6379 redis:7-alpine)
and a reachable DATABASE_URL. Skips itself cleanly if either is
unavailable, so normal test runs are unaffected.

"Two instances" here means two independent ConnectionManager objects, each
with its own real redis.asyncio.Redis connection to the same Redis server —
this proves cross-instance delivery via Redis pub/sub without needing two
actual OS processes/uvicorn servers, which is impractical inside pytest.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import asyncpg
import pytest
import redis.asyncio as redis_asyncio

from app.config import settings
from app.core.realtime import (
    ConnectionManager,
    LocalConnection,
    blocked_counterparts_for_fanout,
    persist_before_publish,
    publish_ban_event,
)

pytestmark = pytest.mark.asyncio


def _asyncpg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def _infra_available() -> tuple[bool, str]:
    if not settings.DATABASE_URL:
        return False, "DATABASE_URL not set"
    try:
        conn = await asyncio.wait_for(
            asyncpg.connect(dsn=_asyncpg_dsn(settings.DATABASE_URL), statement_cache_size=0),
            timeout=5,
        )
        await conn.close()
    except Exception as exc:  # noqa: BLE001
        return False, f"Postgres unreachable: {exc}"
    try:
        r = redis_asyncio.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await r.ping()
        await r.close()
    except Exception as exc:  # noqa: BLE001
        return False, f"Redis unreachable: {exc}"
    return True, ""


@pytest.fixture
async def real_pool():
    ok, reason = await _infra_available()
    if not ok:
        pytest.skip(reason)
    pool = await asyncpg.create_pool(
        dsn=_asyncpg_dsn(settings.DATABASE_URL), min_size=1, max_size=4,
        statement_cache_size=0,
    )
    yield pool
    await pool.close()


@pytest.fixture
async def seeded_community_and_users(real_pool: asyncpg.Pool):
    """Throwaway community + 2 users, cleaned up after the test regardless
    of pass/fail."""
    slug = f"test-realtime-{uuid4().hex[:8]}"
    user_a = uuid4()
    user_b = uuid4()
    async with real_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO communities (archetype_slug, name, description) VALUES ($1, $2, $3)",
            slug, "Test Realtime Community", "throwaway, deleted after the test",
        )
        for uid, phone in ((user_a, "9000000001"), (user_b, "9000000002")):
            await conn.execute(
                """INSERT INTO users (id, phone, display_name, onboarding_state, banned)
                   VALUES ($1, $2, $3, 'active', false)""",
                uid, phone, f"Test User {phone[-1]}",
            )
        for uid in (user_a, user_b):
            await conn.execute(
                "INSERT INTO community_members (archetype_slug, user_id) VALUES ($1, $2)",
                slug, uid,
            )
    try:
        yield slug, user_a, user_b
    finally:
        async with real_pool.acquire() as conn:
            await conn.execute("DELETE FROM messages WHERE archetype_slug = $1", slug)
            await conn.execute("DELETE FROM user_blocks WHERE blocker_user_id = ANY($1::uuid[])", [user_a, user_b])
            await conn.execute("DELETE FROM community_members WHERE archetype_slug = $1", slug)
            await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", [user_a, user_b])
            await conn.execute("DELETE FROM communities WHERE archetype_slug = $1", slug)


async def _make_redis() -> redis_asyncio.Redis:
    return redis_asyncio.from_url(settings.REDIS_URL, socket_connect_timeout=2)


async def test_two_instances_exchange_one_message_with_no_duplicates(
    real_pool: asyncpg.Pool, seeded_community_and_users
) -> None:
    slug, user_a, user_b = seeded_community_and_users

    redis_a = await _make_redis()
    redis_b = await _make_redis()
    manager_a = ConnectionManager(redis_a, lambda: real_pool)
    manager_b = ConnectionManager(redis_b, lambda: real_pool)
    await manager_a.start()
    await manager_b.start()

    conn_a = LocalConnection(user_id=user_a, community_slug=slug)  # "connected to instance A"
    conn_b = LocalConnection(user_id=user_b, community_slug=slug)  # "connected to instance B"
    manager_a.register(conn_a)
    manager_b.register(conn_b)

    try:
        # Give the background pub/sub listener tasks a moment to actually
        # subscribe before publishing.
        await asyncio.sleep(0.2)

        result = await persist_before_publish(
            real_pool, redis_a,
            community_slug=slug, author_id=user_a,
            client_message_id=uuid4(), body="hello from instance A",
        )
        assert result.accepted is True

        # Both instances' locally-connected sockets receive exactly one copy,
        # delivered via Redis PUBLISH — instance B never touched redis_a.
        envelope_a = await asyncio.wait_for(conn_a.queue.get(), timeout=5)
        envelope_b = await asyncio.wait_for(conn_b.queue.get(), timeout=5)
        assert envelope_a["message"]["body"] == "hello from instance A"
        assert envelope_b["message"]["body"] == "hello from instance A"
        assert envelope_a["message"]["id"] == envelope_b["message"]["id"]

        assert conn_a.queue.empty()
        assert conn_b.queue.empty()
    finally:
        await manager_a.stop()
        await manager_b.stop()
        await redis_a.close()
        await redis_b.close()


async def test_replay_protection_same_client_message_id_no_duplicate_row(
    real_pool: asyncpg.Pool, seeded_community_and_users
) -> None:
    slug, user_a, _user_b = seeded_community_and_users
    redis_a = await _make_redis()
    try:
        cmid = uuid4()
        r1 = await persist_before_publish(
            real_pool, redis_a, community_slug=slug, author_id=user_a,
            client_message_id=cmid, body="only once",
        )
        r2 = await persist_before_publish(
            real_pool, redis_a, community_slug=slug, author_id=user_a,
            client_message_id=cmid, body="only once",
        )
        assert r1.message["id"] == r2.message["id"]

        async with real_pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM messages WHERE archetype_slug = $1 AND client_message_id = $2",
                slug, cmid,
            )
        assert count == 1
    finally:
        await redis_a.close()


async def test_blocked_message_filtering_at_fanout(
    real_pool: asyncpg.Pool, seeded_community_and_users
) -> None:
    slug, user_a, user_b = seeded_community_and_users
    async with real_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO user_blocks (blocker_user_id, blocked_user_id) VALUES ($1, $2)",
            user_b, user_a,
        )
    blocked = await blocked_counterparts_for_fanout(real_pool, user_a, {user_a, user_b})
    assert user_b in blocked


async def test_ban_control_event_marks_local_connections_banned(real_pool: asyncpg.Pool) -> None:
    redis_a = await _make_redis()
    manager = ConnectionManager(redis_a, lambda: real_pool)
    await manager.start()
    target_user = uuid4()
    conn_state = LocalConnection(user_id=target_user, community_slug="whatever")
    manager.register(conn_state)
    try:
        await asyncio.sleep(0.2)
        await publish_ban_event(redis_a, target_user)
        for _ in range(50):
            if conn_state.banned:
                break
            await asyncio.sleep(0.1)
        assert conn_state.banned is True
    finally:
        await manager.stop()
        await redis_a.close()

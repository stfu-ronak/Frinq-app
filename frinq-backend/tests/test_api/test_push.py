from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.conftest import FakePool


async def test_register_token_calls_the_upsert_and_returns_201(client: AsyncClient, fake_pool: FakePool) -> None:
    resp = await client.post(
        "/api/v1/push/tokens",
        json={"installation_id": str(uuid4()), "token": "a-real-fcm-token", "platform": "android", "app_version": "1.0.0"},
    )
    assert resp.status_code == 201
    assert resp.json() == {"ok": True}
    queries = [q for q, _ in fake_pool.store.queries]
    assert any("INSERT INTO push_tokens" in q for q in queries)


async def test_register_token_rejects_unknown_platform(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/push/tokens",
        json={"installation_id": str(uuid4()), "token": "tok", "platform": "windows", "app_version": "1.0.0"},
    )
    assert resp.status_code == 422


async def test_register_token_rejects_extra_fields(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/push/tokens",
        json={"installation_id": str(uuid4()), "token": "tok", "platform": "android", "app_version": "1.0.0", "user_id": str(uuid4())},
    )
    assert resp.status_code == 422


async def test_remove_token_404s_when_nothing_matched(client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.execute_handler = lambda q, a: "DELETE 0"
    resp = await client.delete(f"/api/v1/push/tokens/{uuid4()}")
    assert resp.status_code == 404


async def test_remove_token_succeeds_when_a_row_was_deleted(client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.execute_handler = lambda q, a: "DELETE 1"
    resp = await client.delete(f"/api/v1/push/tokens/{uuid4()}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


async def test_remove_token_query_is_scoped_to_the_authenticated_caller(
    client: AsyncClient, fake_pool: FakePool, current_account,
) -> None:
    fake_pool.store.execute_handler = lambda q, a: "DELETE 1"
    installation_id = uuid4()
    await client.delete(f"/api/v1/push/tokens/{installation_id}")
    query, args = fake_pool.store.queries[-1]
    assert args == (current_account.id, installation_id)


async def test_update_preferences_404s_when_token_not_found(client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.execute_handler = lambda q, a: "UPDATE 0"
    resp = await client.patch(
        "/api/v1/push/preferences", json={"installation_id": str(uuid4()), "enabled": False},
    )
    assert resp.status_code == 404


async def test_update_preferences_returns_the_new_state(client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.execute_handler = lambda q, a: "UPDATE 1"
    resp = await client.patch(
        "/api/v1/push/preferences", json={"installation_id": str(uuid4()), "enabled": False},
    )
    assert resp.status_code == 200
    assert resp.json() == {"enabled": False}


async def test_register_token_requires_authentication(fake_pool: FakePool) -> None:
    from httpx import ASGITransport

    from app.api.deps import get_pool
    from app.main import app as fastapi_app

    async def _override_pool() -> FakePool:
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/push/tokens",
                json={"installation_id": str(uuid4()), "token": "tok", "platform": "android", "app_version": "1.0.0"},
            )
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)
    assert resp.status_code == 401

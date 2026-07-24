from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from tests.conftest import FakePool


pytestmark = pytest.mark.asyncio


async def test_get_me(client: AsyncClient, user_row: dict[str, Any]) -> None:
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(user_row["id"])
    assert body["display_name"] == "Test User"


async def test_patch_me_updates_fields(
    client: AsyncClient,
    fake_pool: FakePool,
    user_row: dict[str, Any],
) -> None:
    updated = {**user_row, "display_name": "Renamed", "max_travel_km": 25}
    fake_pool.store.next_rows = [updated]

    resp = await client.patch(
        "/api/v1/users/me",
        json={"display_name": "Renamed", "max_travel_km": 25},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["display_name"] == "Renamed"
    assert body["max_travel_km"] == 25

    # Verify the UPDATE went out with both fields.
    last_query, last_args = fake_pool.store.queries[-1]
    assert "UPDATE users SET" in last_query
    assert "display_name" in last_query
    assert "max_travel_km" in last_query


async def test_patch_me_noop_returns_current(
    client: AsyncClient, user_row: dict[str, Any]
) -> None:
    resp = await client.patch("/api/v1/users/me", json={})
    assert resp.status_code == 200
    assert resp.json()["id"] == str(user_row["id"])


async def test_delete_me_requires_a_reauth_token(
    client: AsyncClient,
    current_account,
    monkeypatch: pytest.MonkeyPatch,
    fake_redis,
) -> None:
    """Full reauth-token/hard-delete coverage lives in
    test_legal_deletion.py — this just pins that the plain DELETE (no
    body) that used to soft-delete unconditionally no longer works."""
    async def _fake_redis():
        return fake_redis

    monkeypatch.setattr("app.api.v1.users.get_redis", _fake_redis)
    resp = await client.request("DELETE", "/api/v1/users/me", json={})
    assert resp.status_code == 422

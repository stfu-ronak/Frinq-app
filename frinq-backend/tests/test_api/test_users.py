from __future__ import annotations

from datetime import datetime, timezone
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


async def test_delete_me_soft_deletes(
    client: AsyncClient,
    fake_pool: FakePool,
    user_row: dict[str, Any],
) -> None:
    deleted_at = datetime.now(timezone.utc)
    fake_pool.store.next_rows = [{"id": user_row["id"], "deleted_at": deleted_at}]

    resp = await client.delete("/api/v1/users/me")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(user_row["id"])

    queries = [q for q, _ in fake_pool.store.queries]
    assert any("UPDATE users SET deleted_at" in q for q in queries)
    # DELETE /users/me must also revoke every session for the account.
    assert any("UPDATE user_sessions SET revoked_at" in q for q in queries)

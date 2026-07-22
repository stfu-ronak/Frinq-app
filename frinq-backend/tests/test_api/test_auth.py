from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.main import app as fastapi_app
from app.api.deps import get_current_user
from tests.conftest import FakePool


pytestmark = pytest.mark.asyncio


async def test_register_creates_user(
    client: AsyncClient,
    fake_pool: FakePool,
    supabase_claims: dict[str, Any],
) -> None:
    # register runs *before* a users row exists, so don't require get_current_user
    fastapi_app.dependency_overrides.pop(get_current_user, None)

    now = datetime.now(timezone.utc)
    new_id = uuid4()
    supa_uid = supabase_claims["sub"]

    def _handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if query.strip().startswith("SELECT * FROM users WHERE supabase_uid"):
            return None
        if "INSERT INTO users" in query:
            return {
                "id": new_id,
                "supabase_uid": supa_uid,
                "phone": "+919999999999",
                "display_name": args[2],
                "gender": args[3],
                "age": args[4],
                "ncr_zone": args[5],
                "max_travel_km": args[6],
                "schedule": list(args[7]),
                "onboarding_complete": False,
                "created_at": now,
                "updated_at": now,
                "deleted_at": None,
            }
        return None

    fake_pool.store.fetchrow_handler = _handler

    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Alice",
            "age": 26,
            "gender": "female",
            "ncr_zone": "gurgaon",
            "max_travel_km": 10,
            "schedule": ["saturday", "sunday"],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["display_name"] == "Alice"
    assert body["ncr_zone"] == "gurgaon"
    assert body["schedule"] == ["saturday", "sunday"]


async def test_register_conflict_when_user_exists(
    client: AsyncClient,
    fake_pool: FakePool,
    user_row: dict[str, Any],
) -> None:
    fastapi_app.dependency_overrides.pop(get_current_user, None)
    fake_pool.store.next_rows = [user_row]

    resp = await client.post(
        "/api/v1/auth/register",
        json={"display_name": "Alice"},
    )
    assert resp.status_code == 409


async def test_register_rejects_missing_bearer() -> None:
    # Use a fresh client without the dependency override so the JWT path runs.
    from httpx import ASGITransport, AsyncClient as _AC

    transport = ASGITransport(app=fastapi_app)
    async with _AC(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={"display_name": "Alice"},
        )
    assert resp.status_code == 401

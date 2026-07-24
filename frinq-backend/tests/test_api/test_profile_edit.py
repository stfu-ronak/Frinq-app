from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from tests.conftest import FakePool


def _row_handler(user_row: dict[str, Any]):
    def handler(query: str, args: tuple[Any, ...]) -> dict[str, Any]:
        # PATCH builds `SET col = $n, ...` dynamically — just echo back the
        # base row merged with whatever values were supplied, matching the
        # real UPDATE ... RETURNING * behavior closely enough for schema
        # validation purposes.
        return dict(user_row)
    return handler


async def test_display_name_2_to_40_codepoints_accepted(
    client: AsyncClient, fake_pool: FakePool, user_row: dict[str, Any]
) -> None:
    fake_pool.store.fetchrow_handler = _row_handler(user_row)
    resp = await client.patch("/api/v1/users/me", json={"display_name": "Al"})
    assert resp.status_code == 200
    # 40 varied chars — not 40 repeated ones, which would (correctly) trip
    # the shared excessive-repetition check.
    resp2 = await client.patch("/api/v1/users/me", json={"display_name": "Ab" * 20})
    assert resp2.status_code == 200


async def test_display_name_too_short_rejected(client: AsyncClient, fake_pool: FakePool) -> None:
    resp = await client.patch("/api/v1/users/me", json={"display_name": "A"})
    assert resp.status_code == 422
    assert "display_name_too_short" in resp.text


async def test_display_name_too_long_rejected(client: AsyncClient, fake_pool: FakePool) -> None:
    resp = await client.patch("/api/v1/users/me", json={"display_name": "A" * 41})
    assert resp.status_code == 422
    assert "display_name_too_long" in resp.text


async def test_display_name_empty_after_normalization_rejected(client: AsyncClient) -> None:
    resp = await client.patch("/api/v1/users/me", json={"display_name": "   "})
    assert resp.status_code == 422
    assert "display_name_empty_after_normalization" in resp.text


async def test_display_name_control_characters_rejected(client: AsyncClient) -> None:
    resp = await client.patch("/api/v1/users/me", json={"display_name": "Al\x00ice"})
    assert resp.status_code == 422
    assert "display_name_control_characters" in resp.text


@pytest.mark.parametrize("bad_name", ["admin", "Admin_Ronak", "the_frinq_team", "SUPPORT desk", "moderator99"])
async def test_display_name_reserved_terms_rejected(client: AsyncClient, bad_name: str) -> None:
    resp = await client.patch("/api/v1/users/me", json={"display_name": bad_name})
    assert resp.status_code == 422
    assert "display_name_reserved_term" in resp.text


async def test_display_name_non_latin_accepted(
    client: AsyncClient, fake_pool: FakePool, user_row: dict[str, Any]
) -> None:
    fake_pool.store.fetchrow_handler = _row_handler(user_row)
    resp = await client.patch("/api/v1/users/me", json={"display_name": "प्रिया"})
    assert resp.status_code == 200


async def test_unknown_fields_rejected(client: AsyncClient) -> None:
    resp = await client.patch("/api/v1/users/me", json={"is_verified": True})
    assert resp.status_code == 422


async def test_cannot_patch_archetype_slug(client: AsyncClient) -> None:
    resp = await client.patch("/api/v1/users/me", json={"archetype_slug": "quiet-storm"})
    assert resp.status_code == 422


async def test_cannot_patch_phone(client: AsyncClient) -> None:
    # phone is the login identity and is matched on normalized last-10-digits
    # at OTP time — a self-service phone rewrite here enables cross-account
    # login confusion, so it must be rejected (extra="forbid"). Any real phone
    # change goes through an OTP-verified flow, never this endpoint.
    resp = await client.patch("/api/v1/users/me", json={"phone": "+919876543210"})
    assert resp.status_code == 422


async def test_get_me_returns_only_authenticated_users_own_response(
    client: AsyncClient, current_account, user_row: dict[str, Any]
) -> None:
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code == 200
    assert resp.json()["id"] == str(current_account.id)


async def test_get_me_requires_auth(fake_pool: FakePool) -> None:
    from httpx import ASGITransport

    from app.api.deps import get_pool
    from app.main import app as fastapi_app

    async def _override_pool() -> FakePool:
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/v1/users/me")
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)
    assert resp.status_code == 401

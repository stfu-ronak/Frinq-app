"""POST /users/me/reset-for-testing — the one-tap wipe a QA/reviewer build
exposes so the same TEST_PHONES number can run the quiz over and over without
the real DELETE /me flow's reauth token. Safe by construction: it 404s
outright in production and 404s for any phone not in TEST_PHONES, so it can
never be turned into a way to nuke a real account even from a leaked build.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.config import settings
from app.core.test_fixtures import TEST_RESET_PHONE


@pytest.fixture
def current_account_test_phone(current_account):
    """The same CurrentAccount the `client` fixture wires up, but with a
    TEST_PHONES number — reset-for-testing must actually work for this one."""
    current_account.phone = TEST_RESET_PHONE
    return current_account


async def test_wipes_a_test_phone_account_and_revokes_its_sessions(
    client: AsyncClient, fake_pool, current_account, monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_account.phone = TEST_RESET_PHONE
    called: dict[str, Any] = {}

    async def _fake_reset(conn: Any, user_id: Any) -> None:
        called["reset_user_id"] = user_id

    async def _fake_revoke(conn: Any, user_id: Any) -> None:
        called["revoked_user_id"] = user_id

    monkeypatch.setattr("app.api.v1.users.reset_test_account", _fake_reset)
    monkeypatch.setattr("app.api.v1.users.revoke_all_sessions", _fake_revoke)

    resp = await client.post("/api/v1/users/me/reset-for-testing")

    assert resp.status_code == 204
    assert called["reset_user_id"] == current_account.id
    assert called["revoked_user_id"] == current_account.id


async def test_404s_for_an_account_whose_phone_is_not_a_test_phone(
    client: AsyncClient, current_account,
) -> None:
    # The `client` fixture's default phone (+919999999999) is not configured
    # as a TEST_PHONES entry — this is the ordinary-user case.
    resp = await client.post("/api/v1/users/me/reset-for-testing")
    assert resp.status_code == 404


async def test_404s_in_production_even_for_a_configured_test_phone(
    client: AsyncClient, current_account, monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_account.phone = TEST_RESET_PHONE
    monkeypatch.setattr(settings, "APP_ENV", "production")

    resp = await client.post("/api/v1/users/me/reset-for-testing")

    assert resp.status_code == 404


async def test_requires_authentication(fake_pool) -> None:
    from httpx import ASGITransport
    from app.api.deps import get_pool
    from app.main import app as fastapi_app

    # get_current_account is intentionally left un-overridden (no auth
    # header at all), but get_pool must still resolve so the dependency
    # chain fails on the auth check itself, not on a missing pool.
    async def _override_pool():
        return fake_pool

    fastapi_app.dependency_overrides[get_pool] = _override_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/v1/users/me/reset-for-testing")
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)
    assert resp.status_code == 401

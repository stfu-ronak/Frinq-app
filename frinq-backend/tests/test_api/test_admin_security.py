"""Phase 4 Task 16 — admin auth/CORS hardening.

Covers the Phase 4 Gate's "destructive actions require two server-validated
secrets" and "production CORS is exact" requirements. The plan's own test
list also names a "banned-user action writes banned_at and revokes
sessions" case — no such admin endpoint exists yet (banning is Task 19,
the later moderation phase), so it's intentionally not covered here.
"""

from __future__ import annotations

from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app as fastapi_app

_ADMIN_HEADERS = {"Authorization": f"Bearer {settings.ADMIN_KEY}"}
_ADMIN_AND_ACTION_HEADERS = {
    **_ADMIN_HEADERS,
    "X-Action-Password": settings.ADMIN_ACTION_PASSWORD,
}


async def test_missing_authorization_returns_401() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/admin/submissions")
    assert resp.status_code == 401


async def test_wrong_authorization_returns_401() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(
            "/api/v1/admin/submissions", headers={"Authorization": "Bearer not-the-key"}
        )
    assert resp.status_code == 401


async def test_destructive_endpoint_without_action_password_returns_403() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/admin/submissions/{uuid4()}/retry-ai", headers=_ADMIN_HEADERS
        )
    assert resp.status_code == 403


async def test_whatsapp_reply_without_action_password_returns_403() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/admin/whatsapp/reply",
            headers=_ADMIN_HEADERS,
            json={"phone": "9999999999", "body": "hi"},
        )
    assert resp.status_code == 403


async def test_destructive_endpoint_with_wrong_action_password_returns_403() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.delete(
            f"/api/v1/admin/submissions/{uuid4()}",
            headers={**_ADMIN_HEADERS, "X-Action-Password": "wrong"},
        )
    assert resp.status_code == 403


async def test_legacy_key_query_param_no_longer_authenticates() -> None:
    """Task 16 removes the ?key= fallback entirely — admin auth is header-only."""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/admin/submissions?key={settings.ADMIN_KEY}")
    assert resp.status_code == 401


async def test_legacy_action_password_query_param_no_longer_authenticates() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/admin/submissions/{uuid4()}/retry-ai"
            f"?action_password={settings.ADMIN_ACTION_PASSWORD}",
            headers=_ADMIN_HEADERS,
        )
    assert resp.status_code == 403


async def test_cors_preflight_allowed_origin_succeeds() -> None:
    allowed_origin = settings.CORS_ORIGINS.split(",")[0].strip()
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.options(
            "/api/v1/admin/submissions",
            headers={
                "Origin": allowed_origin,
                "Access-Control-Request-Method": "GET",
            },
        )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == allowed_origin


async def test_cors_preflight_arbitrary_origin_rejected() -> None:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.options(
            "/api/v1/admin/submissions",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
    # Starlette's CORSMiddleware answers a disallowed-origin preflight with
    # 400 and no Access-Control-Allow-Origin header — the browser then
    # blocks the real request from ever being sent.
    assert resp.status_code == 400
    assert "access-control-allow-origin" not in resp.headers

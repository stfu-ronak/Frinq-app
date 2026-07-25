"""Task 44 Step 1 — security boundary tests, written before/alongside the
hardening they verify: exact CORS origins/methods/headers, request body
limits, WebSocket frame limits, production docs policy, exception
redaction, auth header parsing, banned-user rejection, no-store on
token/account responses, and security headers on API responses.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import CurrentAccount, get_pool
from app.config import settings
from app.core.realtime import CLOSE_MALFORMED_FRAME, LocalConnection, MAX_INBOUND_FRAME_BYTES
from app.main import _docs_urls, app as fastapi_app
from tests.conftest import FakePool


# ─── Security response headers ─────────────────────────────────────────

async def test_every_response_carries_the_baseline_security_headers(client: AsyncClient) -> None:
    res = await client.get("/health/live")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert "camera=()" in res.headers["Permissions-Policy"]
    assert res.headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"


async def test_no_hsts_outside_production(client: AsyncClient) -> None:
    # This test suite never runs with APP_ENV=production — confirms HSTS
    # isn't sent over what could be a plain-HTTP dev server.
    res = await client.get("/health/live")
    assert "Strict-Transport-Security" not in res.headers


# ─── No-store on token/account responses ───────────────────────────────

@pytest.mark.parametrize("path", ["/api/v1/users/me"])
async def test_no_store_on_account_responses(client: AsyncClient, path: str) -> None:
    res = await client.get(path)
    assert res.headers.get("Cache-Control") == "no-store"


async def test_no_store_header_absent_on_unrelated_routes(client: AsyncClient) -> None:
    res = await client.get("/health/live")
    assert res.headers.get("Cache-Control") != "no-store"


# ─── CORS ───────────────────────────────────────────────────────────────

async def test_cors_allows_an_exact_configured_origin(client: AsyncClient) -> None:
    # Whatever this environment's CORS_ORIGINS actually is (real .env locally,
    # the real production allowlist when this runs against staging config) —
    # never hardcode a specific origin the test's own environment might not
    # have configured.
    configured_origin = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()][0]
    res = await client.options(
        "/api/v1/users/me",
        headers={
            "Origin": configured_origin,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res.headers.get("access-control-allow-origin") == configured_origin


async def test_cors_rejects_an_unlisted_origin(client: AsyncClient) -> None:
    res = await client.options(
        "/api/v1/users/me",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res.headers.get("access-control-allow-origin") != "https://evil.example.com"


# ─── Request body size limit ───────────────────────────────────────────

async def test_oversized_json_body_is_rejected_413(client: AsyncClient) -> None:
    big_body = {"display_name": "x" * 2_000_000}  # well past the 1MB cap
    res = await client.patch("/api/v1/users/me", json=big_body)
    assert res.status_code == 413


# ─── Auth header parsing ───────────────────────────────────────────────

async def test_missing_bearer_token_is_401(fake_pool: FakePool) -> None:
    fastapi_app.dependency_overrides[get_pool] = lambda: fake_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as raw_client:
            res = await raw_client.get("/api/v1/users/me")
            assert res.status_code == 401
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)


async def test_malformed_authorization_header_is_401(fake_pool: FakePool) -> None:
    fastapi_app.dependency_overrides[get_pool] = lambda: fake_pool
    try:
        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url="http://test") as raw_client:
            res = await raw_client.get("/api/v1/users/me", headers={"Authorization": "NotBearer abc"})
            assert res.status_code == 401
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)


# ─── Banned-user rejection ──────────────────────────────────────────────
# Exercises the REAL get_current_account (not an override that would bypass
# its own banned-check) with a real minted access token, same pattern as
# tests/test_api/test_sessions.py::test_banned_user_cannot_authenticate.

async def test_banned_account_is_rejected_403(fake_pool: FakePool, user_row: dict) -> None:
    from fastapi import HTTPException

    from app.api.deps import get_current_account
    from app.core.session import create_session

    user_id = user_row["id"]
    session_row: dict = {}

    class _SessionConn:
        async def fetchrow(self, query: str, *args: object) -> dict | None:
            return None

        async def execute(self, query: str, *args: object) -> str:
            if query.strip().startswith("INSERT INTO user_sessions"):
                session_id, uid, secret_hash, platform, expires_at = args
                session_row.update(
                    id=session_id, user_id=uid, refresh_secret_hash=secret_hash,
                    platform=platform, expires_at=expires_at, revoked_at=None,
                )
            return "OK"

        def transaction(self):
            return _NoopCtx()

    class _NoopCtx:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    pair = await create_session(_SessionConn(), user_id, "web")
    banned_row = {**user_row, "banned": True}

    def _handler(query: str, args: tuple) -> dict | None:
        if "user_sessions" in query:
            return dict(session_row)
        return banned_row

    fake_pool.store.fetchrow_handler = _handler

    with pytest.raises(HTTPException) as exc_info:
        await get_current_account(authorization=f"Bearer {pair.access_token}", pool=fake_pool)  # type: ignore[arg-type]
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "account_banned"


# ─── Unhandled-exception redaction ──────────────────────────────────────

async def test_unhandled_exception_never_leaks_internals(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.deps import get_current_account

    async def _boom() -> CurrentAccount:
        raise RuntimeError("super secret internal detail: db password is hunter2")

    fastapi_app.dependency_overrides[get_current_account] = _boom
    try:
        res = await client.get("/api/v1/users/me")
        assert res.status_code == 500
        body = res.json()
        assert body == {"detail": "internal server error"}
        assert "hunter2" not in res.text
        assert "RuntimeError" not in res.text
    finally:
        fastapi_app.dependency_overrides.pop(get_current_account, None)


# ─── Production docs policy (pure function — the real app is already
# constructed with dev settings by the time tests run, so this checks the
# same decision logic main.py uses rather than the already-built app). ────

def test_docs_disabled_in_production() -> None:
    assert _docs_urls("production") == (None, None, None)


def test_docs_enabled_outside_production() -> None:
    assert _docs_urls("development") == ("/docs", "/redoc", "/openapi.json")
    assert _docs_urls("staging") == ("/docs", "/redoc", "/openapi.json")


# ─── WebSocket inbound frame size limit ─────────────────────────────────

class _FakeOversizedWebSocket:
    def __init__(self, oversized_text: str) -> None:
        self._sent = False
        self.closed_with: int | None = None
        self._text = oversized_text

    async def receive_text(self) -> str:
        if self._sent:
            # Second call: hang forever from the test's perspective by
            # raising — the reader loop should have already closed and
            # returned after the first oversized frame.
            raise AssertionError("receive_text called again after the oversized frame should have closed the loop")
        self._sent = True
        return self._text

    async def send_json(self, data: object) -> None:
        pass

    async def close(self, code: int) -> None:
        self.closed_with = code


async def test_oversized_inbound_ws_frame_is_rejected() -> None:
    from app.api.v1.realtime import _reader_loop

    oversized = "x" * (MAX_INBOUND_FRAME_BYTES + 1)
    ws = _FakeOversizedWebSocket(oversized)
    conn_state = LocalConnection(user_id=uuid4(), community_slug="quiet-storm")

    await _reader_loop(ws, conn_state, pool=None, redis=None, manager=None)  # type: ignore[arg-type]

    assert ws.closed_with == CLOSE_MALFORMED_FRAME


# ─── Trusted proxy handling (rate-limit IP extraction) ──────────────────

def _fake_request(headers: dict[str, str], client_host: str | None) -> object:
    from starlette.requests import Request

    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 12345) if client_host else None,
        "method": "GET",
        "path": "/",
    }
    return Request(scope)


def test_client_ip_prefers_first_hop_of_x_forwarded_for() -> None:
    from app.api.v1.otp import _client_ip

    req = _fake_request({"x-forwarded-for": "203.0.113.5, 10.0.0.1"}, client_host="10.0.0.1")
    assert _client_ip(req) == "203.0.113.5"


def test_client_ip_falls_back_to_direct_peer_without_the_header() -> None:
    from app.api.v1.otp import _client_ip

    req = _fake_request({}, client_host="198.51.100.7")
    assert _client_ip(req) == "198.51.100.7"

"""WS handshake Origin handling (app/api/v1/realtime.py's community_websocket).

Origin's real purpose is catching a malicious THIRD-PARTY web page embedding
JS that opens a cross-origin WS to us with a stolen ticket. It does NOT
reliably signal "browser vs native": a real Android device test found that
React Native's OkHttp-based WebSocket client sends an Origin header too,
defaulted to the connection's own target scheme+host (e.g.
"http://10.0.2.2:8000" when connecting to that same host) — not "no origin"
as a naive browser-only assumption would predict, and not any web frontend's
real origin either. The fix allows a same-host Origin (covers both that
native-client quirk and a legitimate same-origin browser page) or an
explicitly allowlisted Origin (a legitimate cross-origin web frontend);
only a genuine cross-origin mismatch is rejected.

`get_redis` is monkeypatched to return None so anything that clears the
Origin check hits a single, unambiguous close code (1011) distinct from the
Origin rejection (CLOSE_FORBIDDEN / 4403) — no live Redis needed.
"""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.config import settings
from app.core.realtime import CLOSE_FORBIDDEN
from app.main import app as fastapi_app

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _allowed_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "CORS_ORIGINS", "https://app.frinq.in")
    monkeypatch.setattr("app.api.v1.realtime.get_redis", lambda: _none())


async def _none():
    return None


def _connect(headers: dict[str, str]):
    client = TestClient(fastapi_app)
    return client.websocket_connect("/api/v1/ws/community?ticket=whatever", headers=headers)


async def test_no_origin_header_clears_the_check() -> None:
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with _connect({}):
            pass
    assert exc_info.value.code != CLOSE_FORBIDDEN


async def test_origin_matching_the_requests_own_host_clears_the_check() -> None:
    # Mirrors React Native's OkHttp WebSocket client, confirmed on a real
    # Android device: it sends Origin defaulted to the target's own host.
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with _connect({"origin": "http://testserver", "host": "testserver"}):
            pass
    assert exc_info.value.code != CLOSE_FORBIDDEN


async def test_mismatched_cross_origin_is_rejected() -> None:
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with _connect({"origin": "https://evil.example", "host": "testserver"}):
            pass
    assert exc_info.value.code == CLOSE_FORBIDDEN


async def test_allowlisted_cross_origin_web_frontend_clears_the_check() -> None:
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with _connect({"origin": "https://app.frinq.in", "host": "testserver"}):
            pass
    assert exc_info.value.code != CLOSE_FORBIDDEN

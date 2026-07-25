"""app/core/redis_client.py's two clients.

Real device test found a genuine bug: ConnectionManager's long-lived, low-
traffic pub/sub `listen()` subscription was sharing get_redis()'s
socket_timeout=2 — a hard per-read deadline on the underlying socket. That
deadline fired the moment traffic went quiet (well under 2s of silence
between chat messages is normal), silently killing the listener task with an
unhandled TimeoutError. Every message still persisted successfully; its
confirmation just never reached any client, forever, until a new WebSocket
connection happened to recreate the listener. Reproduced directly: subscribe
succeeded, then a publish minutes later reached zero subscribers.

Fix: get_pubsub_redis() is a SEPARATE client with socket_timeout=None (block
indefinitely — correct for a call that's supposed to wait for the next
message) + health_check_interval (detects a genuinely dead connection via
periodic PING, since there's no read deadline to fall back on). get_redis()
keeps its short timeout for regular fast commands (rate limits, tickets).
"""

from __future__ import annotations

import pytest

import app.core.redis_client as redis_client


@pytest.fixture(autouse=True)
def _reset_singletons():
    redis_client._client = None
    redis_client._pubsub_client = None
    redis_client._last_failure = 0.0
    redis_client._pubsub_last_failure = 0.0
    yield
    redis_client._client = None
    redis_client._pubsub_client = None
    redis_client._last_failure = 0.0
    redis_client._pubsub_last_failure = 0.0


class _FakeClient:
    async def ping(self) -> bool:
        return True


def _capturing_from_url(captured: dict):
    def fake_from_url(url, **kwargs):
        captured.update(kwargs)
        return _FakeClient()

    return fake_from_url


async def test_get_redis_keeps_a_short_socket_timeout_for_fast_commands(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}
    monkeypatch.setattr(redis_client.redis_asyncio, "from_url", _capturing_from_url(captured))

    client = await redis_client.get_redis()

    assert client is not None
    assert captured.get("socket_timeout") == 2


async def test_get_pubsub_redis_never_times_out_a_blocking_read(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}
    monkeypatch.setattr(redis_client.redis_asyncio, "from_url", _capturing_from_url(captured))

    client = await redis_client.get_pubsub_redis()

    assert client is not None
    assert captured.get("socket_timeout") is None
    assert captured.get("health_check_interval", 0) > 0


async def test_get_redis_and_get_pubsub_redis_are_independent_singletons(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}
    monkeypatch.setattr(redis_client.redis_asyncio, "from_url", _capturing_from_url(captured))

    regular = await redis_client.get_redis()
    pubsub = await redis_client.get_pubsub_redis()

    assert regular is not pubsub


async def test_close_redis_closes_both_clients(monkeypatch: pytest.MonkeyPatch) -> None:
    closed = {"regular": False, "pubsub": False}

    class _FakeClosableClient:
        def __init__(self, key: str) -> None:
            self._key = key

        async def ping(self) -> bool:
            return True

        async def close(self) -> None:
            closed[self._key] = True

    def fake_from_url(url, **kwargs):
        return _FakeClosableClient("pubsub" if kwargs.get("socket_timeout") is None else "regular")

    monkeypatch.setattr(redis_client.redis_asyncio, "from_url", fake_from_url)

    await redis_client.get_redis()
    await redis_client.get_pubsub_redis()
    await redis_client.close_redis()

    assert closed == {"regular": True, "pubsub": True}
    assert redis_client._client is None
    assert redis_client._pubsub_client is None

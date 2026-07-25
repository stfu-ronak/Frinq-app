from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

import app.workers.tasks.push as push_module
from app.core.push import RecipientToken
from app.workers.tasks.push import send_community_push
from tests.conftest import FakePool, FakeRedis


def _recipient(user_id=None, token_hash="hash-1", token="plain-token", platform="android") -> RecipientToken:
    return RecipientToken(user_id=user_id or uuid4(), token_hash=token_hash, token=token, platform=platform)


@pytest.fixture(autouse=True)
def _wire_pool_and_redis(monkeypatch: pytest.MonkeyPatch, fake_pool: FakePool, fake_redis: FakeRedis):
    monkeypatch.setattr(push_module, "get_pool", lambda: fake_pool)

    async def _get_redis():
        return fake_redis

    monkeypatch.setattr(push_module, "get_redis", _get_redis)
    return fake_pool, fake_redis


async def test_no_recipients_is_a_silent_noop(monkeypatch: pytest.MonkeyPatch, fake_pool: FakePool) -> None:
    async def _no_recipients(conn, **kwargs):
        return []

    monkeypatch.setattr(push_module, "eligible_recipient_tokens", _no_recipients)
    send_mock_called = False

    async def _send_sync_should_not_run(*a, **kw):
        nonlocal send_mock_called
        send_mock_called = True

    monkeypatch.setattr(push_module, "_send_sync", _send_sync_should_not_run)
    await send_community_push({}, "quiet-storm", str(uuid4()), [])
    assert send_mock_called is False


async def test_skips_and_logs_when_fcm_is_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _one_recipient(conn, **kwargs):
        return [_recipient()]

    monkeypatch.setattr(push_module, "eligible_recipient_tokens", _one_recipient)
    monkeypatch.setattr(push_module, "_get_firebase_app", lambda: None)
    sent = []
    monkeypatch.setattr(push_module, "_send_sync", lambda app, token: sent.append(token))
    await send_community_push({}, "quiet-storm", str(uuid4()), [])
    assert sent == []  # never attempted a send with no credentials configured


async def test_sends_to_each_eligible_recipient_with_no_pii_in_the_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    recipients = [_recipient(token="tok-1"), _recipient(token="tok-2")]

    async def _two_recipients(conn, **kwargs):
        return recipients

    monkeypatch.setattr(push_module, "eligible_recipient_tokens", _two_recipients)
    monkeypatch.setattr(push_module, "_get_firebase_app", lambda: "fake-app")
    sent_tokens = []

    def _fake_send_sync(app, token):
        sent_tokens.append(token)
        return None

    monkeypatch.setattr(push_module, "_send_sync", _fake_send_sync)
    await send_community_push({}, "quiet-storm", str(uuid4()), [])
    assert sorted(sent_tokens) == ["tok-1", "tok-2"]
    # The generic copy constants carry no message/author/phone content.
    assert "message" not in push_module._PUSH_BODY.lower()
    assert "@" not in push_module._PUSH_BODY


async def test_invalid_token_is_cleaned_up_from_the_database(
    monkeypatch: pytest.MonkeyPatch, fake_pool: FakePool,
) -> None:
    recipient = _recipient(token_hash="stale-hash")

    async def _one_recipient(conn, **kwargs):
        return [recipient]

    monkeypatch.setattr(push_module, "eligible_recipient_tokens", _one_recipient)
    monkeypatch.setattr(push_module, "_get_firebase_app", lambda: "fake-app")
    monkeypatch.setattr(push_module, "_send_sync", lambda app, token: "invalid_token")

    invalidated = []

    async def _fake_invalidate(conn, token_hash):
        invalidated.append(token_hash)

    monkeypatch.setattr(push_module, "invalidate_token", _fake_invalidate)
    await send_community_push({}, "quiet-storm", str(uuid4()), [])
    assert invalidated == ["stale-hash"]


async def test_send_timeout_is_swallowed_not_raised(monkeypatch: pytest.MonkeyPatch) -> None:
    """A hung provider call must never crash the worker — Task 44 Step 3."""
    import time

    recipient = _recipient()

    async def _one_recipient(conn, **kwargs):
        return [recipient]

    monkeypatch.setattr(push_module, "eligible_recipient_tokens", _one_recipient)
    monkeypatch.setattr(push_module, "_get_firebase_app", lambda: "fake-app")
    monkeypatch.setattr(push_module, "_SEND_TIMEOUT_SECONDS", 0.05)

    def _slow_send(app, token):
        time.sleep(0.3)  # real thread-blocking sleep, well past the 0.05s timeout
        return None

    monkeypatch.setattr(push_module, "_send_sync", _slow_send)

    # Must return normally (no exception) even though the send never completed
    # in time.
    await send_community_push({}, "quiet-storm", str(uuid4()), [])


async def test_throttled_recipient_within_the_window_is_skipped(
    monkeypatch: pytest.MonkeyPatch, fake_redis: FakeRedis,
) -> None:
    recipient = _recipient()

    async def _one_recipient(conn, **kwargs):
        return [recipient]

    monkeypatch.setattr(push_module, "eligible_recipient_tokens", _one_recipient)
    monkeypatch.setattr(push_module, "_get_firebase_app", lambda: "fake-app")
    sent = []
    monkeypatch.setattr(push_module, "_send_sync", lambda app, token: sent.append(token))

    # First call consumes the 1-per-15-min budget; second call for the same
    # (user, community) within the window must be skipped.
    await send_community_push({}, "quiet-storm", str(uuid4()), [])
    assert len(sent) == 1
    await send_community_push({}, "quiet-storm", str(uuid4()), [])
    assert len(sent) == 1  # still 1 — the second attempt was throttled

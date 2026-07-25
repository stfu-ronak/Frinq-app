"""Task 47 Step 5 — server-side audited failure switches for new OTP
requests, quiz starts, and push sends. Chat-send's switch (CHAT_DISABLED)
was built in Task 46 and is tested in test_realtime.py; not duplicated here.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import settings
from app.core import metrics


def _counter_value(counter, **labels) -> float:
    return counter.labels(**labels)._value.get()  # noqa: SLF001


async def test_otp_send_rejects_when_disabled(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "OTP_REQUESTS_DISABLED", True)
    before = _counter_value(metrics.feature_disabled_rejections_total, feature="otp_request")

    res = await client.post("/api/v1/otp/send", json={"phone": "9990001111"})

    assert res.status_code == 503
    assert _counter_value(metrics.feature_disabled_rejections_total, feature="otp_request") == before + 1


async def test_otp_send_works_normally_when_not_disabled(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "OTP_REQUESTS_DISABLED", False)
    monkeypatch.setattr("app.api.v1.otp.otp_bypass_active", lambda phone: True)

    res = await client.post("/api/v1/otp/send", json={"phone": "8000000001"})
    assert res.status_code == 200


async def test_quiz_start_rejects_when_disabled(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "QUIZ_STARTS_DISABLED", True)
    before = _counter_value(metrics.feature_disabled_rejections_total, feature="quiz_start")

    res = await client.post("/api/v1/quiz/start", json={"phone": "9990001111"})

    assert res.status_code == 503
    assert _counter_value(metrics.feature_disabled_rejections_total, feature="quiz_start") == before + 1


async def test_push_send_no_ops_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    from uuid import uuid4

    from app.workers.tasks import push as push_module

    monkeypatch.setattr(settings, "PUSH_SENDS_DISABLED", True)
    called = False

    async def _should_not_run(*a, **kw):
        nonlocal called
        called = True

    monkeypatch.setattr(push_module, "eligible_recipient_tokens", _should_not_run)
    before = _counter_value(metrics.feature_disabled_rejections_total, feature="push_send")

    await push_module.send_community_push({}, "quiet-storm", str(uuid4()), [])

    assert called is False
    assert _counter_value(metrics.feature_disabled_rejections_total, feature="push_send") == before + 1

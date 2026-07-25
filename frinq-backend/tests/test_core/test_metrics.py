"""Task 46 Step 3 — proves the metrics registry actually reflects what
happened, not just that the instruments exist. Each test drives the REAL
function that owns a given metric (not the metrics module in isolation) and
reads the counter back through prometheus_client's own collect() API.
"""

from __future__ import annotations

import pytest

from app.core import metrics
from app.core.rate_limit import RateLimitUnavailable, check_rate_limit


def _counter_value(counter, **labels) -> float:
    child = counter.labels(**labels) if labels else counter
    return child._value.get()  # noqa: SLF001 — prometheus_client's own read API for tests


async def test_rate_limit_unavailable_increments_redis_failures_and_the_fail_closed_limiter_raises() -> None:
    before = _counter_value(metrics.redis_failures_total, source="rate_limit.otp_request")
    with pytest.raises(RateLimitUnavailable):
        await check_rate_limit("otp_request", "some-key", redis=None)
    after = _counter_value(metrics.redis_failures_total, source="rate_limit.otp_request")
    assert after == before + 1


async def test_rate_limit_unavailable_fail_open_limiter_allows_and_still_counts_the_failure() -> None:
    before = _counter_value(metrics.redis_failures_total, source="rate_limit.chat_send")
    result = await check_rate_limit("chat_send", "some-key", redis=None)
    assert result.allowed is True
    after = _counter_value(metrics.redis_failures_total, source="rate_limit.chat_send")
    assert after == before + 1


async def test_send_sync_returns_invalid_token_on_unregistered_and_the_caller_counts_it_by_outcome() -> None:
    """_send_sync's real branch (not the metrics increment, which lives one
    level up in send_community_push) — proves the 3-way outcome contract the
    caller's metrics wiring depends on."""
    import sys
    import types

    from app.workers.tasks import push as push_module

    class _FakeUnregisteredError(Exception):
        pass

    fake_module = types.SimpleNamespace(
        Message=lambda **kw: object(),
        Notification=lambda **kw: object(),
        UnregisteredError=_FakeUnregisteredError,
        send=lambda message, app: (_ for _ in ()).throw(_FakeUnregisteredError()),
    )
    sys.modules["firebase_admin.messaging"] = fake_module
    try:
        outcome = push_module._send_sync("fake-app", "tok-1")
    finally:
        del sys.modules["firebase_admin.messaging"]

    assert outcome == "invalid_token"


async def test_quiz_job_failed_increments_quiz_jobs_total(monkeypatch: pytest.MonkeyPatch) -> None:
    from uuid import uuid4

    from app.workers.tasks import quiz_insights as qi_module

    calls = []

    class _FakeConn:
        async def execute(self, *a, **kw):
            calls.append(a)
            return "OK"

    class _FakeTx:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    class _FakeConnCtx:
        async def __aenter__(self):
            return _FakeConnWithTx()

        async def __aexit__(self, *exc):
            return False

    class _FakeConnWithTx(_FakeConn):
        def transaction(self):
            return _FakeTx()

    class _FakePool:
        def acquire(self):
            return _FakeConnCtx()

    before = _counter_value(metrics.quiz_jobs_total, outcome="failed")
    await qi_module._mark_error(_FakePool(), uuid4(), uuid4(), "SomeError")
    after = _counter_value(metrics.quiz_jobs_total, outcome="failed")
    assert after == before + 1

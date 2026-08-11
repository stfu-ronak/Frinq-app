"""A cached ARQ pool can outlive the Redis it connected to (restart, dropped
idle connection). Before this guard, `enqueue_job` raised straight through
`_enqueue_or_503` and the client got an unhandled 500 instead of the clean 503
the caller is written for — and the submission stayed at status='pending',
which `retry_quiz` (WHERE status='error') can never pick up, so the user was
stuck on "Couldn't submit your answers" permanently."""

import pytest

from app.workers import queue as queue_module


class _DeadPool:
    async def enqueue_job(self, *args, **kwargs):
        raise ConnectionError("Connection closed by server.")


class _LivePool:
    def __init__(self):
        self.calls = []

    async def enqueue_job(self, name, *args):
        self.calls.append((name, args))
        return type("Job", (), {"job_id": "job-1"})()


@pytest.mark.asyncio
async def test_enqueue_returns_none_and_drops_pool_when_redis_died(monkeypatch):
    monkeypatch.setattr(queue_module, "_pool", _DeadPool())

    assert await queue_module._enqueue("generate_quiz_insights", "abc") is None
    # Dropped, so the next call reconnects instead of reusing the dead client.
    assert queue_module._pool is None


@pytest.mark.asyncio
async def test_enqueue_returns_job_id_on_the_happy_path(monkeypatch):
    pool = _LivePool()
    monkeypatch.setattr(queue_module, "_pool", pool)

    assert await queue_module._enqueue("generate_quiz_insights", "abc") == "job-1"
    assert pool.calls == [("generate_quiz_insights", ("abc",))]

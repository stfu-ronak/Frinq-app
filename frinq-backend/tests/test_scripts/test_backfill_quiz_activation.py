from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

import scripts.backfill_quiz_activation as backfill


class _FakeConn:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        return list(self.rows)


class _FakeCtx:
    def __init__(self, conn: Any) -> None:
        self.conn = conn

    async def __aenter__(self) -> Any:
        return self.conn

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class _FakePool:
    def __init__(self, conn: Any) -> None:
        self.conn = conn

    def acquire(self) -> _FakeCtx:
        return _FakeCtx(self.conn)


class _FakeQueue:
    def __init__(self) -> None:
        self.enqueued: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []

    async def enqueue_job(self, function: str, *args: Any, **kwargs: Any) -> object:
        self.enqueued.append((function, args, kwargs))
        return object()


async def test_dry_run_reports_but_never_enqueues(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [{"user_id": uuid4(), "submission_id": uuid4()}]
    pool = _FakePool(_FakeConn(rows))
    queue = _FakeQueue()

    monkeypatch.setattr(backfill, "init_pool", lambda: _async_return(pool))
    monkeypatch.setattr(backfill, "close_pool", lambda: _async_return(None))
    monkeypatch.setattr(backfill, "get_queue", lambda: _async_return(queue))

    exit_code = await backfill._main(apply=False)

    assert exit_code == 0
    assert queue.enqueued == []


async def test_apply_enqueues_with_deterministic_job_id(monkeypatch: pytest.MonkeyPatch) -> None:
    submission_id = uuid4()
    rows = [{"user_id": uuid4(), "submission_id": submission_id}]
    pool = _FakePool(_FakeConn(rows))
    queue = _FakeQueue()

    monkeypatch.setattr(backfill, "init_pool", lambda: _async_return(pool))
    monkeypatch.setattr(backfill, "close_pool", lambda: _async_return(None))
    monkeypatch.setattr(backfill, "get_queue", lambda: _async_return(queue))

    exit_code = await backfill._main(apply=True)

    assert exit_code == 0
    assert len(queue.enqueued) == 1
    function, args, kwargs = queue.enqueued[0]
    assert function == "generate_quiz_insights"
    assert args == (str(submission_id),)
    assert kwargs["_job_id"] == f"quiz_insights_backfill_{submission_id}"


async def _async_return(value: Any) -> Any:
    return value

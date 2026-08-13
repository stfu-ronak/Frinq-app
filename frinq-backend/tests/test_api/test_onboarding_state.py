from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.workers.tasks.quiz_insights import STALE_PROCESSING_AFTER_S
from tests.conftest import FakePool


async def test_users_me_reports_onboarding_state_and_community(
    client: AsyncClient, current_account: Any
) -> None:
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["onboarding_state"] == current_account.onboarding_state
    assert body["community_slug"] == current_account.community_slug
    assert body["banned"] is False


async def test_retry_requires_error_status(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    fake_pool.store.fetchrow_handler = lambda query, args: None  # no error-status row matches

    resp = await client.post(f"/api/v1/quiz/{uuid4()}/retry")
    assert resp.status_code == 404


async def test_retry_succeeds_and_returns_job(
    client: AsyncClient, fake_pool: FakePool, current_account: Any
) -> None:
    fake_pool.store.fetchrow_handler = lambda query, args: {"retry_count": 0}

    resp = await client.post(f"/api/v1/quiz/{uuid4()}/retry")
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["status"] == "pending"
    assert body["job_id"]

    retry_update = [
        q for q, _ in fake_pool.store.queries
        if q.strip().startswith("UPDATE quiz_submissions SET status='pending'")
    ]
    assert len(retry_update) == 1
    assert "retry_count = retry_count + 1" in retry_update[0]


async def test_retry_limit_reached(client: AsyncClient, fake_pool: FakePool) -> None:
    fake_pool.store.fetchrow_handler = lambda query, args: {"retry_count": 3}

    resp = await client.post(f"/api/v1/quiz/{uuid4()}/retry")
    assert resp.status_code == 429


async def test_retry_binds_the_callers_own_account_id_as_the_owner_filter(
    client: AsyncClient, fake_pool: FakePool, current_account: Any
) -> None:
    """A future refactor that read user_id from somewhere other than the
    authenticated session (request body, a stale variable, ...) would still
    pass test_retry_requires_error_status/test_retry_succeeds — this test
    is the one that actually checks WHOSE id gets bound into the ownership
    filter, not just that some row is or isn't returned."""
    fake_pool.store.fetchrow_handler = lambda query, args: None

    submission_id = uuid4()
    await client.post(f"/api/v1/quiz/{submission_id}/retry")

    select_calls = [
        (q, a) for q, a in fake_pool.store.queries
        if q.strip().startswith("SELECT retry_count FROM quiz_submissions")
    ]
    assert len(select_calls) == 1
    query, args = select_calls[0]
    assert "user_id = $2" in query
    # $3 is the staleness window: the filter accepts status='error' OR a
    # status='processing' row older than that, so a submission stranded by a
    # dead worker stays recoverable while a live one still can't be
    # duplicated. Ownership binding is what this test actually guards.
    bound_submission_id, bound_user_id, bound_stale_after = args
    assert bound_submission_id == submission_id
    assert bound_user_id == current_account.id
    assert bound_stale_after == float(STALE_PROCESSING_AFTER_S)
    assert "status = 'processing'" in query


async def test_retry_resets_submission_to_error_when_queue_unavailable(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Without this, a failed enqueue leaves the submission at 'pending' —
    which no longer matches retry_quiz's own WHERE status='error' filter,
    burning one of only 3 attempts with no way to ever retry again."""
    fake_pool.store.fetchrow_handler = lambda query, args: {"retry_count": 0}

    async def _fake_enqueue_fails(submission_id: Any) -> None:
        return None

    monkeypatch.setattr("app.api.v1.quiz.enqueue_quiz_insights", _fake_enqueue_fails)

    resp = await client.post(f"/api/v1/quiz/{uuid4()}/retry")
    assert resp.status_code == 503

    queries = [q for q, _ in fake_pool.store.queries]
    assert any(
        q.strip().startswith("UPDATE quiz_submissions SET status = 'error'") for q in queries
    )


async def test_complete_is_a_noop_when_already_processing_or_done(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    """Resetting an already-processing/done submission back to 'pending'
    would defeat generate_quiz_insights' own idempotency guard and risk
    desyncing an already-active user (see quiz_insights.py's community
    reassignment rejection). complete_quiz must no-op instead."""
    fake_pool.store.fetchrow_handler = lambda query, args: {"status": "done"}

    resp = await client.patch(
        f"/api/v1/quiz/complete/{uuid4()}", json={"answers": {}}
    )
    assert resp.status_code == 202, resp.text
    assert resp.json()["status"] == "done"
    assert resp.json()["job_id"] is None

    queries = [q for q, _ in fake_pool.store.queries]
    assert not any(q.strip().startswith("UPDATE quiz_submissions\n") for q in queries)

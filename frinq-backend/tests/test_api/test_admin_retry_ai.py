from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.config import settings
from tests.conftest import FakePool

_ADMIN_HEADERS = {"Authorization": f"Bearer {settings.ADMIN_KEY}"}


async def test_retry_ai_queues_durable_job_not_a_background_task(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    fake_pool.store.fetchrow_handler = lambda query, args: {"user_id": user_id, "status": "error"}

    async def _fake_enqueue(submission_id: Any) -> str:
        return f"job-{submission_id}"

    monkeypatch.setattr("app.api.v1.admin.enqueue_quiz_insights", _fake_enqueue)

    submission_id = uuid4()
    resp = await client.post(
        f"/api/v1/admin/submissions/{submission_id}/retry-ai", headers=_ADMIN_HEADERS
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["job_id"] == f"job-{submission_id}"

    queries = [q for q, _ in fake_pool.store.queries]
    assert any(q.strip().startswith("UPDATE quiz_submissions SET status='processing'") for q in queries)
    assert any(
        q.strip().startswith("UPDATE users SET onboarding_state='profile_processing'") for q in queries
    )


async def test_retry_ai_rejects_submission_with_no_owning_account(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    fake_pool.store.fetchrow_handler = lambda query, args: {"user_id": None, "status": "error"}

    resp = await client.post(
        f"/api/v1/admin/submissions/{uuid4()}/retry-ai", headers=_ADMIN_HEADERS
    )
    assert resp.status_code == 400


async def test_retry_ai_rejects_already_processing(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    fake_pool.store.fetchrow_handler = lambda query, args: {"user_id": uuid4(), "status": "processing"}

    resp = await client.post(
        f"/api/v1/admin/submissions/{uuid4()}/retry-ai", headers=_ADMIN_HEADERS
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["ok"] is False


async def test_retry_ai_returns_503_and_resets_error_when_queue_unavailable(
    client: AsyncClient,
    fake_pool: FakePool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    fake_pool.store.fetchrow_handler = lambda query, args: {"user_id": user_id, "status": "error"}

    async def _fake_enqueue_fails(submission_id: Any) -> None:
        return None

    monkeypatch.setattr("app.api.v1.admin.enqueue_quiz_insights", _fake_enqueue_fails)

    resp = await client.post(
        f"/api/v1/admin/submissions/{uuid4()}/retry-ai", headers=_ADMIN_HEADERS
    )
    assert resp.status_code == 503

    queries = [q for q, _ in fake_pool.store.queries]
    assert any(
        q.strip().startswith("UPDATE users SET onboarding_state='error'") for q in queries
    )


async def test_retry_ai_requires_admin_key() -> None:
    from httpx import ASGITransport

    from app.main import app as fastapi_app

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(f"/api/v1/admin/submissions/{uuid4()}/retry-ai")
    assert resp.status_code == 401

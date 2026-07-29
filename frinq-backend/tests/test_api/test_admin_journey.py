from __future__ import annotations

import pytest

from app.api.v1 import admin as admin_api
from app.api.deps import get_pool
from app.config import settings
from app.main import app as fastapi_app
from tests.conftest import FakePool


async def test_journey_redacts_raw_event_data_and_returns_session_summary(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    monkeypatch.setattr(settings, "ADMIN_KEY", "test-admin-key")
    pool = FakePool()
    pool.store.fetch_handler = lambda _query, _args: [
        {
            "id": 1,
            "session_id": "session-1",
            "phone": "9999999999",
            "name": "Asha",
            "page": "quiz",
            "action": "screen_view",
            "element": None,
            "data": {"raw_answer": "private"},
            "created_at": None,
        },
        {
            "id": 2,
            "session_id": "session-1",
            "phone": "9999999999",
            "name": "Asha",
            "page": "quiz",
            "action": "quiz_completed",
            "element": None,
            "data": None,
            "created_at": None,
        },
    ]

    async def override_pool():
        return pool

    fastapi_app.dependency_overrides[get_pool] = override_pool
    try:
        res = await client.get(
            "/api/v1/admin/journey?phone=9999999999",
            headers={"Authorization": "Bearer test-admin-key"},
        )
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)

    assert res.status_code == 200
    body = res.json()
    assert body["summary"] == {
        "sessions": 1,
        "actions": {"screen_view": 1, "quiz_completed": 1},
    }
    assert "data" not in body["events"][0]

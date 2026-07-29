from __future__ import annotations

import pytest

from app.api.v1 import admin as admin_api
from app.config import settings


async def test_analytics_includes_app_and_community_engagement(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    monkeypatch.setattr(settings, "ADMIN_KEY", "test-admin-key")
    monkeypatch.setattr(admin_api, "_analytics_cache", None)

    def fetchval(query: str, _args):
        if "COUNT(DISTINCT session_id)" in query:
            return 7
        if "COUNT(*) FROM tracking_events" in query:
            return 19
        if "COUNT(*) FROM messages" in query:
            return 11
        if "COUNT(DISTINCT user_id) FROM messages" in query:
            return 5
        return 0

    def fetch(query: str, _args):
        if "FROM tracking_events" in query and "GROUP BY action" in query:
            return [{"action": "screen_view", "count": 12}]
        return []

    # client fixture exposes its FakePool through the route dependency.
    from tests.conftest import FakePool
    pool = FakePool()
    pool.store.fetchval_handler = fetchval
    pool.store.fetch_handler = fetch

    from app.api.deps import get_pool
    from app.main import app as fastapi_app

    async def override_pool():
        return pool

    fastapi_app.dependency_overrides[get_pool] = override_pool
    try:
        res = await client.get(
            "/api/v1/admin/analytics",
            headers={"Authorization": "Bearer test-admin-key"},
        )
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)

    assert res.status_code == 200
    body = res.json()
    assert body["engagement"] == {
        "tracking_events_30d": 19,
        "tracking_sessions_30d": 7,
        "messages_30d": 11,
        "active_chat_users_30d": 5,
        "top_actions": [{"action": "screen_view", "count": 12}],
    }

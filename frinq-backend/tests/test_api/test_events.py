from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.api.deps import get_pool
from app.config import settings
from app.main import app as fastapi_app
from tests.conftest import FakePool


async def test_public_events_only_returns_published_upcoming_or_recent_past(client) -> None:
    pool = FakePool()
    event_id = uuid4()
    pool.store.fetch_handler = lambda _query, _args: [{
        "id": event_id,
        "image_url": "https://cdn.example/event.png",
        "name": "Frinq night",
        "quote": "meet your people",
        "details": "A small evening together.",
        "registration_url": "https://forms.example/register",
        "starts_at": datetime(2026, 8, 1, tzinfo=timezone.utc),
        "ends_at": datetime(2026, 8, 1, 3, tzinfo=timezone.utc),
        "sort_order": 1,
        "status": "published",
    }]

    async def override_pool():
        return pool

    fastapi_app.dependency_overrides[get_pool] = override_pool
    try:
        res = await client.get("/api/v1/events")
    finally:
        fastapi_app.dependency_overrides.pop(get_pool, None)

    assert res.status_code == 200
    assert res.json()["events"][0]["id"] == str(event_id)
    assert res.json()["events"][0]["registration_url"] == "https://forms.example/register"


async def test_admin_event_create_rejects_non_http_registration_url(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    monkeypatch.setattr(settings, "ADMIN_KEY", "test-admin-key")
    res = await client.post(
        "/api/v1/admin/events",
        headers={"Authorization": "Bearer test-admin-key"},
        json={
            "image_url": "https://cdn.example/event.png",
            "name": "Frinq night",
            "quote": "meet your people",
            "details": "A small evening together.",
            "registration_url": "javascript:alert(1)",
            "starts_at": "2026-08-01T00:00:00Z",
            "ends_at": "2026-08-01T03:00:00Z",
            "sort_order": 1,
            "status": "draft",
        },
    )
    assert res.status_code == 422

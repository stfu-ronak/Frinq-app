from __future__ import annotations

from app.config import settings
from tests.conftest import FakePool

_ADMIN_HEADERS = {
    "Authorization": f"Bearer {settings.ADMIN_KEY}",
    "X-Action-Password": settings.ADMIN_ACTION_PASSWORD,
}


async def test_get_admin_quiz_config_requires_admin_key(client, fake_pool: FakePool):
    res = await client.get("/api/v1/admin/quiz-config")
    assert res.status_code == 401


async def test_get_admin_quiz_config_returns_active_version(client, fake_pool: FakePool):
    fake_pool.store.fetchrow_handler = lambda query, args: {
        "version": 1,
        "steps": [{"id": "intro", "kind": "intro", "heading": "Welcome", "ctaLabel": "Start"}],
    }
    res = await client.get("/api/v1/admin/quiz-config", headers=_ADMIN_HEADERS)
    assert res.status_code == 200
    assert res.json()["version"] >= 1


async def test_put_admin_quiz_config_rejects_invalid_steps(client, fake_pool: FakePool):
    res = await client.put(
        "/api/v1/admin/quiz-config",
        json={"steps": [{"id": "x", "kind": "notarealkind"}]},
        headers=_ADMIN_HEADERS,
    )
    assert res.status_code == 422


async def test_put_admin_quiz_config_saves_new_version(client, fake_pool: FakePool):
    new_steps = [
        {"id": "custom_q1", "kind": "text", "section": "custom", "answerKey": "custom_q1", "prompt": "what's new?"},
    ]
    fake_pool.store.fetchval_handler = lambda query, args: 1

    def _fetchrow_handler(query: str, args: object) -> dict:
        return {"version": 2, "steps": new_steps}

    fake_pool.store.fetchrow_handler = _fetchrow_handler

    res = await client.put(
        "/api/v1/admin/quiz-config", json={"steps": new_steps}, headers=_ADMIN_HEADERS,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["steps"] == new_steps

    followup = await client.get("/api/v1/admin/quiz-config", headers=_ADMIN_HEADERS)
    assert followup.json()["steps"] == new_steps

from __future__ import annotations

from tests.conftest import FakePool


async def test_get_quiz_config_returns_active_version(client, fake_pool: FakePool):
    fake_pool.store.fetchrow_handler = lambda query, args: {
        "version": 1,
        "steps": [
            {
                "id": "intro",
                "kind": "intro",
                "heading": "Welcome",
                "ctaLabel": "Start",
            }
        ]
    }
    res = await client.get("/api/v1/quiz/config")
    assert res.status_code == 200
    data = res.json()
    assert data["version"] >= 1
    assert isinstance(data["steps"], list)
    assert len(data["steps"]) > 0

from __future__ import annotations

from app.config import settings
from tests.conftest import FakePool


_ADMIN_HEADERS = {"Authorization": f"Bearer {settings.ADMIN_KEY}"}
_ADMIN_ACTION_HEADERS = {
    **_ADMIN_HEADERS,
    "X-Action-Password": settings.ADMIN_ACTION_PASSWORD,
}


async def test_ai_smoke_requires_action_password(client):
    res = await client.post(
        "/api/v1/admin/ai-test",
        json={"step": "insights", "provider": "gemini", "model_id": "gemini-3.5-flash-lite"},
        headers=_ADMIN_HEADERS,
    )
    assert res.status_code == 403


async def test_ai_smoke_runs_insights_fixture(client, monkeypatch):
    seen: dict[str, object] = {}

    async def fake_generate(answers, *, model_config, usage_recorder):
        seen["answers"] = answers
        seen["config"] = model_config
        return {
            "archetype": "The Quiet Storm",
            "archetype_desc": "A calm, thoughtful presence.",
            "headline": "You make space for good conversations.",
            "insights": ["One", "Two", "Three"],
            "tags": ["calm", "curious", "kind"],
            "share_quote": "Good energy, quietly delivered.",
        }

    monkeypatch.setattr("app.api.v1.admin.generate_insights", fake_generate)
    res = await client.post(
        "/api/v1/admin/ai-test",
        json={"step": "insights", "provider": "gemini", "model_id": "gemini-3.5-flash-lite", "effort": "low"},
        headers=_ADMIN_ACTION_HEADERS,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["step"] == "insights"
    assert body["provider"] == "gemini"
    assert body["model_id"] == "gemini-3.5-flash-lite"
    assert body["result"]["headline"] == "You make space for good conversations."
    assert seen["config"] == {"provider": "gemini", "model_id": "gemini-3.5-flash-lite", "effort": "low"}
    assert "phone" not in seen["answers"]


async def test_ai_smoke_runs_deep_report_fixture(client, monkeypatch):
    seen: dict[str, object] = {}

    async def fake_generate(answers, *, model_config, usage_recorder):
        seen["answers"] = answers
        seen["config"] = model_config
        return {"report_quote": "You notice the details others miss.", "narrative": ["Clean output."]}

    monkeypatch.setattr("app.api.v1.admin.generate_deep_report", fake_generate)
    res = await client.post(
        "/api/v1/admin/ai-test",
        json={"step": "deep_report", "provider": "gemini", "model_id": "gemma-4-31b-it", "effort": "high"},
        headers=_ADMIN_ACTION_HEADERS,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["result"]["report_quote"] == "You notice the details others miss."
    assert seen["config"]["model_id"] == "gemma-4-31b-it"
    assert "phone" not in seen["answers"]


async def test_ai_smoke_runs_unified_summary_fixture(client, monkeypatch):
    seen: dict[str, object] = {}

    async def fake_generate(answers, *, model_config, usage_recorder):
        seen["answers"] = answers
        seen["config"] = model_config
        return {"headline": "One clean result", "deep_summary": {"narrative": ["Clear."]}}

    monkeypatch.setattr("app.api.v1.admin.generate_full_summary", fake_generate)
    res = await client.post(
        "/api/v1/admin/ai-test",
        json={"step": "summary", "provider": "gemini", "model_id": "gemini-3.5-flash-lite", "effort": "low"},
        headers=_ADMIN_ACTION_HEADERS,
    )
    assert res.status_code == 200
    assert res.json()["step"] == "summary"
    assert res.json()["result"]["headline"] == "One clean result"
    assert seen["config"] == {"provider": "gemini", "model_id": "gemini-3.5-flash-lite", "effort": "low"}
    assert "phone" not in seen["answers"]


async def test_ai_config_patch_accepts_gemini(client, fake_pool: FakePool):
    fake_pool.store.fetchrow_handler = lambda query, args: {
        "step": args[0],
        "provider": args[1],
        "model_id": args[2],
        "effort": args[3],
        "updated_at": None,
        "updated_by": args[4],
    }
    res = await client.patch(
        "/api/v1/admin/ai-config/insights",
        json={"provider": "gemini", "model_id": "gemini-3.5-flash-lite", "effort": "low"},
        headers=_ADMIN_ACTION_HEADERS,
    )
    assert res.status_code == 200
    assert res.json()["provider"] == "gemini"


async def test_ai_keys_status_reports_presence_never_values(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-real-key")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    from httpx import ASGITransport, AsyncClient
    from app.main import app as fastapi_app

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/v1/admin/ai-keys-status", headers=_ADMIN_HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert body == {"openai": True, "claude": False, "gemini": False}
    assert "sk-real-key" not in res.text


async def test_ai_keys_status_requires_admin_key():
    from httpx import ASGITransport, AsyncClient
    from app.main import app as fastapi_app

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/v1/admin/ai-keys-status")
    assert res.status_code == 401

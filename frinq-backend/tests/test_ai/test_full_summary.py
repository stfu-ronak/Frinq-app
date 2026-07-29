from __future__ import annotations

import json

from app.core.ai import full_summary
from app.core.ai import failover


def _hero() -> dict:
    return {
        "archetype": "Quiet Anchor",
        "archetype_desc": "you hold people together",
        "headline": "quietly magnetic",
        "insights": [{"label": "signal", "text": "you notice people"}] * 5,
        "tags": ["warm", "steady", "curious"],
        "share_quote": "you make rooms feel easier",
    }


def _report() -> dict:
    return {"report_quote": "there is more under the calm", "narrative": ["a clean read"]}


async def test_full_summary_uses_one_provider_call_and_returns_both_outputs(monkeypatch) -> None:
    calls = []

    async def fake_call(**kwargs):
        calls.append(kwargs)
        return json.dumps({"hero": _hero(), "report": _report()})

    monkeypatch.setattr(full_summary, "call_openai_json", fake_call)
    result = await full_summary.generate_full_summary(
        {"name": "Asha", "phone": "9999999999"},
        model_config={"provider": "openai", "model_id": "gpt-5.5", "effort": "medium"},
    )

    assert len(calls) == 1
    assert result["headline"] == "quietly magnetic"
    assert result["share_card"]["archetype_slug"] == "quiet-anchor"
    assert result["deep_summary"]["report_quote"] == "there is more under the calm"


async def test_full_summary_falls_back_only_after_primary_failure(monkeypatch) -> None:
    failover.reset_for_tests()
    monkeypatch.setattr(failover, "_redis", False)
    calls = []

    async def fake_call(**kwargs):
        calls.append(kwargs["model"])
        if len(calls) == 1:
            raise RuntimeError("provider unavailable")
        return json.dumps({"hero": _hero(), "report": _report()})

    monkeypatch.setattr(full_summary, "call_openai_json", fake_call)
    result = await full_summary.generate_full_summary_with_fallback(
        {"name": "Asha"},
        primary_config={"provider": "openai", "model_id": "primary", "effort": "none"},
        fallback_config={"provider": "openai", "model_id": "fallback", "effort": "none"},
    )

    assert calls == ["primary", "fallback"]
    assert result["headline"] == "quietly magnetic"


async def test_full_summary_uses_cooldown_fallback_without_calling_primary(monkeypatch) -> None:
    failover.reset_for_tests()
    monkeypatch.setattr(failover, "_redis", False)
    await failover.mark_primary_failure("openai:primary")
    calls = []

    async def fake_call(**kwargs):
        calls.append(kwargs["model"])
        return json.dumps({"hero": _hero(), "report": _report()})

    monkeypatch.setattr(full_summary, "call_openai_json", fake_call)
    result = await full_summary.generate_full_summary_with_fallback(
        {"name": "Asha"},
        primary_config={"provider": "openai", "model_id": "primary", "effort": "none"},
        fallback_config={"provider": "openai", "model_id": "fallback", "effort": "none"},
    )

    assert calls == ["fallback"]
    assert result["_ai_route"] == "fallback-cooldown"

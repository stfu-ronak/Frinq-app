from __future__ import annotations

import json

import pytest

from app.core.ai import gemini_client
from app.core.ai.insights import generate_insights
from app.core.ai.openai_client import generate_deep_report


def _answers() -> dict[str, object]:
    return {
        "name": "Ada Example",
        "phone": "8000000001",
        "dob": "14/03/1999",
        "city": "Gurgaon",
        "hobbies": ["reading"],
        "show_up": ["practical help"],
        "looking_for": ["curious people"],
    }


def _insights_json() -> str:
    return json.dumps({
        "archetype": "Quiet Storm",
        "archetype_desc": "calm outside, deep inside",
        "headline": "the still water",
        "insights": [{"label": "Depth", "text": "you notice what others miss"}] * 5,
        "tags": ["depth", "curiosity", "warmth"],
        "share_quote": "quiet carries far",
        "stats": {},
    })


@pytest.mark.asyncio
async def test_gemini_provider_generates_normalized_insights(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    async def fake_call(**kwargs):
        calls.append(kwargs)
        return _insights_json()

    monkeypatch.setattr(gemini_client, "call_gemini_json", fake_call)
    result = await generate_insights(
        _answers(),
        model_config={"provider": "gemini", "model_id": "gemini-3-flash-preview", "effort": "medium"},
    )

    assert result["share_card"]["archetype_slug"] == "quiet-storm"
    assert calls[0]["model"] == "gemini-3-flash-preview"
    assert "8000000001" not in calls[0]["user"]


@pytest.mark.asyncio
async def test_gemma_provider_generates_clean_deep_report(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    async def fake_call(**kwargs):
        calls.append(kwargs)
        return json.dumps({"report_quote": "a thoughtful reader", "narrative": ["A" * 500]})

    monkeypatch.setattr(gemini_client, "call_gemini_json", fake_call)
    result = await generate_deep_report(
        _answers(),
        model_config={"provider": "gemini", "model_id": "gemma-4-31b-it", "effort": "high"},
    )

    assert result["report_quote"] == "a thoughtful reader"
    assert len(result["narrative"][0]) <= 280
    assert calls[0]["model"] == "gemma-4-31b-it"
    assert "8000000001" not in calls[0]["user"]

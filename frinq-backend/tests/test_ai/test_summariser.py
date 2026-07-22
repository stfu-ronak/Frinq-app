"""Mocked-Claude tests for the profile summariser."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.core.ai.pii import PIIContext
from app.core.profile.summariser import SummariserError, summarise_profile


def _profile() -> dict[str, Any]:
    return {
        "primary_goals": ["depth", "play"],
        "loved_activities": [
            {"id": "chess", "intensity": 5},
            {"id": "cafes", "intensity": 4},
        ],
        "saturday_archetype": "workshop",
        "social_type": "selective",
        "connection_signals": ["counter", "weird"],
        "red_flags": ["flaky people"],
        "bonding_style": "secure",
        "chronotype": "evening",
        "group_pref": "small",
        "substance_scene": "social",
        "slider_depth": 0.85,
        "slider_fun_get": 0.7,
        "slider_frequency": 0.4,
        "latent_tags": ["shows up early", "vintage clocks"],
        "hobbies_text": "i collect vintage chess clocks",
        "show_up_style": "early always, stays late",
        "looking_for_text": "curious people who pick up the phone",
        "storytime_transcript": "met at a board games cafe one evening",
    }


def _valid_response_json(**overrides: Any) -> str:
    payload = {
        "summary": (
            "noticed the chess clocks first — there's a specific kind of "
            "attention in someone who collects them. shows up early, stays "
            "for the conversation that starts at 11pm."
        ),
        "tags": [
            "shows up early",
            "vintage chess clocks",
            "small cafés over loud bars",
            "deep 2am talker",
            "calls flakiness out",
        ],
    }
    payload.update(overrides)
    return json.dumps(payload)


class _FakeClaudeClient:
    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)
        self.calls: list[dict[str, Any]] = []
        self.messages = self

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if not self._responses:
            raise AssertionError("FakeClaudeClient ran out of canned responses")
        nxt = self._responses.pop(0)
        if nxt.startswith("RAISE:"):
            raise RuntimeError(nxt[len("RAISE:") :])
        return SimpleNamespace(content=[SimpleNamespace(text=nxt)])


@pytest.fixture(autouse=True)
def _reset_singletons(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.ai import claude_client

    monkeypatch.setattr(claude_client, "_semaphore", None, raising=False)
    monkeypatch.setattr(claude_client, "_client", None, raising=False)


@pytest.mark.asyncio
async def test_summarise_profile_success() -> None:
    client = _FakeClaudeClient([_valid_response_json()])

    result = await summarise_profile(_profile(), client=client)

    assert len(client.calls) == 1
    assert result["ai_summary"].startswith("noticed the chess clocks")
    assert len(result["latent_tags"]) == 5
    # temperature 0.7 per the master plan
    assert client.calls[0]["temperature"] == 0.7
    # system prompt is wrapped for ephemeral caching
    assert client.calls[0]["system"][0]["cache_control"] == {"type": "ephemeral"}


@pytest.mark.asyncio
async def test_summarise_profile_retries_on_malformed_then_succeeds() -> None:
    client = _FakeClaudeClient([
        "this is not json",
        _valid_response_json(),
    ])

    result = await summarise_profile(_profile(), client=client)

    assert len(client.calls) == 2
    assert result["ai_summary"]
    assert result["latent_tags"]


@pytest.mark.asyncio
async def test_summarise_profile_double_failure_raises() -> None:
    client = _FakeClaudeClient(["nope", "still not json"])

    with pytest.raises(SummariserError):
        await summarise_profile(_profile(), client=client)

    assert len(client.calls) == 2


@pytest.mark.asyncio
async def test_summarise_profile_double_failure_via_schema_violation() -> None:
    """Two tags (<3) violates the SummaryResult schema → retry → fail."""
    bad = json.dumps({"summary": "ok", "tags": ["a", "b"]})
    client = _FakeClaudeClient([bad, bad])

    with pytest.raises(SummariserError):
        await summarise_profile(_profile(), client=client)

    assert len(client.calls) == 2


@pytest.mark.asyncio
async def test_summarise_profile_strips_pii_before_sending() -> None:
    profile = _profile()
    profile["hobbies_text"] = "priya from gurgaon, ph +91 9876543210"
    profile["red_flags"] = ["priya hates flakes"]

    client = _FakeClaudeClient([_valid_response_json()])
    pii = PIIContext(name="Priya", phone="+91 9876543210", city="Gurgaon")

    await summarise_profile(profile, pii=pii, client=client)

    sent = client.calls[0]["messages"][0]["content"]
    assert "priya" not in sent.lower()
    assert "gurgaon" not in sent.lower()
    assert "9876543210" not in sent

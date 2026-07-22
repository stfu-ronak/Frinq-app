"""Mocked-Claude tests for the trait extractor."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.core.ai.pii import PIIContext
from app.core.profile import extractor as extractor_mod
from app.core.profile.extractor import extract_traits


# ─── Test fixtures ───────────────────────────────────────────────────

def _seed_profile() -> dict[str, Any]:
    """A deterministic-builder-style seed with values across all trait fields."""
    return {
        "openness": 0.55,
        "conscientiousness": 0.50,
        "extraversion": 0.35,
        "agreeableness": 0.60,
        "neuroticism": 0.45,
        "honesty_humility": 0.70,
        "connection_anxiety": 0.40,
        "connection_avoidance": 0.30,
        "reliability": 0.65,
        "val_self_direction": 0.55,
        "val_stimulation": 0.50,
        "val_achievement": 0.45,
        "val_security": 0.50,
        "val_tradition": 0.40,
        "val_universalism": 0.60,
        "openness_to_change": 0.55,
        "conservation": 0.45,
        "affiliative_humor": 0.65,
        "self_enhancing_humor": 0.55,
        "aggressive_humor": 0.20,
        "directness": 0.60,
        "depth_preference": 0.70,
        "social_type": "selective",
        "saturday_archetype": "workshop",
        "substance_scene": "social",
        "group_pref": "small",
        "chronotype": "evening",
        "plan_style": "planner",
        "connection_signals": ["counter", "weird"],
        "loved_activities": [
            {"id": "chess", "intensity": 4},
            {"id": "cafes", "intensity": 3},
        ],
        "red_flags": ["people who flake last minute", "loud one-uppers"],
        "hobbies_text": "i collect vintage chess clocks",
        "show_up_style": "i show up early and stay late",
        "looking_for_text": "people who are curious and on time",
        "storytime_transcript": "met a friend in a board games cafe",
    }


def _valid_response_json(**overrides: Any) -> str:
    payload = {
        "openness": 0.60,
        "conscientiousness": 0.55,
        "extraversion": 0.30,
        "agreeableness": 0.65,
        "neuroticism": 0.40,
        "honesty_humility": 0.75,
        "connection_anxiety": 0.35,
        "connection_avoidance": 0.25,
        "reliability": 0.75,
        "val_self_direction": 0.60,
        "val_stimulation": 0.55,
        "val_achievement": 0.50,
        "val_security": 0.50,
        "val_tradition": 0.40,
        "val_universalism": 0.65,
        "openness_to_change": 0.60,
        "conservation": 0.45,
        "affiliative_humor": 0.70,
        "self_enhancing_humor": 0.55,
        "aggressive_humor": 0.15,
        "directness": 0.65,
        "depth_preference": 0.80,
        "bonding_style": "secure",
        "chronotype": "evening",
        "plan_style": "planner",
        "latent_tags": [
            "chess at cafés",
            "shows up early",
            "hates flakiness",
            "vintage clocks",
        ],
        "red_flag_normalised": ["flakiness", "one_upping"],
        "confidence": {
            "big_five": "medium",
            "h_factor": "medium",
            "bonding": "medium",
            "values": "low",
            "humor": "medium",
            "lifestyle": "high",
        },
    }
    payload.update(overrides)
    return json.dumps(payload)


class _FakeClaudeClient:
    """Mimics the surface of `AsyncAnthropic` used by `claude_client`.

    `responses` is a list of strings to return in order. Strings beginning
    with "RAISE:" raise a RuntimeError with the trailing message — used to
    simulate network failures.
    """

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
def _reset_semaphore(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure each test gets a fresh semaphore on its own event loop."""
    from app.core.ai import claude_client

    monkeypatch.setattr(claude_client, "_semaphore", None, raising=False)
    monkeypatch.setattr(claude_client, "_client", None, raising=False)


# ─── Tests ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_extract_traits_success_first_call() -> None:
    client = _FakeClaudeClient([_valid_response_json()])
    profile = _seed_profile()

    result = await extract_traits(profile, client=client)

    assert len(client.calls) == 1
    # latent_tags from LLM, written through to profile
    assert result["latent_tags"] == [
        "chess at cafés", "shows up early", "hates flakiness", "vintage clocks",
    ]
    assert "flakiness" in result["red_flag_normalised"]
    # bonding_style was None in seed, LLM provided "secure" — overrides
    assert result["bonding_style"] == "secure"
    # extraversion: seed 0.35, LLM 0.30 — within ±0.20, so applied
    assert abs(result["extraversion"] - 0.30) < 1e-9
    # extraction_confidence written
    assert result["extraction_confidence"]["big_five"] == "medium"


@pytest.mark.asyncio
async def test_extract_traits_clamps_delta_to_max_020() -> None:
    """LLM returns a value > 0.20 away from seed → nudge capped at ±0.20."""
    far = _valid_response_json(openness=0.95)  # seed is 0.55 → gap 0.40
    client = _FakeClaudeClient([far])
    profile = _seed_profile()

    result = await extract_traits(profile, client=client)

    # 0.55 + 0.20 cap = 0.75, NOT 0.95
    assert abs(result["openness"] - 0.75) < 1e-9


@pytest.mark.asyncio
async def test_extract_traits_retries_on_malformed_then_succeeds() -> None:
    client = _FakeClaudeClient([
        "this is not json {{{",       # first call: malformed
        _valid_response_json(),         # second call: valid
    ])
    profile = _seed_profile()

    result = await extract_traits(profile, client=client)

    assert len(client.calls) == 2
    assert result["latent_tags"]  # populated from second attempt
    assert result["extraction_confidence"]["lifestyle"] == "high"


@pytest.mark.asyncio
async def test_extract_traits_double_failure_returns_seed_fallback() -> None:
    client = _FakeClaudeClient([
        "garbage one",
        "garbage two",
    ])
    profile = _seed_profile()

    result = await extract_traits(profile, client=client)

    assert len(client.calls) == 2
    # Numeric traits unchanged from seed
    assert result["openness"] == profile["openness"]
    assert result["extraversion"] == profile["extraversion"]
    # No latent_tags / red_flag_normalised
    assert result["latent_tags"] == []
    assert result["red_flag_normalised"] == []
    # All confidence groups marked "low"
    assert set(result["extraction_confidence"].values()) == {"low"}
    assert "big_five" in result["extraction_confidence"]


@pytest.mark.asyncio
async def test_extract_traits_double_failure_on_validation_error() -> None:
    """Schema-invalid JSON (out-of-range float) is retried and falls back."""
    bad = json.dumps({"openness": 1.5, "latent_tags": [], "red_flag_normalised": [],
                       "confidence": {"big_five": "high"}})
    client = _FakeClaudeClient([bad, bad])
    profile = _seed_profile()

    result = await extract_traits(profile, client=client)

    assert len(client.calls) == 2
    assert result["openness"] == profile["openness"]
    assert set(result["extraction_confidence"].values()) == {"low"}


@pytest.mark.asyncio
async def test_extract_traits_strips_pii_before_sending() -> None:
    profile = _seed_profile()
    profile["hobbies_text"] = "i'm priya from gurgaon, +91 9876543210"
    profile["show_up_style"] = "priya always shows up"

    client = _FakeClaudeClient([_valid_response_json()])
    pii = PIIContext(name="Priya", phone="+91 9876543210", city="Gurgaon")

    await extract_traits(profile, pii=pii, client=client)

    sent_user_msg = client.calls[0]["messages"][0]["content"]
    assert "priya" not in sent_user_msg.lower()
    assert "gurgaon" not in sent_user_msg.lower()
    assert "9876543210" not in sent_user_msg


@pytest.mark.asyncio
async def test_extract_traits_uses_cache_control_on_system() -> None:
    """Sanity-check that the system prompt is wrapped for caching."""
    client = _FakeClaudeClient([_valid_response_json()])
    await extract_traits(_seed_profile(), client=client)

    system_blocks = client.calls[0]["system"]
    assert isinstance(system_blocks, list)
    assert system_blocks[0]["cache_control"] == {"type": "ephemeral"}
    assert client.calls[0]["temperature"] == 0.0

"""LLM-driven trait extraction — the "AI half" of the profile builder.

Takes the deterministic profile (`app.core.profile.builder.build_profile`)
plus the user's raw open-text answers, calls Claude Sonnet 4.6 with the
TRAIT_EXTRACTION_* prompts at `temperature=0.0`, and returns a NEW profile
dict where:
  - numeric traits are nudged by at most ±0.20
  - enum traits (bonding_style / chronotype / plan_style) may be overridden
  - `latent_tags` and `red_flag_normalised` are populated
  - `extraction_confidence` records per-group confidence

Failure policy: malformed JSON → retry once. Second failure → return the
deterministic seed unchanged with empty tags and `low` confidence. The
matching engine treats "low" confidence as a discount, so a silent fallback
degrades gracefully rather than blocking the user.

PII (name / phone / exact city) is scrubbed from every string sent to Claude
via `app.core.ai.pii.scrub_text`.
"""

from __future__ import annotations

import json
from typing import Any, Final

from anthropic import AsyncAnthropic
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.core.ai import prompts
from app.core.ai.claude_client import CLAUDE_SONNET, call_with_cache
from app.core.ai.pii import PIIContext, scrub_list, scrub_text
from app.utils.logger import logger

_MAX_DELTA: Final[float] = 0.20
_MAX_TOKENS: Final[int] = 1000


# ─── Pydantic schema for the LLM's JSON output ───────────────────────

_VALID_BONDING: Final[frozenset[str]] = frozenset({"secure", "anxious", "avoidant", "fearful"})
_VALID_CHRONO: Final[frozenset[str]] = frozenset({"morning", "evening", "neutral"})
_VALID_PLAN: Final[frozenset[str]] = frozenset({"planner", "improviser"})
_VALID_CONF: Final[frozenset[str]] = frozenset({"high", "medium", "low"})


class TraitExtractionResult(BaseModel):
    """Strict-enough validation of the LLM's trait JSON.

    Numeric traits are individually optional so a partial response doesn't
    fail validation — missing fields fall back to the seed. The lists and
    `confidence` dict are required because they're the AI-only signal that
    couldn't be produced deterministically.
    """

    model_config = ConfigDict(extra="ignore")

    # Big Five
    openness: float | None = None
    conscientiousness: float | None = None
    extraversion: float | None = None
    agreeableness: float | None = None
    neuroticism: float | None = None
    # HEXACO
    honesty_humility: float | None = None
    # Bonding
    connection_anxiety: float | None = None
    connection_avoidance: float | None = None
    reliability: float | None = None
    # Schwartz values
    val_self_direction: float | None = None
    val_stimulation: float | None = None
    val_achievement: float | None = None
    val_security: float | None = None
    val_tradition: float | None = None
    val_universalism: float | None = None
    openness_to_change: float | None = None
    conservation: float | None = None
    # Humor + comms
    affiliative_humor: float | None = None
    self_enhancing_humor: float | None = None
    aggressive_humor: float | None = None
    directness: float | None = None
    depth_preference: float | None = None
    # Enums
    bonding_style: str | None = None
    chronotype: str | None = None
    plan_style: str | None = None
    # AI-only outputs
    latent_tags: list[str] = Field(min_length=1, max_length=12)
    red_flag_normalised: list[str] = Field(default_factory=list)
    confidence: dict[str, str]

    @field_validator(
        "openness", "conscientiousness", "extraversion", "agreeableness",
        "neuroticism", "honesty_humility",
        "connection_anxiety", "connection_avoidance", "reliability",
        "val_self_direction", "val_stimulation", "val_achievement",
        "val_security", "val_tradition", "val_universalism",
        "openness_to_change", "conservation",
        "affiliative_humor", "self_enhancing_humor", "aggressive_humor",
        "directness", "depth_preference",
    )
    @classmethod
    def _check_unit(cls, v: float | None) -> float | None:
        if v is None:
            return v
        if not 0.0 <= float(v) <= 1.0:
            raise ValueError("trait value must be in [0.0, 1.0]")
        return float(v)

    @field_validator("bonding_style")
    @classmethod
    def _check_bonding(cls, v: str | None) -> str | None:
        if v is None or v in _VALID_BONDING:
            return v
        raise ValueError(f"invalid bonding_style: {v!r}")

    @field_validator("chronotype")
    @classmethod
    def _check_chrono(cls, v: str | None) -> str | None:
        if v is None or v in _VALID_CHRONO:
            return v
        raise ValueError(f"invalid chronotype: {v!r}")

    @field_validator("plan_style")
    @classmethod
    def _check_plan(cls, v: str | None) -> str | None:
        if v is None or v in _VALID_PLAN:
            return v
        raise ValueError(f"invalid plan_style: {v!r}")

    @field_validator("confidence")
    @classmethod
    def _check_confidence(cls, v: dict[str, str]) -> dict[str, str]:
        for key, level in v.items():
            if level not in _VALID_CONF:
                raise ValueError(f"invalid confidence level for {key}: {level!r}")
        return v


# ─── Helpers ─────────────────────────────────────────────────────────

def _strip_json_fences(text: str) -> str:
    """Best-effort strip of ```json fences — the prompt forbids them but
    Claude occasionally adds them anyway."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
        if t.endswith("```"):
            t = t[: -3]
    return t.strip()


def _parse_response(text: str) -> TraitExtractionResult:
    """Decode the LLM string into a validated TraitExtractionResult.

    Raises `ValueError` (json) or `ValidationError` (pydantic) on failure.
    """
    payload = json.loads(_strip_json_fences(text))
    return TraitExtractionResult.model_validate(payload)


def _build_seed_payload(profile: dict[str, Any]) -> dict[str, Any]:
    """Pluck the high-confidence anchor values from the deterministic profile."""
    seed: dict[str, Any] = {}
    for trait in prompts.NUMERIC_TRAIT_FIELDS:
        if trait in profile and profile[trait] is not None:
            seed[trait] = round(float(profile[trait]), 3)
    for trait in prompts.ENUM_TRAIT_FIELDS:
        if profile.get(trait) is not None:
            seed[trait] = profile[trait]
    for extra in ("social_type", "saturday_archetype", "substance_scene",
                  "group_pref", "connection_signals"):
        if profile.get(extra) is not None:
            seed[extra] = profile[extra]
    return seed


def _build_user_prompt(profile: dict[str, Any], pii: PIIContext | None) -> str:
    red_flags = scrub_list(profile.get("red_flags") or [], pii)
    red_flags = red_flags + [""] * 3  # pad to 3
    seed_payload = _build_seed_payload(profile)
    return prompts.TRAIT_EXTRACTION_USER.format(
        hobbies=scrub_text(profile.get("hobbies_text"), pii),
        red_flag_1=red_flags[0],
        red_flag_2=red_flags[1],
        red_flag_3=red_flags[2],
        show_up=scrub_text(profile.get("show_up_style"), pii),
        looking_for=scrub_text(profile.get("looking_for_text"), pii),
        storytime_transcript=scrub_text(profile.get("storytime_transcript"), pii),
        seed_json=json.dumps(seed_payload, sort_keys=True),
        schema_json=prompts.TRAIT_EXTRACTION_SCHEMA,
    )


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def _merge(profile: dict[str, Any], result: TraitExtractionResult) -> dict[str, Any]:
    """Apply the bounded nudge: extracted numerics adjust the seed by ≤ ±0.20.

    Enums override the seed. AI-only fields (latent_tags, red_flag_normalised,
    extraction_confidence) overwrite whatever the deterministic builder left
    in place (which is "no value").
    """
    out = dict(profile)
    payload = result.model_dump()

    for trait in prompts.NUMERIC_TRAIT_FIELDS:
        value = payload.get(trait)
        if value is None:
            continue
        seed = profile.get(trait)
        if seed is None:
            out[trait] = _clamp(float(value))
            continue
        delta = float(value) - float(seed)
        if delta > _MAX_DELTA:
            delta = _MAX_DELTA
        elif delta < -_MAX_DELTA:
            delta = -_MAX_DELTA
        out[trait] = _clamp(float(seed) + delta)

    for trait in prompts.ENUM_TRAIT_FIELDS:
        value = payload.get(trait)
        if value is not None:
            out[trait] = value

    out["latent_tags"] = list(result.latent_tags)
    out["red_flag_normalised"] = list(result.red_flag_normalised)
    out["extraction_confidence"] = dict(result.confidence)
    return out


def _fallback(profile: dict[str, Any]) -> dict[str, Any]:
    """Seed-unchanged fallback when the LLM fails twice."""
    out = dict(profile)
    out.setdefault("latent_tags", [])
    out.setdefault("red_flag_normalised", [])
    out["extraction_confidence"] = {group: "low" for group in prompts.CONFIDENCE_GROUPS}
    return out


# ─── Public API ──────────────────────────────────────────────────────

async def extract_traits(
    deterministic_profile: dict[str, Any],
    *,
    pii: PIIContext | None = None,
    client: AsyncAnthropic | None = None,
) -> dict[str, Any]:
    """Augment a deterministic profile with Claude-extracted traits.

    Pipeline:
      1. Build the TRAIT_EXTRACTION_USER prompt with PII-scrubbed text.
      2. Call Claude Sonnet 4.6 at temperature=0.0.
      3. Parse + validate JSON. On failure, retry once.
      4. On second failure, return the seed unchanged with `low` confidence.
    """
    user_prompt = _build_user_prompt(deterministic_profile, pii)
    last_error: Exception | None = None

    for attempt in (1, 2):
        try:
            response_text = await call_with_cache(
                system=prompts.TRAIT_EXTRACTION_SYSTEM,
                user=user_prompt,
                model=CLAUDE_SONNET,
                temperature=0.0,
                max_tokens=_MAX_TOKENS,
                client=client,
            )
            result = _parse_response(response_text)
            return _merge(deterministic_profile, result)
        except (json.JSONDecodeError, ValidationError, ValueError) as exc:
            last_error = exc
            logger.warning(
                "trait_extraction_invalid_response",
                attempt=attempt,
                error=str(exc),
            )
        except Exception as exc:  # network/SDK — same retry budget
            last_error = exc
            logger.warning(
                "trait_extraction_call_failed",
                attempt=attempt,
                error=str(exc),
            )

    logger.error("trait_extraction_fallback", error=str(last_error))
    return _fallback(deterministic_profile)

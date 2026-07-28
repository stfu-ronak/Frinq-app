"""Server-side validation + versioned storage for admin-authored quiz
"content steps" (everything from social_type onward — onboarding steps
stay compiled into the mobile app and are never touched here).

Never trust the admin client alone: each step kind has required fields
checked here before a new version can be written, mirroring
app/core/ai/model_config.py's validation philosophy for the same reason —
a malformed step would either crash the mobile renderer or silently do
nothing useful.
"""

from __future__ import annotations

import json
from typing import Any

import asyncpg

RESERVED_ANSWER_KEYS: frozenset[str] = frozenset({
    "name", "city", "dob", "gender", "pronoun", "social_linkedin", "social_instagram",
})

_KNOWN_KINDS = {
    "text", "singleChoiceCard", "singleChoiceList", "multiChoiceTags",
    "slider", "rapidFire", "intro", "voiceOrText", "opinions", "preferences",
}


class InvalidQuizConfigError(ValueError):
    pass


def _require(step: dict[str, Any], *fields: str, kind: str) -> None:
    for f in fields:
        if not step.get(f):
            raise InvalidQuizConfigError(f"{kind} step {step.get('id')!r} missing required field {f!r}")


def _validate_options_list(step: dict[str, Any], *, min_count: int = 2) -> list[Any]:
    options = step.get("options")
    if not isinstance(options, list) or len(options) < min_count:
        raise InvalidQuizConfigError(
            f"step {step.get('id')!r} needs at least {min_count} options"
        )
    return options


def _validate_one_step(step: dict[str, Any]) -> None:
    kind = step.get("kind")
    if kind not in _KNOWN_KINDS:
        raise InvalidQuizConfigError(f"unknown step kind: {kind!r}")

    if kind == "intro":
        _require(step, "heading", "ctaLabel", kind=kind)
        return

    _require(step, "answerKey", kind=kind)
    answer_key = step["answerKey"]
    if answer_key in RESERVED_ANSWER_KEYS:
        raise InvalidQuizConfigError(f"answerKey {answer_key!r} is reserved for onboarding")

    if kind == "rapidFire":
        pairs = step.get("pairs")
        if not isinstance(pairs, list) or len(pairs) < 1:
            raise InvalidQuizConfigError("rapidFire step needs at least one pair")
        for p in pairs:
            if not isinstance(p, dict) or not p.get("a") or not p.get("b"):
                raise InvalidQuizConfigError("rapidFire pair needs both 'a' and 'b'")
        if not step.get("secondsPerPair"):
            raise InvalidQuizConfigError("rapidFire step needs secondsPerPair")
        return

    if kind == "voiceOrText":
        _require(step, "heading", kind=kind)
        return

    if kind == "opinions":
        pairs = step.get("pairs")
        if not isinstance(pairs, list) or not pairs:
            raise InvalidQuizConfigError("opinions step needs at least one pair")
        for pair in pairs:
            if not isinstance(pair, dict) or not all(pair.get(field) for field in ("prompt", "a", "b")):
                raise InvalidQuizConfigError("opinions pair needs 'prompt', 'a', and 'b'")
        return

    if kind == "preferences":
        sliders = step.get("sliders")
        if not isinstance(sliders, list) or not sliders:
            raise InvalidQuizConfigError("preferences step needs at least one slider")
        required = ("prompt", "leftLabel", "leftHint", "rightLabel", "rightHint")
        for slider in sliders:
            if not isinstance(slider, dict) or not all(slider.get(field) for field in required):
                raise InvalidQuizConfigError("preferences slider is missing a label, hint, or prompt")
        return

    _require(step, "prompt", kind=kind)

    if kind == "text":
        return  # optional allowVoice: bool — no further requirement

    if kind == "slider":
        _require(step, "leftLabel", "leftHint", "rightLabel", "rightHint", kind=kind)
        return

    if kind == "singleChoiceCard":
        _validate_options_list(step)
        return

    if kind == "singleChoiceList":
        options = _validate_options_list(step)
        variant = step.get("variant", "pill")
        if variant not in ("pill", "box"):
            raise InvalidQuizConfigError(f"unknown singleChoiceList variant: {variant!r}")
        if variant == "box":
            if len(options) != 2:
                raise InvalidQuizConfigError("singleChoiceList 'box' variant requires exactly 2 options")
            if step.get("chrome") != "simple":
                raise InvalidQuizConfigError("singleChoiceList 'box' variant requires chrome='simple'")
        return

    if kind == "multiChoiceTags":
        options = step.get("options")
        if not isinstance(options, list) or len(options) < 2 or not all(isinstance(o, str) for o in options):
            raise InvalidQuizConfigError("multiChoiceTags needs at least 2 string options")
        layout = step.get("layout", "chips")
        if layout not in ("chips", "list"):
            raise InvalidQuizConfigError(f"unknown multiChoiceTags layout: {layout!r}")
        return


def validate_steps(steps: list[dict[str, Any]]) -> None:
    """Raises InvalidQuizConfigError on the first problem found. Also checks
    cross-step invariants (answerKey uniqueness) after per-step checks pass."""
    if not isinstance(steps, list) or not steps:
        raise InvalidQuizConfigError("steps must be a non-empty list")

    seen_ids: set[str] = set()
    seen_keys: set[str] = set()
    for step in steps:
        if not isinstance(step, dict) or not isinstance(step.get("id"), str) or not step["id"]:
            raise InvalidQuizConfigError("every step needs an 'id'")
        if not isinstance(step.get("section"), str) or not step["section"].strip():
            raise InvalidQuizConfigError("every step needs a non-empty 'section'")
        step_id = step["id"]
        if step_id in seen_ids:
            raise InvalidQuizConfigError(f"duplicate step id: {step_id!r}")
        seen_ids.add(step_id)
        answer_key = step.get("answerKey")
        if answer_key is not None and (not isinstance(answer_key, str) or not answer_key):
            raise InvalidQuizConfigError("every answerKey must be a non-empty string")
        _validate_one_step(step)
        if answer_key is not None:
            if answer_key in seen_keys:
                raise InvalidQuizConfigError(f"duplicate answerKey: {answer_key!r}")
            seen_keys.add(answer_key)


async def get_active_quiz_config(conn: asyncpg.Connection) -> dict[str, Any]:
    row = await conn.fetchrow(
        "SELECT version, steps FROM quiz_config WHERE is_active = TRUE"
    )
    if row is None:
        raise InvalidQuizConfigError("no active quiz_config row")
    steps = row["steps"]
    if isinstance(steps, str):
        steps = json.loads(steps)
    return {"version": row["version"], "steps": steps}


async def set_quiz_config(conn: asyncpg.Connection, steps: list[dict[str, Any]], created_by: str) -> dict[str, Any]:
    validate_steps(steps)
    async with conn.transaction():
        current = await conn.fetchval("SELECT MAX(version) FROM quiz_config")
        next_version = (current or 0) + 1
        await conn.execute("UPDATE quiz_config SET is_active = FALSE WHERE is_active = TRUE")
        row = await conn.fetchrow(
            """INSERT INTO quiz_config (version, steps, is_active, created_by)
               VALUES ($1, $2::jsonb, TRUE, $3)
               RETURNING version, steps""",
            next_version, json.dumps(steps), created_by,
        )
    returned_steps = row["steps"]
    if isinstance(returned_steps, str):
        returned_steps = json.loads(returned_steps)
    return {"version": row["version"], "steps": returned_steps}

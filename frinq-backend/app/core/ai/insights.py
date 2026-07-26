"""Generate dot-connecting personality insights from raw quiz answers.

Calls the INSIGHTS_* prompts against whichever provider settings.INSIGHTS_PROVIDER
selects — OpenAI by default, Claude Sonnet 4.6 if flipped back on. Returns a
structured dict with archetype, archetype_desc, headline, insights list, tags,
share_quote. Also mirrors archetype → spirit_animal for back-compat with older
callers. Retries once on malformed output, raises InsightsError on second failure.
"""

from __future__ import annotations

import json
from typing import Any, Final

from anthropic import AsyncAnthropic

from app.config import settings
from app.core.ai import prompts
from app.core.ai.answer_maps import (
    CONNECTION_MAP,
    OPINION_QUESTIONS,
    RAPID_LABELS,
    SATURDAY_MAP,
    SOCIAL_MAP,
    TRIP_MAP,
    slider_label as _slider_label,
)
from app.core.ai.archetypes import ARCHETYPES as _CANONICAL_ARCHETYPES
from app.core.ai.claude_client import CLAUDE_SONNET, call_with_cache
from app.core.ai.openai_client import call_openai_json
from app.core.ai.pii import PIIContext, scrub_list, scrub_text
from app.utils.logger import logger

# Generous ceiling so GPT-5 reasoning models have room for hidden reasoning
# tokens AND the visible JSON. At 2400, reasoning consumed the whole budget
# and the answer returned empty (parse failure). The prompt's own schema keeps
# the real output modest, so the headroom is only used when actually reasoning.
_MAX_TOKENS: Final[int] = 8000
_TEMPERATURE: Final[float] = 0.9

MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]


class InsightsError(RuntimeError):
    pass


def _parse_dob(dob: str | None) -> tuple[str, int]:
    """Parse 'DD/MM/YYYY' into (month_name, month_num)."""
    if not dob:
        return "unknown", 0
    try:
        parts = dob.strip().split("/")
        if len(parts) >= 2:
            month_num = int(parts[1])
            if 1 <= month_num <= 12:
                return MONTHS[month_num - 1], month_num
    except (ValueError, IndexError):
        pass
    return "unknown", 0


def _build_insights_prompt(answers: dict[str, Any]) -> str:
    dob = answers.get("dob") or answers.get("Q03_DOB") or ""
    birth_month, birth_month_num = _parse_dob(dob)

    # PII context — name and phone are known directly, city stays visible because
    # the prompt explicitly asks for a city-anchored insight.
    pii = PIIContext(
        name=str(answers.get("name") or "").strip() or None,
        phone=str(answers.get("phone") or "").strip() or None,
        city=None,  # intentionally not scrubbed; the prompt uses it.
    )

    rapid_raw: list[str] = answers.get("rapid", []) or []
    rapid_lines = []
    for i, (a_label, b_label) in enumerate(RAPID_LABELS):
        if i < len(rapid_raw):
            rapid_lines.append(f"  → {rapid_raw[i]}")
        else:
            rapid_lines.append("  → (skipped)")

    opinion_raw: list[str] = answers.get("opinions", []) or []
    opinion_lines = []
    for i, (a_label, b_label) in enumerate(OPINION_QUESTIONS):
        if i < len(opinion_raw):
            opinion_lines.append(f"  '{a_label}' vs '{b_label}' → chose: {opinion_raw[i]}")
        else:
            opinion_lines.append(f"  '{a_label}' vs '{b_label}' → (skipped)")

    signals_raw: list[str] = answers.get("connection", []) if isinstance(answers.get("connection"), list) else (
        [answers.get("connection")] if answers.get("connection") else []
    )
    signals = [CONNECTION_MAP.get(s, s) for s in signals_raw if s]

    # Sliders rewritten to 4 questions. Old 3-element arrays from existing
    # rows still work — we pad with 50s and the 4th label just reads "no
    # preference" until the user retakes.
    prefs = answers.get("preferences", [50, 50, 50, 50])
    if not isinstance(prefs, list):
        prefs = [50, 50, 50, 50]
    while len(prefs) < 4:
        prefs.append(50)

    interests_raw = answers.get("interests", []) or []
    if isinstance(interests_raw, list):
        interests_scrubbed = scrub_list([str(i) for i in interests_raw if i], pii)
        interests_str = "\n".join(f"  - {i}" for i in interests_scrubbed) or "  - (not shared)"
    else:
        interests_str = (
            f"  - {scrub_text(str(interests_raw), pii)}" if interests_raw else "  - (not shared)"
        )

    red_flags_raw = answers.get("red_flags", []) or []
    if isinstance(red_flags_raw, list):
        red_flags_scrubbed = scrub_list([str(r) for r in red_flags_raw if r], pii)
        red_flags_str = "\n".join(f"  - {r}" for r in red_flags_scrubbed) or "  - (not shared)"
    else:
        red_flags_str = (
            f"  - {scrub_text(str(red_flags_raw), pii)}" if red_flags_raw else "  - (not shared)"
        )

    story = (
        answers.get("story") or
        answers.get("voice_story") or
        answers.get("storytime") or
        ""
    )
    if story == "[voice response]":
        story = "(recorded a voice note — chose not to type it out)"
    story = scrub_text(story, pii)

    # Substance/scene field — supports both old string and new multi-select array
    scene_raw = answers.get("scene") or answers.get("substance_scene") or ""
    if isinstance(scene_raw, list):
        substance = ", ".join(str(s) for s in scene_raw if s) or "not specified"
    else:
        substance = str(scene_raw) if scene_raw else "not specified"

    # opinions_why — 3 free-text answers explaining their opinion choices
    opinions_why_raw = answers.get("opinions_why", []) or []
    OPINION_WHY_LABELS = ["on ai:", "on truth:", "on respect:"]
    opinions_why_lines = []
    for i, label in enumerate(OPINION_WHY_LABELS):
        if i < len(opinions_why_raw):
            why = scrub_text(str(opinions_why_raw[i]).strip(), pii) if opinions_why_raw[i] else ""
            if why:
                opinions_why_lines.append(f"  {label} \"{why}\"")
    opinions_why_str = "\n".join(opinions_why_lines) or "  (not answered)"

    return prompts.INSIGHTS_USER.format(
        birth_month=birth_month,
        birth_month_num=birth_month_num,
        city=answers.get("city", "unknown"),
        social_type=SOCIAL_MAP.get(answers.get("social_type", ""), answers.get("social_type", "not specified")),
        saturday=SATURDAY_MAP.get(answers.get("saturday", ""), answers.get("saturday", "not specified")),
        substance=substance,
        connection_signals="\n".join(f"  - {s}" for s in signals) if signals else "  - (not selected)",
        trip_reaction=TRIP_MAP.get(answers.get("trip", ""), answers.get("trip", "not specified")),
        rapid_1=rapid_lines[0] if len(rapid_lines) > 0 else "→ skipped",
        rapid_2=rapid_lines[1] if len(rapid_lines) > 1 else "→ skipped",
        rapid_3=rapid_lines[2] if len(rapid_lines) > 2 else "→ skipped",
        rapid_4=rapid_lines[3] if len(rapid_lines) > 3 else "→ skipped",
        rapid_5=rapid_lines[4] if len(rapid_lines) > 4 else "→ skipped",
        rapid_6=rapid_lines[5] if len(rapid_lines) > 5 else "→ skipped",
        rapid_7=rapid_lines[6] if len(rapid_lines) > 6 else "→ skipped",
        rapid_8=rapid_lines[7] if len(rapid_lines) > 7 else "→ skipped",
        rapid_9=rapid_lines[8] if len(rapid_lines) > 8 else "→ skipped",
        # Four sliders, all introspective dimensions (MBTI-ish + values):
        #   slider_1: trust  → what you can see (concrete) ↔ what you sense (intuitive)
        #   slider_2: decide → heart (feeling) ↔ head (thinking)
        #   slider_3: grow   → going deeper (mastery) ↔ going wider (exposure)
        #   slider_4: kind/honest tradeoff
        slider_1=prefs[0],
        slider_1_label=_slider_label(prefs[0], "trusts what they can see", "trusts what they sense"),
        slider_2=prefs[1],
        slider_2_label=_slider_label(prefs[1], "decides with the heart", "decides with the head"),
        slider_3=prefs[2],
        slider_3_label=_slider_label(prefs[2], "grows by going deeper", "grows by going wider"),
        slider_4=prefs[3],
        slider_4_label=_slider_label(prefs[3], "would rather be kind", "would rather be honest"),
        opinions="\n".join(opinion_lines),
        opinions_why=opinions_why_str,
        hobbies=scrub_text(answers.get("hobbies", "") or "", pii) or "not shared",
        interests=interests_str,
        red_flags=red_flags_str,
        show_up=scrub_text(answers.get("show_up", "") or "", pii) or "not shared",
        looking_for=scrub_text(answers.get("looking_for", "") or "", pii) or "not shared",
        story=story or "not shared",
        # Event-organizing answers (#13 batch). Used for the matching/
        # event-suggestion side of the system; also fed to Claude so the
        # archetype description can reflect "this person says yes to live
        # gigs and no to house parties" etc.
        travel_style=str(answers.get("travel_style") or "not specified"),
        connection_mode=str(answers.get("connection_mode") or "not specified"),
        event_yes=_list_str(answers.get("event_yes")),
        event_no=_list_str(answers.get("event_no")),
        would_rather=str(answers.get("would_rather") or "not specified"),
        meeting_style=str(answers.get("meeting_style") or "not specified"),
    )


def _list_str(value: Any) -> str:
    """Format a multi-select answer for the prompt — array → bulleted lines."""
    if not value:
        return "(none)"
    if isinstance(value, list):
        items = [str(v) for v in value if v]
        return "\n".join(f"  - {v}" for v in items) if items else "(none)"
    return str(value)


def _strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
        if t.endswith("```"):
            t = t[:-3]
    return t.strip()


# Derived from the canonical taxonomy (archetypes.py) — NOT re-declared —
# so the names we validate here can never drift from the slugs
# assign_user_to_community expects. A name that isn't canonical would pass
# _validate (paid AI calls already spent) and then dead-end the user in
# 'error' at get_archetype(). test_archetype_taxonomy.py guards the invariant.
ARCHETYPES: Final[frozenset[str]] = frozenset(
    a["name"] for a in _CANONICAL_ARCHETYPES.values()
)


GROUP_ROLES: Final[frozenset[str]] = frozenset({
    "The Glue", "The Spark", "The Anchor", "The Compass",
    "The Bridge", "The Witness", "The Catalyst", "The Sanctuary",
})


def _slugify(name: str) -> str:
    return name.lower().replace("-", " ").replace("  ", " ").strip().replace(" ", "-")


def _validate(data: dict[str, Any]) -> None:
    """Validate required fields. Optional new fields are NOT asserted —
    if Claude omits them we fall back to sensible defaults in the share_card
    assembler so older deployments / partial outputs still render."""
    assert isinstance(data.get("archetype"), str) and data["archetype"] in ARCHETYPES, \
        f"archetype must be one of curated list, got: {data.get('archetype')!r}"
    assert isinstance(data.get("archetype_desc"), str) and data["archetype_desc"]
    assert isinstance(data.get("headline"), str) and data["headline"]
    assert isinstance(data.get("insights"), list) and len(data["insights"]) >= 3
    assert isinstance(data.get("tags"), list) and len(data["tags"]) >= 3
    assert isinstance(data.get("share_quote"), str) and data["share_quote"]


def _build_stats(raw: dict[str, Any] | None, archetype: str) -> dict[str, Any]:
    """Return a clean stats dict, filling missing/invalid fields with defaults."""
    r = raw or {}
    energy = r.get("social_energy")
    if not isinstance(energy, int) or not (0 <= energy <= 100):
        energy = 60
    effect = r.get("group_effect")
    if not isinstance(effect, int) or not (50 <= effect <= 100):
        effect = 85
    role = r.get("group_role") if r.get("group_role") in GROUP_ROLES else "The Glue"
    return {
        "social_energy": energy,
        "peak_time": str(r.get("peak_time") or "9:00 pm"),
        "group_role": role,
        "group_effect": effect,
        "secret_edge": str(r.get("secret_edge") or "Presence"),
        "rarity": str(r.get("rarity") or "Top 10%"),
    }


async def generate_insights(
    answers: dict[str, Any],
    *,
    client: AsyncAnthropic | None = None,
) -> dict[str, Any]:
    """Return the full insights dict. Raises InsightsError on failure."""
    user_prompt = _build_insights_prompt(answers)
    last_error: Exception | None = None

    for attempt in (1, 2):
        try:
            if settings.INSIGHTS_PROVIDER == "claude":
                raw = await call_with_cache(
                    system=prompts.INSIGHTS_SYSTEM,
                    user=user_prompt,
                    model=CLAUDE_SONNET,
                    temperature=_TEMPERATURE,
                    max_tokens=_MAX_TOKENS,
                    client=client,
                )
            else:
                raw = await call_openai_json(
                    system=prompts.INSIGHTS_SYSTEM,
                    user=user_prompt,
                    temperature=_TEMPERATURE,
                    max_tokens=_MAX_TOKENS,
                )
            data = json.loads(_strip_fences(raw))
            _validate(data)
            # Mirror archetype onto legacy spirit_animal/spirit_desc DB columns
            # so older API consumers keep working.
            data["spirit_animal"] = data["archetype"]
            data["spirit_desc"] = data["archetype_desc"]
            # Assemble the rich share_card JSONB — single source of truth for the
            # new stat-table summary card and the in-app "know more" reveal.
            archetype_slug = data.get("archetype_slug") or _slugify(data["archetype"])
            description = data.get("description") or data["archetype_desc"]
            compat = data.get("compatibility") or {}
            audit = data.get("friend_audit") or {}
            data["share_card"] = {
                "archetype": data["archetype"],
                "archetype_slug": archetype_slug,
                "nickname": data.get("nickname") or "",
                "description": description,
                "archetype_desc": data["archetype_desc"],
                "headline": data["headline"],
                "pull_quote": data.get("pull_quote") or data["headline"],
                "share_quote": data["share_quote"],
                "tags": data.get("tags", []),
                "stats": _build_stats(data.get("stats"), data["archetype"]),
                "love_language": data.get("love_language") or "",
                "ideal_hangout": data.get("ideal_hangout") or "",
                "compatibility": {
                    "clicks_with": list(compat.get("clicks_with") or [])[:3],
                    "clashes_with": list(compat.get("clashes_with") or [])[:3],
                },
                "friend_audit": {
                    "seek": audit.get("seek") or "",
                    "avoid": audit.get("avoid") or "",
                },
                "growth_edge": data.get("growth_edge") or "",
            }
            return data
        except Exception as exc:
            last_error = exc
            logger.warning("insights.attempt_failed", attempt=attempt, error=str(exc))

    raise InsightsError(f"insights generation failed: {last_error}")

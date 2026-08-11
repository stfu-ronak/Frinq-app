"""Single-call generation for user summary plus vibe card.

Legacy — superseded for production quiz-completion traffic by
app.core.ai.page2_summary (2026-07-31). Retained for admin's /ai-test
step="summary" smoke check and back-compat tests
(tests/test_ai/test_full_summary.py); not called from
app/workers/tasks/quiz_insights.py anymore."""

from __future__ import annotations

import json
from typing import Any, Callable, Final

from app.config import settings
from app.core.ai import gemini_client, prompts
from app.core.ai import failover
from app.core.ai.claude_client import CLAUDE_SONNET, call_with_cache
from app.core.ai.model_pricing import GEMINI_DEFAULT
from app.core.ai.answer_maps import annotate_answers
from app.core.ai.insights import (
    ARCHETYPES,
    INSIGHTS_JSON_SCHEMA,
    _build_insights_prompt,
    _build_stats,
    _slugify,
    _validate,
)
from app.core.ai.openai_client import (
    DEEP_REPORT_EXAMPLE_ASSISTANT,
    DEEP_REPORT_EXAMPLE_USER,
    DEEP_REPORT_JSON_SCHEMA,
    _extract_json,
    _normalize_deep_report,
    call_openai_json,
)
from app.core.ai.pii import PIIContext, scrub_text

_FULL_HERO_SCHEMA: Final[dict[str, Any]] = {
    **INSIGHTS_JSON_SCHEMA,
    "properties": {
        **INSIGHTS_JSON_SCHEMA["properties"],
        "insights": {"type": "array", "minItems": 5, "maxItems": 5, "items": {"type": "object"}},
        "tags": {"type": "array", "minItems": 3, "maxItems": 6, "items": {"type": "string"}},
    },
}

FULL_SUMMARY_SCHEMA: Final[dict[str, Any]] = {
    "type": "object",
    "properties": {
        "hero": _FULL_HERO_SCHEMA,
        "report": DEEP_REPORT_JSON_SCHEMA,
    },
    "required": ["hero", "report"],
}

FULL_SUMMARY_SYSTEM: Final[str] = f"""You generate one complete Frinq result in one response.

Use hero instructions:
{prompts.INSIGHTS_SYSTEM}

Use report instructions:
{prompts.DEEP_REPORT_SYSTEM}

Return exactly one JSON object with two keys: hero and report. Put every hero
field under hero and every report field under report. Hero.insights must have
exactly five distinct objects and hero.tags at least three strings. Do not
return markdown.
"""


def _report_input(answers: dict[str, Any]) -> dict[str, Any]:
    pii = PIIContext(
        name=str(answers.get("name") or "").strip() or None,
        phone=str(answers.get("phone") or "").strip() or None,
        city=None,
    )
    annotated = annotate_answers(answers)
    return {
        k: (scrub_text(v, pii) if isinstance(v, str) else v)
        for k, v in annotated.items()
        if k not in {"name", "phone"}
    }


def _assemble_hero(hero: dict[str, Any]) -> dict[str, Any]:
    _validate(hero)
    hero = dict(hero)
    hero["spirit_animal"] = hero["archetype"]
    hero["spirit_desc"] = hero["archetype_desc"]
    archetype_slug = hero.get("archetype_slug") or _slugify(hero["archetype"])
    compat = hero.get("compatibility") or {}
    audit = hero.get("friend_audit") or {}
    hero["share_card"] = {
        "archetype": hero["archetype"],
        "archetype_slug": archetype_slug,
        "nickname": hero.get("nickname") or "",
        "description": hero.get("description") or hero["archetype_desc"],
        "archetype_desc": hero["archetype_desc"],
        "headline": hero["headline"],
        "pull_quote": hero.get("pull_quote") or hero["headline"],
        "share_quote": hero["share_quote"],
        "tags": list(hero.get("tags") or []),
        "stats": _build_stats(hero.get("stats"), hero["archetype"]),
        "love_language": hero.get("love_language") or "",
        "ideal_hangout": hero.get("ideal_hangout") or "",
        "compatibility": {
            "clicks_with": list(compat.get("clicks_with") or [])[:3],
            "clashes_with": list(compat.get("clashes_with") or [])[:3],
        },
        "friend_audit": {
            "seek": audit.get("seek") or "",
            "avoid": audit.get("avoid") or "",
        },
        "growth_edge": hero.get("growth_edge") or "",
    }
    return hero


async def generate_full_summary(
    answers: dict[str, Any],
    *,
    model_config: dict[str, Any] | None = None,
    usage_recorder: Callable[[int, int], Any] | None = None,
) -> dict[str, Any]:
    provider = (model_config or {}).get("provider", settings.INSIGHTS_PROVIDER)
    model_id = (model_config or {}).get("model_id") or (
        CLAUDE_SONNET if provider == "claude" else
        GEMINI_DEFAULT if provider == "gemini" else settings.OPENAI_MODEL
    )
    effort = (model_config or {}).get("effort")
    user = json.dumps({
        "hero_prompt": _build_insights_prompt(answers),
        "report_questionnaire": _report_input(answers),
    })

    if provider == "claude":
        example_prefix = (
            f"Example report input:\n{DEEP_REPORT_EXAMPLE_USER}\n\n"
            f"Example report output:\n{DEEP_REPORT_EXAMPLE_ASSISTANT}\n\n"
            "Now generate for the real input:\n"
        )
        raw = await call_with_cache(
            system=FULL_SUMMARY_SYSTEM,
            user=example_prefix + user,
            model=model_id,
            max_tokens=12000,
            effort=effort,
            usage_recorder=usage_recorder,
        )
    elif provider == "gemini":
        raw = await gemini_client.call_gemini_json(
            system=FULL_SUMMARY_SYSTEM,
            user=user,
            model=model_id,
            schema=FULL_SUMMARY_SCHEMA,
            effort=effort,
            usage_recorder=usage_recorder,
        )
    elif provider == "azure":
        # Same body as the OpenAI branch; azure_client only swaps host+auth.
        from app.core.ai import azure_client

        raw = await azure_client.call_azure_json(
            system=FULL_SUMMARY_SYSTEM,
            user=user,
            model=model_id,
            max_tokens=12000,
            examples=[(DEEP_REPORT_EXAMPLE_USER, DEEP_REPORT_EXAMPLE_ASSISTANT)],
            effort=effort,
            usage_recorder=usage_recorder,
        )
    else:
        raw = await call_openai_json(
            system=FULL_SUMMARY_SYSTEM,
            user=user,
            model=model_id,
            max_tokens=12000,
            examples=[(DEEP_REPORT_EXAMPLE_USER, DEEP_REPORT_EXAMPLE_ASSISTANT)],
            effort=effort,
            usage_recorder=usage_recorder,
        )

    parsed = _extract_json(raw)
    hero = parsed.get("hero") if isinstance(parsed.get("hero"), dict) else parsed
    report = parsed.get("report") or parsed.get("deep_summary") or {}
    hero_result = _assemble_hero(hero)
    return {
        **hero_result,
        "deep_summary": _normalize_deep_report(report),
    }


async def generate_full_summary_with_fallback(
    answers: dict[str, Any],
    *,
    primary_config: dict[str, Any],
    fallback_config: dict[str, Any],
    primary_usage_recorder: Callable[[int, int], Any] | None = None,
    fallback_usage_recorder: Callable[[int, int], Any] | None = None,
) -> dict[str, Any]:
    route_key = f"{primary_config.get('provider')}:{primary_config.get('model_id')}"
    if await failover.is_primary_suppressed(route_key):
        result = await generate_full_summary(
            answers,
            model_config=fallback_config,
            usage_recorder=fallback_usage_recorder,
        )
        result["_ai_route"] = "fallback-cooldown"
        return result

    try:
        result = await generate_full_summary(
            answers,
            model_config=primary_config,
            usage_recorder=primary_usage_recorder,
        )
        await failover.mark_primary_success(route_key)
        result["_ai_route"] = "primary"
        return result
    except Exception as primary_error:
        await failover.mark_primary_failure(route_key)
        try:
            result = await generate_full_summary(
                answers,
                model_config=fallback_config,
                usage_recorder=fallback_usage_recorder,
            )
            result["_ai_route"] = "fallback"
            return result
        except Exception:
            raise primary_error

"""Two-pass Luna Page 2 generation with deterministic privacy and QA gates.

Replaces app.core.ai.full_summary as the production quiz-completion
generator (see app/workers/tasks/quiz_insights.py). full_summary/insights
stay in the tree as the legacy path behind admin's /ai-test smoke endpoint —
see their module docstrings.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
from typing import Any, Callable, Final

from app.config import settings
from app.core.ai import failover
from app.core.ai.answer_maps import annotate_answers
from app.core.ai.openai_client import call_openai_structured
from app.core.ai.pii import PIIContext, scrub_text
from app.core.ai.page2_prompts import (
    FRIEND_ROLES, FRIEND_ROLE_NAMES, FRIEND_ROLE_SLUGS, PAGE2_MODEL,
    PAGE2_PROMPT_VERSION, PAGE2_REASONING_EFFORT, REPORT_FIELDS, SOURCE_FIELDS,
    STAGE1_SCHEMA, STAGE1_SYSTEM, STAGE1_USER, STAGE2_REPAIR_USER,
    STAGE2_SCHEMA, STAGE2_SYSTEM, STAGE2_USER,
)
from app.core.ai.model_pricing import GEMINI_DEFAULT
from app.core.ai.claude_client import CLAUDE_SONNET
from app.utils.logger import logger

_IDENTITY = {"name", "phone", "instagram", "linkedin_url", "dob", "city", "social_verified"}
_BANNED = re.compile(r"\b(most people|based on (your|the) answers?|you (said|chose|picked)|your answers? (show|suggest|indicate)|in ways you may not realize|rare|gifted|empath|old soul|magnetic|unusually deep|you tend to be both|you are both)\b", re.I)
_JARGON = re.compile(r"\b(social intensity|relational evidence|cross-family|modality|interpersonal|substance-based|practical presence|decompress|polished fiction|social battery|ideal pace|doorway|performing|sustained|capacity|navigate)\b", re.I)
_HARD_WORDS = re.compile(r"\b(nuanced|concrete|tendency|reciprocal|prolonged|categorical|corroboration|eligibility|adjudicate)\b", re.I)
_LETTER_STRETCH = re.compile(r"\b[a-z]*([a-z])\1{3,}[a-z]*\b", re.I)
_FIELDS = ("typeDefinition", "quickRows.bring", "quickRows.notice", "quickRows.connect", "quickRows.care", "detailedOpening", "portrait.0", "portrait.1", "portrait.2", "portrait.3", "portrait.4", "portrait.5", "shareCaption")
_QUICK_ROW_WORDS = {"bring": (30, 48), "notice": (30, 48), "connect": (30, 48), "care": (30, 48)}
# The frontend writes this literal sentinel (story/opinions_why pages) when
# someone answers by voice and never types a transcript -- there is no
# speech-to-text step anywhere in this pipeline yet (the `transcripts` param
# below is real plumbing, but no live call site ever passes it). Without
# this filter the sentinel string itself gets sent to the model as if it
# were the person's actual answer.
_VOICE_PLACEHOLDER = "[voice response]"
# Base output-token ceilings, raised from the original 5200/7200: "medium"
# reasoning effort can spend a large, variable share of the budget on
# reasoning tokens before any visible text comes out, and the tighter
# ceilings were routinely truncating stage2 mid-JSON in production
# (Responses API status="incomplete", reason="max_output_tokens").
_STAGE1_BASE_TOKENS: Final[int] = 6500
_STAGE2_BASE_TOKENS: Final[int] = 9000
# Stage1 runs at "low" reasoning effort (mechanical evidence-tagging, not
# creative writing); stage2 keeps the configured effort (default "medium")
# since it writes the actual user-facing voice.
_STAGE1_MAX_ROUNDS: Final[int] = 3
_STAGE1_REASONING_EFFORT: Final[str] = "low"
_STAGE2_MAX_REPAIRS: Final[int] = 3
# A submission stuck in retries across three providers' worth of latency
# has no other ceiling on total wall-clock time -- give up after this long
# so a hung generation doesn't tie up a shared provider semaphore slot (and
# therefore every other concurrent submission) indefinitely; the existing
# primary/fallback + circuit breaker in generate_page2_summary_with_fallback
# treats a timeout the same as any other failure.
_OVERALL_DEADLINE: Final[float] = 150.0


def _clean(value: Any, pii: PIIContext) -> Any:
    if isinstance(value, str):
        return scrub_text(value, pii)
    if isinstance(value, list):
        return [_clean(item, pii) for item in value]
    if isinstance(value, dict):
        return {str(k): _clean(v, pii) for k, v in value.items() if str(k) not in _IDENTITY}
    return value


def build_page2_input(answers: dict[str, Any], transcripts: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build a PII-minimised, labelled questionnaire for the evidence pass."""
    pii = PIIContext(name=str(answers.get("name") or "") or None, phone=str(answers.get("phone") or "") or None)
    enriched = annotate_answers(_clean(answers, pii))
    transcript_values = transcripts or {}
    rows = []
    for field, value in enriched.items():
        if field not in SOURCE_FIELDS:
            continue
        if field in _IDENTITY or value in (None, "", [], _VOICE_PLACEHOLDER):
            continue
        modality = "voice_transcript" if field in transcript_values and transcript_values[field] else "text"
        if modality == "voice_transcript":
            value = transcript_values[field]
        rows.append({"source_field": field, "source_modality": modality, "value": _clean(value, pii)})
    return {"prompt_version": PAGE2_PROMPT_VERSION, "privacy": "identity fields removed; missing values are unknown", "questionnaire": rows}


def rotated_taxonomy(submission_id: str | None) -> list[dict[str, str]]:
    seed = int(hashlib.sha256((submission_id or "preview").encode()).hexdigest()[:8], 16)
    offset = seed % len(FRIEND_ROLES)
    return list(FRIEND_ROLES[offset:]) + list(FRIEND_ROLES[:offset])


def _public_fields(report: dict[str, Any]) -> dict[str, str]:
    out = {"typeDefinition": report.get("typeDefinition", ""), "detailedOpening": report.get("detailedOpening", ""), "shareCaption": report.get("shareCaption", "")}
    for key, value in report.get("quickRows", {}).items(): out[f"quickRows.{key}"] = value
    for i, value in enumerate(report.get("portrait", [])): out[f"portrait.{i}"] = value
    return out


def validate_stage1(data: dict[str, Any], source: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    evidence = data.get("evidence", [])
    ids = [item.get("id") for item in evidence]
    if not 8 <= len(evidence) <= 10 or len(set(ids)) != len(ids): errors.append("evidence must contain 8-10 unique ids")
    available = {str(row["source_field"]).strip().lower() for row in source.get("questionnaire", [])}
    for item in evidence:
        field = str(item.get("source_field") or "").strip().lower()
        if field not in available: errors.append(f"unknown source field: {item.get('source_field')}")
    for pattern in data.get("patterns", []):
        refs = pattern.get("evidence_ids", [])
        items = [e for e in evidence if e.get("id") in refs]
        if not pattern.get("tentative") and (len({e.get("source_field") for e in items}) < 2 or not any(e.get("source_kind") in ("self_authored", "relational") for e in items)):
            # Keep the ledger usable while preventing an unsupported pattern
            # from acting as a hard claim in stage two.
            pattern["tentative"] = True
    return errors


def validate_stage2(data: dict[str, Any], evidence: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    sel, report = data.get("selection", {}), data.get("report", {})
    scores = sel.get("allTypeScores", []); slugs = [x.get("slug") for x in scores]
    if set(slugs) != set(FRIEND_ROLE_SLUGS) or len(slugs) != 18: errors.append("allTypeScores must contain each role once")
    top = sel.get("topCandidates", [])
    if len(top) != 3 or not top or sel.get("selectedSlug") != top[0].get("slug"): errors.append("selection ranking is inconsistent")
    role_name = dict(zip(FRIEND_ROLE_SLUGS, FRIEND_ROLE_NAMES)).get(sel.get("selectedSlug"))
    if report.get("typeName") != role_name: errors.append("typeName does not match selected role")
    portrait = report.get("portrait", [])
    if len(portrait) != 6 or not 270 <= sum(len(x.split()) for x in portrait) <= 350: errors.append("portrait must have six paragraphs and 270-350 words")
    if not 32 <= len(str(report.get("typeDefinition") or "").split()) <= 48: errors.append("typeDefinition must be 32-48 words")
    if not 40 <= len(str(report.get("detailedOpening") or "").split()) <= 62: errors.append("detailedOpening must be 40-62 words")
    for key, (minimum, maximum) in _QUICK_ROW_WORDS.items():
        value = str((report.get("quickRows") or {}).get(key) or "")
        if not minimum <= len(value.split()) <= maximum: errors.append(f"quickRows.{key} must be {minimum}-{maximum} words")
    all_text = " ".join(_public_fields(report).values())
    if _BANNED.search(all_text): errors.append("cold-reading or answer-recap phrase detected")
    if _JARGON.search(all_text): errors.append("abstract or technical wording detected")
    if _HARD_WORDS.search(all_text): errors.append("hard vocabulary detected")
    if len(_LETTER_STRETCH.findall(all_text)) > 2: errors.append("too many conversational letter stretches")
    for field, text in _public_fields(report).items():
        if not isinstance(text, str) or not text.strip() or text != text.lower(): errors.append(f"{field} must be non-empty lowercase copy")
        if text and text[-1] not in ".!?\"'”:)’": errors.append(f"{field} must end as a sentence")
    emap = data.get("evidenceMap", []); mapped = [x.get("reportField") for x in emap]
    if set(mapped) != set(_FIELDS) or len(mapped) != 13: errors.append("evidenceMap must cover each public field exactly once")
    valid_ids = {x.get("id") for x in evidence.get("evidence", [])}; counts: dict[str, int] = {}
    for item in emap:
        for ref in item.get("evidenceIds", []):
            if ref not in valid_ids: errors.append(f"unknown evidence id: {ref}")
            counts[ref] = counts.get(ref, 0) + 1
    if any(n > 2 for n in counts.values()): errors.append("evidence reused more than twice")
    texts = list(_public_fields(report).values())
    for i, left in enumerate(texts):
        for right in texts[i + 1:]:
            if left == right or (len(left.split()) > 7 and len(set(left.lower().split()) & set(right.lower().split())) / max(1, len(set(left.lower().split()) | set(right.lower().split()))) > .82): errors.append("public fields are too repetitive")
    qa = data.get("qa", {})
    if qa and not all(qa.values()): errors.append("model QA flags are not all true")
    return sorted(set(errors))


def validate_public_report(report: dict[str, Any]) -> list[str]:
    """Check a human/Codex-authored Page 2 import before it reaches a profile."""
    errors: list[str] = []
    if report.get("typeName") not in FRIEND_ROLE_NAMES:
        errors.append("typeName must be one of the approved friend roles")
    for key, bounds in _QUICK_ROW_WORDS.items():
        text = str((report.get("quickRows") or {}).get(key) or "")
        if not bounds[0] <= len(text.split()) <= bounds[1]:
            errors.append(f"quickRows.{key} must be {bounds[0]}-{bounds[1]} words")
    for key, minimum, maximum in (
        ("typeDefinition", 32, 48),
        ("detailedOpening", 40, 62),
        ("shareCaption", 8, 30),
    ):
        text = str(report.get(key) or "")
        if not minimum <= len(text.split()) <= maximum:
            errors.append(f"{key} must be {minimum}-{maximum} words")
    portrait = report.get("portrait", [])
    if not isinstance(portrait, list) or len(portrait) != 6:
        errors.append("portrait must contain six paragraphs")
    elif not 270 <= sum(len(str(item).split()) for item in portrait) <= 350:
        errors.append("portrait must be 270-350 words")
    all_text = " ".join(_public_fields(report).values())
    if _BANNED.search(all_text):
        errors.append("cold-reading or answer-recap phrase detected")
    if _JARGON.search(all_text) or _HARD_WORDS.search(all_text):
        errors.append("abstract or difficult wording detected")
    return sorted(set(errors))


async def _call_structured(
    *,
    provider: str,
    model_id: str,
    effort: str | None,
    system: str,
    user: str,
    schema_name: str,
    schema: dict[str, Any],
    max_output_tokens: int,
    safety_id: str,
    usage_recorder: Callable[[int, int], Any] | None,
) -> dict[str, Any]:
    """Provider-agnostic structured call, matching full_summary.py's 3-way
    dispatch — Claude/Gemini have no strict-schema equivalent of OpenAI's
    Structured Outputs, so their string responses get parsed here to
    present the same "parsed dict" contract to every caller."""
    if provider == "claude":
        from app.core.ai.claude_client import call_with_cache

        raw = await call_with_cache(
            system=system, user=user, model=model_id, max_tokens=max_output_tokens,
            effort=effort, usage_recorder=usage_recorder,
        )
        return json.loads(raw)
    if provider == "gemini":
        from app.core.ai import gemini_client

        raw = await gemini_client.call_gemini_json(
            system=system, user=user, model=model_id, schema=schema,
            effort=effort, usage_recorder=usage_recorder,
        )
        return json.loads(raw)
    # openai AND azure: identical request, different host/credential. Without
    # via_azure an admin-selected provider='azure' fell through to
    # api.openai.com with the Azure key and died as OpenAIStructuredError.
    return await call_openai_structured(
        system=system, user=user, schema_name=schema_name, schema=schema,
        model=model_id, reasoning_effort=effort, max_output_tokens=max_output_tokens,
        safety_identifier=safety_id, prompt_cache_key=PAGE2_PROMPT_VERSION,
        usage_recorder=usage_recorder, via_azure=provider == "azure",
    )


async def _run_page2_pipeline(
    answers: dict[str, Any],
    submission_id: str | None,
    transcripts: dict[str, Any] | None,
    *,
    provider: str,
    model_id: str,
    effort: str | None,
    usage_recorder: Callable[[int, int], Any] | None,
) -> dict[str, Any]:
    source = build_page2_input(answers, transcripts)
    safety_id = hashlib.sha256((submission_id or "preview").encode()).hexdigest()[:32]

    stage1 = await _call_structured(
        provider=provider, model_id=model_id, effort=effort,
        system=STAGE1_SYSTEM, user=STAGE1_USER.replace("{{ANONYMIZED_ANSWERS_JSON}}", json.dumps(source)),
        schema_name="frinq_page2_evidence_v1", schema=STAGE1_SCHEMA, max_output_tokens=5200,
        safety_id=safety_id, usage_recorder=usage_recorder,
    )
    stage1_errors = validate_stage1(stage1, source)
    if stage1_errors:
        raise ValueError("Page 2 evidence validation failed: " + "; ".join(stage1_errors))

    taxonomy = rotated_taxonomy(submission_id)
    evidence_json = json.dumps(stage1)
    taxonomy_json = json.dumps(taxonomy)
    user = STAGE2_USER.replace("{{STAGE1_JSON}}", evidence_json).replace("{{ROTATED_TAXONOMY_JSON}}", taxonomy_json)
    stage2 = await _call_structured(
        provider=provider, model_id=model_id, effort=effort,
        system=STAGE2_SYSTEM, user=user,
        schema_name="frinq_page2_result_v1", schema=STAGE2_SCHEMA, max_output_tokens=7200,
        safety_id=safety_id, usage_recorder=usage_recorder,
    )
    errors = validate_stage2(stage2, stage1)
    for _ in range(2):
        if not errors:
            break
        repair = (
            STAGE2_REPAIR_USER.replace("{{STAGE1_JSON}}", evidence_json)
            .replace("{{ROTATED_TAXONOMY_JSON}}", taxonomy_json)
            .replace("{{INVALID_STAGE2_JSON}}", json.dumps(stage2))
            .replace("{{VALIDATOR_ERRORS_JSON}}", json.dumps(errors))
        )
        stage2 = await _call_structured(
            provider=provider, model_id=model_id, effort=effort,
            system=STAGE2_SYSTEM, user=repair,
            schema_name="frinq_page2_result_v1", schema=STAGE2_SCHEMA, max_output_tokens=7200,
            safety_id=safety_id, usage_recorder=usage_recorder,
        )
        errors = validate_stage2(stage2, stage1)
    if errors:
        raise ValueError("Page 2 report validation failed: " + "; ".join(errors))
    return {"report": stage2["report"], "selection": stage2["selection"], "evidenceMap": stage2["evidenceMap"], "qa": stage2["qa"], "promptVersion": PAGE2_PROMPT_VERSION}


def _to_db_shape(stage2_result: dict[str, Any]) -> dict[str, Any]:
    """Map page2's report contract onto the quiz_submissions columns every
    other generator (full_summary/insights) also writes to. share_card
    carries the full new report — headline/spirit_animal/spirit_desc are
    legacy-aliased for old clients per QuizSummaryResponse. share_card.stats/
    compatibility are intentionally dropped (page2 doesn't produce them) —
    mobile's vibe-report screen needs a follow-up for this, tracked
    separately, not built in this pass."""
    report = stage2_result["report"]
    slug = stage2_result["selection"]["selectedSlug"]
    share_card = {
        "archetype_slug": slug,
        "archetype": report["typeName"],
        "archetype_desc": report["typeDefinition"],
        "quickRows": report["quickRows"],
        "detailedOpening": report["detailedOpening"],
        "portrait": report["portrait"],
        "shareCaption": report["shareCaption"],
        "promptVersion": stage2_result["promptVersion"],
    }
    return {
        "headline": report["typeName"],
        "spirit_animal": report["typeName"],
        "spirit_desc": report["typeDefinition"],
        "insights": [{"label": key, "text": value} for key, value in report["quickRows"].items()],
        "tags": [],
        "share_card": share_card,
        "deep_summary": None,
    }


async def generate_page2_summary(
    answers: dict[str, Any],
    *,
    model_config: dict[str, Any] | None = None,
    usage_recorder: Callable[[int, int], Any] | None = None,
    submission_id: str | None = None,
    transcripts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Two-stage (evidence ledger -> adjudication) replacement for
    generate_full_summary. Returns the shape quiz_insights.py expects:
    headline/spirit_animal/spirit_desc/insights/tags/share_card/deep_summary,
    with share_card.archetype_slug being one of the 18 new role ids."""
    provider = (model_config or {}).get("provider", settings.INSIGHTS_PROVIDER)
    model_id = (model_config or {}).get("model_id") or (
        CLAUDE_SONNET if provider == "claude" else
        GEMINI_DEFAULT if provider == "gemini" else PAGE2_MODEL
    )
    effort = (model_config or {}).get("effort") or PAGE2_REASONING_EFFORT

    stage2_result = await _run_page2_pipeline(
        answers, submission_id, transcripts,
        provider=provider, model_id=model_id, effort=effort, usage_recorder=usage_recorder,
    )
    return _to_db_shape(stage2_result)


async def generate_page2_summary_with_fallback(
    answers: dict[str, Any],
    *,
    primary_config: dict[str, Any],
    fallback_config: dict[str, Any],
    primary_usage_recorder: Callable[[int, int], Any] | None = None,
    fallback_usage_recorder: Callable[[int, int], Any] | None = None,
    submission_id: str | None = None,
    transcripts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Same primary-then-fallback-then-circuit-breaker shape as
    full_summary.generate_full_summary_with_fallback."""
    route_key = f"{primary_config.get('provider')}:{primary_config.get('model_id')}"
    if await failover.is_primary_suppressed(route_key):
        result = await generate_page2_summary(
            answers, model_config=fallback_config, usage_recorder=fallback_usage_recorder,
            submission_id=submission_id, transcripts=transcripts,
        )
        result["_ai_route"] = "fallback-cooldown"
        return result

    try:
        result = await generate_page2_summary(
            answers, model_config=primary_config, usage_recorder=primary_usage_recorder,
            submission_id=submission_id, transcripts=transcripts,
        )
        await failover.mark_primary_success(route_key)
        result["_ai_route"] = "primary"
        return result
    except Exception as primary_error:
        # Include the message, not just the class: the class alone can't
        # distinguish a bad deployment from a rejected schema from an auth
        # failure, and this is the log an operator reaches for first.
        logger.error(
            "page2_summary.primary_failed",
            error_type=type(primary_error).__name__,
            error=str(primary_error)[:400],
        )
        await failover.mark_primary_failure(route_key)
        try:
            result = await generate_page2_summary(
                answers, model_config=fallback_config, usage_recorder=fallback_usage_recorder,
                submission_id=submission_id, transcripts=transcripts,
            )
            result["_ai_route"] = "fallback"
            return result
        except Exception as fallback_error:
            # Surface the FALLBACK's error, not the primary's. `raise
            # primary_error` discarded the only record of why the last chance
            # actually failed, so the job's error_code described a route that
            # had already been given up on — the real failure was invisible.
            logger.error(
                "page2_summary.fallback_failed",
                error_type=type(fallback_error).__name__,
                error=str(fallback_error)[:400],
            )
            raise fallback_error from primary_error

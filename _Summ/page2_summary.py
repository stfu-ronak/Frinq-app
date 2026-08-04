"""Two-pass Luna Page 2 generation with deterministic privacy and QA gates."""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
from typing import Any, Final

from app.core.ai.answer_maps import annotate_answers
from app.core.ai.openai_client import (
    OpenAIContentFilterError,
    OpenAIIncompleteError,
    OpenAIResponseError,
    call_openai_structured,
)
from app.core.ai.pii import PIIContext, scrub_text
from app.core.ai.page2_prompts import (
    FRIEND_ROLES, FRIEND_ROLE_NAMES, FRIEND_ROLE_SLUGS, PAGE2_MODEL,
    PAGE2_PROMPT_VERSION, PAGE2_REASONING_EFFORT, REPORT_FIELDS, SOURCE_FIELDS,
    STAGE1_SCHEMA, STAGE1_SYSTEM, STAGE1_USER, STAGE2_REPAIR_USER,
    STAGE2_SCHEMA, STAGE2_SYSTEM, STAGE2_USER,
)
from app.utils.logger import logger

# If the configured model's provider content-filters a request (seen live:
# Azure AI Foundry's "jailbreak" classifier false-positiving on an ordinary
# quiz answer), retry once against this model instead of leaving the person
# with no Page 2 at all. gpt-5.6-luna goes straight to api.openai.com, a
# different content-safety layer than Azure's.
_CONTENT_FILTER_FALLBACK_MODEL: Final[str] = "gpt-5.6-luna"

_IDENTITY = {"name", "phone", "instagram", "linkedin_url", "dob", "city", "social_verified"}
# Base output-token ceilings, raised from the original 5200/7200: "medium"
# reasoning effort can spend a large, variable share of the budget on
# reasoning tokens before any visible text comes out, and the tighter
# ceilings were routinely truncating stage2 mid-JSON in production
# (Responses API status="incomplete", reason="max_output_tokens").
_STAGE1_BASE_TOKENS: Final[int] = 6500
_STAGE2_BASE_TOKENS: Final[int] = 9000
_TOKEN_BUMP: Final[int] = 3000
# Round/repair counts used to be the only thing bounding worst-case
# latency, which made them a tradeoff against reliability. Now that
# generate_page2_summary() has its own hard 150s wall-clock ceiling
# (below), that job moved there — these can afford to give the model
# more chances, since a run that's genuinely stuck gets cut off by the
# deadline regardless of what these are set to. Stage1 runs at "low"
# reasoning effort (mechanical evidence-tagging, not creative writing);
# stage2 keeps "medium" since it writes the actual user-facing voice.
_STAGE1_MAX_ROUNDS: Final[int] = 3
_STAGE1_REASONING_EFFORT: Final[str] = "low"
_STAGE2_MAX_REPAIRS: Final[int] = 3
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


async def _call_model_resilient(
    *, model: str, system: str, user: str, schema_name: str, schema: dict[str, Any],
    submission_id: str | None, base_tokens: int, reasoning_effort: str,
) -> dict[str, Any]:
    """Call the Responses API against one specific model, retrying once with
    a higher token ceiling if the first attempt got cut off (status=
    "incomplete", reason=max_output_tokens) or the model refused/returned
    unparsable output. One extra call on an otherwise-fine day is cheap; a
    permanently-null deep_summary is not.
    """
    safety_id = hashlib.sha256((submission_id or "preview").encode()).hexdigest()[:32]
    tokens = base_tokens
    last_exc: OpenAIResponseError | None = None
    for attempt in range(2):
        try:
            return await call_openai_structured(
                system=system, user=user, schema_name=schema_name, schema=schema,
                model=model, reasoning_effort=reasoning_effort,
                max_output_tokens=tokens, safety_identifier=safety_id,
                prompt_cache_key=PAGE2_PROMPT_VERSION,
            )
        except OpenAIResponseError as exc:
            last_exc = exc
            if isinstance(exc, OpenAIIncompleteError):
                tokens += _TOKEN_BUMP
            if attempt == 0:
                continue
    assert last_exc is not None
    raise last_exc


async def _call_stage_resilient(
    *, system: str, user: str, schema_name: str, schema: dict[str, Any],
    submission_id: str | None, base_tokens: int, reasoning_effort: str = PAGE2_REASONING_EFFORT,
) -> dict[str, Any]:
    """As _call_model_resilient, but falls back to a different provider
    entirely if the configured model's own content-safety layer blocks the
    request -- retrying the same model/prompt would just get blocked again
    (seen live: Azure AI Foundry's "jailbreak" classifier false-positiving
    on an ordinary quiz answer), so this is "try elsewhere", not "retry".
    """
    try:
        return await _call_model_resilient(
            model=PAGE2_MODEL, system=system, user=user, schema_name=schema_name, schema=schema,
            submission_id=submission_id, base_tokens=base_tokens, reasoning_effort=reasoning_effort,
        )
    except OpenAIContentFilterError as exc:
        if PAGE2_MODEL == _CONTENT_FILTER_FALLBACK_MODEL:
            raise
        logger.warning(
            "page2.content_filter_fallback", submission_id=submission_id,
            schema=schema_name, primary_model=PAGE2_MODEL,
            fallback_model=_CONTENT_FILTER_FALLBACK_MODEL, error=str(exc),
        )
        return await _call_model_resilient(
            model=_CONTENT_FILTER_FALLBACK_MODEL, system=system, user=user, schema_name=schema_name,
            schema=schema, submission_id=submission_id, base_tokens=base_tokens, reasoning_effort=reasoning_effort,
        )


_OVERALL_DEADLINE: Final[float] = 150.0


async def generate_page2_summary(answers: dict[str, Any], submission_id: str | None = None, transcripts: dict[str, Any] | None = None) -> dict[str, Any]:
    """Wraps _generate_page2_summary with a hard wall-clock ceiling.

    Real submissions were measured taking 12-22 minutes end to end -- far
    past anything a frontend poll should wait for -- because each retry
    round (stage1 rounds + stage2 repairs, each itself retrying once on a
    slow/incomplete response) could individually sit near the old 240s
    HTTP timeout with no ceiling on the sum. A single slow submission was
    also tying up a shared OpenAI semaphore slot for that whole time,
    which meant OTHER users' generations queued up behind it too. Give up
    at 150s -- if the model hasn't produced a valid report by then, no
    amount of additional waiting was going to land within a reasonable UX
    budget; the caller's existing fallback (null deep_summary, old UI,
    admin can regenerate) takes over the same as any other failure.
    """
    return await asyncio.wait_for(
        _generate_page2_summary(answers, submission_id, transcripts), timeout=_OVERALL_DEADLINE,
    )


async def _generate_page2_summary(answers: dict[str, Any], submission_id: str | None, transcripts: dict[str, Any] | None) -> dict[str, Any]:
    source = build_page2_input(answers, transcripts)
    stage1_user = STAGE1_USER.replace("{{ANONYMIZED_ANSWERS_JSON}}", json.dumps(source))

    stage1: dict[str, Any] = {}
    stage1_errors: list[str] = ["not yet generated"]
    for _ in range(_STAGE1_MAX_ROUNDS):
        stage1 = await _call_stage_resilient(
            system=STAGE1_SYSTEM, user=stage1_user, schema_name="frinq_page2_evidence_v1",
            schema=STAGE1_SCHEMA, submission_id=submission_id, base_tokens=_STAGE1_BASE_TOKENS,
            reasoning_effort=_STAGE1_REASONING_EFFORT,
        )
        stage1_errors = validate_stage1(stage1, source)
        if not stage1_errors:
            break
    if stage1_errors:
        raise ValueError("Page 2 evidence validation failed: " + "; ".join(stage1_errors))

    taxonomy = rotated_taxonomy(submission_id); evidence_json = json.dumps(stage1); taxonomy_json = json.dumps(taxonomy)
    user = STAGE2_USER.replace("{{STAGE1_JSON}}", evidence_json).replace("{{ROTATED_TAXONOMY_JSON}}", taxonomy_json)
    stage2 = await _call_stage_resilient(
        system=STAGE2_SYSTEM, user=user, schema_name="frinq_page2_result_v1",
        schema=STAGE2_SCHEMA, submission_id=submission_id, base_tokens=_STAGE2_BASE_TOKENS,
    )
    errors = validate_stage2(stage2, stage1)
    for _ in range(_STAGE2_MAX_REPAIRS):
        if not errors:
            break
        repair = STAGE2_REPAIR_USER.replace("{{STAGE1_JSON}}", evidence_json).replace("{{ROTATED_TAXONOMY_JSON}}", taxonomy_json).replace("{{INVALID_STAGE2_JSON}}", json.dumps(stage2)).replace("{{VALIDATOR_ERRORS_JSON}}", json.dumps(errors))
        stage2 = await _call_stage_resilient(
            system=STAGE2_SYSTEM, user=repair, schema_name="frinq_page2_result_v1",
            schema=STAGE2_SCHEMA, submission_id=submission_id, base_tokens=_STAGE2_BASE_TOKENS,
        )
        errors = validate_stage2(stage2, stage1)
    if errors: raise ValueError("Page 2 report validation failed: " + "; ".join(errors))
    return {"report": stage2["report"], "selection": stage2["selection"], "evidenceMap": stage2["evidenceMap"], "qa": stage2["qa"], "promptVersion": PAGE2_PROMPT_VERSION}

"""OpenAI client + the deep-report generator for the vibe-box "know more" panel.

This is the active generator for the quiz reveal (see INSIGHTS_PROVIDER in
app/config.py). `call_openai_json` is a generic chat-completions helper used
by app/core/ai/insights.py when INSIGHTS_PROVIDER="openai" (the hero-card
profile fields); `generate_deep_report` below produces the new "vibe report"
fields that replaced the old NVIDIA/Kimi deep-summary call outright.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Final

import httpx

from app.config import settings
from app.core.ai.answer_maps import annotate_answers
from app.core.ai.prompts import (
    DEEP_REPORT_EXAMPLE_ASSISTANT,
    DEEP_REPORT_EXAMPLE_USER,
    DEEP_REPORT_SYSTEM,
)
from app.core.ai.pii import PIIContext, scrub_text
from app.utils.logger import logger

_CONCURRENCY: Final[int] = 8
_semaphore: asyncio.Semaphore | None = None

_PLAIN_TEXT_LIMITS: Final[dict[str, int]] = {
    "report_quote": 115,
    "signal_archetype_text": 62,
    "mirror": 185,
    "first_impression": 185,
    "hidden_pattern": 185,
    "unspoken_need": 185,
    "closing_line": 100,
}
_SIGNAL_TRAIT_LIMITS: Final[dict[str, int]] = {"label": 34, "text": 62}
_READ_NOTE_LIMITS: Final[dict[str, int]] = {"label": 26, "text": 150}
_SNAPSHOT_LIMITS: Final[dict[str, int]] = {
    "first_read": 120,
    "after_time": 120,
    "under_stress": 120,
    "what_wins_you": 120,
}
_NARRATIVE_LIMIT: Final[int] = 280


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(_CONCURRENCY)
    return _semaphore


async def call_openai_json(
    *,
    system: str,
    user: str,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1500,
    examples: list[tuple[str, str]] | None = None,
) -> str:
    """Call OpenAI chat completions with JSON-object mode. Returns the raw
    text content (a JSON string). `examples` are (user, assistant) few-shot
    turns inserted between the system prompt and the real user message.
    Network/HTTP errors propagate — callers decide on retry policy, matching
    the contract of claude_client.call_with_cache.
    """
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set.")

    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for ex_user, ex_assistant in (examples or []):
        messages.append({"role": "user", "content": ex_user})
        messages.append({"role": "assistant", "content": ex_assistant})
    messages.append({"role": "user", "content": user})

    payload: dict[str, Any] = {
        "model": model or settings.OPENAI_MODEL,
        "messages": messages,
        # Newer OpenAI models reject the legacy "max_tokens" param in favor
        # of "max_completion_tokens" — confirmed via a live 400 during dev.
        "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    # GPT-5-series reasoning models take a reasoning_effort and only accept
    # the default temperature (a custom value 400s). When effort is set we
    # send it and omit temperature; otherwise we keep the caller's temperature
    # for the older non-reasoning models.
    effort = (settings.OPENAI_REASONING_EFFORT or "").strip()
    if effort:
        payload["reasoning_effort"] = effort
    else:
        payload["temperature"] = temperature
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    sem = _get_semaphore()
    async with sem:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
                # GPT-5 reasoning models can spend 30-90s thinking on a
                # full-size quiz prompt before emitting the JSON. The old 60s
                # ceiling cut them off mid-reason (empty content / timeout),
                # which is exactly how the vibe-report generation was failing.
                timeout=180.0,
            )
    response.raise_for_status()
    data = response.json()

    usage = data.get("usage") or {}
    logger.info(
        "openai.call",
        model=payload["model"],
        input_tokens=usage.get("prompt_tokens", 0),
        output_tokens=usage.get("completion_tokens", 0),
    )
    return data["choices"][0]["message"]["content"]


def _extract_json(content: str) -> dict[str, Any]:
    content = content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))



def _as_text(v: Any) -> str:
    """Coerce a value the schema wants as a plain string into one, even if the
    model returned a {text,label} object or a list. Mirrors the frontend
    asText() so stored data and rendered data agree."""
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        return " ".join(_as_text(x) for x in v if x)
    if isinstance(v, dict):
        if isinstance(v.get("text"), str):
            return v["text"]
        if isinstance(v.get("label"), str):
            return v["label"]
        return " ".join(str(x) for x in v.values() if isinstance(x, str))
    return str(v)


def _as_pair(v: Any) -> dict[str, str]:
    """Coerce into a {label, text} object with string members."""
    if isinstance(v, dict):
        return {"label": _as_text(v.get("label")), "text": _as_text(v.get("text"))}
    return {"label": "", "text": _as_text(v)}


def _strip_wrapping_quotes(text: str) -> str:
    pairs = {
        '"': '"',
        "'": "'",
        "\u201c": "\u201d",
        "\u2018": "\u2019",
    }
    if len(text) >= 2 and pairs.get(text[0]) == text[-1]:
        return text[1:-1].strip()
    return text


def _fit_text(v: Any, max_chars: int) -> str:
    text = re.sub(r"\s+", " ", _as_text(v)).strip()
    text = _strip_wrapping_quotes(text)
    if len(text) <= max_chars:
        return text
    clipped = text[:max_chars].rstrip()
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0].rstrip(" ,;:")
    return clipped or text[:max_chars].rstrip()


def _fit_pair(v: Any, limits: dict[str, int]) -> dict[str, str]:
    pair = _as_pair(v)
    return {
        "label": _fit_text(pair.get("label"), limits["label"]),
        "text": _fit_text(pair.get("text"), limits["text"]),
    }


def _normalize_deep_report(data: dict[str, Any]) -> dict[str, Any]:
    """Force the model output into the exact shape the UI expects, regardless
    of the model drifting (e.g. emitting a string field as a {text,label}
    object). Belt-and-braces with the frontend's asText/asPair.
    """
    out = dict(data)
    for key, limit in _PLAIN_TEXT_LIMITS.items():
        if key in out:
            out[key] = _fit_text(out[key], limit)
    if "signal_trait" in out:
        out["signal_trait"] = _fit_pair(out["signal_trait"], _SIGNAL_TRAIT_LIMITS)
    if isinstance(out.get("narrative"), list):
        out["narrative"] = [_fit_text(x, _NARRATIVE_LIMIT) for x in out["narrative"][:3] if x]
    elif "narrative" in out:
        out["narrative"] = [_fit_text(out["narrative"], _NARRATIVE_LIMIT)]
    if isinstance(out.get("read_notes"), list):
        out["read_notes"] = [_fit_pair(x, _READ_NOTE_LIMITS) for x in out["read_notes"][:3]]
    if isinstance(out.get("snapshot"), dict):
        out["snapshot"] = {
            k: _fit_text(v, _SNAPSHOT_LIMITS.get(k, 120))
            for k, v in out["snapshot"].items()
        }
    return out


async def generate_deep_report(answers: dict[str, Any]) -> dict[str, Any]:
    """Generate the vibe-box 'know more' report fields via OpenAI.

    Replaces the old NVIDIA/Kimi generate_deep_summary(). Scrubs name/phone
    before sending, matching the PII discipline already used for the
    hero-card generator in insights.py (the old NVIDIA prompt claimed PII
    was stripped but the code never actually did it). Also expands
    single-token answers (social_type, trip, saturday, connection, opinions,
    sliders) to the same descriptive phrases annotate_answers() already
    gives the hero-card prompt, so this call reasons over equivalent signal
    richness instead of raw quiz tokens.
    """
    pii = PIIContext(
        name=str(answers.get("name") or "").strip() or None,
        phone=str(answers.get("phone") or "").strip() or None,
        city=None,
    )
    annotated = annotate_answers(answers)
    scrubbed_answers = {
        k: (scrub_text(v, pii) if isinstance(v, str) else v)
        for k, v in annotated.items()
        if k not in ("name", "phone")
    }

    user_payload = {
        "important_instruction": "Read for cues and contradictions. Multi-select chips are weak. Do not summarize selected answers. Do not infer dating compatibility.",
        "questionnaire": scrubbed_answers,
    }

    content = await call_openai_json(
        system=DEEP_REPORT_SYSTEM,
        user=json.dumps(user_payload),
        temperature=0.7,
        # Generous ceiling: GPT-5 reasoning models spend part of this budget
        # on hidden reasoning tokens BEFORE emitting the visible JSON. At the
        # old 1800 cap, reasoning ate the whole budget and the answer came
        # back empty (JSON parse failed). The report's own field caps keep the
        # actual visible output small (~1.5k tokens), so the extra headroom is
        # only ever consumed when the model genuinely needs to reason.
        max_tokens=8000,
        examples=[(DEEP_REPORT_EXAMPLE_USER, DEEP_REPORT_EXAMPLE_ASSISTANT)],
    )

    try:
        parsed = _extract_json(content)
    except json.JSONDecodeError as exc:
        logger.error("openai.deep_report_parse_failed", error=str(exc), content=content)
        raise ValueError(f"Failed to parse OpenAI deep-report output as JSON: {content}") from exc

    return _normalize_deep_report(parsed)

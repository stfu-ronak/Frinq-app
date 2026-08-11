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
from typing import Any, Callable, Final

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

DEEP_REPORT_JSON_SCHEMA: Final[dict[str, Any]] = {
    "type": "object",
    "properties": {
        "report_quote": {"type": "string"},
        "narrative": {"type": "array", "items": {"type": "string"}},
        "signal_trait": {"type": "object"},
        "mirror": {"type": "string"},
        "first_impression": {"type": "string"},
        "hidden_pattern": {"type": "string"},
        "unspoken_need": {"type": "string"},
        "closing_line": {"type": "string"},
        "read_notes": {"type": "array", "items": {"type": "object"}},
        "snapshot": {"type": "object"},
    },
    "required": ["report_quote", "narrative"],
}


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
    effort: str | None = None,
    usage_recorder: Callable[[int, int], Any] | None = None,
) -> str:
    """Call OpenAI chat completions with JSON-object mode. Returns the raw
    text content (a JSON string). `examples` are (user, assistant) few-shot
    turns inserted between the system prompt and the real user message.
    Network/HTTP errors propagate — callers decide on retry policy, matching
    the contract of claude_client.call_with_cache.

    `effort` overrides settings.OPENAI_REASONING_EFFORT when given explicitly
    (the admin-configured per-step effort) — falls back to the global setting
    when omitted, so existing callers that don't pass it keep working.
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
    resolved_effort = (effort if effort is not None else settings.OPENAI_REASONING_EFFORT or "").strip()
    # "none" is a real, selectable entry in model_pricing.py's effort_levels
    # (meaning "no reasoning_effort configured") — it must omit the param
    # entirely, not forward the literal string "none" to the API.
    if resolved_effort and resolved_effort != "none":
        payload["reasoning_effort"] = resolved_effort
    else:
        payload["temperature"] = temperature
    headers = {
        "Authorization": f"Bearer {secret}",
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
    input_tokens = usage.get("prompt_tokens", 0)
    output_tokens = usage.get("completion_tokens", 0)
    logger.info(
        "openai.call",
        model=payload["model"],
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    if usage_recorder is not None:
        result = usage_recorder(input_tokens, output_tokens)
        if hasattr(result, "__await__"):
            await result
    return data["choices"][0]["message"]["content"]


class OpenAIStructuredError(RuntimeError):
    """Wraps an OpenAI Structured Outputs failure with a stable, loggable
    cause type — never leaks response body content into the message. Lets
    callers (e.g. admin's /ai-test) surface *which* failure happened
    (timeout vs. auth vs. rate-limit vs. schema mismatch) instead of every
    failure looking identical."""

    def __init__(self, message: str, *, cause: Exception):
        super().__init__(message)
        self.cause_type = type(cause).__name__


async def call_openai_structured(
    *,
    system: str,
    user: str,
    schema_name: str,
    schema: dict[str, Any],
    model: str | None = None,
    reasoning_effort: str | None = None,
    max_output_tokens: int = 1500,
    safety_identifier: str | None = None,
    prompt_cache_key: str | None = None,
    usage_recorder: Callable[[int, int], Any] | None = None,
    max_retries: int = 2,
    via_azure: bool = False,
) -> dict[str, Any]:
    """Structured Outputs (strict json_schema) sibling of call_openai_json.
    Returns the PARSED dict — strict mode guarantees schema-valid JSON, so
    none of call_openai_json's regex-fallback parsing is needed here.

    Adds a bounded retry loop (call_openai_json/the production summary path
    have none) on transient failures only — timeout, 5xx, or a malformed
    response body. Never retries a 4xx (bad request/auth/schema-config
    errors don't fix themselves). Raises OpenAIStructuredError on exhausted
    retries or a non-retryable failure.
    """
    # Azure AI Foundry v1 speaks the same Structured Outputs dialect on the
    # same request shape — only host, credential and the model-as-deployment
    # name differ — so it reuses this implementation rather than forking a
    # near-identical one that would drift on retries and usage accounting.
    if via_azure:
        from app.core.ai import azure_client

        url = azure_client.build_url()
        secret = azure_client.api_key()
        model_name = azure_client.resolve_deployment(model or settings.OPENAI_MODEL)
    else:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not set.")
        url = "https://api.openai.com/v1/chat/completions"
        secret = settings.OPENAI_API_KEY
        model_name = model or settings.OPENAI_MODEL

    payload: dict[str, Any] = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_completion_tokens": max_output_tokens,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "schema": schema, "strict": True},
        },
    }
    resolved_effort = (reasoning_effort if reasoning_effort is not None else settings.OPENAI_REASONING_EFFORT or "").strip()
    if resolved_effort and resolved_effort != "none":
        payload["reasoning_effort"] = resolved_effort
    if safety_identifier is not None:
        payload["safety_identifier"] = safety_identifier
    if prompt_cache_key is not None:
        payload["prompt_cache_key"] = prompt_cache_key

    headers = {
        "Authorization": f"Bearer {secret}",
        "Content-Type": "application/json",
    }

    sem = _get_semaphore()
    for attempt in range(max_retries + 1):
        try:
            async with sem:
                async with httpx.AsyncClient() as client:
                    response = await client.post(url, headers=headers, json=payload, timeout=180.0)
            response.raise_for_status()
            data = response.json()
            parsed = json.loads(data["choices"][0]["message"]["content"])
        except (httpx.TimeoutException, httpx.HTTPStatusError, json.JSONDecodeError, KeyError, IndexError) as exc:
            retryable = isinstance(exc, (httpx.TimeoutException, json.JSONDecodeError, KeyError, IndexError)) or (
                isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code >= 500
            )
            if not retryable or attempt >= max_retries:
                # Carry the provider's own status+message. Without it a 400
                # (bad deployment, unsupported param, schema rejected) and a
                # 401 are indistinguishable in the logs — both just said
                # "OpenAIStructuredError" and cost an hour to tell apart.
                detail = ""
                if isinstance(exc, httpx.HTTPStatusError):
                    detail = f" [{exc.response.status_code}: {exc.response.text[:300]}]"
                raise OpenAIStructuredError(
                    f"OpenAI structured call failed after {attempt + 1} attempt(s)"
                    f" (model={payload['model']}){detail}",
                    cause=exc,
                ) from exc
            await asyncio.sleep(0.5 * (attempt + 1))
            continue
        else:
            usage = data.get("usage") or {}
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            logger.info(
                "openai.call_structured",
                model=payload["model"],
                schema=schema_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
            if usage_recorder is not None:
                result = usage_recorder(input_tokens, output_tokens)
                if hasattr(result, "__await__"):
                    await result
            return parsed
    raise AssertionError("unreachable")  # loop always returns or raises


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


async def generate_deep_report(
    answers: dict[str, Any],
    *,
    model_config: dict[str, Any] | None = None,
    usage_recorder: Callable[[int, int], Any] | None = None,
) -> dict[str, Any]:
    """Generate the vibe-box 'know more' report fields.

    Replaces the old NVIDIA/Kimi generate_deep_summary(). Scrubs name/phone
    before sending, matching the PII discipline already used for the
    hero-card generator in insights.py (the old NVIDIA prompt claimed PII
    was stripped but the code never actually did it). Also expands
    single-token answers (social_type, trip, saturday, connection, opinions,
    sliders) to the same descriptive phrases annotate_answers() already
    gives the hero-card prompt, so this call reasons over equivalent signal
    richness instead of raw quiz tokens.

    `model_config` (provider/model_id/effort) is the admin-configured
    snapshot for this generation — defaults to the OpenAI path with
    settings.OPENAI_MODEL when omitted, so existing callers keep working
    unchanged. Claude has no `examples` few-shot mechanism like
    call_openai_json, so the one example pair is folded into the user
    prompt text instead when routed there.
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

    provider = (model_config or {}).get("provider", "openai")
    model_id = (model_config or {}).get("model_id") or settings.OPENAI_MODEL
    effort = (model_config or {}).get("effort")

    if provider == "claude":
        from app.core.ai.claude_client import call_with_cache

        example_prefix = (
            f"Example input:\n{DEEP_REPORT_EXAMPLE_USER}\n\n"
            f"Example output:\n{DEEP_REPORT_EXAMPLE_ASSISTANT}\n\n"
            "Now generate for this real input:\n"
        )
        content = await call_with_cache(
            system=DEEP_REPORT_SYSTEM,
            user=example_prefix + json.dumps(user_payload),
            model=model_id,
            temperature=0.7,
            max_tokens=8000,
            effort=effort,
            usage_recorder=usage_recorder,
        )
    elif provider == "azure":
        # Same request/response shape as the direct OpenAI branch below —
        # only the transport differs (deployment in the URL, api-key header),
        # which azure_client absorbs.
        from app.core.ai import azure_client

        content = await azure_client.call_azure_json(
            system=DEEP_REPORT_SYSTEM,
            user=json.dumps(user_payload),
            model=model_id,
            temperature=0.7,
            max_tokens=8000,
            effort=effort,
            usage_recorder=usage_recorder,
        )
    elif provider == "gemini":
        from app.core.ai import gemini_client

        example_prefix = (
            f"Example input:\n{DEEP_REPORT_EXAMPLE_USER}\n\n"
            f"Example output:\n{DEEP_REPORT_EXAMPLE_ASSISTANT}\n\n"
            "Now generate for this real input:\n"
        )
        content = await gemini_client.call_gemini_json(
            system=DEEP_REPORT_SYSTEM,
            user=example_prefix + json.dumps(user_payload),
            model=model_id,
            schema=DEEP_REPORT_JSON_SCHEMA,
            effort=effort,
            usage_recorder=usage_recorder,
        )
    else:
        content = await call_openai_json(
            system=DEEP_REPORT_SYSTEM,
            user=json.dumps(user_payload),
            model=model_id,
            temperature=0.7,
            # Generous ceiling: GPT-5 reasoning models spend part of this budget
            # on hidden reasoning tokens BEFORE emitting the visible JSON. At the
            # old 1800 cap, reasoning ate the whole budget and the answer came
            # back empty (JSON parse failed). The report's own field caps keep the
            # actual visible output small (~1.5k tokens), so the extra headroom is
            # only ever consumed when the model genuinely needs to reason.
            max_tokens=8000,
            examples=[(DEEP_REPORT_EXAMPLE_USER, DEEP_REPORT_EXAMPLE_ASSISTANT)],
            effort=effort,
            usage_recorder=usage_recorder,
        )

    try:
        parsed = _extract_json(content)
    except json.JSONDecodeError as exc:
        # Model output can contain user-derived text. Keep it out of logs and
        # exception messages; callers only need a stable failure type.
        logger.error("openai.deep_report_parse_failed", error_type=type(exc).__name__)
        raise ValueError("Failed to parse deep-report output as JSON") from exc

    return _normalize_deep_report(parsed)

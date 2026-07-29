"""Async Google Gemini/Gemma JSON client.

Gemini 3.x uses the current Interactions API. Gemma 4 uses the documented
generateContent endpoint because that is the model-specific API path.
"""

from __future__ import annotations

import inspect
from typing import Any, Callable

import httpx

from app.config import settings
from app.utils.logger import logger

_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


async def _record_usage(
    usage_recorder: Callable[[int, int], Any] | None,
    input_tokens: int,
    output_tokens: int,
) -> None:
    if usage_recorder is None:
        return
    result = usage_recorder(input_tokens, output_tokens)
    if inspect.isawaitable(result):
        await result


def _usage_values(data: dict[str, Any]) -> tuple[int, int]:
    usage = data.get("usage") or data.get("usageMetadata") or {}
    input_tokens = usage.get("input_tokens", usage.get("promptTokenCount", 0))
    output_tokens = usage.get("output_tokens", usage.get("candidatesTokenCount", 0))
    return int(input_tokens or 0), int(output_tokens or 0)


def _response_text(data: dict[str, Any], model: str) -> str:
    if isinstance(data.get("output_text"), str) and data["output_text"].strip():
        return data["output_text"]

    candidates = data.get("candidates") or []
    for candidate in candidates:
        content = candidate.get("content") or {}
        for part in content.get("parts") or []:
            if isinstance(part.get("text"), str) and part["text"].strip():
                return part["text"]

    for step in data.get("steps") or []:
        if step.get("type") != "model_output":
            continue
        for part in step.get("content") or []:
            if isinstance(part.get("text"), str) and part["text"].strip():
                return part["text"]

    raise RuntimeError(f"gemini_empty_response:{model}")


async def call_gemini_json(
    *,
    system: str,
    user: str,
    model: str,
    schema: dict[str, Any],
    effort: str | None = None,
    usage_recorder: Callable[[int, int], Any] | None = None,
) -> str:
    """Return provider text while enforcing JSON output at the API boundary."""
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set.")

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": settings.GEMINI_API_KEY,
    }
    payload: dict[str, Any]
    url: str
    if model.startswith("gemma-"):
        url = _GENERATE_URL.format(model=model)
        generation_config: dict[str, Any] = {
            "responseMimeType": "application/json",
            "responseSchema": schema,
        }
        if effort and effort != "none":
            generation_config["thinkingConfig"] = {"thinkingLevel": effort}
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": generation_config,
        }
    else:
        url = _INTERACTIONS_URL
        payload = {
            "model": model,
            "input": user,
            "system_instruction": system,
            "response_format": {"type": "text", "mime_type": "application/json", "schema": schema},
            "store": False,
        }
        if effort and effort != "none":
            payload["generation_config"] = {"thinking_level": effort}

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("gemini.call_failed", model=model, status=exc.response.status_code)
        raise RuntimeError(f"gemini_http_{exc.response.status_code}") from exc
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        logger.error("gemini.call_unavailable", model=model, error_type=type(exc).__name__)
        raise RuntimeError("gemini_unavailable") from exc

    data = response.json()
    input_tokens, output_tokens = _usage_values(data)
    await _record_usage(usage_recorder, input_tokens, output_tokens)
    logger.info(
        "gemini.call",
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    return _response_text(data, model)

"""Azure AI Foundry (v1) chat-completions client.

IMPORTANT — this targets the Foundry **v1** surface, which is OpenAI-COMPATIBLE:

  base_url = https://<resource>.services.ai.azure.com/openai/v1
  POST {base_url}/chat/completions
  Authorization: Bearer <key>
  body: {"model": "<deployment-name>", ...}

That is deliberately NOT the classic Azure OpenAI shape
(`<res>.openai.azure.com/openai/deployments/<d>/chat/completions?api-version=`,
`api-key` header, no `model` in the body). The v1 endpoint is what the stock
`OpenAI` python client talks to when you hand it `base_url`, so the only thing
that differs from api.openai.com is the host — the request body, auth scheme
and response shape are identical.

Because of that this module stays thin: it builds the URL and reuses exactly
the same payload rules as openai_client.py (JSON-object mode,
`max_completion_tokens`, and the GPT-5 rule of *send `reasoning_effort`, omit
`temperature`*). `model` carries the DEPLOYMENT name, which on Foundry is
usually just the model id.
"""

from __future__ import annotations

import json
from typing import Any, Callable

import httpx

from app.config import settings
from app.utils.logger import logger


class AzureConfigError(RuntimeError):
    """Raised when Azure is selected but not configured — a clear operator
    error instead of a confusing DNS failure from a half-built URL."""


def resolve_deployment(model_id: str) -> str:
    """Foundry addresses a *deployment*, normally named after the model.
    AZURE_OPENAI_DEPLOYMENTS remaps it when that isn't true."""
    raw = (settings.AZURE_OPENAI_DEPLOYMENTS or "").strip()
    if raw:
        try:
            mapping = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise AzureConfigError(f"AZURE_OPENAI_DEPLOYMENTS is not valid JSON: {exc}") from exc
        if isinstance(mapping, dict) and model_id in mapping:
            return str(mapping[model_id])
    return model_id


def build_url() -> str:
    """`AZURE_OPENAI_ENDPOINT` is the OpenAI-compatible base, i.e. it already
    ends in /openai/v1. Appending the standard path keeps this identical to
    what the stock OpenAI client would issue."""
    base = (settings.AZURE_OPENAI_ENDPOINT or "").strip().rstrip("/")
    if not base:
        raise AzureConfigError("AZURE_OPENAI_ENDPOINT is not set.")
    return f"{base}/chat/completions"


def api_key() -> str:
    """Falls back to OPENAI_API_KEY so an Azure key already sitting in that
    slot keeps working without a second copy in .env."""
    key = (settings.AZURE_OPENAI_API_KEY or settings.OPENAI_API_KEY or "").strip()
    if not key:
        raise AzureConfigError("AZURE_OPENAI_API_KEY (or OPENAI_API_KEY) is not set.")
    return key


def build_payload(
    *,
    system: str,
    user: str,
    model: str,
    temperature: float,
    max_tokens: int,
    examples: list[tuple[str, str]] | None,
    effort: str | None,
) -> dict[str, Any]:
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for ex_user, ex_assistant in (examples or []):
        messages.append({"role": "user", "content": ex_user})
        messages.append({"role": "assistant", "content": ex_assistant})
    messages.append({"role": "user", "content": user})

    # v1 is OpenAI-compatible, so `model` DOES belong in the body — it carries
    # the deployment name.
    payload: dict[str, Any] = {
        "model": resolve_deployment(model),
        "messages": messages,
        "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    resolved_effort = (effort if effort is not None else settings.OPENAI_REASONING_EFFORT or "").strip()
    # "none" means "no reasoning_effort configured" — omit rather than forward
    # the literal string (same rule as openai_client.py).
    if resolved_effort and resolved_effort != "none":
        payload["reasoning_effort"] = resolved_effort
    else:
        payload["temperature"] = temperature
    return payload


async def call_azure_json(
    *,
    system: str,
    user: str,
    model: str,
    temperature: float = 0.7,
    max_tokens: int = 1500,
    examples: list[tuple[str, str]] | None = None,
    effort: str | None = None,
    usage_recorder: Callable[[int, int], Any] | None = None,
) -> str:
    """Azure Foundry equivalent of call_openai_json. Returns the raw JSON."""
    url = build_url()
    headers = {"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"}
    payload = build_payload(
        system=system, user=user, model=model, temperature=temperature,
        max_tokens=max_tokens, examples=examples, effort=effort,
    )

    async with httpx.AsyncClient() as client:
        # Same 180s ceiling as the direct path: GPT-5 reasoning models can
        # spend 30-90s thinking before emitting any JSON.
        response = await client.post(url, headers=headers, json=payload, timeout=180.0)
    response.raise_for_status()
    data = response.json()

    usage = data.get("usage") or {}
    input_tokens = usage.get("prompt_tokens", 0)
    output_tokens = usage.get("completion_tokens", 0)
    logger.info(
        "azure_openai.call",
        deployment=resolve_deployment(model),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    if usage_recorder is not None:
        await usage_recorder(input_tokens, output_tokens)

    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Azure OpenAI returned no choices.")
    return choices[0].get("message", {}).get("content") or ""

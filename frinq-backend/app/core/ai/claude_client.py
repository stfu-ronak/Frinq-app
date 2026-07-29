"""Async Anthropic client wrapper with prompt caching + concurrency cap.

Single point of entry for every Claude call in the backend. Caches the
system prompt with `cache_control: ephemeral` so the trait-extraction and
narrator prompts get the ~70% input-cost discount across a matching run.
Concurrency is gated by an `asyncio.Semaphore(8)` so a burst of matching
narrations cannot exhaust the per-org rate limit.
"""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable

from anthropic import AsyncAnthropic

from app.config import settings
from app.core.ai.model_pricing import get_model_info
from app.utils.logger import logger

UsageRecorder = Callable[[int, int], Awaitable[None]]

# Model strategy (CLAUDE.md): always claude-sonnet-4-6 unless explicitly
# approved otherwise.
CLAUDE_SONNET: str = "claude-sonnet-4-6"

_CONCURRENCY: int = 8

_client: AsyncAnthropic | None = None
_semaphore: asyncio.Semaphore | None = None


def get_client() -> AsyncAnthropic:
    """Lazy-init the AsyncAnthropic singleton. Explicit timeout — the SDK's
    own default (10 minutes) is far too generous for a request a user is
    actively waiting on; a slow/hung provider call must fail and free the
    connection rather than tie it up indefinitely."""
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=60.0)
    return _client


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(_CONCURRENCY)
    return _semaphore


def _extract_text(message: Any) -> str:
    """Concatenate the text content blocks of an Anthropic Message."""
    parts: list[str] = []
    for block in getattr(message, "content", None) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            parts.append(text)
    return "".join(parts)


async def call_with_cache(
    *,
    system: str,
    user: str,
    model: str = CLAUDE_SONNET,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    client: AsyncAnthropic | None = None,
    effort: str | None = None,
    usage_recorder: UsageRecorder | None = None,
) -> str:
    """Call Claude with the system prompt placed in the ephemeral cache.

    Returns the concatenated text content of the response. Network and SDK
    errors propagate; callers decide on retry/fallback policy.

    `temperature` is only sent for models that still accept it — Claude
    Opus 5, Sonnet 5, and Fable 5 reject the parameter outright (400) if
    it's present at all, sampling is not configurable on those models.
    `effort` is only sent when the model actually supports it (skipped +
    logged otherwise, e.g. Haiku 4.5 has no `effort` parameter) — never
    forwarded blindly to the API.
    """
    c = client or get_client()
    info = get_model_info(model)

    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": [
            {
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        "messages": [{"role": "user", "content": user}],
    }
    if info is None or info.supports_temperature:
        kwargs["temperature"] = temperature
    if effort:
        if info is not None and info.supports_effort and effort in info.effort_levels:
            # The pinned SDK version (requirements.txt: anthropic==0.34.0)
            # predates output_config as a typed messages.create() parameter —
            # extra_body merges it into the raw request JSON regardless of
            # SDK version, avoiding a package upgrade for this one field.
            kwargs["extra_body"] = {"output_config": {"effort": effort}}
        else:
            logger.warning("claude.effort_unsupported", model=model, effort=effort)

    sem = _get_semaphore()
    async with sem:
        message = await c.messages.create(**kwargs)

    usage = getattr(message, "usage", None)
    if usage is not None:
        input_tokens = getattr(usage, "input_tokens", 0)
        output_tokens = getattr(usage, "output_tokens", 0)
        logger.info(
            "claude.call",
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_creation_input_tokens=getattr(usage, "cache_creation_input_tokens", 0),
            cache_read_input_tokens=getattr(usage, "cache_read_input_tokens", 0),
        )
        if usage_recorder is not None:
            await usage_recorder(input_tokens, output_tokens)

    return _extract_text(message)

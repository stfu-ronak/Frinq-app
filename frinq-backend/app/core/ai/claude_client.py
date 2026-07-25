"""Async Anthropic client wrapper with prompt caching + concurrency cap.

Single point of entry for every Claude call in the backend. Caches the
system prompt with `cache_control: ephemeral` so the trait-extraction and
narrator prompts get the ~70% input-cost discount across a matching run.
Concurrency is gated by an `asyncio.Semaphore(8)` so a burst of matching
narrations cannot exhaust the per-org rate limit.
"""

from __future__ import annotations

import asyncio
from typing import Any

from anthropic import AsyncAnthropic

from app.config import settings
from app.utils.logger import logger

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
) -> str:
    """Call Claude with the system prompt placed in the ephemeral cache.

    Returns the concatenated text content of the response. Network and SDK
    errors propagate; callers decide on retry/fallback policy.
    """
    c = client or get_client()
    sem = _get_semaphore()
    async with sem:
        message = await c.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=[
                {
                    "type": "text",
                    "text": system,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user}],
        )

    usage = getattr(message, "usage", None)
    if usage is not None:
        logger.info(
            "claude.call",
            model=model,
            input_tokens=getattr(usage, "input_tokens", 0),
            output_tokens=getattr(usage, "output_tokens", 0),
            cache_creation_input_tokens=getattr(usage, "cache_creation_input_tokens", 0),
            cache_read_input_tokens=getattr(usage, "cache_read_input_tokens", 0),
        )

    return _extract_text(message)

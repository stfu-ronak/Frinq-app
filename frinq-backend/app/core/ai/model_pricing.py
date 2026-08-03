"""Pricing + capability table for every model the admin can select for AI
generation (app/core/ai/model_config.py). Confirmed via Anthropic's own docs
and OpenAI's model catalog (July 2026) — not guessed. Update this file when
prices change; nothing else references raw $ figures.

`supports_temperature=False` is load-bearing, not cosmetic: Claude Opus 5,
Sonnet 5, and Fable 5 reject the `temperature` parameter outright (400) —
sending it unconditionally, as the pre-existing call_with_cache() did, would
break every request the moment an admin picks one of these three models.
"""

from __future__ import annotations

from typing import Final, NamedTuple


class ModelInfo(NamedTuple):
    provider: str  # "openai" | "claude" | "gemini"
    input_price_per_mtok: float
    output_price_per_mtok: float
    supports_effort: bool
    # Effort levels this specific model accepts, in the order the admin UI
    # should offer them. Empty when supports_effort is False.
    effort_levels: tuple[str, ...]
    supports_temperature: bool


MODEL_INFO: Final[dict[str, ModelInfo]] = {
    # OpenAI
    "gpt-5.5": ModelInfo("openai", 5.00, 30.00, True,
                          ("none", "low", "medium", "high", "xhigh", "max"), True),
    "gpt-5.6-sol": ModelInfo("openai", 5.00, 30.00, True,
                              ("none", "low", "medium", "high", "xhigh", "max"), True),
    "gpt-5.6-terra": ModelInfo("openai", 2.50, 15.00, True,
                                ("none", "low", "medium", "high", "xhigh", "max"), True),
    "gpt-5.6-luna": ModelInfo("openai", 1.00, 6.00, True,
                               ("none", "low", "medium", "high", "xhigh", "max"), True),
    # Claude — Opus 5 / Sonnet 5 / Fable 5 do NOT accept `temperature` (400).
    # Haiku 4.5 does not support `effort` at all (confirmed: absent from
    # Anthropic's own supported-models list for the effort parameter).
    "claude-fable-5": ModelInfo("claude", 10.00, 50.00, True,
                                 ("low", "medium", "high", "xhigh", "max"), False),
    "claude-opus-5": ModelInfo("claude", 5.00, 25.00, True,
                                ("low", "medium", "high", "xhigh", "max"), False),
    "claude-sonnet-5": ModelInfo("claude", 3.00, 15.00, True,
                                  ("low", "medium", "high", "xhigh", "max"), False),
    "claude-haiku-4-5-20251001": ModelInfo("claude", 1.00, 5.00, False, (), True),
    # Gemini/Gemma. Prices are paid-tier USD per MTok; AI Studio free-tier
    # usage is still logged as zero-cost for local testing.
    # Google currently documents this family as Gemini 3 Flash Preview; the
    # requested "3.6 Flash" name is not a published Gemini API model id.
    "gemini-3-flash-preview": ModelInfo("gemini", 0.50, 3.00, True,
                                   ("minimal", "low", "medium", "high"), False),
    "gemini-3.5-flash-lite": ModelInfo("gemini", 0.30, 2.50, True,
                                       ("minimal", "low", "medium", "high"), False),
    "gemini-3.1-flash-lite": ModelInfo("gemini", 0.25, 1.50, True,
                                       ("minimal", "low", "medium", "high"), False),
    "gemma-4-31b-it": ModelInfo("gemini", 0.00, 0.00, True,
                                 ("minimal", "high"), False),
}

# The default Gemini model when a step's config doesn't specify one —
# single source of truth so retiring it from MODEL_INFO fails a test
# (test_model_pricing.py) instead of silently breaking two call sites.
GEMINI_DEFAULT: Final[str] = "gemini-3.5-flash-lite"

# Convenience alias some callers may already use.
MODEL_ALIASES: Final[dict[str, str]] = {
    "claude-haiku-4-5": "claude-haiku-4-5-20251001",
    "gpt-5.6": "gpt-5.6-sol",
}


def resolve_model_id(model_id: str) -> str:
    """Resolve a convenience alias to its canonical key in MODEL_INFO."""
    return MODEL_ALIASES.get(model_id, model_id)


def is_known_model(model_id: str) -> bool:
    return resolve_model_id(model_id) in MODEL_INFO


def get_model_info(model_id: str) -> ModelInfo | None:
    return MODEL_INFO.get(resolve_model_id(model_id))


def effort_supported(model_id: str, effort: str | None) -> bool:
    """True if `effort` (already-non-None) is valid for this model."""
    info = get_model_info(model_id)
    if info is None or not info.supports_effort:
        return False
    return effort in info.effort_levels


def compute_cost(model_id: str, input_tokens: int, output_tokens: int) -> float:
    info = get_model_info(model_id)
    if info is None:
        raise ValueError(f"unknown model_id for cost computation: {model_id!r}")
    return (
        (input_tokens / 1_000_000) * info.input_price_per_mtok
        + (output_tokens / 1_000_000) * info.output_price_per_mtok
    )

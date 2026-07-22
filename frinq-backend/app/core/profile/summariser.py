"""LLM profile summariser — the first words a user reads about themselves.

Calls Claude Sonnet 4.6 with SUMMARY_* prompts at `temperature=0.7`, parses
the `{summary, tags}` JSON, retries once on malformed output, and raises
`SummariserError` on a second failure. The caller (profile API / worker)
decides whether to surface a fallback template or queue a retry; we do not
swallow the failure here because the summary is user-visible and a silent
placeholder would degrade the launch experience.

PII (name / phone / exact city) is scrubbed from every string sent to
Claude via `app.core.ai.pii.scrub_text`.
"""

from __future__ import annotations

import json
from typing import Any, Final

from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.core.ai import prompts
from app.core.ai.claude_client import CLAUDE_SONNET, call_with_cache
from app.core.ai.pii import PIIContext, scrub_list, scrub_text
from app.utils.logger import logger

_MAX_TOKENS: Final[int] = 1000
_TEMPERATURE: Final[float] = 0.7

# Hard cap from §2.3 voice rules: 60 words. Allow a bit of slack so a
# Claude over-run still passes validation rather than dropping into retry.
_SUMMARY_MAX_CHARS: Final[int] = 600


class SummariserError(RuntimeError):
    """Raised when Claude fails to return a valid summary twice in a row."""


class SummaryResult(BaseModel):
    """`{summary, tags}` shape from SUMMARY_SYSTEM (§2.3)."""

    summary: str = Field(min_length=1, max_length=_SUMMARY_MAX_CHARS)
    tags: list[str] = Field(min_length=3, max_length=8)

    @field_validator("tags")
    @classmethod
    def _non_empty(cls, v: list[str]) -> list[str]:
        cleaned = [tag.strip() for tag in v if tag and tag.strip()]
        if len(cleaned) < 3:
            raise ValueError("need at least 3 non-empty tags")
        return cleaned


def _strip_json_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
        if t.endswith("```"):
            t = t[: -3]
    return t.strip()


def _parse_response(text: str) -> SummaryResult:
    payload = json.loads(_strip_json_fences(text))
    return SummaryResult.model_validate(payload)


def _fmt_field(value: Any) -> str:
    """Render a profile field for prompt interpolation — list/None safe."""
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(str(v) for v in value)
    return str(value)


def _fmt_loved(items: list[dict[str, Any]] | None) -> str:
    if not items:
        return ""
    return ", ".join(item.get("id", "") for item in items if item.get("id"))


def _fmt_slider(value: Any) -> str:
    if value is None:
        return ""
    return f"{float(value):.2f}"


def _build_user_prompt(profile: dict[str, Any], pii: PIIContext | None) -> str:
    return prompts.SUMMARY_USER.format(
        primary_goals=_fmt_field(profile.get("primary_goals")),
        loved_activities=_fmt_loved(profile.get("loved_activities")),
        saturday_archetype=_fmt_field(profile.get("saturday_archetype")),
        social_type=_fmt_field(profile.get("social_type")),
        connection_signals=_fmt_field(profile.get("connection_signals")),
        red_flags=_fmt_field(scrub_list(profile.get("red_flags") or [], pii)),
        bonding_style=_fmt_field(profile.get("bonding_style")),
        chronotype=_fmt_field(profile.get("chronotype")),
        group_pref=_fmt_field(profile.get("group_pref")),
        substance_scene=_fmt_field(profile.get("substance_scene")),
        slider_depth=_fmt_slider(profile.get("slider_depth")),
        slider_fun_get=_fmt_slider(profile.get("slider_fun_get")),
        slider_frequency=_fmt_slider(profile.get("slider_frequency")),
        latent_tags=_fmt_field(profile.get("latent_tags")),
        hobbies=scrub_text(profile.get("hobbies_text"), pii),
        show_up=scrub_text(profile.get("show_up_style"), pii),
        looking_for=scrub_text(profile.get("looking_for_text"), pii),
        storytime_transcript=scrub_text(profile.get("storytime_transcript"), pii),
    )


async def summarise_profile(
    profile: dict[str, Any],
    *,
    pii: PIIContext | None = None,
    client: AsyncAnthropic | None = None,
) -> dict[str, Any]:
    """Return `{"ai_summary": str, "latent_tags": list[str]}`.

    Raises `SummariserError` if Claude returns malformed output twice.
    """
    user_prompt = _build_user_prompt(profile, pii)
    last_error: Exception | None = None

    for attempt in (1, 2):
        try:
            response_text = await call_with_cache(
                system=prompts.SUMMARY_SYSTEM,
                user=user_prompt,
                model=CLAUDE_SONNET,
                temperature=_TEMPERATURE,
                max_tokens=_MAX_TOKENS,
                client=client,
            )
            result = _parse_response(response_text)
            return {
                "ai_summary": result.summary,
                "latent_tags": list(result.tags),
            }
        except (json.JSONDecodeError, ValidationError, ValueError) as exc:
            last_error = exc
            logger.warning(
                "summary_invalid_response",
                attempt=attempt,
                error=str(exc),
            )
        except Exception as exc:
            last_error = exc
            logger.warning(
                "summary_call_failed",
                attempt=attempt,
                error=str(exc),
            )

    logger.error("summary_failed", error=str(last_error))
    raise SummariserError(f"summary generation failed after retry: {last_error}")

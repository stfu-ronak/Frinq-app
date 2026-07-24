"""Deterministic, local-only chat message moderation for beta.

No LLM or external moderation service call — everything here is a plain
Unicode-aware rule check. One result type (accepted/rejected/review) with a
stable machine-readable reason; callers must never log the raw message body
for a non-accepted result, only `content_hash()` + the reason + user id
(same "identifiers + sanitized reason, never raw content" convention as
app/workers/tasks/quiz_insights.py's `_error_code()`).
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from app.config import settings

ModerationVerdict = Literal["accepted", "rejected", "review"]


@lru_cache
def blocked_terms_from_settings() -> frozenset[str]:
    """Parses MODERATION_BLOCKED_TERMS (comma-separated) once — same
    parsing convention as CORS_ORIGINS. Cached since settings don't change
    at runtime; the process needs a restart to pick up an env change,
    same as every other setting read at import/first-use time."""
    return frozenset(t.strip() for t in settings.MODERATION_BLOCKED_TERMS.split(",") if t.strip())

_MAX_BODY_LEN = 1000
_MAX_URLS = 5
_MAX_REPEATED_RUN = 8  # more than 8 identical chars in a row is excessive
_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
_REPEATED_RE = re.compile(r"(.)\1{" + str(_MAX_REPEATED_RUN) + r",}")
# Every C0/DEL control character except \n (0x0A) — \t and \r are rejected
# too since the plan names newline as the only exception.
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x09\x0b-\x1f\x7f]")


@dataclass(frozen=True, slots=True)
class ModerationResult:
    verdict: ModerationVerdict
    reason: str
    # Only set when verdict == "accepted" — the normalized text that should
    # actually be persisted (never the raw, un-normalized client input).
    normalized_body: str | None = None


def content_hash(body: str) -> str:
    """A stable, non-reversible identifier for a message body — safe to log
    or store when the raw content itself must not be."""
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def moderate(
    body: str, *, blocked_terms: frozenset[str] = frozenset(), max_length: int = _MAX_BODY_LEN
) -> ModerationResult:
    normalized = unicodedata.normalize("NFKC", body).strip()

    if not normalized:
        return ModerationResult("rejected", "empty_after_normalization")
    if len(normalized) > max_length:
        return ModerationResult("rejected", "too_long")
    if _CONTROL_CHAR_RE.search(normalized):
        return ModerationResult("rejected", "control_characters")
    if _REPEATED_RE.search(normalized):
        return ModerationResult("rejected", "excessive_repetition")
    if len(_URL_RE.findall(normalized)) > _MAX_URLS:
        return ModerationResult("rejected", "too_many_urls")

    if blocked_terms:
        lowered = normalized.lower()
        for term in blocked_terms:
            if term and term.lower() in lowered:
                return ModerationResult("review", "blocked_term")

    return ModerationResult("accepted", "ok", normalized_body=normalized)

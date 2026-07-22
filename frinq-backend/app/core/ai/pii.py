"""PII scrubbing for inputs to the Claude API.

The trait extractor and summariser must never send the user's name, phone
number, or exact city to Anthropic. The user table holds these directly;
the open-text answers may also mention them. This module gives a single
pass that both call sites use.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Phone numbers — international or local, 8+ digits with optional separators.
_PHONE_RE: re.Pattern[str] = re.compile(r"\+?\d[\d\s\-]{6,}\d")

# Email addresses — generic.
_EMAIL_RE: re.Pattern[str] = re.compile(
    r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"
)

# LinkedIn profile URLs — both linkedin.com/in/<handle> and bare lnkd.in shortlinks.
# Anchored to a domain so we don't eat anything that just contains "in/".
_LINKEDIN_RE: re.Pattern[str] = re.compile(
    r"(?:https?://)?(?:[a-z]{2,4}\.)?linkedin\.com/(?:in|pub|company)/[A-Za-z0-9_\-/%.]+",
    re.IGNORECASE,
)
_LNKD_IN_RE: re.Pattern[str] = re.compile(
    r"(?:https?://)?lnkd\.in/[A-Za-z0-9_\-]+", re.IGNORECASE
)

# Instagram handles — leading-@ form only, so we don't munch email local-parts or
# "@" used as a normal word. Email is scrubbed first, so by the time we hit this
# regex the only @ left should be a social handle.
# Matches "@somebody" but not bare words.
_INSTAGRAM_HANDLE_RE: re.Pattern[str] = re.compile(
    r"(?<![A-Za-z0-9._])@[A-Za-z0-9._]{1,30}"
)
# Instagram profile URLs.
_INSTAGRAM_URL_RE: re.Pattern[str] = re.compile(
    r"(?:https?://)?(?:www\.)?instagram\.com/[A-Za-z0-9_./]+", re.IGNORECASE
)


@dataclass(frozen=True)
class PIIContext:
    """Known-PII values to redact from text before sending to Claude."""

    name: str | None = None
    phone: str | None = None
    city: str | None = None


def scrub_text(text: str | None, pii: PIIContext | None) -> str:
    """Remove PII from a single string. Returns "" for None input.

    - Explicit name / city substrings are replaced (case-insensitive).
    - Any phone-number-shaped token is replaced.
    - Any email-shaped token is replaced.
    """
    if not text:
        return ""

    cleaned = text

    if pii is not None:
        for value in (pii.name, pii.city):
            if value and len(value.strip()) >= 2:
                cleaned = re.sub(
                    re.escape(value), "[redacted]", cleaned, flags=re.IGNORECASE
                )
        if pii.phone:
            cleaned = cleaned.replace(pii.phone, "[redacted]")

    # Order matters: scrub email before instagram-handle regex, so the @ in
    # email local-parts doesn't get re-matched as a handle.
    cleaned = _EMAIL_RE.sub("[redacted]", cleaned)
    cleaned = _LINKEDIN_RE.sub("[redacted]", cleaned)
    cleaned = _LNKD_IN_RE.sub("[redacted]", cleaned)
    cleaned = _INSTAGRAM_URL_RE.sub("[redacted]", cleaned)
    cleaned = _INSTAGRAM_HANDLE_RE.sub("[redacted]", cleaned)
    cleaned = _PHONE_RE.sub("[redacted]", cleaned)
    return cleaned


def scrub_list(items: list[str] | None, pii: PIIContext | None) -> list[str]:
    if not items:
        return []
    return [scrub_text(item, pii) for item in items]

from __future__ import annotations

import logging
import re
import sys
from typing import Any

import structlog

from app.config import settings

# ─── Task 46 Step 2: redaction ──────────────────────────────────────────────
# Two layers, since either alone misses real cases:
#  1. Key-based: exact field names that are ALWAYS sensitive regardless of
#     value shape (a raw refresh token string doesn't "look like" anything in
#     particular). Exact-match on a normalized (lowercased, underscored) key,
#     never a substring test — a substring test on "code" would also eat the
#     legitimate, plan-required "sanitized error code" field.
#  2. Value-pattern: some sensitive strings leak into fields that AREN'T
#     obviously named for it — a phone number embedded in an exception
#     message (`ValueError(f"invalid phone {phone}")`), a bearer token pasted
#     into a debug string, a JWT. This scans every string value (including
#     the flattened exception traceback) for these shapes and masks just the
#     matched substring, keeping the rest of the message readable.
_FORBIDDEN_KEYS = frozenset({
    "authorization", "cookie", "cookies", "refresh_token", "access_token",
    "ticket", "ws_ticket", "phone", "password", "secret", "api_key", "apikey",
    "push_token", "device_token", "fcm_token", "voice_url", "voice_path",
    "message_body", "body", "report_text", "quiz_answers", "answers", "answer",
    "otp_code", "verification_code", "database_url", "redis_url", "dsn",
    "client_secret", "service_account", "private_key",
})

_VALUE_PATTERNS = [
    re.compile(r"Bearer\s+[A-Za-z0-9\-_.]+"),
    re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),  # JWT-shaped
    re.compile(r"(?<!\d)\+?(?:91)?[6-9]\d{9}(?!\d)"),  # Indian phone, +91/91/bare
    re.compile(r"AC[a-f0-9]{32}"),  # Twilio Account SID
    re.compile(r"SK[a-f0-9]{32}"),  # Twilio API key
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),  # OpenAI/Anthropic-shaped API key
]

_MASK = "[redacted]"


def _redact_value(value: str) -> str:
    for pattern in _VALUE_PATTERNS:
        value = pattern.sub(_MASK, value)
    return value


def _redact(value: Any) -> Any:
    if isinstance(value, str):
        return _redact_value(value)
    if isinstance(value, dict):
        return {
            k: _MASK if k.lower().replace("-", "_") in _FORBIDDEN_KEYS else _redact(v)
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_redact(v) for v in value]
    return value


def redact_processor(logger: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """structlog processor — must run AFTER format_exc_info (so the exception
    traceback is already a flat string in event_dict['exception'] by the time
    this scans it) and BEFORE the final renderer."""
    return {
        k: _MASK if k.lower().replace("-", "_") in _FORBIDDEN_KEYS else _redact(v)
        for k, v in event_dict.items()
    }


def _configure() -> structlog.stdlib.BoundLogger:
    is_dev = settings.APP_ENV == "development"

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        redact_processor,
    ]
    if is_dev:
        processors.append(structlog.dev.ConsoleRenderer(colors=True))
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
    # Bound once, present on every line without every call site repeating it —
    # the plan's "deployment version" field, so an incident can be pinned to
    # the exact running build.
    return structlog.get_logger("frinq").bind(deployment_version=settings.DEPLOYMENT_VERSION)


logger = _configure()

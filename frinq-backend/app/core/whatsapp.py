"""Proactive WhatsApp send via Twilio Messaging API.

Unlike Verify (which only sends OTP codes), this sends arbitrary
messages — used after a user completes the quiz to notify them about
launch timeline, Delhi NCR limitation, etc. Re-uses the same Twilio
account + creds as OTP.

Important: outbound WhatsApp outside the 24h customer-initiated session
window REQUIRES a Meta-approved Content Template (HSM). Send a free-form
message to a cold number and Twilio returns 63016 ("free-form not
allowed outside session window"). We always send via template.

If TWILIO_WHATSAPP_FROM or TWILIO_WHATSAPP_TEMPLATE_SID is empty, send
is skipped (logged as 'whatsapp.skipped') so the rest of the app keeps
working until Meta approves the template.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from app.config import settings
from app.utils.logger import logger


_AWAIT_TIMEOUT: float = 9.0
_client_instance: Any = None


def _client() -> Any:
    global _client_instance
    if _client_instance is not None:
        return _client_instance
    from twilio.rest import Client
    _client_instance = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _client_instance


def _e164(phone: str) -> str:
    digits = phone.replace("+91", "").replace(" ", "").strip()
    return f"+91{digits}"


async def _send_template(
    phone: str,
    template_sid: str,
    template_vars: dict[str, str],
    *,
    log_label: str,
) -> dict[str, Any]:
    """Generic templated send. Used by both launch-notice and follow-up.
    Returns {ok, skipped?, sid?, error?}. Never raises."""
    to_raw = _e164(phone)
    to = f"whatsapp:{to_raw}"

    if not settings.TWILIO_WHATSAPP_FROM or not template_sid:
        logger.info(
            f"whatsapp.{log_label}.skipped",
            reason="not_configured",
            has_from=bool(settings.TWILIO_WHATSAPP_FROM),
            has_template=bool(template_sid),
            to=to_raw,
        )
        return {"ok": False, "skipped": True, "reason": "not_configured"}

    def _send_sync() -> Any:
        return _client().messages.create(
            to=to,
            from_=settings.TWILIO_WHATSAPP_FROM,
            content_sid=template_sid,
            content_variables=json.dumps(template_vars),
        )

    try:
        msg = await asyncio.wait_for(asyncio.to_thread(_send_sync), timeout=_AWAIT_TIMEOUT)
        sid = getattr(msg, "sid", None)
        logger.info(f"whatsapp.{log_label}.sent", to=to_raw, sid=sid)
        return {"ok": True, "sid": sid}
    except asyncio.TimeoutError:
        logger.error(f"whatsapp.{log_label}.timeout", to=to_raw)
        return {"ok": False, "error": "timeout"}
    except Exception as exc:  # noqa: BLE001
        logger.error(
            f"whatsapp.{log_label}.send_failed", to=to_raw,
            error_type=type(exc).__name__, error=str(exc),
        )
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


async def send_launch_notice(
    phone: str,
    *,
    name: str = "",
    archetype: str = "",
    template_vars: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Send the post-quiz launch-notice WhatsApp template.
    template_vars defaults to {"1": name, "2": archetype}."""
    vars_payload = template_vars or {"1": name or "friend", "2": archetype or "your read"}
    return await _send_template(
        phone, settings.TWILIO_WHATSAPP_TEMPLATE_SID, vars_payload, log_label="launch",
    )


async def send_followup(
    phone: str,
    *,
    name: str = "",
    template_vars: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Send the 'first_follow_up' template to a drop-off user.
    template_vars defaults to {"1": first_name}."""
    first_name = (name or "").strip().split()[0] if name else "friend"
    vars_payload = template_vars or {"1": first_name}
    return await _send_template(
        phone, settings.TWILIO_WHATSAPP_FOLLOWUP_TEMPLATE_SID, vars_payload, log_label="followup",
    )

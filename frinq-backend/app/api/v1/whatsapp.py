"""WhatsApp notification endpoint.

Frontend pings this when the user lands on the 'what's next' screen
after their quiz summary. We look up the submission to get name + phone
+ archetype, then fire the templated WhatsApp message.

Idempotent: a submission can only trigger the launch-notice ONCE
(tracked via the whatsapp_sent_at column on quiz_submissions). Second
request returns { ok: true, already_sent: true } without re-sending.
"""

from __future__ import annotations

import json
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.api.deps import get_pool
from app.core.whatsapp import send_launch_notice
from app.utils.logger import logger

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

# ── Sunday-invite RSVP button auto-replies ────────────────────────────────────
# Keyed by the button `id` we set on the invite template (twilio/card actions).
# Free-form replies are allowed here because a button tap opens the 24h session.
RSVP_REPLIES = {
    "rsvp_yes": (
        "Great to hear that! 🎉 We'll send you the WhatsApp group link for the "
        "event shortly. See you on Sunday!"
    ),
    "rsvp_no": (
        "Sorry to hear that — we'd have loved to have you there. If you change "
        "your mind, just message us here anytime. 💛"
    ),
    "rsvp_info": (
        "Sure! 😊 Message us right here with whatever you'd like to know — venue, "
        "timing, anything — and we'll help you out."
    ),
}

# Fallback when the button id isn't present: match on the visible button text.
_TEXT_TO_CHOICE = {
    "i'll attend": "rsvp_yes",
    "can't attend": "rsvp_no",
    "need more info": "rsvp_info",
}


def _choice_from(payload: str, button_text: str, body: str) -> str | None:
    if payload in RSVP_REPLIES:
        return payload
    probe = (button_text or body or "").strip().lower()
    for needle, choice in _TEXT_TO_CHOICE.items():
        if needle in probe:
            return choice
    return None


async def _record_rsvp(pool: asyncpg.Pool, from_field: str, choice: str) -> None:
    """Persist the RSVP against the matching submission (by last-10-digit phone)."""
    digits = "".join(c for c in (from_field or "") if c.isdigit())
    last10 = digits[-10:]
    if len(last10) != 10:
        logger.warning("whatsapp.rsvp.no_phone", from_field=from_field)
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE quiz_submissions
                   SET rsvp_status = $1, rsvp_at = NOW()
                   WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = $2""",
                choice, last10,
            )
        logger.info("whatsapp.rsvp.recorded", phone=last10, choice=choice)
    except Exception as exc:  # noqa: BLE001
        logger.error("whatsapp.rsvp.record_failed", error=str(exc), phone=last10)


async def _store_inbound(
    pool: asyncpg.Pool, from_field: str, body: str,
    button_text: str, payload: str, choice: str | None,
) -> None:
    """Persist every inbound message (button tap or free-form) for the admin UI."""
    phone = "".join(c for c in (from_field or "") if c.isdigit())[-10:]
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO whatsapp_inbound
                   (from_phone, body, button_text, button_payload, choice)
                   VALUES ($1, $2, $3, $4, $5)""",
                phone, body or None, button_text or None, payload or None, choice,
            )
    except Exception as exc:  # noqa: BLE001
        logger.error("whatsapp.inbound.store_failed", error=str(exc), phone=phone)


@router.post("/inbound")
async def whatsapp_inbound(
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
) -> Response:
    """Twilio inbound webhook for the FRINQ-Whatsapp messaging service.
    Auto-replies to RSVP button taps and records the choice. Returns TwiML.

    Parses the raw urlencoded body (Twilio always posts
    application/x-www-form-urlencoded) so we don't depend on python-multipart."""
    from urllib.parse import parse_qs
    raw = (await request.body()).decode("utf-8", "ignore")
    form = {k: (v[0] if v else "") for k, v in parse_qs(raw).items()}
    payload = (form.get("ButtonPayload") or "").strip()
    button_text = (form.get("ButtonText") or "").strip()
    body = (form.get("Body") or "").strip()
    from_field = (form.get("From") or "").strip()

    choice = _choice_from(payload, button_text, body)
    logger.info(
        "whatsapp.inbound", from_field=from_field, payload=payload,
        button_text=button_text, body=body[:80], choice=choice,
    )

    await _store_inbound(pool, from_field, body, button_text, payload, choice)

    from twilio.twiml.messaging_response import MessagingResponse
    twiml = MessagingResponse()
    if choice:
        await _record_rsvp(pool, from_field, choice)
        twiml.message(RSVP_REPLIES[choice])
    return Response(content=str(twiml), media_type="application/xml")


@router.post("/notify/{submission_id}")
async def notify_launch(
    submission_id: str,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    try:
        sid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT phone, answers, share_card, whatsapp_sent_at
               FROM quiz_submissions WHERE id = $1""",
            sid,
        )
    if not row:
        raise HTTPException(status_code=404, detail="submission not found")
    if row["whatsapp_sent_at"]:
        return {"ok": True, "already_sent": True}

    phone = row["phone"]
    if not phone:
        return {"ok": False, "error": "no phone on submission"}

    answers = row["answers"] or {}
    if isinstance(answers, str):
        try:
            answers = json.loads(answers)
        except Exception:
            answers = {}
    name = (answers.get("name") if isinstance(answers, dict) else "") or ""

    share_card = row["share_card"] or {}
    if isinstance(share_card, str):
        try:
            share_card = json.loads(share_card)
        except Exception:
            share_card = {}
    archetype = (share_card.get("archetype") if isinstance(share_card, dict) else "") or ""

    result = await send_launch_notice(phone, name=name, archetype=archetype)

    if result.get("ok"):
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE quiz_submissions SET whatsapp_sent_at = NOW() WHERE id = $1",
                sid,
            )
        logger.info("whatsapp.notify.recorded", submission_id=str(sid))

    return result

"""Phone OTP endpoints — no auth required.

POST /api/v1/otp/send    — trigger Twilio Verify SMS
POST /api/v1/otp/verify  — check code, return signed phone token + prior session
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from pydantic import BaseModel

from app.api.deps import get_pool
from app.config import settings
from app.core.otp import send_otp, verify_otp
from app.utils.logger import logger

router = APIRouter(prefix="/otp", tags=["otp"])

_JWT_ALG = "HS256"
_JWT_TTL_HOURS = 24


def make_phone_token(phone: str) -> str:
    now = datetime.now(tz=timezone.utc)
    return jwt.encode(
        {
            "sub": phone,
            "type": "phone_verified",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=_JWT_TTL_HOURS)).timestamp()),
        },
        settings.SECRET_KEY,
        algorithm=_JWT_ALG,
    )


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    phone: str


class SendOTPResponse(BaseModel):
    ok: bool


class VerifyOTPRequest(BaseModel):
    phone: str
    code: str


class PriorSession(BaseModel):
    submission_id: str
    answers: dict[str, Any]
    is_complete: bool = False
    status: str = "pending"
    last_page: str | None = None


class VerifyOTPResponse(BaseModel):
    verified: bool
    token: str
    prior_session: PriorSession | None = None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/send", response_model=SendOTPResponse)
async def send_otp_route(body: SendOTPRequest) -> SendOTPResponse:
    digits = body.phone.replace("+91", "").replace(" ", "").strip()
    if len(digits) != 10 or not digits.isdigit():
        raise HTTPException(status_code=422, detail="Enter a valid 10-digit Indian mobile number.")

    try:
        await send_otp(digits)
    except RuntimeError:
        raise HTTPException(
            status_code=503,
            detail="Could not send OTP right now. Try again in a moment.",
        )

    return SendOTPResponse(ok=True)


async def _fetch_prior_session(pool: asyncpg.Pool, digits: str) -> PriorSession | None:
    """Lookup the best prior submission for this phone.

    PREFERS a completed submission over an incomplete one — this fixes
    the "session flush" bug where users who'd already finished the quiz
    were getting routed to /s0 instead of /vibe-box.

    Sequence that caused the bug:
      1. user completes full quiz → row A with is_complete=TRUE
      2. user comes back, enters phone → /quiz/start sees no INCOMPLETE
         row, creates row B with is_complete=FALSE (empty)
      3. /otp/verify previously fetched "most recent overall" → row B
      4. frontend saw is_complete=false → routed to /social-verify
         (or /s0 via splash auto-redirect on a fresh browser)
      5. user lost the entire summary they'd built

    Fix: query for the most recent COMPLETED submission first. If none,
    fall back to the most recent overall (covers true new users + users
    who are mid-quiz).
    """
    async with pool.acquire() as conn:
        # Pass 1: completed submission, if any
        row = await conn.fetchrow(
            """SELECT id, answers, is_complete, status, last_page FROM quiz_submissions
               WHERE phone = $1 AND is_complete = TRUE
               ORDER BY completed_at DESC NULLS LAST, created_at DESC
               LIMIT 1""",
            digits,
        )
        # Pass 2: most recent overall (incomplete or empty)
        if row is None:
            row = await conn.fetchrow(
                """SELECT id, answers, is_complete, status, last_page FROM quiz_submissions
                   WHERE phone = $1
                   ORDER BY created_at DESC
                   LIMIT 1""",
                digits,
            )
    if not row:
        return None
    answers: dict[str, Any] = {}
    raw = row["answers"]
    if raw:
        try:
            answers = json.loads(raw) if isinstance(raw, str) else dict(raw)
        except Exception:
            answers = {}
    return PriorSession(
        submission_id=str(row["id"]),
        answers=answers,
        is_complete=bool(row["is_complete"]),
        status=str(row["status"] or "pending"),
        last_page=row["last_page"],
    )


@router.post("/verify", response_model=VerifyOTPResponse)
async def verify_otp_route(
    body: VerifyOTPRequest,
    pool: asyncpg.Pool = Depends(get_pool),
) -> VerifyOTPResponse:
    """Verify the OTP code with Twilio. Then (only on success) look up
    prior session. Sequential — was previously parallel via create_task but
    the concurrency was making failure modes unpredictable.
    """
    digits = body.phone.replace("+91", "").replace(" ", "").strip()
    if len(digits) != 10 or not digits.isdigit():
        raise HTTPException(status_code=422, detail="Invalid phone number format.")

    # Step 1: verify with Twilio.
    try:
        await verify_otp(digits, body.code.strip())
    except TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Verification took too long. Try again in a moment.",
        )
    except ValueError as exc:
        reason = str(exc) if exc.args else ""
        if reason == "expired":
            raise HTTPException(
                status_code=410,
                detail="That code is no longer valid. Tap 'resend code' to get a new one.",
            )
        raise HTTPException(
            status_code=400,
            detail="Incorrect code. Check your WhatsApp and try again.",
        )

    # Step 2: lookup prior session (non-fatal — verify already succeeded).
    prior: PriorSession | None = None
    try:
        prior = await _fetch_prior_session(pool, digits)
    except Exception as exc:
        logger.warning("otp.prior_lookup_failed", error=str(exc))

    token = make_phone_token(digits)
    logger.info("otp.verified", phone=digits[:4] + "****", has_prior=prior is not None)
    return VerifyOTPResponse(verified=True, token=token, prior_session=prior)

"""Phone OTP endpoints — no auth required.

POST /api/v1/otp/send    — trigger Twilio Verify SMS
POST /api/v1/otp/verify  — check code, create/resume the account, return
                           a session (access + refresh token) + prior session
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.api.deps import get_pool
from app.config import settings
from app.core import metrics
from app.core.otp import otp_bypass_active, send_otp, verify_otp
from app.core.rate_limit import RateLimitUnavailable, check_rate_limit, hash_identifier
from app.core.redis_client import get_redis
from app.core.session import TokenPair, create_session
from app.core.test_fixtures import account_reset_allowed_in_env, reset_test_account, test_phone_role
from app.utils.logger import logger

router = APIRouter(prefix="/otp", tags=["otp"])


def _client_ip(request: Request) -> str:
    """First hop of X-Forwarded-For if present (behind a proxy/LB), else the
    direct peer. Used only as rate-limit key material (hashed), never trusted
    for auth."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _enforce_otp_limit(request: Request, digits: str, phone_limiter: str, ip_limiter: str) -> None:
    """Fail-closed per-phone + per-IP rate limiting on the real OTP path.

    Skipped entirely for bypassed numbers (dev/test/review) — those make no
    Twilio call, so there's nothing to abuse, and skipping keeps dev/test
    login working even when Redis is down. On the real path a Redis outage
    blocks OTP (503) rather than leaving SMS cost / code brute-forcing
    unbounded, matching the reverify endpoints' fail-closed policy."""
    if otp_bypass_active(digits):
        return
    redis = await get_redis()
    for limiter, material in ((phone_limiter, digits), (ip_limiter, _client_ip(request))):
        try:
            result = await check_rate_limit(limiter, hash_identifier(material), redis)
        except RateLimitUnavailable:
            metrics.otp_requests_total.labels(outcome="rate_limit_unavailable").inc()
            raise HTTPException(status_code=503, detail="Could not process the request right now. Try again in a moment.")
        if not result.allowed:
            metrics.otp_requests_total.labels(outcome="rate_limited").inc()
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please wait and try again.",
                headers={"Retry-After": str(result.retry_after)},
            )


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    phone: str


class SendOTPResponse(BaseModel):
    ok: bool


class VerifyOTPRequest(BaseModel):
    phone: str
    code: str
    platform: Literal["ios", "android", "web"]


class PriorSession(BaseModel):
    submission_id: str
    answers: dict[str, Any]
    is_complete: bool = False
    status: str = "pending"
    last_page: str | None = None


class AccountState(BaseModel):
    id: str
    onboarding_state: str
    banned: bool


class VerifyOTPResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: AccountState
    prior_session: PriorSession | None = None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/send", response_model=SendOTPResponse)
async def send_otp_route(body: SendOTPRequest, request: Request) -> SendOTPResponse:
    if settings.OTP_REQUESTS_DISABLED:
        metrics.feature_disabled_rejections_total.labels(feature="otp_request").inc()
        logger.warning("otp.requests_disabled")
        raise HTTPException(status_code=503, detail="New sign-ins are temporarily paused. Try again shortly.")

    digits = body.phone.replace("+91", "").replace(" ", "").strip()
    if len(digits) != 10 or not digits.isdigit():
        raise HTTPException(status_code=422, detail="Enter a valid 10-digit Indian mobile number.")

    await _enforce_otp_limit(request, digits, "otp_request", "otp_request_ip")

    try:
        await send_otp(digits)
    except RuntimeError:
        metrics.otp_requests_total.labels(outcome="send_failed").inc()
        raise HTTPException(
            status_code=503,
            detail="Could not send OTP right now. Try again in a moment.",
        )

    metrics.otp_requests_total.labels(outcome="sent").inc()
    return SendOTPResponse(ok=True)


def _row_to_prior_session(row: dict[str, Any]) -> PriorSession:
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


async def _fetch_prior_session(conn: asyncpg.Connection, user_id: Any) -> PriorSession | None:
    """Lookup the best prior submission owned by this user.

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
    row = await conn.fetchrow(
        """SELECT id, answers, is_complete, status, last_page FROM quiz_submissions
           WHERE user_id = $1 AND is_complete = TRUE
           ORDER BY completed_at DESC NULLS LAST, created_at DESC
           LIMIT 1""",
        user_id,
    )
    if row is None:
        row = await conn.fetchrow(
            """SELECT id, answers, is_complete, status, last_page FROM quiz_submissions
               WHERE user_id = $1
               ORDER BY created_at DESC
               LIMIT 1""",
            user_id,
        )
    if not row:
        return None
    return _row_to_prior_session(row)


@router.post("/verify", response_model=VerifyOTPResponse)
async def verify_otp_route(
    body: VerifyOTPRequest,
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
) -> VerifyOTPResponse:
    """Verify the OTP code with Twilio. Then (only on success) look up
    prior session. Sequential — was previously parallel via create_task but
    the concurrency was making failure modes unpredictable.
    """
    digits = body.phone.replace("+91", "").replace(" ", "").strip()
    if len(digits) != 10 or not digits.isdigit():
        raise HTTPException(status_code=422, detail="Invalid phone number format.")

    await _enforce_otp_limit(request, digits, "otp_verify", "otp_verify_ip")

    # Step 1: verify with Twilio.
    try:
        await verify_otp(digits, body.code.strip())
    except TimeoutError:
        metrics.otp_requests_total.labels(outcome="verify_timeout").inc()
        raise HTTPException(
            status_code=504,
            detail="Verification took too long. Try again in a moment.",
        )
    except RuntimeError:
        # Twilio outage / rate-limit / auth failure — not the user's fault.
        # 503 (not 400) so the client shows "try again" and monitoring sees it.
        metrics.otp_requests_total.labels(outcome="verify_unavailable").inc()
        raise HTTPException(
            status_code=503,
            detail="Couldn't verify the code right now. Try again in a moment.",
        )
    except ValueError as exc:
        reason = str(exc) if exc.args else ""
        if reason == "expired":
            metrics.otp_requests_total.labels(outcome="verify_expired").inc()
            raise HTTPException(
                status_code=410,
                detail="That code is no longer valid. Tap 'resend code' to get a new one.",
            )
        metrics.otp_requests_total.labels(outcome="verify_wrong_code").inc()
        raise HTTPException(
            status_code=400,
            detail="Incorrect code. Check your WhatsApp and try again.",
        )

    # Step 2: upsert the account and issue a session, all in one transaction
    # so a crash mid-way never leaves an orphaned user or a linked-but-
    # sessionless submission.
    async with pool.acquire() as conn:
        async with conn.transaction():
            user_row = await conn.fetchrow(
                "SELECT * FROM users WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = $1 "
                "FOR UPDATE",
                digits,
            )
            if user_row is None:
                user_row = await conn.fetchrow(
                    "INSERT INTO users (phone) VALUES ($1) RETURNING *",
                    digits,
                )
            data = dict(user_row)

            if data["banned"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"code": "account_banned"},
                )

            suspended_until = data.get("suspended_until")
            if suspended_until is not None:
                if suspended_until.tzinfo is None:
                    suspended_until = suspended_until.replace(tzinfo=timezone.utc)
                if suspended_until > datetime.now(tz=timezone.utc):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"code": "account_suspended", "suspended_until": suspended_until.isoformat()},
                    )

            # Link legacy phone-only submissions (pre-dates user_id) to this
            # account. Submissions already linked to a different user are
            # left untouched. Normalized match (last 10 digits) — same idiom
            # as the migration backfill and users lookup above — so this
            # keeps working regardless of how the phone was formatted.
            await conn.execute(
                "UPDATE quiz_submissions SET user_id = $1 "
                "WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = $2 AND user_id IS NULL",
                data["id"], digits,
            )

            # Lets a tester clear the app's local cache, sign back in as the
            # reset test phone, and land on a genuinely fresh quiz every
            # time — including against the deployed review app, where
            # ALLOW_TEST_OTP_IN_PROD is what makes this phone loggable in at
            # all. Without this the account just resumed wherever the SERVER
            # left it (done/error/mid-quiz), since clearing local storage
            # only wipes the DEVICE's copy of that state, never the account
            # row itself.
            if account_reset_allowed_in_env() and test_phone_role(digits) == "reset":
                await reset_test_account(conn, data["id"])
                user_row = await conn.fetchrow("SELECT * FROM users WHERE id = $1 FOR UPDATE", data["id"])
                if user_row is None:
                    raise HTTPException(status_code=500, detail="test account reset failed")
                data = dict(user_row)

            pair: TokenPair = await create_session(conn, data["id"], body.platform)

        # Prior-session lookup is response enrichment only. Run it AFTER the
        # txn commits (same connection) so a hiccup here can neither abort the
        # account/session creation nor be aborted by it — inside the txn a real
        # DB error would poison the transaction and 500 the whole login despite
        # this except. Failure now degrades cleanly to prior=None.
        prior: PriorSession | None = None
        try:
            prior = await _fetch_prior_session(conn, data["id"])
        except Exception as exc:
            logger.warning("otp.prior_lookup_failed", error=str(exc))

    metrics.otp_requests_total.labels(outcome="verified").inc()
    logger.info("otp.verified", phone=digits[:4] + "****", has_prior=prior is not None)
    return VerifyOTPResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        user=AccountState(
            id=str(data["id"]),
            onboarding_state=data["onboarding_state"],
            banned=data["banned"],
        ),
        prior_session=prior,
    )

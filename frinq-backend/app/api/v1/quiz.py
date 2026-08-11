"""Quiz submission endpoints.

POST /quiz/start   — create a tracking row before phone entry (no account —
                      this is the one genuinely pre-OTP anonymous path)
POST /quiz/submit  — save answers + start async AI insights; owner-only (this
                      is the vibe-box fallback when PATCH .../complete fails,
                      so it needs the same guarantees complete does)
PATCH /quiz/partial/{id}  — save progress; owner-only
PATCH /quiz/complete/{id} — finalize + trigger AI insights; owner-only
GET  /quiz/summary/{id}   — poll for status + results; owner-only
POST /quiz/{id}/retry     — requeue an error submission; owner-only, max 3 attempts

Ownership: once OTP verify links a submission to a user_id (app/api/v1/otp.py),
every endpoint above except /start requires a session and filters mutations by
`WHERE id = $1 AND user_id = $2` (submit sets user_id directly on insert
instead), returning 404 (never 403) on a mismatch so a guessed UUID can't be
used to probe for another user's submission.
"""

from __future__ import annotations

import json
import re
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.deps import CurrentAccount, get_current_account, get_optional_account, get_pool
from app.config import settings
from app.core import metrics
from app.core.age_gate import AgeGateError, validate_frinq_dob
from app.core.quiz_config import get_active_quiz_config
from app.core.rate_limit import check_rate_limit, hash_identifier
from app.core.redis_client import get_redis
from app.schemas.quiz import (
    InsightItem,
    QuizStartRequest,
    QuizSubmitRequest,
    QuizSubmitResponse,
    QuizSummaryResponse,
)
from app.utils.logger import logger
from app.workers.queue import enqueue_quiz_insights

router = APIRouter(prefix="/quiz", tags=["quiz"])


def _client_ip(request: Request) -> str:
    """First hop of X-Forwarded-For behind the LB, else the direct peer. Only
    ever hashed rate-limit key material, never trusted for auth. (Same XFF
    caveat as otp._client_ip — a shared trusted-proxy allowlist is the proper
    systemic fix.)"""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_age_gate(answers: dict) -> None:
    """Validate frinq_dob whenever this save includes it — on partial saves
    (as soon as the field appears) and again on completion. Never skipped
    just because a client-side check already ran."""
    dob = answers.get("dob")
    if not dob:
        return
    try:
        validate_frinq_dob(str(dob))
    except AgeGateError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code}) from exc


async def _claim_unowned_submission(conn: asyncpg.Connection, submission_id: UUID, account: CurrentAccount) -> None:
    """Adopt a submission that still has `user_id IS NULL`, but only when its
    phone is the caller's own.

    /quiz/start is pre-auth and inserts an unowned row; OTP verify then
    backfills user_id by phone. That handoff silently stopped covering the
    normal path when the journey was reordered so the quiz begins AFTER auth —
    the backfill has already run by the time the row exists, so it stayed
    unowned forever and every /quiz/complete answered 404 ("Couldn't submit
    your answers") with no way to recover.

    The phone equality is what makes this safe: without it an authenticated
    user could claim any unowned submission by guessing its id. Normalised to
    the last 10 digits, the same rule OTP verify's backfill uses, so both
    agree on what "the same phone" means."""
    digits = re.sub(r"\D", "", account.phone or "")[-10:]
    if not digits:
        return
    await conn.execute(
        """UPDATE quiz_submissions SET user_id = $1, updated_at = now()
           WHERE id = $2 AND user_id IS NULL
             AND RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = $3""",
        account.id, submission_id, digits,
    )


async def _enqueue_or_503(pool: asyncpg.Pool, submission_id: UUID, user_id: UUID) -> str:
    """Enqueues the durable insights job; on Redis being unreachable, marks
    BOTH the user and the submission 'error' and raises 503 instead of leaving
    the account stuck in 'profile_processing' forever.

    The submission reset is unconditional, not just for retry_quiz: retry_quiz
    filters on `WHERE status='error'`, so a failed enqueue that left the row at
    'pending' locked the user out of ever retrying — the exact dead end behind
    the rows sitting at status='pending', error_msg=NULL with the client stuck
    on "Couldn't submit your answers"."""
    job_id = await enqueue_quiz_insights(submission_id)
    if job_id is None:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET onboarding_state = 'error', updated_at = now() WHERE id = $1",
                user_id,
            )
            await conn.execute(
                "UPDATE quiz_submissions SET status = 'error',"
                " error_msg = COALESCE(error_msg, 'queue unavailable'), updated_at = now()"
                " WHERE id = $1",
                submission_id,
            )
        raise HTTPException(status_code=503, detail="queue unavailable, try again")
    return job_id


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/submit", response_model=QuizSubmitResponse, status_code=status.HTTP_201_CREATED)
async def submit_quiz(
    body: QuizSubmitRequest,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> QuizSubmitResponse:
    """Owner-only, same as complete_quiz — this is the vibe-box fallback path
    when a PATCH /quiz/complete/{id} attempt fails, so it needs the identical
    auth/age-gate/durability treatment or it becomes a bypass for all three."""
    redis = await get_redis()
    limit = await check_rate_limit("quiz_submit", str(account.id), redis)
    if not limit.allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many submissions. Please wait and try again.",
            headers={"Retry-After": str(limit.retry_after)},
        )
    _check_age_gate(body.answers)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO quiz_submissions (user_id, phone, answers, is_complete)
               VALUES ($1, $2, $3::jsonb, $4)
               RETURNING id""",
            account.id,
            body.phone,
            json.dumps(body.answers),
            body.is_complete,
        )
    submission_id: UUID = row["id"]
    logger.info("quiz.submitted", submission_id=str(submission_id), is_complete=body.is_complete)

    job_id = None
    if body.is_complete:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET onboarding_state = 'profile_processing', updated_at = now() WHERE id = $1",
                account.id,
            )
        job_id = await _enqueue_or_503(pool, submission_id, account.id)

    return QuizSubmitResponse(submission_id=str(submission_id), status="pending", job_id=job_id)


@router.get("/summary/{submission_id}", response_model=QuizSummaryResponse)
async def get_summary(
    submission_id: str,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> QuizSummaryResponse:
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid submission id")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT status, headline, spirit_animal, spirit_desc,
                      insights, tags, share_card, deep_summary,
                      answers->>'name' AS name
               FROM quiz_submissions WHERE id = $1 AND user_id = $2""",
            uid, account.id,
        )

    if row is None:
        raise HTTPException(status_code=404, detail="submission not found")

    insights_raw = row["insights"]
    if isinstance(insights_raw, str):
        try:
            insights_raw = json.loads(insights_raw)
        except Exception:
            insights_raw = []

    share_card_raw = row["share_card"]
    share_card = json.loads(share_card_raw) if isinstance(share_card_raw, str) else (share_card_raw or None)
    share_quote = (share_card or {}).get("share_quote") if isinstance(share_card, dict) else None

    deep_summary_raw = row["deep_summary"]
    deep_summary = json.loads(deep_summary_raw) if isinstance(deep_summary_raw, str) else (deep_summary_raw or None)

    return QuizSummaryResponse(
        submission_id=submission_id,
        status=row["status"],
        name=row["name"],
        headline=row["headline"],
        archetype=row["spirit_animal"],
        archetype_desc=row["spirit_desc"],
        share_quote=share_quote,
        spirit_animal=row["spirit_animal"],
        spirit_desc=row["spirit_desc"],
        insights=[InsightItem(**i) for i in (insights_raw or []) if isinstance(i, dict)],
        tags=list(row["tags"] or []),
        share_card=share_card,
        deep_summary=deep_summary,
    )


@router.patch("/partial/{submission_id}", status_code=200)
async def save_partial(
    submission_id: str,
    body: QuizSubmitRequest,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Save partial answers mid-quiz so nothing is lost if user drops off."""
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid submission id")

    _check_age_gate(body.answers)

    async with pool.acquire() as conn:
        result = await conn.execute(
            """UPDATE quiz_submissions
               SET answers = $3::jsonb, last_page = COALESCE($4, last_page), updated_at = now()
               WHERE id = $1 AND user_id = $2""",
            uid,
            account.id,
            json.dumps(body.answers),
            body.last_page,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="submission not found")

    return {"ok": True}


@router.get("/config")
async def get_quiz_config(pool: asyncpg.Pool = Depends(get_pool)) -> dict:
    async with pool.acquire() as conn:
        return await get_active_quiz_config(conn)


@router.post("/start", status_code=status.HTTP_201_CREATED)
async def start_quiz(
    request: Request,
    body: QuizStartRequest,
    account: CurrentAccount | None = Depends(get_optional_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Create an initial tracking record as soon as user enters their phone
    so drop-offs between phone-entry and OTP-verify still appear in admin.

    If the same phone already has a recent incomplete submission (last 24h),
    return that id instead of creating a duplicate.
    """
    if settings.QUIZ_STARTS_DISABLED:
        metrics.feature_disabled_rejections_total.labels(feature="quiz_start").inc()
        logger.warning("quiz.starts_disabled")
        raise HTTPException(status_code=503, detail="New quizzes are temporarily paused. Try again shortly.")

    # Pre-auth, accepts an arbitrary phone, and reuses an existing submission
    # per phone/24h — without a cap that's a bulk phone-enumeration oracle.
    # IP-keyed (no session exists yet here).
    redis = await get_redis()
    ip_limit = await check_rate_limit("quiz_start_ip", hash_identifier(_client_ip(request)), redis)
    if not ip_limit.allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please wait and try again.",
            headers={"Retry-After": str(ip_limit.retry_after)},
        )

    async with pool.acquire() as conn:
        if body.phone:
            existing = await conn.fetchrow(
                """SELECT id FROM quiz_submissions
                   WHERE phone = $1 AND is_complete = FALSE
                   AND created_at > now() - interval '24 hours'
                   ORDER BY created_at DESC LIMIT 1""",
                body.phone,
            )
            if existing:
                # Reused rows get the same ownership treatment as new ones,
                # for the case where the row predates the caller's session.
                if account is not None:
                    await _claim_unowned_submission(conn, existing["id"], account)
                logger.info("quiz.start_reused", submission_id=str(existing["id"]))
                return {"submission_id": str(existing["id"])}

        # user_id when we already know who's asking. This endpoint is still
        # anonymous-capable (it runs before OTP for a first-time user, where
        # the phone backfill at verify is what links the row) — but the quiz
        # now starts AFTER auth, and leaving those rows unowned is what made
        # /quiz/complete 404 forever. See _claim_unowned_submission.
        row = await conn.fetchrow(
            """INSERT INTO quiz_submissions (user_id, phone, answers, is_complete)
               VALUES ($1, $2, '{}'::jsonb, FALSE)
               RETURNING id""",
            account.id if account else None,
            body.phone,
        )
    submission_id = str(row["id"])
    logger.info("quiz.started", submission_id=submission_id)
    return {"submission_id": submission_id}


@router.patch("/complete/{submission_id}", status_code=202)
async def complete_quiz(
    submission_id: str,
    body: QuizSubmitRequest,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Mark an existing partial submission as complete and enqueue the
    durable insights job — no FastAPI BackgroundTask, no in-process work
    that a restart could silently drop."""
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid submission id")

    _check_age_gate(body.answers)

    async with pool.acquire() as conn:
        await _claim_unowned_submission(conn, uid, account)
        current = await conn.fetchrow(
            "SELECT status FROM quiz_submissions WHERE id = $1 AND user_id = $2",
            uid, account.id,
        )
    if current is None:
        raise HTTPException(status_code=404, detail="submission not found")
    if current["status"] in ("processing", "done"):
        # Already durably in-flight or finished — resetting to 'pending' and
        # re-enqueuing here would defeat generate_quiz_insights' own
        # idempotency guard and risk desyncing an already-active user if the
        # model returns a different archetype on a rerun. No-op instead.
        return {"submission_id": submission_id, "status": current["status"], "job_id": None}

    async with pool.acquire() as conn:
        result = await conn.execute(
            """UPDATE quiz_submissions
               SET answers=$3::jsonb, is_complete=TRUE, status='pending',
                   updated_at=now()
               WHERE id=$1 AND user_id=$2""",
            uid,
            account.id,
            json.dumps(body.answers),
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="submission not found")

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET onboarding_state = 'profile_processing', updated_at = now() WHERE id = $1",
            account.id,
        )

    job_id = await _enqueue_or_503(pool, uid, account.id)
    logger.info("quiz.completed", submission_id=submission_id, job_id=job_id)
    return {"submission_id": submission_id, "status": "pending", "job_id": job_id}


_MAX_RETRIES = 3


@router.post("/{submission_id}/retry", status_code=202)
async def retry_quiz(
    submission_id: str,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Requeue a submission that failed durable processing. Only the owner
    may retry, only while status='error' (an active/processing submission
    can't be duplicated this way), and only up to 3 total attempts."""
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid submission id")

    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT retry_count FROM quiz_submissions "
                "WHERE id = $1 AND user_id = $2 AND status = 'error' FOR UPDATE",
                uid, account.id,
            )
            if row is None:
                raise HTTPException(status_code=404, detail="submission not found or not in error state")
            if row["retry_count"] >= _MAX_RETRIES:
                raise HTTPException(status_code=429, detail="retry limit reached")

            await conn.execute(
                "UPDATE quiz_submissions SET status='pending', error_msg=NULL, "
                "retry_count = retry_count + 1, updated_at = now() WHERE id = $1",
                uid,
            )
            await conn.execute(
                "UPDATE users SET onboarding_state = 'profile_processing', updated_at = now() WHERE id = $1",
                account.id,
            )

    job_id = await _enqueue_or_503(pool, uid, account.id)
    logger.info("quiz.retried", submission_id=submission_id, job_id=job_id)
    return {"submission_id": submission_id, "status": "pending", "job_id": job_id}

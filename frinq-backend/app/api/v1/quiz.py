"""Quiz submission endpoints.

POST /quiz/start   — create a tracking row before phone entry (no account —
                      this is the one genuinely pre-OTP anonymous path)
POST /quiz/submit  — save answers + start async AI insights; owner-only (this
                      is the vibe-box fallback when PATCH .../complete fails,
                      so it needs the same guarantees complete does)
PATCH /quiz/partial/{id}  — save progress; owner-only
PATCH /quiz/complete/{id} — finalize + trigger AI insights; owner-only
GET  /quiz/summary/{id}   — poll for status + results; owner-only

Ownership: once OTP verify links a submission to a user_id (app/api/v1/otp.py),
every endpoint above except /start requires a session and filters mutations by
`WHERE id = $1 AND user_id = $2` (submit sets user_id directly on insert
instead), returning 404 (never 403) on a mismatch so a guessed UUID can't be
used to probe for another user's submission.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.api.deps import CurrentAccount, get_current_account, get_pool
from app.core.age_gate import AgeGateError, validate_frinq_dob
from app.core.ai.insights import generate_insights
from app.core.ai.openai_client import generate_deep_report
from app.schemas.quiz import (
    InsightItem,
    QuizStartRequest,
    QuizSubmitRequest,
    QuizSubmitResponse,
    QuizSummaryResponse,
)
from app.utils.logger import logger

router = APIRouter(prefix="/quiz", tags=["quiz"])


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


# ─── Background AI task ──────────────────────────────────────────────────────

async def _run_insights(submission_id: UUID, answers: dict[str, Any], pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE quiz_submissions SET status='processing', updated_at=now() WHERE id=$1",
            submission_id,
        )
    try:
        # Run the hero-card profile and the deep report concurrently. Both
        # are OpenAI-backed by default (see settings.INSIGHTS_PROVIDER to
        # switch the profile call back to Claude).
        insights_task = asyncio.create_task(generate_insights(answers))
        deep_summary_task = asyncio.create_task(generate_deep_report(answers))

        result, deep_summary = await asyncio.gather(insights_task, deep_summary_task, return_exceptions=True)

        if isinstance(result, Exception):
            raise result

        deep_summary_result = deep_summary if not isinstance(deep_summary, Exception) else None
        if isinstance(deep_summary, Exception):
            logger.error("quiz.deep_summary_failed", submission_id=str(submission_id), error=str(deep_summary))

        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE quiz_submissions SET
                    status       = 'done',
                    headline     = $2,
                    spirit_animal = $3,
                    spirit_desc  = $4,
                    insights     = $5::jsonb,
                    tags         = $6,
                    share_card   = $7::jsonb,
                    deep_summary = $8::jsonb,
                    completed_at = now(),
                    updated_at   = now()
                WHERE id = $1""",
                submission_id,
                result.get("headline"),
                result.get("spirit_animal"),
                result.get("spirit_desc"),
                json.dumps(result.get("insights", [])),
                result.get("tags", []),
                json.dumps(result.get("share_card") or {}),
                json.dumps(deep_summary_result) if deep_summary_result else None,
            )
        logger.info("quiz.insights_done", submission_id=str(submission_id))
    except Exception as exc:
        logger.error("quiz.insights_failed", submission_id=str(submission_id), error=str(exc))
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE quiz_submissions SET status='error', error_msg=$2, updated_at=now() WHERE id=$1",
                submission_id,
                str(exc),
            )


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/submit", response_model=QuizSubmitResponse, status_code=status.HTTP_201_CREATED)
async def submit_quiz(
    body: QuizSubmitRequest,
    background_tasks: BackgroundTasks,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> QuizSubmitResponse:
    """Owner-only, same as complete_quiz — this is the vibe-box fallback path
    when a PATCH /quiz/complete/{id} attempt fails, so it needs the identical
    auth/age-gate treatment or it becomes a bypass for both."""
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

    # Only generate insights for complete submissions
    if body.is_complete:
        background_tasks.add_task(_run_insights, submission_id, body.answers, pool)

    return QuizSubmitResponse(submission_id=str(submission_id), status="pending")


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


@router.post("/start", status_code=status.HTTP_201_CREATED)
async def start_quiz(
    body: QuizStartRequest,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Create an initial tracking record as soon as user enters their phone
    so drop-offs between phone-entry and OTP-verify still appear in admin.

    If the same phone already has a recent incomplete submission (last 24h),
    return that id instead of creating a duplicate.
    """
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
                logger.info("quiz.start_reused", submission_id=str(existing["id"]))
                return {"submission_id": str(existing["id"])}

        row = await conn.fetchrow(
            """INSERT INTO quiz_submissions (phone, answers, is_complete)
               VALUES ($1, '{}'::jsonb, FALSE)
               RETURNING id""",
            body.phone,
        )
    submission_id = str(row["id"])
    logger.info("quiz.started", submission_id=submission_id)
    return {"submission_id": submission_id}


@router.patch("/complete/{submission_id}", status_code=200)
async def complete_quiz(
    submission_id: str,
    body: QuizSubmitRequest,
    background_tasks: BackgroundTasks,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Mark an existing partial submission as complete and trigger AI insights."""
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid submission id")

    _check_age_gate(body.answers)

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

    background_tasks.add_task(_run_insights, uid, body.answers, pool)
    logger.info("quiz.completed", submission_id=submission_id)
    return {"ok": True, "submission_id": submission_id, "status": "pending"}

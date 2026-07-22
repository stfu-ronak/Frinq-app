from __future__ import annotations

import json

import asyncpg
from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_current_user, get_pool
from app.schemas.questionnaire import (
    QuestionnaireStatusResponse,
    QuestionnaireSubmitRequest,
    QuestionnaireSubmitResponse,
)
from app.utils.logger import logger
from app.workers.queue import enqueue_build_profile

router = APIRouter(prefix="/questionnaire", tags=["questionnaire"])


@router.post("/submit", response_model=QuestionnaireSubmitResponse)
async def submit(
    body: QuestionnaireSubmitRequest,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> QuestionnaireSubmitResponse:
    answers_json = json.dumps(body.answers.model_dump(mode="json", exclude_none=False))
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO questionnaire_responses (user_id, version, answers)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (user_id) DO UPDATE
              SET version = EXCLUDED.version,
                  answers = EXCLUDED.answers,
                  submitted_at = now()
            RETURNING id, submitted_at
            """,
            user.id,
            body.version,
            answers_json,
        )

    job_id = await enqueue_build_profile(user.id)
    logger.info(
        "questionnaire.submit",
        user_id=str(user.id),
        response_id=str(row["id"]),
        job_id=job_id,
    )
    return QuestionnaireSubmitResponse(
        response_id=row["id"],
        submitted_at=row["submitted_at"],
        job_id=job_id,
    )


@router.get("/status", response_model=QuestionnaireStatusResponse)
async def status_endpoint(
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> QuestionnaireStatusResponse:
    async with pool.acquire() as conn:
        qr = await conn.fetchrow(
            "SELECT submitted_at FROM questionnaire_responses WHERE user_id = $1",
            user.id,
        )
        profile = await conn.fetchrow(
            "SELECT ai_summary FROM user_profiles WHERE user_id = $1",
            user.id,
        )
    return QuestionnaireStatusResponse(
        has_submitted=qr is not None,
        submitted_at=qr["submitted_at"] if qr else None,
        profile_ready=bool(profile and profile["ai_summary"]),
    )

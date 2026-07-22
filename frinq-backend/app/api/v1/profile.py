from __future__ import annotations

from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentUser, get_current_user, get_pool
from app.schemas.profile import (
    ProfileMeResponse,
    ProfileRebuildResponse,
    ProfileSummaryResponse,
)
from app.utils.logger import logger
from app.workers.queue import enqueue_build_profile

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/me", response_model=ProfileMeResponse)
async def get_me(
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> ProfileMeResponse:
    async with pool.acquire() as conn:
        # Pull every column except the raw embedding vector — clients don't need
        # the 1024-dim array and serialising it is wasted bandwidth.
        row = await conn.fetchrow(
            """
            SELECT id, user_id, primary_goals, secondary_goals,
                   openness, conscientiousness, extraversion, agreeableness, neuroticism,
                   honesty_humility,
                   connection_anxiety, connection_avoidance, reliability, bonding_style,
                   val_self_direction, val_stimulation, val_achievement, val_security,
                   val_tradition, val_universalism, openness_to_change, conservation,
                   loved_activities, open_to_try, anti_preferences, activity_archetype,
                   "riasec_R", "riasec_I", "riasec_A", "riasec_S", "riasec_E", "riasec_C",
                   affiliative_humor, self_enhancing_humor, aggressive_humor,
                   directness, depth_preference,
                   chronotype, group_pref, drinks, smokes,
                   drinks_tolerance, smokes_tolerance, diet, languages,
                   ai_summary, latent_tags, vibe_check_raw,
                   social_type, saturday_archetype, substance_scene,
                   connection_signals, red_flags, red_flag_normalised,
                   show_up_style, looking_for_text, hobbies_text,
                   storytime_transcript, rapid_fire,
                   slider_depth, slider_fun_get, slider_frequency,
                   extraction_confidence,
                   meetups_attended, meetups_no_show,
                   created_at, updated_at
            FROM user_profiles WHERE user_id = $1
            """,
            user.id,
        )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="profile not built yet",
        )
    return ProfileMeResponse.model_validate(dict(row))


@router.get("/me/summary", response_model=ProfileSummaryResponse)
async def get_summary(
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> ProfileSummaryResponse:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT ai_summary, latent_tags, updated_at "
            "FROM user_profiles WHERE user_id = $1",
            user.id,
        )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="profile not built yet",
        )
    return ProfileSummaryResponse(
        user_id=user.id,
        ai_summary=row["ai_summary"],
        latent_tags=list(row["latent_tags"] or []),
        updated_at=row["updated_at"],
    )


@router.post("/rebuild", response_model=ProfileRebuildResponse)
async def rebuild(
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> ProfileRebuildResponse:
    async with pool.acquire() as conn:
        qr = await conn.fetchrow(
            "SELECT 1 FROM questionnaire_responses WHERE user_id = $1",
            user.id,
        )
    if qr is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="no questionnaire submission to rebuild from",
        )
    job_id = await enqueue_build_profile(user.id)
    logger.info("profile.rebuild", user_id=str(user.id), job_id=job_id)
    return ProfileRebuildResponse(
        user_id=user.id,
        job_id=job_id,
        queued_at=datetime.now(timezone.utc),
    )

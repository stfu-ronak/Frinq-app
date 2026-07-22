"""ARQ background task: generate_quiz_insights

Durable replacement for the old FastAPI-BackgroundTask `_run_insights`.
Sequence (see Phase 2 Task 8 of the launch plan):

  1. Lock the submission row.
  2. Return immediately if already done with a membership (idempotent replay).
  3. Reuse a stored usable result if present (skip model calls); otherwise
     mark submission processing / user profile_processing.
  4. Run generate_insights + generate_deep_report outside any open
     transaction (slow AI calls) when a usable result was absent.
  5. Validate the final share_card.archetype_slug against the taxonomy —
     never accept arbitrary model output.
  6-10. One transaction: update quiz_submissions, assign the single
     community membership, set users.onboarding_state='active', commit.

Any failure at any step: sanitized short error code only (never full
questionnaire/model content — ARQ's own exception logging covers debugging),
submission status='error', user onboarding_state='error'.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from app.core.ai.archetypes import get_archetype
from app.core.ai.insights import generate_insights
from app.core.ai.openai_client import generate_deep_report
from app.core.communities import assign_user_to_community, get_user_community
from app.database import get_pool
from app.utils.logger import logger


def _parse_jsonb(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return None
    return value


def _error_code(exc: Exception) -> str:
    """The exception TYPE name only — never str(exc). Model-call errors
    (see app/core/ai/openai_client.py) embed raw model output, which is
    built from the user's quiz answers, directly in their message text.
    ARQ's own crash logging is where full tracebacks belong; error_msg and
    our own logger.error calls must never carry that content."""
    return type(exc).__name__


async def _mark_error(pool: Any, submission_id: UUID, user_id: UUID, error_code: str) -> None:
    sanitized = error_code[:200]
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE quiz_submissions SET status='error', error_msg=$2, updated_at=now() WHERE id=$1",
                submission_id, sanitized,
            )
            await conn.execute(
                "UPDATE users SET onboarding_state='error', updated_at=now() WHERE id=$1",
                user_id,
            )
    logger.error("quiz_insights.failed", submission_id=str(submission_id), error_code=sanitized)


async def generate_quiz_insights(ctx: dict[str, Any], submission_id: str) -> None:
    sid = UUID(submission_id)
    pool = get_pool()

    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT id, user_id, answers, status, share_card, headline, spirit_animal, "
                "spirit_desc, insights, tags, deep_summary FROM quiz_submissions "
                "WHERE id = $1 FOR UPDATE",
                sid,
            )
            if row is None:
                logger.warning("quiz_insights.no_submission", submission_id=submission_id)
                return
            user_id: UUID | None = row["user_id"]
            if user_id is None:
                logger.warning("quiz_insights.unowned_submission", submission_id=submission_id)
                return

            if row["status"] == "done":
                membership = await get_user_community(conn, user_id)
                if membership is not None:
                    return  # already fully processed — idempotent replay

            share_card = _parse_jsonb(row["share_card"])
            usable_result = row["status"] == "done" and bool(share_card and share_card.get("archetype_slug"))

            if usable_result:
                result: dict[str, Any] = {
                    "headline": row["headline"],
                    "spirit_animal": row["spirit_animal"],
                    "spirit_desc": row["spirit_desc"],
                    "insights": _parse_jsonb(row["insights"]) or [],
                    "tags": list(row["tags"] or []),
                    "share_card": share_card,
                }
                deep_summary_result = _parse_jsonb(row["deep_summary"])
            else:
                await conn.execute(
                    "UPDATE quiz_submissions SET status='processing', updated_at=now() WHERE id=$1",
                    sid,
                )
                await conn.execute(
                    "UPDATE users SET onboarding_state='profile_processing', updated_at=now() WHERE id=$1",
                    user_id,
                )

            answers = _parse_jsonb(row["answers"]) or {}

    if not usable_result:
        try:
            insights_task = asyncio.create_task(generate_insights(answers))
            deep_summary_task = asyncio.create_task(generate_deep_report(answers))
            gathered_result, gathered_deep_summary = await asyncio.gather(
                insights_task, deep_summary_task, return_exceptions=True
            )
            if isinstance(gathered_result, Exception):
                raise gathered_result
            result = gathered_result
            deep_summary_result = (
                gathered_deep_summary if not isinstance(gathered_deep_summary, Exception) else None
            )
            if isinstance(gathered_deep_summary, Exception):
                logger.error(
                    "quiz_insights.deep_summary_failed",
                    submission_id=submission_id, error_type=type(gathered_deep_summary).__name__,
                )
        except Exception as exc:
            await _mark_error(pool, sid, user_id, _error_code(exc))
            return

    share_card = result.get("share_card") or {}
    slug = share_card.get("archetype_slug")
    if not slug or get_archetype(slug) is None:
        await _mark_error(pool, sid, user_id, "invalid_archetype")
        return

    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """UPDATE quiz_submissions SET
                        status = 'done',
                        headline = $2,
                        spirit_animal = $3,
                        spirit_desc = $4,
                        insights = $5::jsonb,
                        tags = $6,
                        share_card = $7::jsonb,
                        deep_summary = $8::jsonb,
                        archetype_slug = $9,
                        completed_at = now(),
                        updated_at = now()
                    WHERE id = $1""",
                    sid,
                    result.get("headline"),
                    result.get("spirit_animal"),
                    result.get("spirit_desc"),
                    json.dumps(result.get("insights", [])),
                    result.get("tags", []),
                    json.dumps(share_card),
                    json.dumps(deep_summary_result) if deep_summary_result else None,
                    slug,
                )
                await assign_user_to_community(conn, user_id, slug)
                await conn.execute(
                    "UPDATE users SET onboarding_state = 'active', updated_at = now() WHERE id = $1",
                    user_id,
                )
    except Exception as exc:
        # Deliberately broad: a DB error, a lost connection, or a race on
        # community_members' UNIQUE constraint must still land the
        # submission/user in 'error' with a retry path — never left stuck
        # in 'processing'/'profile_processing' forever. UnknownArchetypeError
        # and CommunityAssignmentError are expected business-logic failures;
        # anything else is unexpected but must be handled identically.
        await _mark_error(pool, sid, user_id, _error_code(exc))
        return

    logger.info("quiz_insights.done", submission_id=submission_id, archetype_slug=slug)

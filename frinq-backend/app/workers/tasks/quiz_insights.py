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

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.ai.archetypes import get_archetype
from app.core.ai.page2_summary import generate_page2_summary_with_fallback
from app.core.ai.insights import generate_insights as _ORIGINAL_GENERATE_INSIGHTS
from app.core.ai.model_config import InvalidModelConfigError, get_active_model_config
from app.core.ai.model_pricing import compute_cost
from app.core.ai.openai_client import generate_deep_report as _ORIGINAL_GENERATE_DEEP_REPORT
from app.core.ai.transcription import transcribe_submission_voice_clips
from app.core.communities import assign_user_to_community, get_user_community
from app.core import metrics
from app.database import get_pool
from app.utils.logger import logger

# A row sitting at status='processing' longer than this is not in flight — it
# was stranded by a worker that died without running its handlers. Must stay
# comfortably ABOVE WorkerSettings.job_timeout (420s), or a healthy but slow
# job could be reclaimed underneath itself and billed twice.
STALE_PROCESSING_AFTER_S = 900

# Explicit injection seams for existing worker adapters. Production leaves
# these untouched and uses the combined one-call generator.
generate_insights = _ORIGINAL_GENERATE_INSIGHTS
generate_deep_report = _ORIGINAL_GENERATE_DEEP_REPORT


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


def _make_usage_recorder(pool: Any, submission_id: UUID, step: str, config: dict[str, Any]):
    """Closure capturing the snapshotted provider/model/effort for one
    generation step — each actual provider call (insights or deep_report)
    inserts its own ai_usage_log row via this, computed against whatever
    model was active when the job snapshotted it, never the current live
    admin config."""
    async def _record(input_tokens: int, output_tokens: int) -> None:
        try:
            cost = compute_cost(config["model_id"], input_tokens, output_tokens)
        except ValueError:
            # Unknown model_id (e.g. a stale snapshot from before a model was
            # retired from model_pricing) — log the usage without a cost
            # rather than losing the row or crashing the generation.
            cost = 0.0
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO ai_usage_log
                    (submission_id, step, provider, model_id, effort, input_tokens, output_tokens, cost_usd)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                submission_id, step, config["provider"], config["model_id"], config["effort"],
                input_tokens, output_tokens, cost,
            )
    return _record


async def _generate_summary(
    answers: dict[str, Any],
    *,
    primary_config: dict[str, Any],
    fallback_config: dict[str, Any],
    primary_usage_recorder: Any,
    fallback_usage_recorder: Any,
    submission_id: str | None = None,
    transcripts: dict[str, str] | None = None,
) -> dict[str, Any]:
    # Existing tests/adapters can inject legacy callables. Normal runtime uses
    # the page2 two-stage pipeline with fallback handled by page2_summary.
    if generate_insights is not _ORIGINAL_GENERATE_INSIGHTS or generate_deep_report is not _ORIGINAL_GENERATE_DEEP_REPORT:
        result = await generate_insights(
            answers, model_config=primary_config, usage_recorder=primary_usage_recorder
        )
        try:
            deep = await generate_deep_report(
                answers, model_config=fallback_config, usage_recorder=fallback_usage_recorder
            )
        except Exception:
            deep = None
        result = dict(result)
        result["deep_summary"] = deep
        result["_ai_route"] = "primary"
        return result
    return await generate_page2_summary_with_fallback(
        answers,
        primary_config=primary_config,
        fallback_config=fallback_config,
        primary_usage_recorder=primary_usage_recorder,
        fallback_usage_recorder=fallback_usage_recorder,
        submission_id=submission_id,
        transcripts=transcripts,
    )


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
    metrics.quiz_jobs_total.labels(outcome="failed").inc()
    logger.error("quiz_insights.failed", submission_id=str(submission_id), error_code=sanitized)


async def generate_quiz_insights(ctx: dict[str, Any], submission_id: str) -> None:
    sid = UUID(submission_id)
    pool = get_pool()

    enqueue_time = ctx.get("enqueue_time")
    if isinstance(enqueue_time, datetime):
        if enqueue_time.tzinfo is None:
            enqueue_time = enqueue_time.replace(tzinfo=timezone.utc)
        metrics.quiz_job_wait_seconds.observe((datetime.now(timezone.utc) - enqueue_time).total_seconds())

    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT id, user_id, answers, status, share_card, headline, spirit_animal, "
                    "spirit_desc, insights, tags, deep_summary, "
                    # Age of the row's last write, used below to tell a job
                    # that is genuinely in flight from one that was stranded.
                    "EXTRACT(EPOCH FROM (now() - updated_at)) AS updated_age_s "
                    "FROM quiz_submissions "
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

                if row["status"] == "processing":
                    # Another job for this submission is already mid-flight (e.g. a
                    # double-tapped /quiz/complete enqueued two jobs). The FOR UPDATE
                    # lock serialises us behind that job's first txn, so seeing
                    # 'processing' means "in flight, skip" — running the paid AI
                    # calls again would double-charge and can reclassify the user.
                    #
                    # UNLESS the row is stale. A worker killed hard (OOM, deploy
                    # restart, or ARQ's own job_timeout, which raises
                    # CancelledError — a BaseException that our `except Exception`
                    # handlers below never caught) leaves the row at 'processing'
                    # forever: /quiz/retry only accepts status='error', and the
                    # admin retry_ai no-ops on 'processing', so nothing could ever
                    # move it and the user's onboarding stuck at
                    # profile_processing permanently. Past the job timeout no
                    # legitimate job can still be running, so take the row over
                    # rather than skipping it.
                    age_s = float(row["updated_age_s"] or 0.0)
                    if age_s < STALE_PROCESSING_AFTER_S:
                        logger.info("quiz_insights.already_processing", submission_id=submission_id)
                        return
                    logger.warning(
                        "quiz_insights.reclaiming_stale_processing",
                        submission_id=submission_id,
                        age_s=round(age_s),
                    )

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
                    # Snapshot the ACTIVE model config now, once, before any AI call —
                    # this is what makes "admin switches model mid-flight" safe. This
                    # job reads model_config only here; it never re-reads it, so a
                    # later admin PATCH to ai_model_config cannot affect a job already
                    # past this point, including across its own internal retries. A
                    # missing/invalid config row (InvalidModelConfigError) is caught
                    # below, outside the transaction, and routed to _mark_error —
                    # never left to propagate and strand the row silently.
                    # Product exposes one logical summary model. Existing DB rows
                    # remain compatible: insights is primary, deep_report is the
                    # validated fallback configured by the unified Admin UI.
                    insights_config = await get_active_model_config(conn, "insights")
                    deep_report_config = await get_active_model_config(conn, "deep_report")
                    await conn.execute(
                        "UPDATE quiz_submissions SET status='processing', model_snapshot=$2::jsonb, updated_at=now() WHERE id=$1",
                        sid, json.dumps({
                            "primary": insights_config,
                            "fallback": deep_report_config,
                            # Compatibility aliases for existing admin exports.
                            "insights": insights_config,
                            "deep_report": deep_report_config,
                        }, default=str),
                    )
                    await conn.execute(
                        "UPDATE users SET onboarding_state='profile_processing', updated_at=now() WHERE id=$1",
                        user_id,
                    )

                answers = _parse_jsonb(row["answers"]) or {}
    except InvalidModelConfigError as exc:
        await _mark_error(pool, sid, user_id, _error_code(exc))
        return

    if not usable_result:
        try:
            # Best-effort: a Whisper outage must not fail the whole
            # generation job — transcribe_submission_voice_clips already
            # swallows per-clip failures, so this only raises on something
            # structural (DB down), which the outer except already handles
            # the same as any other generation failure.
            transcripts = await transcribe_submission_voice_clips(pool, sid)
            insights_recorder = _make_usage_recorder(pool, sid, "insights", insights_config)
            fallback_recorder = _make_usage_recorder(pool, sid, "deep_report", deep_report_config)
            result = await _generate_summary(
                answers,
                primary_config=insights_config,
                fallback_config=deep_report_config,
                primary_usage_recorder=insights_recorder,
                fallback_usage_recorder=fallback_recorder,
                submission_id=submission_id,
                transcripts=transcripts,
            )
            ai_route = result.pop("_ai_route", "primary")
            deep_summary_result = result.get("deep_summary")
            logger.info("quiz_insights.generated", submission_id=submission_id, route=ai_route)
        except Exception as exc:
            await _mark_error(pool, sid, user_id, _error_code(exc))
            return
        except BaseException:
            # ARQ enforces job_timeout by CANCELLING the task, and
            # asyncio.CancelledError is a BaseException — so the handler above
            # never saw it and the row stayed at 'processing' forever. Mark it
            # error so the ordinary retry paths can pick it up, then re-raise:
            # cancellation must never be swallowed, ARQ still needs to see the
            # task die so it can retry or give up.
            await _mark_error(pool, sid, user_id, "job_cancelled")
            raise

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
                # Backfill the profile columns from the quiz answers, but only
                # where they are still NULL — COALESCE means an explicit value
                # the user set via PATCH /users/me always wins, and a re-run
                # can never overwrite it.
                #
                # These columns are otherwise written ONLY by PATCH /users/me
                # during onboarding, while the summary reads the name from
                # quiz answers instead. Two sources for the same fact: if that
                # PATCH ever fails or is skipped, the app happily greets the
                # user by name on the summary while their profile shows
                # "your profile" and a column of em-dashes, permanently, with
                # no path to self-heal.
                # gender is guarded by an inner CHECK-matching filter, NOT
                # written raw: users.gender has CHECK (gender IN
                # ('male','female','non_binary','other')), so an answer
                # outside that set would raise CheckViolationError *inside
                # this final transaction* and dump an otherwise-successful,
                # already-paid-for summary into 'error'. A backfill must never
                # be able to fail the job it is decorating.
                #
                # ncr_zone is deliberately NOT backfilled: it is a constrained
                # NCR-only enum ('gurgaon','south_delhi',...) while the quiz's
                # city list includes Mumbai/Pune/Bangalore, which have no valid
                # value at all. Guessing a mapping would write wrong data; the
                # profile's Area stays blank until the user sets it.
                await conn.execute(
                    """UPDATE users SET
                        onboarding_state = 'active',
                        display_name = COALESCE(display_name, NULLIF(TRIM($2), '')),
                        gender = COALESCE(
                            gender,
                            (SELECT g FROM (SELECT LOWER(TRIM($3)) AS g) s
                              WHERE s.g IN ('male','female','non_binary','other'))
                        ),
                        updated_at = now()
                       WHERE id = $1""",
                    user_id,
                    str(answers.get("name") or ""),
                    str(answers.get("gender") or ""),
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

    metrics.quiz_jobs_total.labels(outcome="done").inc()
    logger.info("quiz_insights.done", submission_id=submission_id, archetype_slug=slug)

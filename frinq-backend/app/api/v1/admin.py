"""Admin endpoints — protected by Authorization: Bearer <ADMIN_KEY>."""

from __future__ import annotations

import csv
import hmac
import io
import json
from datetime import datetime
from time import time
from typing import Any
from uuid import UUID, uuid4

import asyncpg
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field, field_validator

import asyncio

from app.api.deps import get_pool
from app.api.deps import require_admin as _require_admin
from app.config import settings
from app.core.export.raw_responses import to_csv as raw_to_csv
from app.core.export.raw_responses import to_xlsx as raw_to_xlsx
from app.core.push import remove_all_for_user as remove_all_push_tokens_for_user
from app.core.realtime import publish_ban_event
from app.core.redis_client import get_redis
from app.core.session import revoke_all_sessions
from app.utils.logger import logger
from app.workers.queue import enqueue_quiz_insights

router = APIRouter(prefix="/admin", tags=["admin"])

_analytics_cache: dict[str, Any] = {}
_analytics_cache_ts: float = 0.0
_ANALYTICS_TTL = 60.0


def _require_action_password(
    x_action_password: str | None = Header(default=None, alias="X-Action-Password"),
) -> None:
    """Second-factor for destructive actions — X-Action-Password header only."""
    expected = settings.ADMIN_ACTION_PASSWORD
    provided = x_action_password or ""
    if not expected or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid action password")


# ─── Submissions ──────────────────────────────────────────────────────────────

@router.get("/submissions", dependencies=[Depends(_require_admin)])
async def list_submissions(
    pool: asyncpg.Pool = Depends(get_pool),
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0, ge=0),
    complete_only: bool = Query(default=False),
    status_filter: str = Query(default="", alias="status"),
    search: str = Query(default=""),
) -> dict[str, Any]:
    conditions: list[str] = []
    filter_params: list[Any] = []

    if complete_only:
        conditions.append("is_complete = TRUE")
    if status_filter in ("done", "processing", "error", "pending"):
        filter_params.append(status_filter)
        conditions.append(f"status = ${len(filter_params)}")
    if search:
        filter_params.append(f"%{search}%")
        idx = len(filter_params)
        conditions.append(
            f"(answers->>'name' ILIKE ${idx} OR answers->>'city' ILIKE ${idx} OR phone ILIKE ${idx})"
        )
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    limit_p = len(filter_params) + 1
    offset_p = len(filter_params) + 2

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT id, phone, is_complete, status, headline, spirit_animal,
                       tags, answers, insights, last_page, share_card,
                       admin_notes, is_test, is_approved,
                       whatsapp_sent_at, followup_sent_at,
                       created_at, completed_at, updated_at, error_msg
                FROM quiz_submissions
                {where}
                ORDER BY created_at DESC
                LIMIT ${limit_p} OFFSET ${offset_p}""",
            *filter_params, limit, offset,
        )
        total = await conn.fetchval(f"SELECT COUNT(*) FROM quiz_submissions {where}", *filter_params)
        complete_count = await conn.fetchval(
            f"SELECT COUNT(*) FROM quiz_submissions {where} {'AND' if where else 'WHERE'} is_complete = TRUE",
            *filter_params,
        )
        drop_count = total - complete_count

    results = []
    for row in rows:
        answers_raw = row["answers"]
        if isinstance(answers_raw, str):
            try:
                answers_raw = json.loads(answers_raw)
            except Exception:
                answers_raw = {}

        insights_raw = row["insights"]
        if isinstance(insights_raw, str):
            try:
                insights_raw = json.loads(insights_raw)
            except Exception:
                insights_raw = []

        share_card_raw = row["share_card"]
        if isinstance(share_card_raw, str):
            try:
                share_card_raw = json.loads(share_card_raw)
            except Exception:
                share_card_raw = {}

        results.append({
            "id": str(row["id"]),
            "phone": row["phone"],
            "is_complete": row["is_complete"],
            "status": row["status"],
            "headline": row["headline"],
            "spirit_animal": row["spirit_animal"],
            "tags": list(row["tags"] or []),
            "insights": insights_raw or [],
            "answers": answers_raw or {},
            "last_page": row["last_page"],
            "archetype": (share_card_raw.get("archetype") if isinstance(share_card_raw, dict) else None),
            "admin_notes": row["admin_notes"],
            "is_test": row["is_test"] or False,
            "is_approved": row["is_approved"] or False,
            "whatsapp_sent_at": row["whatsapp_sent_at"].isoformat() if row["whatsapp_sent_at"] else None,
            "followup_sent_at": row["followup_sent_at"].isoformat() if row["followup_sent_at"] else None,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "completed_at": row["completed_at"].isoformat() if row["completed_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            "error_msg": row["error_msg"],
        })

    logger.info("admin.list_submissions", total=total, returned=len(results))
    return {"total": total, "complete": complete_count, "drop_off": drop_count, "submissions": results}


@router.get("/submissions/{submission_id}", dependencies=[Depends(_require_admin)])
async def get_submission(submission_id: str, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM quiz_submissions WHERE id = $1", uid)

    if not row:
        raise HTTPException(status_code=404, detail="not found")

    data = dict(row)
    for key in ("answers", "insights", "share_card"):
        if isinstance(data.get(key), str):
            try:
                data[key] = json.loads(data[key])
            except Exception:
                data[key] = None
    data["id"] = str(data["id"])
    for key in ("created_at", "updated_at", "completed_at"):
        if data.get(key):
            data[key] = data[key].isoformat()
    return data


async def _fetch_answers_and_name(submission_id: str, pool: asyncpg.Pool) -> tuple[dict, str]:
    """Shared loader for the raw-export endpoints: returns (answers, name)."""
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT answers FROM quiz_submissions WHERE id = $1", uid
        )
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    answers = row["answers"]
    if isinstance(answers, str):
        try:
            answers = json.loads(answers)
        except Exception:
            answers = {}
    answers = answers or {}
    name = str(answers.get("name") or "user").strip() or "user"
    return answers, name


def _safe_filename(name: str, submission_id: str, ext: str) -> str:
    slug = "".join(c if c.isalnum() else "-" for c in name).strip("-").lower() or "user"
    return f"frinq-{slug}-{submission_id[:8]}.{ext}"


@router.get("/submissions/{submission_id}/export.xlsx",
            dependencies=[Depends(_require_admin)])
async def export_submission_xlsx(
    submission_id: str, pool: asyncpg.Pool = Depends(get_pool)
) -> Response:
    """Download ONE user's raw responses as Excel — exact question wording, exact
    answers, every sub-question (opinions / whys / sliders / rapid-fire) expanded.
    No AI: a faithful transcript of how they actually filled the quiz."""
    answers, name = await _fetch_answers_and_name(submission_id, pool)
    data = raw_to_xlsx(answers, title=name)
    logger.info("admin.export_submission_xlsx", submission_id=submission_id)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":
                 f'attachment; filename="{_safe_filename(name, submission_id, "xlsx")}"'},
    )


@router.get("/submissions/{submission_id}/export.csv",
            dependencies=[Depends(_require_admin)])
async def export_submission_csv(
    submission_id: str, pool: asyncpg.Pool = Depends(get_pool)
) -> StreamingResponse:
    """Same faithful raw transcript as a CSV (no spreadsheet app needed)."""
    answers, name = await _fetch_answers_and_name(submission_id, pool)
    logger.info("admin.export_submission_csv", submission_id=submission_id)
    return StreamingResponse(
        iter([raw_to_csv(answers)]),
        media_type="text/csv",
        headers={"Content-Disposition":
                 f'attachment; filename="{_safe_filename(name, submission_id, "csv")}"'},
    )


@router.post("/submissions/{submission_id}/retry-ai",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def retry_ai(
    submission_id: str,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    """Re-trigger AI insights generation for a failed or errored submission —
    routed through the same durable worker + community-assignment pipeline
    every other completion path uses (generate_quiz_insights), not a
    separate ad-hoc regeneration. No FastAPI BackgroundTask: a crash between
    the admin click and the AI call finishing must not silently lose the job."""
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, status FROM quiz_submissions WHERE id = $1", uid
        )

    if not row:
        raise HTTPException(status_code=404, detail="not found")
    if row["status"] == "processing":
        return {"ok": False, "msg": "already processing"}
    if row["user_id"] is None:
        raise HTTPException(
            status_code=400,
            detail="submission has no owning account — link it to a user before retrying",
        )
    user_id = row["user_id"]

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE quiz_submissions SET status='processing', error_msg=NULL, updated_at=now() WHERE id=$1",
            uid,
        )
        await conn.execute(
            "UPDATE users SET onboarding_state='profile_processing', updated_at=now() WHERE id=$1",
            user_id,
        )

    job_id = await enqueue_quiz_insights(uid)
    if job_id is None:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET onboarding_state='error', updated_at=now() WHERE id=$1",
                user_id,
            )
        raise HTTPException(status_code=503, detail="queue unavailable, try again")

    logger.info("admin.retry_ai", submission_id=submission_id, job_id=job_id)
    return {"ok": True, "msg": "AI reprocessing queued", "job_id": job_id}


@router.delete("/submissions/{submission_id}",
               dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def delete_submission(
    submission_id: str,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    """Delete a submission and all related rows.

    voice_clips has ON DELETE CASCADE on submission_id so audio rows
    auto-vanish. tracking_events uses session_id (not FK to submissions)
    so those stay — they're analytics-only.

    No soft-delete: when admin clicks delete, the row is gone. Confirm
    on the client side before calling.
    """
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT phone FROM quiz_submissions WHERE id = $1", uid
        )
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        result = await conn.execute("DELETE FROM quiz_submissions WHERE id = $1", uid)
    logger.info("admin.delete_submission", submission_id=submission_id,
                phone=row["phone"], result=result)
    return {"ok": True, "deleted_id": submission_id}


@router.post("/submissions/bulk-delete",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def bulk_delete_submissions(
    payload: dict,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    """Delete multiple submissions in one call. Body: { ids: [uuid, ...] }.
    Used when admin wants to clean up all the test/dev rows in one go."""
    ids = payload.get("ids", [])
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=400, detail="ids must be a non-empty array")
    parsed: list[UUID] = []
    for raw in ids:
        try:
            parsed.append(UUID(str(raw)))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"invalid id: {raw}")
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM quiz_submissions WHERE id = ANY($1::uuid[])", parsed
        )
    logger.info("admin.bulk_delete", count=len(parsed), result=result)
    return {"ok": True, "deleted_count": len(parsed)}


# ─── Admin flags + notes + actions ───────────────────────────────────────────


@router.patch("/submissions/{submission_id}/flags",
              dependencies=[Depends(_require_admin)])
async def update_flags(
    submission_id: str,
    payload: dict,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    """Update admin-only flags + notes on a submission.

    Body keys (all optional, only sent fields are updated):
      - admin_notes:  text annotation for analysis
      - is_test:      manual flag to mark/unmark as test row
      - is_approved:  flag for 'inside the 100' gatekeeping

    No password gate — these are reversible and low-risk. Useful for
    daily admin work without paying the password prompt.
    """
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")

    fields = []
    values: list[Any] = []
    if "admin_notes" in payload:
        fields.append(f"admin_notes = ${len(values) + 1}")
        values.append(str(payload["admin_notes"]) if payload["admin_notes"] is not None else None)
    if "is_test" in payload:
        fields.append(f"is_test = ${len(values) + 1}")
        values.append(bool(payload["is_test"]))
    if "is_approved" in payload:
        fields.append(f"is_approved = ${len(values) + 1}")
        values.append(bool(payload["is_approved"]))
    if not fields:
        raise HTTPException(status_code=400, detail="no fields to update")

    values.append(uid)
    sql = f"UPDATE quiz_submissions SET {', '.join(fields)} WHERE id = ${len(values)}"
    async with pool.acquire() as conn:
        await conn.execute(sql, *values)
    logger.info("admin.update_flags", submission_id=submission_id, fields=list(payload.keys()))
    return {"ok": True}


@router.post("/submissions/{submission_id}/send-followup",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def send_followup_one(
    submission_id: str,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    """Send the 'first_follow_up' template to one drop-off user.

    Idempotent: tracked via followup_sent_at column. If already sent,
    returns ok + already_sent so admin can safely click without spamming.
    """
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT phone, answers, followup_sent_at
               FROM quiz_submissions WHERE id = $1""", uid
        )
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    if row["followup_sent_at"]:
        return {"ok": True, "already_sent": True}

    phone = row["phone"]
    if not phone:
        return {"ok": False, "error": "no phone on submission"}

    answers = row["answers"] or {}
    if isinstance(answers, str):
        try: answers = json.loads(answers)
        except Exception: answers = {}
    name = (answers.get("name") if isinstance(answers, dict) else "") or ""

    from app.core.whatsapp import send_followup
    result = await send_followup(phone, name=name)

    if result.get("ok"):
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE quiz_submissions SET followup_sent_at = NOW() WHERE id = $1", uid
            )
    return result


@router.post("/send-followups-bulk",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def send_followups_bulk(
    payload: dict,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    """Send first_follow_up to all drop-offs that haven't been messaged yet.

    Body: { ids?: [uuid, ...] } — optional list of specific submission ids
    to target. Omit to send to ALL incomplete submissions with phone +
    no prior followup. Returns per-user results.

    Skips: complete submissions, no-phone rows, already-sent rows,
    test rows (is_test = true).
    """
    ids = payload.get("ids") if isinstance(payload, dict) else None
    parsed_ids: list[UUID] | None = None
    if ids:
        if not isinstance(ids, list):
            raise HTTPException(status_code=400, detail="ids must be an array")
        parsed_ids = []
        for raw in ids:
            try: parsed_ids.append(UUID(str(raw)))
            except ValueError: raise HTTPException(status_code=400, detail=f"invalid id: {raw}")

    where = "WHERE is_complete = FALSE AND phone IS NOT NULL AND followup_sent_at IS NULL AND is_test = FALSE"
    if parsed_ids is not None:
        where += " AND id = ANY($1::uuid[])"

    async with pool.acquire() as conn:
        if parsed_ids is not None:
            rows = await conn.fetch(
                f"SELECT id, phone, answers FROM quiz_submissions {where}", parsed_ids
            )
        else:
            rows = await conn.fetch(
                f"SELECT id, phone, answers FROM quiz_submissions {where}"
            )

    from app.core.whatsapp import send_followup
    results = []
    for r in rows:
        answers = r["answers"] or {}
        if isinstance(answers, str):
            try: answers = json.loads(answers)
            except Exception: answers = {}
        name = (answers.get("name") if isinstance(answers, dict) else "") or ""
        res = await send_followup(r["phone"], name=name)
        results.append({"id": str(r["id"]), **res})
        if res.get("ok"):
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE quiz_submissions SET followup_sent_at = NOW() WHERE id = $1", r["id"]
                )

    sent = sum(1 for r in results if r.get("ok"))
    skipped = sum(1 for r in results if r.get("skipped"))
    failed = len(results) - sent - skipped
    logger.info("admin.send_followups_bulk", total=len(results), sent=sent, skipped=skipped, failed=failed)
    return {"total": len(results), "sent": sent, "skipped": skipped, "failed": failed, "results": results}


@router.post("/submissions/{submission_id}/resend-whatsapp",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def resend_whatsapp(
    submission_id: str,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    """Reset whatsapp_sent_at so the next /whatsapp/notify call goes
    through again. Useful if the first send failed for any reason
    (Twilio outage, template not yet approved at send time, etc).

    Password-gated because re-sending costs money + can annoy users
    if mis-fired."""
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT phone, answers, share_card FROM quiz_submissions WHERE id = $1", uid
        )
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        # Clear the idempotency marker.
        await conn.execute(
            "UPDATE quiz_submissions SET whatsapp_sent_at = NULL WHERE id = $1", uid
        )

    # Now actually fire the send (deferred import to avoid circular).
    from app.core.whatsapp import send_launch_notice

    phone = row["phone"]
    if not phone:
        return {"ok": False, "error": "no phone on submission"}

    answers = row["answers"] or {}
    if isinstance(answers, str):
        try: answers = json.loads(answers)
        except Exception: answers = {}
    name = (answers.get("name") if isinstance(answers, dict) else "") or ""

    share_card = row["share_card"] or {}
    if isinstance(share_card, str):
        try: share_card = json.loads(share_card)
        except Exception: share_card = {}
    archetype = (share_card.get("archetype") if isinstance(share_card, dict) else "") or ""

    result = await send_launch_notice(phone, name=name, archetype=archetype)
    if result.get("ok"):
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE quiz_submissions SET whatsapp_sent_at = NOW() WHERE id = $1", uid
            )
    logger.info("admin.resend_whatsapp", submission_id=submission_id, result=result)
    return result


# ─── Analytics ────────────────────────────────────────────────────────────────

@router.get("/analytics", dependencies=[Depends(_require_admin)])
async def get_analytics(pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    global _analytics_cache, _analytics_cache_ts
    if _analytics_cache and (time() - _analytics_cache_ts) < _ANALYTICS_TTL:
        return _analytics_cache

    async with pool.acquire() as conn:
        # Core counts
        total = await conn.fetchval("SELECT COUNT(*) FROM quiz_submissions") or 0
        complete = await conn.fetchval("SELECT COUNT(*) FROM quiz_submissions WHERE is_complete = TRUE") or 0
        done = await conn.fetchval("SELECT COUNT(*) FROM quiz_submissions WHERE status = 'done'") or 0
        processing = await conn.fetchval("SELECT COUNT(*) FROM quiz_submissions WHERE status = 'processing'") or 0
        error = await conn.fetchval("SELECT COUNT(*) FROM quiz_submissions WHERE status = 'error'") or 0
        drop_off = total - complete

        # Timing
        avg_seconds = await conn.fetchval(
            """SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))
               FROM quiz_submissions WHERE completed_at IS NOT NULL AND created_at IS NOT NULL"""
        )

        # Daily last 30
        daily = await conn.fetch(
            """SELECT DATE(created_at) as day, COUNT(*) as submissions,
                      COUNT(*) FILTER (WHERE is_complete) as completions
               FROM quiz_submissions
               WHERE created_at > now() - interval '30 days'
               GROUP BY DATE(created_at)
               ORDER BY day DESC LIMIT 30"""
        )

        # Week over week
        this_week = await conn.fetchval(
            "SELECT COUNT(*) FROM quiz_submissions WHERE created_at > now() - interval '7 days'"
        ) or 0
        last_week = await conn.fetchval(
            """SELECT COUNT(*) FROM quiz_submissions
               WHERE created_at BETWEEN now() - interval '14 days' AND now() - interval '7 days'"""
        ) or 0

        # Hourly distribution (last 30 days)
        hourly = await conn.fetch(
            """SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') as hour,
                      COUNT(*) as count
               FROM quiz_submissions
               WHERE created_at > now() - interval '30 days'
               GROUP BY hour ORDER BY hour"""
        )

        # Spirit animal distribution
        spirit_animals = await conn.fetch(
            """SELECT spirit_animal, COUNT(*) as count
               FROM quiz_submissions
               WHERE spirit_animal IS NOT NULL AND status = 'done'
               GROUP BY spirit_animal ORDER BY count DESC LIMIT 12"""
        )

        # Tag frequency
        top_tags = await conn.fetch(
            """SELECT unnest(tags) as tag, COUNT(*) as count
               FROM quiz_submissions
               WHERE tags != '{}'
               GROUP BY tag ORDER BY count DESC LIMIT 20"""
        )

        # City breakdown (top 15)
        cities = await conn.fetch(
            """SELECT answers->>'city' as city, COUNT(*) as count
               FROM quiz_submissions
               WHERE answers->>'city' IS NOT NULL AND answers->>'city' != ''
               GROUP BY city ORDER BY count DESC LIMIT 15"""
        )

        # Social type breakdown
        social_types = await conn.fetch(
            """SELECT answers->>'social_type' as social_type, COUNT(*) as count
               FROM quiz_submissions
               WHERE answers->>'social_type' IS NOT NULL AND answers->>'social_type' != ''
               GROUP BY social_type ORDER BY count DESC"""
        )

        # Social verification stats
        linkedin_count = await conn.fetchval(
            """SELECT COUNT(*) FROM quiz_submissions
               WHERE answers->>'linkedin_url' IS NOT NULL AND answers->>'linkedin_url' != ''"""
        ) or 0
        instagram_count = await conn.fetchval(
            """SELECT COUNT(*) FROM quiz_submissions
               WHERE answers->>'instagram' IS NOT NULL AND answers->>'instagram' != ''"""
        ) or 0

        # Funnel: infer page completion from which answer keys exist
        funnel_fields = [
            ("name",         "answers->>'name' IS NOT NULL AND answers->>'name' != ''"),
            ("city",         "answers->>'city' IS NOT NULL AND answers->>'city' != ''"),
            ("social_type",  "answers->>'social_type' IS NOT NULL"),
            ("saturday",     "answers->>'saturday' IS NOT NULL"),
            ("hobbies",      "answers->>'hobbies' IS NOT NULL"),
            ("interests",    "jsonb_array_length(COALESCE(answers->'interests','[]'::jsonb)) > 0"),
            ("connection",   "answers->>'connection' IS NOT NULL"),
            ("trip",         "answers->>'trip' IS NOT NULL"),
            ("red_flags",    "jsonb_array_length(COALESCE(answers->'red_flags','[]'::jsonb)) > 0"),
            ("show_up",      "answers->>'show_up' IS NOT NULL"),
            ("rapid",        "jsonb_array_length(COALESCE(answers->'rapid','[]'::jsonb)) > 0"),
            ("opinions",     "jsonb_array_length(COALESCE(answers->'opinions','[]'::jsonb)) > 0"),
            ("looking_for",  "answers->>'looking_for' IS NOT NULL"),
        ]
        funnel = []
        for label, condition in funnel_fields:
            count_val = await conn.fetchval(
                f"SELECT COUNT(*) FROM quiz_submissions WHERE {condition}"
            ) or 0
            funnel.append({"step": label, "count": int(count_val)})

    completion_rate = round((complete / total * 100), 1) if total else 0
    ai_success_rate = round((done / complete * 100), 1) if complete else 0
    week_delta = this_week - last_week
    social_pct = round((linkedin_count + instagram_count) / 2 / max(complete, 1) * 100, 1)

    result: dict[str, Any] = {
        "totals": {
            "all_submissions": int(total),
            "complete": int(complete),
            "drop_off": int(drop_off),
            "ai_done": int(done),
            "ai_processing": int(processing),
            "ai_error": int(error),
            "this_week": int(this_week),
            "last_week": int(last_week),
            "week_delta": int(week_delta),
            "linkedin_verified": int(linkedin_count),
            "instagram_verified": int(instagram_count),
            "social_pct": social_pct,
        },
        "rates": {
            "quiz_completion_pct": completion_rate,
            "ai_success_pct": ai_success_rate,
        },
        "timing": {
            "avg_ai_seconds": round(float(avg_seconds), 1) if avg_seconds else None,
        },
        "daily_last_30": [
            {"day": str(r["day"]), "submissions": int(r["submissions"]), "completions": int(r["completions"])}
            for r in daily
        ],
        "hourly": [{"hour": int(r["hour"]), "count": int(r["count"])} for r in hourly],
        "spirit_animals": [{"name": r["spirit_animal"], "count": int(r["count"])} for r in spirit_animals],
        "top_tags": [{"tag": r["tag"], "count": int(r["count"])} for r in top_tags],
        "cities": [{"city": r["city"] or "unknown", "count": int(r["count"])} for r in cities],
        "social_types": [{"type": r["social_type"], "count": int(r["count"])} for r in social_types],
        "funnel": funnel,
    }
    _analytics_cache = result
    _analytics_cache_ts = time()
    return result


# ─── User Journey ─────────────────────────────────────────────────────────────

@router.get("/journey", dependencies=[Depends(_require_admin)])
async def get_user_journey(
    pool: asyncpg.Pool = Depends(get_pool),
    phone: str = Query(default=""),
    name: str = Query(default=""),
) -> dict[str, Any]:
    if not phone and not name:
        raise HTTPException(status_code=400, detail="phone or name required")

    conditions: list[str] = []
    params: list[Any] = []
    if phone:
        params.append(f"%{phone.replace('%', '')}%")
        conditions.append(f"phone ILIKE ${len(params)}")
    if name:
        params.append(f"%{name.replace('%', '')}%")
        conditions.append(f"name ILIKE ${len(params)}")

    where = "WHERE " + " OR ".join(conditions)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT id, session_id, phone, name, page, action, element, data, created_at
                FROM tracking_events
                {where}
                ORDER BY created_at ASC
                LIMIT 2000""",
            *params,
        )

    events = [
        {
            "id": row["id"],
            "session_id": row["session_id"],
            "phone": row["phone"],
            "name": row["name"],
            "page": row["page"],
            "action": row["action"],
            "element": row["element"],
            "data": dict(row["data"]) if row["data"] else None,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]

    return {"events": events, "count": len(events)}


# ─── Voice clips ──────────────────────────────────────────────────────────────

@router.get("/schema", dependencies=[Depends(_require_admin)])
async def schema_check(pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    """Return all columns on quiz_submissions so we can see exactly what's
    actually present in the live DB. Also runs the new SELECT once and
    reports any error — lets us debug 'admin 500s' without DO log access."""
    async with pool.acquire() as conn:
        cols = await conn.fetch(
            """SELECT column_name, data_type, is_nullable
               FROM information_schema.columns
               WHERE table_name = 'quiz_submissions'
               ORDER BY ordinal_position"""
        )
        select_error = None
        try:
            await conn.fetch(
                """SELECT id, phone, is_complete, status, headline, spirit_animal,
                          tags, answers, insights, last_page, share_card,
                          admin_notes, is_test, is_approved,
                          whatsapp_sent_at, followup_sent_at,
                          created_at, completed_at, updated_at, error_msg
                   FROM quiz_submissions LIMIT 1"""
            )
        except Exception as exc:
            select_error = f"{type(exc).__name__}: {exc}"
    return {
        "columns": [{"name": r["column_name"], "type": r["data_type"]} for r in cols],
        "list_select_error": select_error,
    }


@router.post("/run-migrations",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def run_migrations_now(pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    """Manually re-run startup migrations + return per-statement results.

    The old version swallowed exceptions and returned a bare 'ok'. This
    version reports each statement's outcome so we can see exactly which
    DDL was rejected (suspected: API user lacks ALTER TABLE permission
    on Supabase, which is why migrations silent-fail at startup).
    """
    statements = [
        # tracking_events
        ("tracking_events.create", """CREATE TABLE IF NOT EXISTS tracking_events (
            id          BIGSERIAL PRIMARY KEY,
            session_id  TEXT NOT NULL, phone TEXT, name TEXT,
            page TEXT NOT NULL, action TEXT NOT NULL, element TEXT,
            data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"""),
        # voice_clips
        ("voice_clips.create", """CREATE TABLE IF NOT EXISTS voice_clips (
            id              BIGSERIAL PRIMARY KEY,
            submission_id   UUID REFERENCES quiz_submissions(id) ON DELETE CASCADE,
            question_key    TEXT NOT NULL,
            audio_data      BYTEA NOT NULL,
            mime_type       TEXT NOT NULL DEFAULT 'audio/webm',
            duration_sec    SMALLINT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (submission_id, question_key)
        )"""),
        # whatsapp_sent_at
        ("whatsapp_sent_at", "ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ"),
        # admin flags
        ("admin_notes", "ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS admin_notes TEXT"),
        ("is_test", "ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE"),
        ("is_approved", "ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE"),
        ("followup_sent_at", "ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ"),
    ]
    results = []
    for label, stmt in statements:
        try:
            async with pool.acquire() as conn:
                await conn.execute(stmt)
            results.append({"step": label, "ok": True})
        except Exception as exc:
            results.append({"step": label, "ok": False,
                            "error": f"{type(exc).__name__}: {exc}"})
    return {"results": results}


@router.post("/twilio-create-template",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def twilio_create_template(payload: dict) -> dict[str, Any]:
    """Programmatically create a Twilio Content Template + submit for
    WhatsApp approval. Used to recreate a template that's already
    approved on Meta WABA side so we get the HX SID we need for sending.

    Body (all optional, sensible defaults for first_followup):
        friendly_name: str   - twilio template name
        language:      str   - "en"
        body:          str   - the message body
        image_url:     str   - header image URL
        button_title:  str   - CTA button text
        button_url:    str   - URL the button opens
        category:      str   - "MARKETING" | "UTILITY"

    Returns: sid (HX...), approval_status, full response from Twilio.
    """
    import asyncio as _asyncio
    import requests

    friendly_name = payload.get("friendly_name", "first_followup")
    language = payload.get("language", "en")
    body = payload.get("body", "hi, you started this for a reason. Just a few questions are left before we can find your people.")
    image_url = payload.get("image_url", "https://app.frinq.in/illustrations/followup-ducks.png")
    button_title = payload.get("button_title", "complete your profile")
    button_url = payload.get("button_url", "https://app.frinq.in/?ref=followup")
    category = payload.get("category", "MARKETING")

    base_url = "https://content.twilio.com/v1/Content"
    auth = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    # twilio/card supports the full WhatsApp template structure:
    #   media[]   — header image (5MB max)
    #   body      — main text (longer than title/subtitle, used here)
    #   actions[] — URL/Phone buttons
    # title + subtitle are capped at 60 chars each; we leave them empty
    # and put the message in body. The image_url goes in media.
    create_payload = {
        "friendly_name": friendly_name,
        "language": language,
        "variables": {},
        "types": {
            "twilio/card": {
                "title": "",
                "subtitle": "",
                "body": body,
                "media": [image_url] if image_url else [],
                "actions": [
                    {"type": "URL", "title": button_title, "url": button_url}
                ],
            }
        },
    }

    def _create_sync() -> dict[str, Any]:
        # 1. Create the template — returns SID immediately.
        r = requests.post(base_url, json=create_payload, auth=auth, timeout=15)
        if r.status_code >= 400:
            return {"error": "create_failed", "status": r.status_code, "body": r.text}
        data = r.json()
        sid = data.get("sid")
        if not sid:
            return {"error": "no_sid_returned", "body": data}

        # 2. Submit for WhatsApp approval (Meta auto-approves if identical
        #    body already exists on the WABA — usually within minutes).
        #    The approval API requires both name + title even when the
        #    template is media-only (the title field maps to the
        #    submission display name on Meta side).
        approval_url = f"{base_url}/{sid}/ApprovalRequests/whatsapp"
        ar = requests.post(approval_url,
                           json={
                               "name": friendly_name,
                               "category": category,
                               "title": friendly_name,
                           },
                           auth=auth, timeout=15)
        approval_status = ar.json() if ar.headers.get("content-type", "").startswith("application/json") else ar.text

        return {
            "sid": sid,
            "create_response": data,
            "approval_response": approval_status,
            "approval_http_status": ar.status_code,
        }

    try:
        result = await _asyncio.wait_for(_asyncio.to_thread(_create_sync), timeout=30.0)
        logger.info("admin.twilio_create_template",
                    name=friendly_name, sid=result.get("sid"))
        return result
    except Exception as exc:
        logger.error("admin.twilio_create_template.failed",
                     error_type=type(exc).__name__, error=str(exc))
        return {"error": f"{type(exc).__name__}: {exc}"}


@router.get("/twilio-templates",
            dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def list_twilio_templates() -> dict[str, Any]:
    """List all Twilio Content Templates on this account.

    Helper for finding the HX… SID of an approved template by name when
    the Twilio Console is hard to navigate. Returns sid + friendly_name +
    language + variables for each template.
    """
    from twilio.rest import Client
    import asyncio as _asyncio

    def _fetch_sync() -> list[dict[str, Any]]:
        c = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        # Twilio Content v1: .content.v1.contents.list() returns ContentInstance
        items = c.content.v1.contents.list(limit=100)
        out = []
        for it in items:
            out.append({
                "sid": getattr(it, "sid", None),
                "friendly_name": getattr(it, "friendly_name", None),
                "language": getattr(it, "language", None),
                "variables": getattr(it, "variables", None),
                "date_created": str(getattr(it, "date_created", "") or ""),
            })
        return out

    try:
        templates = await _asyncio.wait_for(_asyncio.to_thread(_fetch_sync), timeout=15.0)
        return {"count": len(templates), "templates": templates}
    except Exception as exc:
        logger.error("admin.twilio_templates.failed", error_type=type(exc).__name__, error=str(exc))
        return {"error": f"{type(exc).__name__}: {exc}"}


@router.get("/voice-stats", dependencies=[Depends(_require_admin)])
async def voice_stats(pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    """Diagnose 'voice uploads aren't saving' reports — checks if the
    table exists, total row count, and the 10 most recent uploads."""
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'voice_clips')"
        )
        if not exists:
            return {"table_exists": False, "total_rows": 0, "recent": []}
        total = await conn.fetchval("SELECT COUNT(*) FROM voice_clips")
        recent = await conn.fetch(
            """SELECT submission_id, question_key, mime_type,
                      length(audio_data) as bytes, duration_sec, created_at
               FROM voice_clips
               ORDER BY created_at DESC
               LIMIT 10"""
        )
    return {
        "table_exists": True,
        "total_rows": total,
        "recent": [
            {
                "submission_id": str(r["submission_id"]),
                "question_key": r["question_key"],
                "mime_type": r["mime_type"],
                "bytes": r["bytes"],
                "duration_sec": r["duration_sec"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in recent
        ],
    }


@router.get("/voice/{submission_id}", dependencies=[Depends(_require_admin)])
async def list_voice_clips(
    submission_id: str,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    """List voice clips uploaded for a submission. Returns metadata + a
    streaming URL the admin UI can use as the <audio> src.

    Returns empty `clips` + `table_missing: true` if the voice_clips
    table doesn't exist (instead of HTTP 500), so the admin UI doesn't
    break the whole user detail panel when the migration hasn't run yet.
    """
    try:
        sid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT question_key, mime_type, duration_sec, length(audio_data) as bytes,
                          created_at
                   FROM voice_clips
                   WHERE submission_id = $1
                   ORDER BY created_at ASC""",
                sid,
            )
    except asyncpg.UndefinedTableError:
        logger.error("admin.voice.table_missing", submission_id=str(sid))
        return {"clips": [], "table_missing": True}
    except Exception as exc:
        logger.error("admin.voice.list_failed", submission_id=str(sid),
                     error_type=type(exc).__name__, error=str(exc))
        return {"clips": [], "error": f"{type(exc).__name__}: {exc}"}
    return {
        "clips": [
            {
                "question_key": r["question_key"],
                "mime_type": r["mime_type"],
                "duration_sec": r["duration_sec"],
                "bytes": r["bytes"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]
    }


@router.get("/voice/{submission_id}/{question_key}/stream", dependencies=[Depends(_require_admin)])
async def stream_voice_clip(
    submission_id: str,
    question_key: str,
    pool: asyncpg.Pool = Depends(get_pool),
):
    """Stream the audio bytes for one clip. The admin app fetches this as a
    blob (Authorization: Bearer header) and assigns it via
    URL.createObjectURL — no query-param key needed."""
    try:
        sid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT audio_data, mime_type FROM voice_clips WHERE submission_id = $1 AND question_key = $2",
            sid, question_key,
        )
    if not row:
        raise HTTPException(status_code=404, detail="no recording")
    return Response(content=row["audio_data"], media_type=row["mime_type"] or "audio/webm")


# ─── Export ───────────────────────────────────────────────────────────────────

@router.get("/export/csv", dependencies=[Depends(_require_admin)])
async def export_csv(pool: asyncpg.Pool = Depends(get_pool)) -> StreamingResponse:
    """Export all complete submissions as CSV."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, phone, is_complete, status, headline, spirit_animal, tags,
                      answers, created_at, completed_at
               FROM quiz_submissions ORDER BY created_at DESC"""
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "phone", "is_complete", "status", "name", "city", "dob",
        "social_type", "saturday", "hobbies", "story", "connection", "trip",
        "show_up", "looking_for", "linkedin_url", "instagram",
        "headline", "spirit_animal", "tags", "created_at", "completed_at",
    ])

    for row in rows:
        a: dict = {}
        if row["answers"]:
            try:
                a = json.loads(row["answers"]) if isinstance(row["answers"], str) else dict(row["answers"])
            except Exception:
                pass

        writer.writerow([
            str(row["id"]),
            row["phone"] or "",
            row["is_complete"],
            row["status"],
            a.get("name", ""),
            a.get("city", ""),
            a.get("dob", ""),
            a.get("social_type", ""),
            a.get("saturday", ""),
            a.get("hobbies", ""),
            a.get("story", ""),
            a.get("connection", ""),
            a.get("trip", ""),
            a.get("show_up", ""),
            a.get("looking_for", ""),
            a.get("linkedin_url", ""),
            a.get("instagram", ""),
            row["headline"] or "",
            row["spirit_animal"] or "",
            ", ".join(row["tags"] or []),
            row["created_at"].isoformat() if row["created_at"] else "",
            row["completed_at"].isoformat() if row["completed_at"] else "",
        ])

    output.seek(0)
    logger.info("admin.export_csv", rows=len(rows))
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=frinq-submissions.csv"},
    )


# ─── Sunday-invite RSVPs ────────────────────────────────────────────────────

@router.get("/rsvps", dependencies=[Depends(_require_admin)])
async def list_rsvps(pool: asyncpg.Pool = Depends(get_pool)) -> dict:
    """Who tapped which invite button — the source for follow-up sends.
    rsvp_status is rsvp_yes / rsvp_no / rsvp_info; rsvp_at is the tap time."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT phone, rsvp_status, rsvp_at
               FROM quiz_submissions
               WHERE rsvp_status IS NOT NULL
               ORDER BY rsvp_at DESC NULLS LAST"""
        )
    items = [
        {
            "phone": r["phone"],
            "status": r["rsvp_status"],
            "at": r["rsvp_at"].isoformat() if r["rsvp_at"] else None,
        }
        for r in rows
    ]
    counts: dict[str, int] = {}
    for it in items:
        counts[it["status"]] = counts.get(it["status"], 0) + 1
    return {"counts": counts, "total": len(items), "rsvps": items}


@router.get("/whatsapp/inbox", dependencies=[Depends(_require_admin)])
async def whatsapp_inbox(pool: asyncpg.Pool = Depends(get_pool)) -> dict:
    """Everything the admin RSVP/inbox UI needs:
      - counts:     how many tapped each button (rsvp_yes/no/info)
      - responders: who tapped what (current), with name
      - messages:   every inbound message (button + free-form), newest first
    """
    err: str | None = None

    async def _safe(conn: Any, sql: str) -> list:
        nonlocal err
        try:
            return await conn.fetch(sql)
        except Exception as exc:  # noqa: BLE001
            logger.error("admin.inbox.query_failed", error=str(exc), sql=sql[:60])
            err = err or f"{type(exc).__name__}: {exc}"
            return []

    async with pool.acquire() as conn:
        resp_rows = await _safe(conn,
            """SELECT phone, rsvp_status, rsvp_at FROM quiz_submissions
               WHERE rsvp_status IS NOT NULL ORDER BY rsvp_at DESC NULLS LAST""")
        msg_rows = await _safe(conn,
            """SELECT from_phone, body, button_text, button_payload, choice, received_at
               FROM whatsapp_inbound ORDER BY received_at DESC LIMIT 500""")
        name_rows = await _safe(conn,
            "SELECT phone, answers FROM quiz_submissions WHERE phone IS NOT NULL")

    def _last10(p: Any) -> str:
        return "".join(ch for ch in (p or "") if ch.isdigit())[-10:]

    names: dict[str, str] = {}
    for r in name_rows:
        a = r["answers"]
        if isinstance(a, str):
            try:
                a = json.loads(a)
            except Exception:  # noqa: BLE001
                a = {}
        nm = a.get("name") if isinstance(a, dict) else None
        if nm:
            names[_last10(r["phone"])] = nm

    # One current RSVP per person (a phone can have several submission rows —
    # keep the most recent rsvp_at) so counts aren't inflated by duplicates.
    latest: dict[str, Any] = {}
    for r in resp_rows:
        k = _last10(r["phone"])
        prev = latest.get(k)
        if prev is None or (r["rsvp_at"] is not None and
                            (prev["rsvp_at"] is None or r["rsvp_at"] > prev["rsvp_at"])):
            latest[k] = r

    counts: dict[str, int] = {}
    responders = []
    for r in latest.values():
        counts[r["rsvp_status"]] = counts.get(r["rsvp_status"], 0) + 1
        responders.append({
            "phone": r["phone"],
            "name": names.get(_last10(r["phone"]), ""),
            "status": r["rsvp_status"],
            "at": r["rsvp_at"].isoformat() if r["rsvp_at"] else None,
        })
    responders.sort(key=lambda x: x["at"] or "", reverse=True)
    messages = [{
        "phone": m["from_phone"],
        "name": names.get(_last10(m["from_phone"]), ""),
        "body": m["body"],
        "button_text": m["button_text"],
        "choice": m["choice"],
        "at": m["received_at"].isoformat() if m["received_at"] else None,
    } for m in msg_rows]

    return {
        "counts": counts,
        "responders": responders,
        "messages": messages,
        "total_responded": len(responders),
        "total_messages": len(messages),
        "error": err,
    }


# ─── WhatsApp 1:1 chat (thread + reply) ─────────────────────────────────────

_WA_MSG_SVC = "MGdec5b6175025e0029424aac28d0fa27d"  # FRINQ-Whatsapp


def _wa_num(phone: str) -> str:
    last10 = "".join(c for c in (phone or "") if c.isdigit())[-10:]
    return f"whatsapp:+91{last10}"


@router.get("/whatsapp/thread", dependencies=[Depends(_require_admin)])
async def whatsapp_thread(phone: str = Query(...)) -> dict:
    """Full WhatsApp conversation with one person (both directions), from
    Twilio — so it includes our template sends, auto-replies and their messages."""
    import asyncio
    from app.core.whatsapp import _client

    num = _wa_num(phone)

    def _fetch() -> list[dict]:
        cli = _client()
        msgs = list(cli.messages.list(to=num, limit=50)) + \
            list(cli.messages.list(from_=num, limit=50))
        msgs.sort(key=lambda m: m.date_created or m.date_sent)
        return [{
            "direction": "out" if (m.direction or "").startswith("outbound") else "in",
            "body": m.body or "",
            "status": m.status,
            "error_code": m.error_code,
            "at": (m.date_sent or m.date_created).isoformat()
                  if (m.date_sent or m.date_created) else None,
        } for m in msgs]

    try:
        items = await asyncio.to_thread(_fetch)
        return {"phone": "".join(c for c in phone if c.isdigit())[-10:], "messages": items}
    except Exception as exc:  # noqa: BLE001
        logger.error("admin.thread.failed", error=str(exc))
        return {"phone": phone, "messages": [], "error": f"{type(exc).__name__}: {exc}"}


class _ReplyIn(BaseModel):
    phone: str
    body: str


@router.post("/whatsapp/reply", dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def whatsapp_reply(payload: _ReplyIn) -> dict:
    """Send a free-form WhatsApp reply to one person. Works only inside the 24h
    window opened by their last inbound message (else Twilio 63016)."""
    import asyncio
    from app.core.whatsapp import _client

    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="empty message")
    num = _wa_num(payload.phone)

    def _send() -> Any:
        return _client().messages.create(
            to=num, messaging_service_sid=_WA_MSG_SVC, body=body)

    try:
        m = await asyncio.to_thread(_send)
        logger.info("admin.reply.sent", to=num, sid=m.sid)
        return {"ok": True, "sid": m.sid, "status": m.status}
    except Exception as exc:  # noqa: BLE001
        logger.error("admin.reply.failed", to=num, error=str(exc))
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


# ─── Campaign / delivery analytics (Twilio + DB) ────────────────────────────

_campaign_cache: dict[str, Any] = {}
_campaign_cache_ts: float = 0.0
_CAMPAIGN_TTL = 90.0

# Best-status ranking so a recipient's furthest-reached state wins across their
# multiple outbound messages (invite + retries + replies).
_STATUS_RANK = {
    "read": 5, "delivered": 4, "sent": 3, "sending": 2, "queued": 2,
    "accepted": 1, "scheduled": 1, "undelivered": 0, "failed": 0, "canceled": 0,
}


def _l10(p: Any) -> str:
    return "".join(c for c in (p or "") if c.isdigit())[-10:]


@router.get("/whatsapp/campaign", dependencies=[Depends(_require_admin)])
async def whatsapp_campaign(pool: asyncpg.Pool = Depends(get_pool)) -> dict:
    """Marketing funnel for the invite campaign, computed from Twilio message
    statuses (per recipient: best delivery state + error codes) joined with our
    RSVP/inbound data. Cached for 90s to avoid hammering Twilio."""
    global _campaign_cache, _campaign_cache_ts
    if _campaign_cache and (time() - _campaign_cache_ts) < _CAMPAIGN_TTL:
        return _campaign_cache

    import asyncio
    from datetime import datetime, timezone
    from app.core.whatsapp import _client

    after = datetime(2026, 6, 25, tzinfo=timezone.utc)

    def _fetch() -> list:
        cli = _client()
        msgs = cli.messages.list(date_sent_after=after, limit=2000)
        return [m for m in msgs
                if (m.to or "").startswith("whatsapp:") or (m.from_ or "").startswith("whatsapp:")]

    try:
        msgs = await asyncio.to_thread(_fetch)
    except Exception as exc:  # noqa: BLE001
        logger.error("admin.campaign.twilio_failed", error=str(exc))
        return {"error": f"{type(exc).__name__}: {exc}"}

    out: dict[str, dict] = {}          # phone -> best outbound state
    inbound_phones: set[str] = set()
    inbound_count = 0
    last_activity: dict[str, str] = {}

    for m in msgs:
        ts = (m.date_sent or m.date_created)
        tss = ts.isoformat() if ts else ""
        if (m.direction or "").startswith("inbound"):
            p = _l10(m.from_)
            inbound_phones.add(p)
            inbound_count += 1
            if tss > last_activity.get(p, ""):
                last_activity[p] = tss
        else:
            p = _l10(m.to)
            cur = out.setdefault(p, {"status": None, "rank": -1, "errors": {}})
            r = _STATUS_RANK.get(m.status or "", 0)
            if r > cur["rank"]:
                cur["rank"] = r
                cur["status"] = m.status
            if m.error_code:
                k = str(m.error_code)
                cur["errors"][k] = cur["errors"].get(k, 0) + 1
            if tss > last_activity.get(p, ""):
                last_activity[p] = tss

    # names + rsvp from DB
    names: dict[str, str] = {}
    rsvp: dict[str, str] = {}
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT phone, answers, rsvp_status FROM quiz_submissions WHERE phone IS NOT NULL")
        for r in rows:
            p = _l10(r["phone"])
            a = r["answers"]
            if isinstance(a, str):
                try:
                    a = json.loads(a)
                except Exception:  # noqa: BLE001
                    a = {}
            nm = a.get("name") if isinstance(a, dict) else None
            if nm:
                names[p] = nm
            if r["rsvp_status"]:
                rsvp[p] = r["rsvp_status"]
    except Exception as exc:  # noqa: BLE001
        logger.error("admin.campaign.db_failed", error=str(exc))

    audience = list(out.keys())
    delivered = [p for p, v in out.items() if v["rank"] >= 4]   # delivered or read
    read = [p for p, v in out.items() if v["status"] == "read"]
    failed = [p for p, v in out.items() if v["rank"] == 0]
    responded = [p for p in audience if p in inbound_phones]
    delivered_no_reply = [p for p in delivered if p not in inbound_phones]
    read_no_reply = [p for p in read if p not in inbound_phones]

    err_breakdown: dict[str, int] = {}
    for v in out.values():
        for code in v["errors"]:
            err_breakdown[code] = err_breakdown.get(code, 0) + 1

    rsvp_counts: dict[str, int] = {}
    for p in responded:
        s = rsvp.get(p)
        if s:
            rsvp_counts[s] = rsvp_counts.get(s, 0) + 1

    recipients = sorted(
        [{
            "phone": p,
            "name": names.get(p, ""),
            "delivery": out[p]["status"],
            "read": out[p]["status"] == "read",
            "responded": p in inbound_phones,
            "rsvp": rsvp.get(p),
            "errors": list(out[p]["errors"].keys()),
            "last": last_activity.get(p),
        } for p in audience],
        key=lambda x: x["last"] or "", reverse=True,
    )

    result = {
        "funnel": {
            "audience": len(audience),
            "delivered": len(delivered),
            "read": len(read),
            "responded": len(responded),
            "failed": len(failed),
        },
        "delivered_no_reply": len(delivered_no_reply),
        "read_no_reply": len(read_no_reply),
        "messages_received": inbound_count,
        "error_breakdown": err_breakdown,
        "rsvp_counts": rsvp_counts,
        "recipients": recipients,
    }
    _campaign_cache = result
    _campaign_cache_ts = time()
    return result


# ─── Moderation review queue (Phase 5 Task 20) ─────────────────────────────
#
# Every enforcement write below requires BOTH _require_admin AND
# _require_action_password, and derives actor_id from settings.ADMIN_ACTOR_ID
# — never from a request field, so an audit row can't be forged to point at
# someone else. resolve/delete/suspend/ban all optionally accept a
# report_id to also resolve the triggering report in the same transaction —
# a moderator acting from the report queue shouldn't need two separate
# clicks/requests for "handle this" + "mark it resolved".

class ModerationActionRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
    report_id: str | None = None


class SuspendUserRequest(ModerationActionRequest):
    until: datetime

    @field_validator("until")
    @classmethod
    def _until_must_be_future(cls, v: datetime) -> datetime:
        now = datetime.now(v.tzinfo) if v.tzinfo else datetime.utcnow()
        if v <= now:
            raise ValueError("until must be in the future")
        return v


async def _record_moderation_action(
    conn: asyncpg.Connection,
    *,
    report_id: UUID | None,
    target_user_id: UUID | None,
    message_id: int | None,
    action: str,
    reason: str,
) -> None:
    await conn.execute(
        """INSERT INTO moderation_actions (id, report_id, target_user_id, message_id, actor_id, action, reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7)""",
        uuid4(), report_id, target_user_id, message_id, settings.ADMIN_ACTOR_ID, action, reason,
    )


async def _resolve_report_if_given(conn: asyncpg.Connection, report_id: str | None) -> None:
    if report_id is None:
        return
    await conn.execute(
        "UPDATE message_reports SET status = 'resolved', resolved_at = now() WHERE id = $1",
        UUID(report_id),
    )


async def _publish_ban_event_best_effort(user_id: UUID, *, reason_for_log: str) -> None:
    """Best-effort — the DB enforcement write already committed by the time
    this runs; a Redis hiccup here must never fail the whole request, it
    just means an already-connected session takes up to the next
    reconnect/ticket cycle to be forced off instead of being disconnected
    immediately."""
    redis = await get_redis()
    if redis is None:
        logger.warning("admin.moderation.ban_event_skipped", user_id=str(user_id), reason=reason_for_log)
        return
    try:
        await publish_ban_event(redis, user_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "admin.moderation.ban_event_publish_failed",
            user_id=str(user_id), reason=reason_for_log, error=type(exc).__name__,
        )


@router.get("/reports", dependencies=[Depends(_require_admin)])
async def list_reports(
    pool: asyncpg.Pool = Depends(get_pool),
    status_filter: str = Query(default="open", alias="status"),
    reason: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    conditions = ["mr.status = $1"]
    params: list[Any] = [status_filter]
    if reason:
        params.append(reason)
        conditions.append(f"mr.reason = ${len(params)}")
    where = "WHERE " + " AND ".join(conditions)
    limit_p = len(params) + 1
    offset_p = len(params) + 2

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT mr.id, mr.message_id, mr.reporter_user_id, mr.reason, mr.details,
                       mr.status, mr.created_at, m.archetype_slug, m.user_id AS author_id
                FROM message_reports mr
                JOIN messages m ON m.id = mr.message_id
                {where}
                ORDER BY mr.created_at DESC
                LIMIT ${limit_p} OFFSET ${offset_p}""",
            *params, limit, offset,
        )
        total = await conn.fetchval(f"SELECT COUNT(*) FROM message_reports mr {where}", *params)

    return {
        "total": total,
        "reports": [
            {
                "id": str(r["id"]),
                "message_id": r["message_id"],
                "reporter_user_id": str(r["reporter_user_id"]) if r["reporter_user_id"] else None,
                "reason": r["reason"],
                "details": r["details"],
                "status": r["status"],
                "created_at": r["created_at"].isoformat(),
                "community_slug": r["archetype_slug"],
                "author_id": str(r["author_id"]) if r["author_id"] else None,
            }
            for r in rows
        ],
    }


@router.get("/reports/{report_id}", dependencies=[Depends(_require_admin)])
async def get_report_detail(report_id: str, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    try:
        rid = UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")

    async with pool.acquire() as conn:
        report = await conn.fetchrow(
            """SELECT mr.id, mr.reason, mr.details, mr.status, mr.reporter_user_id,
                      m.id AS message_id, m.body, m.created_at AS message_created_at,
                      m.archetype_slug, m.user_id AS author_id
               FROM message_reports mr
               JOIN messages m ON m.id = mr.message_id
               WHERE mr.id = $1""",
            rid,
        )
        if report is None:
            raise HTTPException(status_code=404, detail="report not found")

        # Limited same-community context — a few nearby messages, never the
        # full history, and never a different community's content.
        context_rows = await conn.fetch(
            """SELECT id, user_id, body, created_at FROM messages
               WHERE archetype_slug = $1 AND deleted_at IS NULL
               ORDER BY ABS(id - $2) ASC LIMIT 10""",
            report["archetype_slug"], report["message_id"],
        )

        author = None
        if report["author_id"] is not None:
            author = await conn.fetchrow(
                "SELECT id, display_name FROM users WHERE id = $1", report["author_id"]
            )
        prior_action_count = await conn.fetchval(
            "SELECT COUNT(*) FROM moderation_actions WHERE target_user_id = $1", report["author_id"]
        )

    return {
        "id": str(report["id"]),
        "reason": report["reason"],
        "details": report["details"],
        "status": report["status"],
        "reporter_user_id": str(report["reporter_user_id"]) if report["reporter_user_id"] else None,
        "message": {
            "id": report["message_id"],
            "body": report["body"],
            "created_at": report["message_created_at"].isoformat(),
            # Public account fields only — no phone number by default.
            "author": {"id": str(author["id"]), "display_name": author["display_name"]} if author else None,
        },
        "context": [
            {
                "id": c["id"],
                "user_id": str(c["user_id"]) if c["user_id"] else None,
                "body": c["body"],
                "created_at": c["created_at"].isoformat(),
            }
            for c in context_rows
        ],
        "prior_action_count": prior_action_count,
    }


@router.post("/reports/{report_id}/resolve",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def resolve_report(
    report_id: str, body: ModerationActionRequest, pool: asyncpg.Pool = Depends(get_pool)
) -> dict[str, Any]:
    try:
        rid = UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")

    async with pool.acquire() as conn:
        report = await conn.fetchrow(
            "SELECT mr.message_id, m.user_id AS author_id FROM message_reports mr "
            "JOIN messages m ON m.id = mr.message_id WHERE mr.id = $1",
            rid,
        )
        if report is None:
            raise HTTPException(status_code=404, detail="report not found")

        async with conn.transaction():
            await conn.execute(
                "UPDATE message_reports SET status = 'resolved', resolved_at = now() WHERE id = $1", rid
            )
            await _record_moderation_action(
                conn, report_id=rid, target_user_id=report["author_id"],
                message_id=report["message_id"], action="resolve_no_action", reason=body.reason,
            )

    logger.info("admin.moderation.resolve", report_id=report_id)
    return {"ok": True}


@router.post("/messages/{message_id}/delete",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def delete_message_moderation(
    message_id: int, body: ModerationActionRequest, pool: asyncpg.Pool = Depends(get_pool)
) -> dict[str, Any]:
    async with pool.acquire() as conn:
        msg = await conn.fetchrow(
            "SELECT user_id FROM messages WHERE id = $1 AND deleted_at IS NULL", message_id
        )
        if msg is None:
            raise HTTPException(status_code=404, detail="message not found")

        report_uuid = UUID(body.report_id) if body.report_id else None
        async with conn.transaction():
            await conn.execute(
                "UPDATE messages SET deleted_at = now(), deleted_by = $2 WHERE id = $1",
                message_id, settings.ADMIN_ACTOR_ID,
            )
            await _record_moderation_action(
                conn, report_id=report_uuid, target_user_id=msg["user_id"],
                message_id=message_id, action="delete_message", reason=body.reason,
            )
            await _resolve_report_if_given(conn, body.report_id)

    logger.info("admin.moderation.delete_message", message_id=message_id)
    return {"ok": True}


@router.post("/users/{user_id}/suspend",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def suspend_user(
    user_id: str, body: SuspendUserRequest, pool: asyncpg.Pool = Depends(get_pool)
) -> dict[str, Any]:
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")

    async with pool.acquire() as conn:
        async with conn.transaction():
            result = await conn.execute(
                "UPDATE users SET suspended_until = $2, updated_at = now() "
                "WHERE id = $1 AND deleted_at IS NULL",
                uid, body.until,
            )
            if result == "UPDATE 0":
                raise HTTPException(status_code=404, detail="user not found")
            await revoke_all_sessions(conn, uid)
            await _record_moderation_action(
                conn, report_id=UUID(body.report_id) if body.report_id else None,
                target_user_id=uid, message_id=None, action="suspend_user", reason=body.reason,
            )
            await _resolve_report_if_given(conn, body.report_id)

    await _publish_ban_event_best_effort(uid, reason_for_log="suspend")
    logger.info("admin.moderation.suspend", user_id=user_id, until=body.until.isoformat())
    return {"ok": True}


@router.post("/users/{user_id}/ban",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def ban_user_moderation(
    user_id: str, body: ModerationActionRequest, pool: asyncpg.Pool = Depends(get_pool)
) -> dict[str, Any]:
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")

    async with pool.acquire() as conn:
        async with conn.transaction():
            result = await conn.execute(
                "UPDATE users SET banned = TRUE, banned_reason = $2, banned_at = now(), updated_at = now() "
                "WHERE id = $1 AND deleted_at IS NULL",
                uid, body.reason,
            )
            if result == "UPDATE 0":
                raise HTTPException(status_code=404, detail="user not found")
            await revoke_all_sessions(conn, uid)
            await remove_all_push_tokens_for_user(conn, uid)
            await _record_moderation_action(
                conn, report_id=UUID(body.report_id) if body.report_id else None,
                target_user_id=uid, message_id=None, action="ban_user", reason=body.reason,
            )
            await _resolve_report_if_given(conn, body.report_id)

    await _publish_ban_event_best_effort(uid, reason_for_log="ban")
    logger.info("admin.moderation.ban", user_id=user_id)
    return {"ok": True}


# ─── User management + audit trail (full-control console) ───────────────────────
# Additive endpoints on the EXISTING schema (users, user_sessions via
# revoke_all_sessions, moderation_actions). Closes the audited gaps: users were
# only reachable through a report; ban/suspend were one-way (a wrong ban was
# unrecoverable from the console); moderation_actions was written but only ever
# surfaced as a COUNT. The new action types need migration 016 (widens the
# moderation_actions.action CHECK added in 014).


class ReasonRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
    report_id: str | None = None


def _mask_phone(phone: str | None) -> str | None:
    """List views can return many rows — full numbers don't need to sit on
    screen in bulk. The single-user detail endpoint returns the full number."""
    if not phone:
        return phone
    return f"****{phone[-4:]}" if len(phone) >= 4 else "****"


@router.get("/users", dependencies=[Depends(_require_admin)])
async def list_users(
    pool: asyncpg.Pool = Depends(get_pool),
    q: str | None = Query(default=None, description="phone/display_name substring, or an exact user id"),
    status_filter: str | None = Query(default=None, alias="status", description="active|banned|suspended"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    conditions = ["deleted_at IS NULL"]
    params: list[Any] = []
    if q and q.strip():
        q = q.strip()
        try:
            params.append(UUID(q))
            conditions.append(f"id = ${len(params)}")
        except ValueError:
            params.append(f"%{q}%")
            conditions.append(f"(phone ILIKE ${len(params)} OR display_name ILIKE ${len(params)})")
    if status_filter == "banned":
        conditions.append("banned = TRUE")
    elif status_filter == "suspended":
        conditions.append("suspended_until IS NOT NULL AND suspended_until > now()")
    elif status_filter == "active":
        conditions.append("banned = FALSE AND (suspended_until IS NULL OR suspended_until <= now())")

    where = "WHERE " + " AND ".join(conditions)
    limit_p, offset_p = len(params) + 1, len(params) + 2
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT id, phone, display_name, onboarding_state, banned, banned_reason,
                       suspended_until, created_at, last_seen_at
                FROM users {where}
                ORDER BY created_at DESC
                LIMIT ${limit_p} OFFSET ${offset_p}""",
            *params, limit, offset,
        )
        total = await conn.fetchval(f"SELECT COUNT(*) FROM users {where}", *params)
    return {
        "total": total,
        "users": [
            {
                "id": str(r["id"]),
                "phone": _mask_phone(r["phone"]),
                "display_name": r["display_name"],
                "onboarding_state": r["onboarding_state"],
                "banned": r["banned"],
                "banned_reason": r["banned_reason"],
                "suspended_until": r["suspended_until"].isoformat() if r["suspended_until"] else None,
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "last_seen_at": r["last_seen_at"].isoformat() if r["last_seen_at"] else None,
            }
            for r in rows
        ],
    }


@router.get("/users/{user_id}", dependencies=[Depends(_require_admin)])
async def get_user_detail(user_id: str, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    async with pool.acquire() as conn:
        u = await conn.fetchrow(
            """SELECT id, phone, display_name, gender, age, onboarding_state, banned,
                      banned_reason, banned_at, suspended_until, created_at, updated_at, last_seen_at
               FROM users WHERE id = $1 AND deleted_at IS NULL""",
            uid,
        )
        if u is None:
            raise HTTPException(status_code=404, detail="user not found")
        active_sessions = await conn.fetchval(
            "SELECT COUNT(*) FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()",
            uid,
        )
        submission_count = await conn.fetchval("SELECT COUNT(*) FROM quiz_submissions WHERE user_id = $1", uid)
        action_count = await conn.fetchval("SELECT COUNT(*) FROM moderation_actions WHERE target_user_id = $1", uid)
    return {
        "id": str(u["id"]),
        "phone": u["phone"],  # full number on the single-user view (admin needs it)
        "display_name": u["display_name"],
        "gender": u["gender"],
        "age": u["age"],
        "onboarding_state": u["onboarding_state"],
        "banned": u["banned"],
        "banned_reason": u["banned_reason"],
        "banned_at": u["banned_at"].isoformat() if u["banned_at"] else None,
        "suspended_until": u["suspended_until"].isoformat() if u["suspended_until"] else None,
        "created_at": u["created_at"].isoformat() if u["created_at"] else None,
        "updated_at": u["updated_at"].isoformat() if u["updated_at"] else None,
        "last_seen_at": u["last_seen_at"].isoformat() if u["last_seen_at"] else None,
        "active_sessions": active_sessions,
        "submission_count": submission_count,
        "moderation_action_count": action_count,
    }


@router.post("/users/{user_id}/unban",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def unban_user(user_id: str, body: ReasonRequest, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    """Reverse a ban — the mirror of ban_user_moderation, which was one-way, so
    a wrong ban was previously unrecoverable from the console."""
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    async with pool.acquire() as conn:
        async with conn.transaction():
            result = await conn.execute(
                "UPDATE users SET banned = FALSE, banned_reason = NULL, banned_at = NULL, updated_at = now() "
                "WHERE id = $1 AND deleted_at IS NULL AND banned = TRUE",
                uid,
            )
            if result == "UPDATE 0":
                raise HTTPException(status_code=404, detail="user not found or not banned")
            await _record_moderation_action(
                conn, report_id=UUID(body.report_id) if body.report_id else None,
                target_user_id=uid, message_id=None, action="unban_user", reason=body.reason,
            )
    logger.info("admin.moderation.unban", user_id=user_id)
    return {"ok": True}


@router.post("/users/{user_id}/unsuspend",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def unsuspend_user(user_id: str, body: ReasonRequest, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    """Lift a suspension early (clear suspended_until)."""
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    async with pool.acquire() as conn:
        async with conn.transaction():
            result = await conn.execute(
                "UPDATE users SET suspended_until = NULL, updated_at = now() "
                "WHERE id = $1 AND deleted_at IS NULL AND suspended_until IS NOT NULL",
                uid,
            )
            if result == "UPDATE 0":
                raise HTTPException(status_code=404, detail="user not found or not suspended")
            await _record_moderation_action(
                conn, report_id=UUID(body.report_id) if body.report_id else None,
                target_user_id=uid, message_id=None, action="unsuspend_user", reason=body.reason,
            )
    logger.info("admin.moderation.unsuspend", user_id=user_id)
    return {"ok": True}


@router.post("/users/{user_id}/force-logout",
             dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def force_logout_user(user_id: str, body: ReasonRequest, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    """Revoke every session (without banning) and disconnect any live socket —
    for a lost/compromised device or a support request."""
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid id")
    async with pool.acquire() as conn:
        async with conn.transaction():
            exists = await conn.fetchval("SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL", uid)
            if not exists:
                raise HTTPException(status_code=404, detail="user not found")
            await revoke_all_sessions(conn, uid)
            await _record_moderation_action(
                conn, report_id=None, target_user_id=uid, message_id=None,
                action="force_logout", reason=body.reason,
            )
    await _publish_ban_event_best_effort(uid, reason_for_log="force_logout")
    logger.info("admin.moderation.force_logout", user_id=user_id)
    return {"ok": True}


@router.get("/audit-log", dependencies=[Depends(_require_admin)])
async def list_audit_log(
    pool: asyncpg.Pool = Depends(get_pool),
    action: str | None = Query(default=None),
    target_user_id: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    """The moderation_actions trail, finally viewable (was only ever a COUNT).
    Every resolve/delete-message/ban/suspend/unban/unsuspend/force-logout is
    here with actor, target, reason and time."""
    conditions: list[str] = []
    params: list[Any] = []
    if action:
        params.append(action)
        conditions.append(f"ma.action = ${len(params)}")
    if target_user_id:
        try:
            params.append(UUID(target_user_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid target_user_id")
        conditions.append(f"ma.target_user_id = ${len(params)}")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    limit_p, offset_p = len(params) + 1, len(params) + 2
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT ma.id, ma.action, ma.reason, ma.actor_id, ma.target_user_id,
                       ma.message_id, ma.report_id, ma.created_at, u.display_name AS target_display_name
                FROM moderation_actions ma
                LEFT JOIN users u ON u.id = ma.target_user_id
                {where}
                ORDER BY ma.created_at DESC
                LIMIT ${limit_p} OFFSET ${offset_p}""",
            *params, limit, offset,
        )
        total = await conn.fetchval(f"SELECT COUNT(*) FROM moderation_actions ma {where}", *params)
    return {
        "total": total,
        "actions": [
            {
                "id": str(r["id"]),
                "action": r["action"],
                "reason": r["reason"],
                "actor_id": r["actor_id"],
                "target_user_id": str(r["target_user_id"]) if r["target_user_id"] else None,
                "target_display_name": r["target_display_name"],
                "message_id": r["message_id"],
                "report_id": str(r["report_id"]) if r["report_id"] else None,
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ],
    }

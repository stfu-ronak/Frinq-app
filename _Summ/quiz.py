"""Unauthenticated quiz submission endpoints.

POST /quiz/submit  — save answers, start async AI insights generation
GET  /quiz/summary/{id} — poll for status + results
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import time
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_pool
from app.config import settings
from app.core.ai.insights import generate_insights
from app.core.ai.openai_client import generate_deep_report
from app.core.ai.voice_transcripts import apply_voice_transcripts
from app.utils.logger import logger

router = APIRouter(prefix="/quiz", tags=["quiz"])


# ─── Signed-token helpers (shared with rsvp.frinq.in via PREFILL_SECRET) ──────
# Format (identical on both apps): base64url(payloadJSON).base64url(
#   HMAC_SHA256(base64url-body-string, PREFILL_SECRET) ). Used for the prefill
# token this app issues AND the "paid" proof the RSVP app hands back.
def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _make_token(payload: dict[str, Any]) -> str:
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64url(hmac.new(settings.PREFILL_SECRET.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def _verify_token(token: str) -> dict[str, Any] | None:
    if not settings.PREFILL_SECRET or not token:
        return None
    try:
        body, sig = str(token).split(".", 1)
        expected = hmac.new(settings.PREFILL_SECRET.encode(), body.encode(), hashlib.sha256).digest()
        got = base64.urlsafe_b64decode(sig + "=" * (-len(sig) % 4))
        if not hmac.compare_digest(expected, got):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if payload.get("exp") and time.time() * 1000 > float(payload["exp"]):
            return None
        return payload
    except Exception:
        return None


# ─── Request / Response schemas ──────────────────────────────────────────────

class QuizSubmitRequest(BaseModel):
    phone: str | None = Field(default=None, description="Phone number (optional at this step)")
    answers: dict[str, Any] = Field(default_factory=dict)
    is_complete: bool = False
    last_page: str | None = Field(default=None)


class QuizSubmitResponse(BaseModel):
    submission_id: str
    status: str


class InsightItem(BaseModel):
    label: str
    text: str


class QuizSummaryResponse(BaseModel):
    submission_id: str
    status: str  # pending | processing | done | error
    # First name for the report tape ("an insight into <name>, by frinq").
    # Sourced from answers so previews of other users show the right name.
    name: str | None = None
    headline: str | None = None
    archetype: str | None = None
    archetype_desc: str | None = None
    share_quote: str | None = None
    # Legacy aliases for older frontend builds — keep until clients migrate.
    spirit_animal: str | None = None
    spirit_desc: str | None = None
    insights: list[InsightItem] = []
    tags: list[str] = []
    share_card: dict[str, Any] | None = None
    deep_summary: dict[str, Any] | None = None
    # True once this profile has paid (server-side, cross-device). Gates the
    # report reveal — see the RSVP paywall.
    paid: bool = False


# ─── Background AI task ──────────────────────────────────────────────────────

async def _run_insights(submission_id: UUID, answers: dict[str, Any], pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE quiz_submissions SET status='processing', updated_at=now() WHERE id=$1",
            submission_id,
        )
    try:
        # Patch in real transcripts for any voice-recorded fields (story,
        # opinion_why_*) before either generator sees the answers, so voice
        # responses carry the same weight as typed ones. No-op if there
        # are no voice clips or GROQ_API_KEY isn't set yet.
        answers = await apply_voice_transcripts(answers, submission_id, pool)

        # Run the hero-card profile and the deep report concurrently. Both
        # are OpenAI-backed by default (see settings.INSIGHTS_PROVIDER to
        # switch the profile call back to Claude).
        insights_task = asyncio.create_task(generate_insights(answers))
        deep_summary_task = asyncio.create_task(generate_deep_report(answers, submission_id=str(submission_id)))

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
    pool: asyncpg.Pool = Depends(get_pool),
) -> QuizSubmitResponse:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO quiz_submissions (phone, answers, is_complete)
               VALUES ($1, $2::jsonb, $3)
               RETURNING id""",
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
                      (paid_at IS NOT NULL) AS paid,
                      answers->>'name' AS name
               FROM quiz_submissions WHERE id = $1""",
            uid,
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
        paid=bool(row["paid"]),
    )


# Shared, pooled client for the cross-DB paid check: the per-call client paid
# a fresh DNS + TLS handshake every time, which is what pushed cold calls past
# the old timeout. 3s cap keeps the paywall gate snappy — this check is an
# optimization (the RSVP page itself bounces already-paid phones back with a
# signed proof), so a miss costs one extra redirect, never a double charge.
_rsvp_http: "httpx.AsyncClient | None" = None


def _rsvp_http_client() -> "httpx.AsyncClient":
    global _rsvp_http
    if _rsvp_http is None:
        import httpx

        _rsvp_http = httpx.AsyncClient(timeout=3.0)
    return _rsvp_http


async def _paid_on_rsvp(phone: str) -> bool:
    """Cross-DB check: has this phone already paid on rsvp.frinq.in directly?

    The RSVP app writes successful payments to its own Supabase project
    (registrations.payment_status = 'success'), which the quiz DB knows nothing
    about. Without this, someone who registered on the RSVP page first would be
    redirected there again — and its double-payment guard (409 per phone) would
    leave them stuck with no way to unlock the report. Suffix-match the last 10
    digits so '+91XXXXXXXXXX' and 'XXXXXXXXXX' rows both count. Fails closed
    (not paid) on any error/timeout.
    """
    if not settings.RSVP_SUPABASE_URL or not settings.RSVP_SUPABASE_SERVICE_KEY:
        return False
    digits = "".join(c for c in phone if c.isdigit())[-10:]
    if len(digits) < 10:
        return False
    try:
        r = await _rsvp_http_client().get(
            f"{settings.RSVP_SUPABASE_URL.rstrip('/')}/rest/v1/registrations",
            params={
                "select": "id",
                "payment_status": "eq.success",
                "whatsapp": f"like.*{digits}",
                "limit": "1",
            },
            headers={
                "apikey": settings.RSVP_SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {settings.RSVP_SUPABASE_SERVICE_KEY}",
            },
        )
        return r.status_code == 200 and len(r.json()) > 0
    except Exception as exc:  # noqa: BLE001 — network/parse errors mean "unknown", not "paid"
        logger.warning("quiz.rsvp_paid_check.failed", error=str(exc))
        return False


# ─── RSVP paywall handoff ─────────────────────────────────────────────────────
@router.get("/rsvp-link/{submission_id}")
async def rsvp_link(submission_id: str, pool: asyncpg.Pool = Depends(get_pool)) -> dict:
    """The paywall gate: {paid: true} if this submission's phone has already
    paid (stamped here, or found in the RSVP app's registrations), else a
    signed prefill link to the RSVP payment page. The token carries
    name/phone/city/LinkedIn (prefill + skip-OTP) plus the submission id (sid),
    which the RSVP app echoes back in the 'paid' proof so the report can unlock.
    """
    if not settings.PREFILL_SECRET:
        raise HTTPException(status_code=503, detail="RSVP handoff not configured")
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid submission id")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT phone, answers, paid_at FROM quiz_submissions WHERE id = $1", uid
        )
    if not row:
        raise HTTPException(status_code=404, detail="submission not found")

    if row["paid_at"] is not None:
        return {"paid": True}

    answers = row["answers"]
    if isinstance(answers, str):
        try:
            answers = json.loads(answers)
        except Exception:
            answers = {}
    answers = answers or {}

    phone = (row["phone"] or answers.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=422, detail="submission has no phone to hand off")

    # Already paid on rsvp.frinq.in directly (no quiz handoff)? Stamp it here
    # so every later check is a fast local paid_at read.
    if await _paid_on_rsvp(phone):
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE quiz_submissions SET paid_at = now(), updated_at = now() "
                "WHERE id = $1 AND paid_at IS NULL",
                uid,
            )
        return {"paid": True}

    token = _make_token({
        "name": (answers.get("name") or "").strip(),
        "phone": phone,
        "city": (answers.get("city") or "").strip(),
        "linkedin": (answers.get("linkedin_url") or answers.get("linkedin") or "").strip(),
        "sid": str(uid),
        "exp": int((time.time() + 900) * 1000),  # 15 min
    })
    return {"paid": False, "url": f"{settings.RSVP_BASE_URL.rstrip('/')}/?t={token}"}


@router.get("/verify-paid")
async def verify_paid(sid: str, proof: str, pool: asyncpg.Pool = Depends(get_pool)) -> dict:
    """Verify the signed 'paid' proof the RSVP app hands back after a successful
    payment, and record the payment on the submission so the report unlocks on
    ANY device this profile signs in from (server-side, not per-browser).
    """
    if not settings.PREFILL_SECRET:
        raise HTTPException(status_code=503, detail="RSVP handoff not configured")
    try:
        uid = UUID(sid)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid submission id")

    payload = _verify_token(proof)
    valid = bool(payload and payload.get("paid") is True and str(payload.get("sid")) == str(sid))

    async with pool.acquire() as conn:
        if valid:
            # Idempotent: stamp paid_at once. This is what makes payment
            # profile-level and cross-device.
            await conn.execute(
                "UPDATE quiz_submissions SET paid_at = now(), updated_at = now() "
                "WHERE id = $1 AND paid_at IS NULL",
                uid,
            )
        # Report paid=true if the proof is valid OR the profile is already paid.
        already = await conn.fetchval("SELECT paid_at IS NOT NULL FROM quiz_submissions WHERE id = $1", uid)

    return {"paid": bool(valid or already)}


@router.patch("/partial/{submission_id}", status_code=200)
async def save_partial(
    submission_id: str,
    body: QuizSubmitRequest,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Save partial answers mid-quiz so nothing is lost if user drops off."""
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid submission id")

    async with pool.acquire() as conn:
        result = await conn.execute(
            """UPDATE quiz_submissions
               SET answers = $2::jsonb, last_page = COALESCE($3, last_page), updated_at = now()
               WHERE id = $1""",
            uid,
            json.dumps(body.answers),
            body.last_page,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="submission not found")
    return {"ok": True}


class QuizStartRequest(BaseModel):
    phone: str | None = Field(default=None)


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
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Mark an existing partial submission as complete and trigger AI insights."""
    try:
        uid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid submission id")

    async with pool.acquire() as conn:
        result = await conn.execute(
            """UPDATE quiz_submissions
               SET answers=$2::jsonb, is_complete=TRUE, status='pending',
                   updated_at=now()
               WHERE id=$1""",
            uid,
            json.dumps(body.answers),
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="submission not found")

    background_tasks.add_task(_run_insights, uid, body.answers, pool)
    logger.info("quiz.completed", submission_id=submission_id)
    return {"ok": True, "submission_id": submission_id, "status": "pending"}

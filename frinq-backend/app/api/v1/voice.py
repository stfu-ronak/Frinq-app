"""Voice clip storage. Frontend uploads on recording stop;
admin endpoint streams the audio back for playback in the dashboard.

Storage is BYTEA in PostgreSQL (not filesystem) because DO App Platform
wipes the disk on every deploy. Audio is small enough (~50KB per 30s
recording at WebM/Opus) that in-DB storage is fine for the foreseeable
volume.
"""

from __future__ import annotations

import re
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.api.deps import CurrentAccount, get_current_account, get_pool
from app.utils.logger import logger

router = APIRouter(prefix="/voice", tags=["voice"])

_MAX_AUDIO_BYTES = 5_000_000  # 5MB ceiling — ~3 minutes at default Opus bitrate
_SAFE_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{1,60}$")


@router.post("")
async def upload_voice(
    submission_id: str = Form(...),
    question_key: str = Form(...),
    duration_sec: int = Form(0),
    audio: UploadFile = File(...),
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Accept an audio blob from the voice recorder, upsert into voice_clips.

    Re-recording the same question for the same submission overwrites the
    previous take (ON CONFLICT DO UPDATE). Returns size + ok so the client
    can confirm the upload succeeded.
    """
    try:
        sid = UUID(submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid submission_id")

    if not _SAFE_KEY_RE.match(question_key):
        raise HTTPException(status_code=400, detail="invalid question_key")

    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty audio")
    if len(content) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="audio too large")

    mime = audio.content_type or "audio/webm"

    try:
        async with pool.acquire() as conn:
            owned = await conn.fetchrow(
                "SELECT id FROM quiz_submissions WHERE id = $1 AND user_id = $2",
                sid, account.id,
            )
            if owned is None:
                raise HTTPException(status_code=404, detail="submission not found")

            await conn.execute(
                """INSERT INTO voice_clips (submission_id, question_key, audio_data, mime_type, duration_sec)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (submission_id, question_key) DO UPDATE
                     SET audio_data = EXCLUDED.audio_data,
                         mime_type  = EXCLUDED.mime_type,
                         duration_sec = EXCLUDED.duration_sec,
                         created_at = NOW()""",
                sid, question_key, content, mime, max(0, min(duration_sec, 600)),
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Surface the real reason rather than the generic 500 so we can
        # diagnose from the client side (FK violation, missing table,
        # type mismatch, etc.) instead of guessing from DO logs.
        logger.error(
            "voice.insert_failed",
            submission_id=str(sid), key=question_key,
            error_type=type(exc).__name__, error=str(exc),
        )
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")

    logger.info("voice.uploaded", submission_id=str(sid), key=question_key, bytes=len(content))
    return {"ok": True, "bytes": len(content)}

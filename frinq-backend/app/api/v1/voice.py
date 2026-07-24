"""Voice clip storage. Web frontend uploads WebM/Opus on recording stop; the
native app (Task 33) uploads M4A/AAC via react-native-audio-api. Admin
endpoint streams the audio back for playback in the dashboard.

Storage is BYTEA in PostgreSQL (not filesystem) because DO App Platform
wipes the disk on every deploy. Audio is small enough (~50KB per 30s
recording at WebM/Opus, similar order of magnitude for AAC) that in-DB
storage is fine for the foreseeable volume.

Format allowlist is enforced by container signature (magic bytes), never by
the client-supplied Content-Type alone — that header is fully attacker-
controlled and proves nothing about the actual bytes.
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

# 10MB / 120s per Task 33's native upload rules — a strict tightening of the
# duration ceiling (previously a 600s DB-sanity clamp, not an enforced cap)
# applied uniformly to both the web (WebM) and native (M4A) upload paths.
_MAX_AUDIO_BYTES = 10_000_000
_MAX_DURATION_SEC = 120
_SAFE_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{1,60}$")

# Container signatures for the only two formats either client ever produces.
# WebM/EBML: 1A 45 DF A3. MP4/M4A: 'ftyp' at byte offset 4 (ISO base media
# file format box header — AAC-in-M4A always uses this container).
_WEBM_MAGIC = b"\x1a\x45\xdf\xa3"


def _sniff_audio_format(content: bytes) -> str | None:
    """Returns 'webm', 'm4a', or None (unrecognized/rejected) based on the
    actual bytes, ignoring whatever Content-Type the client claims."""
    if content[:4] == _WEBM_MAGIC:
        return "webm"
    if len(content) >= 8 and content[4:8] == b"ftyp":
        return "m4a"
    return None


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
    if duration_sec > _MAX_DURATION_SEC:
        raise HTTPException(status_code=400, detail="recording too long")

    try:
        async with pool.acquire() as conn:
            # Ownership check runs before format sniffing: a caller probing a
            # submission that isn't theirs must get 404 regardless of what
            # bytes they upload, not a format-validation error.
            owned = await conn.fetchrow(
                "SELECT id FROM quiz_submissions WHERE id = $1 AND user_id = $2",
                sid, account.id,
            )
            if owned is None:
                raise HTTPException(status_code=404, detail="submission not found")

            sniffed = _sniff_audio_format(content)
            if sniffed is None:
                raise HTTPException(status_code=422, detail="unrecognized audio format")
            mime = "audio/webm" if sniffed == "webm" else "audio/mp4"

            await conn.execute(
                """INSERT INTO voice_clips (submission_id, question_key, audio_data, mime_type, duration_sec)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (submission_id, question_key) DO UPDATE
                     SET audio_data = EXCLUDED.audio_data,
                         mime_type  = EXCLUDED.mime_type,
                         duration_sec = EXCLUDED.duration_sec,
                         created_at = NOW()""",
                sid, question_key, content, mime, max(0, duration_sec),
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Log the real reason server-side (FK violation, missing table, type
        # mismatch, etc.); return a generic message to the client so internal
        # exception text / schema details never leak over the wire.
        logger.error(
            "voice.insert_failed",
            submission_id=str(sid), key=question_key,
            error_type=type(exc).__name__, error=str(exc),
        )
        raise HTTPException(status_code=500, detail="Could not save the recording. Try again.")

    logger.info("voice.uploaded", submission_id=str(sid), key=question_key, bytes=len(content))
    return {"ok": True, "bytes": len(content)}

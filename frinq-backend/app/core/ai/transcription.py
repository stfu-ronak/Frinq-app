"""Azure OpenAI Whisper transcription for recorded voice answers.

Runs once per submission, right before Page-2 generation (see
app/workers/tasks/quiz_insights.py) — not on voice upload. Doing it there
would add transcription latency to the foreground save request; the
generation job is already an async background step, so that's where the
one Whisper round-trip per clip belongs.

Reuses azure_client's Foundry v1 endpoint/auth/deployment-resolution
exactly as chat completions do — same base URL, same Bearer key, same
AZURE_OPENAI_DEPLOYMENTS remap mechanism — just a different path
(`/audio/transcriptions` instead of `/chat/completions`) and a
multipart body instead of JSON.
"""

from __future__ import annotations

import asyncio
from uuid import UUID

import asyncpg
import httpx

from app.config import settings
from app.core.ai.azure_client import AzureConfigError, api_key, resolve_deployment
from app.utils.logger import logger

def _transcribe_model() -> str:
    """Read at call time, not import time, so the deployment can be changed
    by env/restart without a code change (see AZURE_TRANSCRIBE_MODEL)."""
    return (settings.AZURE_TRANSCRIBE_MODEL or "whisper-1").strip()
_TRANSCRIBE_TIMEOUT = 60.0
# Each clip is capped at 120s / 10MB (app/api/v1/voice.py) — three quick
# attempts covers a transient network blip without holding up the whole
# summary job over one bad clip.
_MAX_ATTEMPTS = 3
# Matches the Semaphore(8) the OpenAI/Claude clients already use. Without a
# cap, a submission with N clips opened N simultaneous Whisper connections —
# fine for the ~5 real voice questions, a self-inflicted rate-limit/cost
# spike for anything larger.
_MAX_CONCURRENT = 8
# Hard ceiling on clips transcribed per submission. question_key is validated
# by a charset regex rather than an allowlist, so a caller can create an
# unbounded number of distinct rows for their OWN submission; without this the
# job would load every one of them (up to 10MB each) into memory at once.
_MAX_CLIPS = 40


def _transcription_url() -> str:
    base = (settings.AZURE_OPENAI_ENDPOINT or "").strip().rstrip("/")
    if not base:
        raise AzureConfigError("AZURE_OPENAI_ENDPOINT is not set.")
    return f"{base}/audio/transcriptions"


async def _transcribe_clip(client: httpx.AsyncClient, audio_bytes: bytes, mime_type: str, question_key: str) -> str | None:
    url = _transcription_url()
    headers = {"Authorization": f"Bearer {api_key()}"}
    data = {"model": resolve_deployment(_transcribe_model())}
    extension = "webm" if mime_type == "audio/webm" else "m4a"
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            files = {"file": (f"{question_key}.{extension}", audio_bytes, mime_type)}
            response = await client.post(url, headers=headers, data=data, files=files, timeout=_TRANSCRIBE_TIMEOUT)
            response.raise_for_status()
            text = (response.json().get("text") or "").strip()
            return text or None
        except Exception as exc:
            if attempt == _MAX_ATTEMPTS:
                # Best-effort: a clip that never transcribes falls back to
                # whatever build_page2_input already does for a missing
                # transcript (the frontend's own [voice response] sentinel
                # gets filtered out there) — never fails the whole summary
                # generation over one bad clip.
                logger.warning(
                    "voice.transcribe_failed",
                    question_key=question_key,
                    error_type=type(exc).__name__,
                    attempts=attempt,
                )
                return None
            await asyncio.sleep(0.5 * attempt)
    return None


async def transcribe_submission_voice_clips(pool: asyncpg.Pool, submission_id: UUID) -> dict[str, str]:
    """Every voice clip recorded for this submission, transcribed and keyed
    by question_key (the same field key the answers dict uses) — ready to
    hand straight to generate_page2_summary_with_fallback's `transcripts`
    param."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            # Deterministic order + LIMIT so an oversized submission degrades
            # to a stable subset rather than an unbounded memory load.
            "SELECT question_key, audio_data, mime_type FROM voice_clips "
            "WHERE submission_id = $1 ORDER BY question_key LIMIT $2",
            submission_id, _MAX_CLIPS,
        )
    if not rows:
        return {}
    if len(rows) == _MAX_CLIPS:
        logger.warning("voice.clip_limit_hit", submission_id=str(submission_id), limit=_MAX_CLIPS)

    semaphore = asyncio.Semaphore(_MAX_CONCURRENT)

    async with httpx.AsyncClient() as client:
        async def _bounded(row: asyncpg.Record) -> str | None:
            async with semaphore:
                return await _transcribe_clip(client, row["audio_data"], row["mime_type"], row["question_key"])

        texts = await asyncio.gather(*(_bounded(row) for row in rows))

    transcripts = {row["question_key"]: text for row, text in zip(rows, texts) if text}
    logger.info(
        "voice.transcribed",
        submission_id=str(submission_id),
        clips=len(rows),
        transcribed=len(transcripts),
    )
    return transcripts

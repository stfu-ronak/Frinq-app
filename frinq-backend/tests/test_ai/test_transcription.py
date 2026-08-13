from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.core.ai import transcription


class _FakeConn:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        return self._rows


class _FakeCtx:
    def __init__(self, conn: _FakeConn) -> None:
        self.conn = conn

    async def __aenter__(self) -> _FakeConn:
        return self.conn

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class _FakePool:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def acquire(self) -> _FakeCtx:
        return _FakeCtx(_FakeConn(self._rows))


async def test_no_clips_returns_empty_dict():
    result = await transcription.transcribe_submission_voice_clips(_FakePool([]), uuid4())
    assert result == {}


async def test_transcribes_each_clip_keyed_by_question_key_and_omits_failures(monkeypatch):
    rows = [
        {"question_key": "story", "audio_data": b"a", "mime_type": "audio/mp4"},
        {"question_key": "opinions_why", "audio_data": b"b", "mime_type": "audio/webm"},
    ]

    async def _fake_transcribe(client: Any, audio_bytes: bytes, mime_type: str, question_key: str) -> str | None:
        # opinions_why's clip fails to transcribe (e.g. exhausted retries) —
        # it must be omitted from the result, not raise or return an empty
        # string entry.
        return f"transcript for {question_key}" if question_key == "story" else None

    monkeypatch.setattr(transcription, "_transcribe_clip", _fake_transcribe)

    result = await transcription.transcribe_submission_voice_clips(_FakePool(rows), uuid4())
    assert result == {"story": "transcript for story"}

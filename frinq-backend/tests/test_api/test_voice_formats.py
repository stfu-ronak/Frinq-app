from __future__ import annotations

from typing import Any
from uuid import uuid4

from httpx import AsyncClient

from tests.conftest import FakePool

WEBM_MAGIC = b"\x1a\x45\xdf\xa3"
# Minimal M4A/MP4 container: 4-byte box size + 'ftyp' box type at offset 4.
M4A_MAGIC = b"\x00\x00\x00\x18ftypM4A "


def _own_submission(fake_pool: FakePool, submission_id: Any) -> None:
    fake_pool.store.fetchrow_handler = lambda query, args: {"id": submission_id}


async def test_accepts_valid_webm_signature(client: AsyncClient, fake_pool: FakePool) -> None:
    sid = uuid4()
    _own_submission(fake_pool, sid)

    response = await client.post(
        "/api/v1/voice",
        data={"submission_id": str(sid), "question_key": "q1", "duration_sec": "3"},
        files={"audio": ("clip.webm", WEBM_MAGIC + b"rest-of-file", "audio/webm")},
    )
    assert response.status_code == 200, response.text


async def test_accepts_valid_m4a_signature(client: AsyncClient, fake_pool: FakePool) -> None:
    sid = uuid4()
    _own_submission(fake_pool, sid)

    response = await client.post(
        "/api/v1/voice",
        data={"submission_id": str(sid), "question_key": "q1", "duration_sec": "3"},
        files={"audio": ("clip.m4a", M4A_MAGIC + b"rest-of-file", "audio/mp4")},
    )
    assert response.status_code == 200, response.text


async def test_rejects_unrecognized_format(client: AsyncClient, fake_pool: FakePool) -> None:
    sid = uuid4()
    _own_submission(fake_pool, sid)

    response = await client.post(
        "/api/v1/voice",
        data={"submission_id": str(sid), "question_key": "q1", "duration_sec": "3"},
        files={"audio": ("clip.webm", b"not-a-real-container", "audio/webm")},
    )
    assert response.status_code == 422


async def test_rejects_spoofed_content_type(client: AsyncClient, fake_pool: FakePool) -> None:
    """Client claims audio/mp4 but the bytes are garbage — signature wins, not the header."""
    sid = uuid4()
    _own_submission(fake_pool, sid)

    response = await client.post(
        "/api/v1/voice",
        data={"submission_id": str(sid), "question_key": "q1", "duration_sec": "3"},
        files={"audio": ("clip.m4a", b"totally-fake-bytes", "audio/mp4")},
    )
    assert response.status_code == 422


async def test_rejects_oversized_audio(client: AsyncClient, fake_pool: FakePool) -> None:
    sid = uuid4()
    _own_submission(fake_pool, sid)

    oversized = WEBM_MAGIC + (b"a" * 10_000_001)
    response = await client.post(
        "/api/v1/voice",
        data={"submission_id": str(sid), "question_key": "q1", "duration_sec": "3"},
        files={"audio": ("clip.webm", oversized, "audio/webm")},
    )
    assert response.status_code == 413


async def test_body_size_middleware_allows_up_to_the_real_10mb_cap(client: AsyncClient, fake_pool: FakePool) -> None:
    """A real regression: main.py's body-size middleware once capped voice
    uploads at 6MB even though the handler's own cap is 10MB, silently
    rejecting valid 6-10MB recordings before they ever reached voice.py's
    logic. A 7MB body must reach the handler (and be accepted, being valid
    WebM under the real 10MB cap) rather than getting a generic 413 from
    the middleware layer."""
    sid = uuid4()
    _own_submission(fake_pool, sid)

    seven_mb = WEBM_MAGIC + (b"a" * 7_000_000)
    response = await client.post(
        "/api/v1/voice",
        data={"submission_id": str(sid), "question_key": "q1", "duration_sec": "3"},
        files={"audio": ("clip.webm", seven_mb, "audio/webm")},
    )
    assert response.status_code == 200, response.text


async def test_rejects_too_long_recording(client: AsyncClient, fake_pool: FakePool) -> None:
    sid = uuid4()
    _own_submission(fake_pool, sid)

    response = await client.post(
        "/api/v1/voice",
        data={"submission_id": str(sid), "question_key": "q1", "duration_sec": "121"},
        files={"audio": ("clip.webm", WEBM_MAGIC + b"rest-of-file", "audio/webm")},
    )
    assert response.status_code == 400


async def test_ownership_checked_before_format_sniff(client: AsyncClient, fake_pool: FakePool) -> None:
    """Wrong-owner submission must 404 even with garbage bytes — no format-error leak."""
    fake_pool.store.fetchrow_handler = lambda query, args: None

    response = await client.post(
        "/api/v1/voice",
        data={"submission_id": str(uuid4()), "question_key": "q1", "duration_sec": "3"},
        files={"audio": ("clip.webm", b"not-a-real-container", "audio/webm")},
    )
    assert response.status_code == 404

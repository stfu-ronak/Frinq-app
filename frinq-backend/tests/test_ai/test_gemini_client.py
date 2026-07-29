from __future__ import annotations

import pytest

from app.config import settings
from app.core.ai.gemini_client import call_gemini_json

SCHEMA = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}


@pytest.mark.asyncio
async def test_gemini_3_uses_interactions_structured_output(httpx_mock, monkeypatch) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    httpx_mock.add_response(
        url="https://generativelanguage.googleapis.com/v1beta/interactions",
        json={"output_text": '{"ok": true}', "usage": {"input_tokens": 11, "output_tokens": 7}},
    )
    usage: list[tuple[int, int]] = []

    result = await call_gemini_json(
        system="system", user="user", model="gemini-3-flash-preview", schema=SCHEMA,
        effort="medium", usage_recorder=lambda i, o: usage.append((i, o)),
    )

    request = httpx_mock.get_requests()[0]
    payload = request.content.decode()
    assert request.headers["x-goog-api-key"] == "test-key"
    assert '"model": "gemini-3-flash-preview"' in payload
    assert '"response_format"' in payload
    assert '"mime_type": "application/json"' in payload
    assert "temperature" not in payload
    assert "top_p" not in payload
    assert result == '{"ok": true}'
    assert usage == [(11, 7)]


@pytest.mark.asyncio
async def test_gemma_uses_generate_content_and_extracts_usage(httpx_mock, monkeypatch) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    httpx_mock.add_response(
        url="https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent",
        json={
            "candidates": [{"content": {"parts": [{"text": '{"ok": true}'}]}}],
            "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 4},
        },
    )
    usage: list[tuple[int, int]] = []

    result = await call_gemini_json(
        system="system", user="user", model="gemma-4-31b-it", schema=SCHEMA,
        usage_recorder=lambda i, o: usage.append((i, o)),
    )

    request = httpx_mock.get_requests()[0]
    assert request.url.path.endswith("/models/gemma-4-31b-it:generateContent")
    assert "responseMimeType" in request.content.decode()
    assert result == '{"ok": true}'
    assert usage == [(5, 4)]


@pytest.mark.asyncio
async def test_gemini_requires_backend_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
        await call_gemini_json(system="system", user="user", model="gemini-3-flash-preview", schema=SCHEMA)

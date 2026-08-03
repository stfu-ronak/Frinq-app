from __future__ import annotations

import httpx
import pytest

from app.config import settings
from app.core.ai.openai_client import OpenAIStructuredError, call_openai_structured

SCHEMA = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}
URL = "https://api.openai.com/v1/chat/completions"


@pytest.mark.asyncio
async def test_sends_strict_json_schema_response_format(httpx_mock, monkeypatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")
    httpx_mock.add_response(
        url=URL,
        json={
            "choices": [{"message": {"content": '{"ok": true}'}}],
            "usage": {"prompt_tokens": 11, "completion_tokens": 7},
        },
    )
    usage: list[tuple[int, int]] = []

    result = await call_openai_structured(
        system="system", user="user", schema_name="my_schema", schema=SCHEMA,
        model="gpt-5.5", usage_recorder=lambda i, o: usage.append((i, o)),
    )

    request = httpx_mock.get_requests()[0]
    payload = request.content.decode()
    assert result == {"ok": True}
    assert usage == [(11, 7)]
    assert '"type": "json_schema"' in payload
    assert '"name": "my_schema"' in payload
    assert '"strict": true' in payload


@pytest.mark.asyncio
async def test_safety_identifier_and_prompt_cache_key_pass_through(httpx_mock, monkeypatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")
    httpx_mock.add_response(url=URL, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    await call_openai_structured(
        system="s", user="u", schema_name="n", schema=SCHEMA,
        safety_identifier="user-123", prompt_cache_key="cache-abc",
    )

    payload = httpx_mock.get_requests()[0].content.decode()
    assert '"safety_identifier": "user-123"' in payload
    assert '"prompt_cache_key": "cache-abc"' in payload


@pytest.mark.asyncio
async def test_retries_on_500_then_succeeds(httpx_mock, monkeypatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")
    httpx_mock.add_response(url=URL, status_code=500)
    httpx_mock.add_response(url=URL, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    result = await call_openai_structured(
        system="s", user="u", schema_name="n", schema=SCHEMA, max_retries=2,
    )
    assert result == {"ok": True}
    assert len(httpx_mock.get_requests()) == 2


@pytest.mark.asyncio
async def test_gives_up_after_max_retries(httpx_mock, monkeypatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")
    for _ in range(3):
        httpx_mock.add_response(url=URL, status_code=503)

    with pytest.raises(OpenAIStructuredError) as excinfo:
        await call_openai_structured(system="s", user="u", schema_name="n", schema=SCHEMA, max_retries=2)
    assert excinfo.value.cause_type == "HTTPStatusError"
    assert len(httpx_mock.get_requests()) == 3


@pytest.mark.asyncio
async def test_does_not_retry_on_400(httpx_mock, monkeypatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")
    httpx_mock.add_response(url=URL, status_code=400, json={"error": "bad request"})

    with pytest.raises(OpenAIStructuredError) as excinfo:
        await call_openai_structured(system="s", user="u", schema_name="n", schema=SCHEMA, max_retries=2)
    assert excinfo.value.cause_type == "HTTPStatusError"
    assert len(httpx_mock.get_requests()) == 1


@pytest.mark.asyncio
async def test_retries_on_timeout(httpx_mock, monkeypatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")
    httpx_mock.add_exception(httpx.TimeoutException("timed out"))
    httpx_mock.add_response(url=URL, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    result = await call_openai_structured(system="s", user="u", schema_name="n", schema=SCHEMA, max_retries=2)
    assert result == {"ok": True}


@pytest.mark.asyncio
async def test_malformed_json_body_raises_wrapped_error(httpx_mock, monkeypatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")
    for _ in range(3):
        httpx_mock.add_response(url=URL, json={"choices": [{"message": {"content": "not json"}}]})

    with pytest.raises(OpenAIStructuredError) as excinfo:
        await call_openai_structured(system="s", user="u", schema_name="n", schema=SCHEMA, max_retries=2)
    assert excinfo.value.cause_type == "JSONDecodeError"


@pytest.mark.asyncio
async def test_requires_api_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        await call_openai_structured(system="s", user="u", schema_name="n", schema=SCHEMA)

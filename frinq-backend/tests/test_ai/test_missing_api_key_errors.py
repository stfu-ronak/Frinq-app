"""Every provider client must fail with an actionable RuntimeError when its
API key is unset — never an opaque SDK/library error.

This existed for openai_client and gemini_client but not claude_client, which
passed the empty key straight into AsyncAnthropic() and surfaced a bare
TypeError. The admin /ai-test endpoint reports only `type(exc).__name__`, so
"AI test failed: TypeError" was indistinguishable from a genuine code bug —
it cost real debugging time against a provider that was never even called.
"""
import pytest

from app.core.ai import claude_client, gemini_client, openai_client


@pytest.mark.asyncio
async def test_openai_missing_key_raises_runtime_error(monkeypatch):
    monkeypatch.setattr(openai_client.settings, "OPENAI_API_KEY", "")
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY is not set"):
        await openai_client.call_openai_json(system="s", user="u")


@pytest.mark.asyncio
async def test_openai_structured_missing_key_raises_runtime_error(monkeypatch):
    monkeypatch.setattr(openai_client.settings, "OPENAI_API_KEY", "")
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY is not set"):
        await openai_client.call_openai_structured(
            system="s", user="u", schema_name="n", schema={"type": "object"},
        )


@pytest.mark.asyncio
async def test_gemini_missing_key_raises_runtime_error(monkeypatch):
    monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", "")
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY is not set"):
        await gemini_client.call_gemini_json(
            system="s", user="u", model="gemini-3.5-flash-lite", schema={"type": "object"},
        )


def test_claude_missing_key_raises_runtime_error_not_typeerror(monkeypatch):
    # Reset the module-level singleton so the guard is actually reached; a
    # client cached by an earlier test would skip it entirely.
    monkeypatch.setattr(claude_client, "_client", None)
    monkeypatch.setattr(claude_client.settings, "ANTHROPIC_API_KEY", "")
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY is not set"):
        claude_client.get_client()

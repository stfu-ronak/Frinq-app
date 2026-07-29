from __future__ import annotations

import pytest

from app.config import settings
from app.main import app, lifespan


async def _enter_and_exit_lifespan() -> None:
    async with lifespan(app):
        pass


async def test_production_requires_review_otp_expiry_when_review_phone_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "a-real-production-secret")
    monkeypatch.setattr(settings, "SESSION_HASH_PEPPER", "a-real-session-pepper")
    monkeypatch.setattr(settings, "RATE_LIMIT_PEPPER", "a-real-rate-limit-pepper")
    monkeypatch.setattr(settings, "PUSH_TOKEN_HASH_PEPPER", "a-real-push-pepper")
    monkeypatch.setattr(settings, "ADMIN_KEY", "a-real-admin-key")
    monkeypatch.setattr(settings, "ADMIN_ACTION_PASSWORD", "a-real-password")
    monkeypatch.setattr(settings, "CORS_ORIGINS", "https://app.frinq.in")
    monkeypatch.setattr(settings, "REVIEW_PHONE", "9999999999")
    monkeypatch.setattr(settings, "REVIEW_OTP", "some-high-entropy-code")
    monkeypatch.setattr(settings, "REVIEW_OTP_EXPIRES_AT", "")

    with pytest.raises(RuntimeError, match="REVIEW_OTP_EXPIRES_AT"):
        await _enter_and_exit_lifespan()


async def test_production_allows_review_bypass_with_expiry_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "a-real-production-secret")
    monkeypatch.setattr(settings, "SESSION_HASH_PEPPER", "a-real-session-pepper")
    monkeypatch.setattr(settings, "RATE_LIMIT_PEPPER", "a-real-rate-limit-pepper")
    monkeypatch.setattr(settings, "PUSH_TOKEN_HASH_PEPPER", "a-real-push-pepper")
    monkeypatch.setattr(settings, "ADMIN_KEY", "a-real-admin-key")
    monkeypatch.setattr(settings, "ADMIN_ACTION_PASSWORD", "a-real-password")
    monkeypatch.setattr(settings, "ADMIN_ACTOR_ID", "dhairya")
    monkeypatch.setattr(settings, "CORS_ORIGINS", "https://app.frinq.in")
    monkeypatch.setattr(settings, "DATABASE_URL", "postgresql://user:pass@realhost:5432/db")
    monkeypatch.setattr(settings, "REDIS_URL", "redis://realhost:6379/0")
    monkeypatch.setattr(settings, "SKIP_OTP_VERIFICATION", False)
    monkeypatch.setattr(settings, "TEST_PHONES", "")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-a-real-openai-key")
    monkeypatch.setattr(settings, "REVIEW_PHONE", "9999999999")
    monkeypatch.setattr(settings, "REVIEW_OTP", "some-high-entropy-code")
    monkeypatch.setattr(settings, "REVIEW_OTP_EXPIRES_AT", "2099-01-01T00:00:00+00:00")

    await _enter_and_exit_lifespan()


async def test_production_rejects_default_session_hash_pepper(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "a-real-production-secret")
    monkeypatch.setattr(settings, "SESSION_HASH_PEPPER", "dev-pepper-change-me")
    with pytest.raises(RuntimeError, match="SESSION_HASH_PEPPER"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_default_rate_limit_pepper(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "a-real-production-secret")
    monkeypatch.setattr(settings, "SESSION_HASH_PEPPER", "a-real-session-pepper")
    monkeypatch.setattr(settings, "RATE_LIMIT_PEPPER", "dev-rate-limit-pepper-change-me")
    with pytest.raises(RuntimeError, match="RATE_LIMIT_PEPPER"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_default_push_token_hash_pepper(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "a-real-production-secret")
    monkeypatch.setattr(settings, "SESSION_HASH_PEPPER", "a-real-session-pepper")
    monkeypatch.setattr(settings, "RATE_LIMIT_PEPPER", "a-real-rate-limit-pepper")
    monkeypatch.setattr(settings, "PUSH_TOKEN_HASH_PEPPER", "dev-push-pepper-change-me")
    with pytest.raises(RuntimeError, match="PUSH_TOKEN_HASH_PEPPER"):
        await _enter_and_exit_lifespan()


def _set_all_valid(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every field validate_production_settings checks, set to a value that
    passes every rule — individual tests below monkeypatch exactly one field
    away from valid to isolate the one rule they're testing."""
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "a-real-production-secret")
    monkeypatch.setattr(settings, "SESSION_HASH_PEPPER", "a-real-session-pepper")
    monkeypatch.setattr(settings, "RATE_LIMIT_PEPPER", "a-real-rate-limit-pepper")
    monkeypatch.setattr(settings, "PUSH_TOKEN_HASH_PEPPER", "a-real-push-pepper")
    monkeypatch.setattr(settings, "ADMIN_KEY", "a-real-admin-key")
    monkeypatch.setattr(settings, "ADMIN_ACTION_PASSWORD", "a-real-password")
    monkeypatch.setattr(settings, "ADMIN_ACTOR_ID", "dhairya")
    monkeypatch.setattr(settings, "CORS_ORIGINS", "https://app.frinq.in")
    monkeypatch.setattr(settings, "DATABASE_URL", "postgresql://user:pass@realhost:5432/db")
    monkeypatch.setattr(settings, "REDIS_URL", "redis://realhost:6379/0")
    monkeypatch.setattr(settings, "PUSH_TOKEN_ENCRYPTION_KEY", "")
    monkeypatch.setattr(settings, "REVIEW_PHONE", "")
    monkeypatch.setattr(settings, "REVIEW_OTP", "")
    monkeypatch.setattr(settings, "REVIEW_OTP_EXPIRES_AT", "")
    monkeypatch.setattr(settings, "SKIP_OTP_VERIFICATION", False)
    monkeypatch.setattr(settings, "TEST_PHONES", "")
    monkeypatch.setattr(settings, "INSIGHTS_PROVIDER", "openai")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-a-real-openai-key")


async def test_production_passes_with_every_field_valid(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    await _enter_and_exit_lifespan()


async def test_production_rejects_missing_ai_key_for_active_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # INSIGHTS_PROVIDER=openai but no OPENAI_API_KEY would 500 every quiz reveal.
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_missing_gemini_key_for_active_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "INSIGHTS_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_default_admin_actor_id(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "ADMIN_ACTOR_ID", "admin")
    with pytest.raises(RuntimeError, match="ADMIN_ACTOR_ID"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_empty_admin_actor_id(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "ADMIN_ACTOR_ID", "")
    with pytest.raises(RuntimeError, match="ADMIN_ACTOR_ID"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_overlapping_admin_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "ADMIN_ACTION_PASSWORD", "a-real-admin-key")  # same as ADMIN_KEY
    with pytest.raises(RuntimeError, match="ADMIN_KEY and ADMIN_ACTION_PASSWORD"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_wildcard_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "CORS_ORIGINS", "*")
    with pytest.raises(RuntimeError, match="wildcard"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_cleartext_cors_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "CORS_ORIGINS", "http://app.frinq.in")
    with pytest.raises(RuntimeError, match="cleartext http"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_missing_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "DATABASE_URL", "")
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_default_redis_url(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "REDIS_URL", "redis://localhost:6379/0")
    with pytest.raises(RuntimeError, match="REDIS_URL"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_invalid_push_token_encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "PUSH_TOKEN_ENCRYPTION_KEY", "not-a-real-fernet-key")
    with pytest.raises(RuntimeError, match="PUSH_TOKEN_ENCRYPTION_KEY"):
        await _enter_and_exit_lifespan()


async def test_production_accepts_a_real_fernet_push_token_encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from cryptography.fernet import Fernet

    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "PUSH_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    await _enter_and_exit_lifespan()


async def test_production_rejects_skip_otp_verification_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "SKIP_OTP_VERIFICATION", True)
    with pytest.raises(RuntimeError, match="SKIP_OTP_VERIFICATION"):
        await _enter_and_exit_lifespan()


async def test_production_rejects_nonempty_test_phones(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_all_valid(monkeypatch)
    monkeypatch.setattr(settings, "TEST_PHONES", "9876543210")
    with pytest.raises(RuntimeError, match="TEST_PHONES"):
        await _enter_and_exit_lifespan()

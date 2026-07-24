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
    monkeypatch.setattr(settings, "ADMIN_KEY", "a-real-admin-key")
    monkeypatch.setattr(settings, "ADMIN_ACTION_PASSWORD", "a-real-password")
    monkeypatch.setattr(settings, "CORS_ORIGINS", "https://app.frinq.in")
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

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings
from app.core.otp import _review_bypass_allowed, _test_phone_bypass_allowed


def test_test_phone_bypass_requires_non_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "DUMMY_OTP", "000000")
    monkeypatch.setattr(settings, "TEST_PHONES", "9999999999")
    assert _test_phone_bypass_allowed("9999999999") is False


def test_test_phone_bypass_allowed_in_staging(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "staging")
    monkeypatch.setattr(settings, "DUMMY_OTP", "000000")
    monkeypatch.setattr(settings, "TEST_PHONES", "9999999999, 8888888888")
    assert _test_phone_bypass_allowed("9999999999") is True
    assert _test_phone_bypass_allowed("8888888888") is True
    assert _test_phone_bypass_allowed("7777777777") is False


def test_review_bypass_rejects_missing_expiry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "REVIEW_PHONE", "9999999999")
    monkeypatch.setattr(settings, "REVIEW_OTP", "high-entropy")
    monkeypatch.setattr(settings, "REVIEW_OTP_EXPIRES_AT", "")
    assert _review_bypass_allowed("9999999999") is False


def test_review_bypass_rejects_expired(monkeypatch: pytest.MonkeyPatch) -> None:
    past = datetime.now(timezone.utc) - timedelta(days=1)
    monkeypatch.setattr(settings, "REVIEW_PHONE", "9999999999")
    monkeypatch.setattr(settings, "REVIEW_OTP", "high-entropy")
    monkeypatch.setattr(settings, "REVIEW_OTP_EXPIRES_AT", past.isoformat())
    assert _review_bypass_allowed("9999999999") is False


def test_review_bypass_rejects_more_than_30_days_out(monkeypatch: pytest.MonkeyPatch) -> None:
    far_future = datetime.now(timezone.utc) + timedelta(days=45)
    monkeypatch.setattr(settings, "REVIEW_PHONE", "9999999999")
    monkeypatch.setattr(settings, "REVIEW_OTP", "high-entropy")
    monkeypatch.setattr(settings, "REVIEW_OTP_EXPIRES_AT", far_future.isoformat())
    assert _review_bypass_allowed("9999999999") is False


def test_review_bypass_allowed_within_window(monkeypatch: pytest.MonkeyPatch) -> None:
    soon = datetime.now(timezone.utc) + timedelta(days=10)
    monkeypatch.setattr(settings, "REVIEW_PHONE", "9999999999")
    monkeypatch.setattr(settings, "REVIEW_OTP", "high-entropy")
    monkeypatch.setattr(settings, "REVIEW_OTP_EXPIRES_AT", soon.isoformat())
    assert _review_bypass_allowed("9999999999") is True
    assert _review_bypass_allowed("8888888888") is False

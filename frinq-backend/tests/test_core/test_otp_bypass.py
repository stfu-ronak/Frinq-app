from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings
from app.core.otp import (
    _dev_bypass_allowed,
    _review_bypass_allowed,
    _skip_all_otp,
    _test_phone_bypass_allowed,
)


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


def test_dev_bypass_works_in_production_when_explicitly_allowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The owner runs manual test passes against live, so the single
    DEV_PHONE account must be able to log in with DUMMY_OTP in production
    when ALLOW_TEST_OTP_IN_PROD is on (set in .do/app.yaml). If this ever
    starts failing, production manual testing is silently broken."""
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "ALLOW_TEST_OTP_IN_PROD", True)
    monkeypatch.setattr(settings, "DUMMY_OTP", "000000")
    monkeypatch.setattr(settings, "DEV_PHONE", "9876543210")
    monkeypatch.setattr(settings, "TEST_PHONES", "")
    assert _dev_bypass_allowed() is True


def test_dev_bypass_stays_off_in_production_without_the_explicit_flag(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The flag is the whole safety boundary: a DUMMY_OTP that leaks into a
    prod env by itself must never become a working backdoor."""
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "ALLOW_TEST_OTP_IN_PROD", False)
    monkeypatch.setattr(settings, "DUMMY_OTP", "000000")
    monkeypatch.setattr(settings, "DEV_PHONE", "9876543210")
    monkeypatch.setattr(settings, "TEST_PHONES", "")
    assert _dev_bypass_allowed() is False


def test_allowing_dev_bypass_in_prod_does_not_open_the_global_skip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ALLOW_TEST_OTP_IN_PROD grants exactly ONE account. It must not widen
    into SKIP_OTP_VERIFICATION (every phone) or TEST_PHONES (several) — those
    stay hard-off in production no matter how the env is configured."""
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "ALLOW_TEST_OTP_IN_PROD", True)
    monkeypatch.setattr(settings, "DUMMY_OTP", "000000")
    monkeypatch.setattr(settings, "DEV_PHONE", "9876543210")
    monkeypatch.setattr(settings, "SKIP_OTP_VERIFICATION", True)
    monkeypatch.setattr(settings, "TEST_PHONES", "8888888888")

    assert _skip_all_otp() is False
    assert _test_phone_bypass_allowed("8888888888") is False
    # A phone that is neither DEV_PHONE nor a review phone gets nothing.
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

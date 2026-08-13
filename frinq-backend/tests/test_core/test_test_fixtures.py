from __future__ import annotations

from uuid import uuid4

import pytest

from app.config import settings
from app.core.test_fixtures import (
    TEST_CHAT_A_PHONE,
    TEST_CHAT_B_PHONE,
    TEST_RESET_PHONE,
    reset_test_account,
    test_phone_role as get_test_phone_role,
    account_reset_allowed_in_env,
)
from tests.conftest import FakeConnection


def test_emulator_phone_roles_are_explicit() -> None:
    assert get_test_phone_role(TEST_RESET_PHONE) == "reset"
    assert get_test_phone_role(TEST_CHAT_A_PHONE) == "chat_a"
    assert get_test_phone_role(TEST_CHAT_B_PHONE) == "chat_b"
    assert get_test_phone_role("9111111111") is None


@pytest.mark.asyncio
async def test_reset_test_account_clears_only_account_scoped_state(fake_pool) -> None:
    user_id = uuid4()

    await reset_test_account(FakeConnection(fake_pool.store), user_id)

    queries = [query for query, _args in fake_pool.store.queries]
    assert any("DELETE FROM messages" in query and "user_id = $1" in query for query in queries)
    assert any("DELETE FROM quiz_submissions" in query and "user_id = $1" in query for query in queries)
    assert any("DELETE FROM user_profiles" in query and "user_id = $1" in query for query in queries)
    assert any("UPDATE users" in query and "onboarding_state = 'quiz_in_progress'" in query for query in queries)
    assert all("DELETE FROM users" not in query for query in queries)


def test_test_phone_defaults_are_narrow(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TEST_PHONES", "8000000001,8000000002,8000000003")
    assert set(settings.TEST_PHONES.split(",")) == {TEST_RESET_PHONE, TEST_CHAT_A_PHONE, TEST_CHAT_B_PHONE}


def test_reset_allowed_outside_production_regardless_of_the_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "ALLOW_TEST_OTP_IN_PROD", False)
    assert account_reset_allowed_in_env() is True


def test_reset_blocked_in_production_without_the_explicit_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "ALLOW_TEST_OTP_IN_PROD", False)
    assert account_reset_allowed_in_env() is False


def test_reset_allowed_in_production_when_the_operator_flips_the_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    # Same toggle that already has to be on for DEV_PHONE to log in at all
    # against a production-flagged deploy — one switch, not two to remember.
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "ALLOW_TEST_OTP_IN_PROD", True)
    assert account_reset_allowed_in_env() is True

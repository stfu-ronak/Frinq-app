"""Development-only emulator fixture accounts and reset behavior."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from app.config import settings

TEST_RESET_PHONE = "8000000001"
TEST_CHAT_A_PHONE = "8000000002"
TEST_CHAT_B_PHONE = "8000000003"
TestPhoneRole = Literal["reset", "chat_a", "chat_b"]

_ROLES: dict[str, TestPhoneRole] = {
    TEST_RESET_PHONE: "reset",
    TEST_CHAT_A_PHONE: "chat_a",
    TEST_CHAT_B_PHONE: "chat_b",
}


def test_phone_role(phone: str) -> TestPhoneRole | None:
    digits = phone.replace("+91", "").replace(" ", "").strip()
    if digits not in _configured_test_phones():
        return None
    return _ROLES.get(digits)


def is_test_phone(phone: str) -> bool:
    return test_phone_role(phone) is not None


def _configured_test_phones() -> set[str]:
    configured = {p.strip() for p in settings.TEST_PHONES.split(",") if p.strip()}
    return configured or set(_ROLES)


async def reset_test_account(conn: Any, user_id: UUID) -> None:
    """Clear all user-owned onboarding state without deleting the account row."""
    await conn.execute("DELETE FROM message_reports WHERE reporter_user_id = $1", user_id)
    await conn.execute("DELETE FROM messages WHERE user_id = $1", user_id)
    await conn.execute(
        "DELETE FROM user_blocks WHERE blocker_user_id = $1 OR blocked_user_id = $1",
        user_id,
    )
    await conn.execute("DELETE FROM push_tokens WHERE user_id = $1", user_id)
    await conn.execute("DELETE FROM legal_acceptances WHERE user_id = $1", user_id)
    await conn.execute("DELETE FROM questionnaire_responses WHERE user_id = $1", user_id)
    await conn.execute("DELETE FROM user_profiles WHERE user_id = $1", user_id)
    await conn.execute(
        "DELETE FROM ai_usage_log WHERE submission_id IN "
        "(SELECT id FROM quiz_submissions WHERE user_id = $1)",
        user_id,
    )
    await conn.execute(
        "DELETE FROM voice_clips WHERE submission_id IN "
        "(SELECT id FROM quiz_submissions WHERE user_id = $1)",
        user_id,
    )
    await conn.execute("DELETE FROM quiz_submissions WHERE user_id = $1", user_id)
    await conn.execute("DELETE FROM community_members WHERE user_id = $1", user_id)
    await conn.execute("DELETE FROM user_sessions WHERE user_id = $1", user_id)
    await conn.execute(
        "UPDATE users SET display_name = NULL, gender = NULL, age = NULL, "
        "ncr_zone = NULL, schedule = '{}', onboarding_complete = FALSE, "
        "onboarding_state = 'quiz_in_progress', terms_version = NULL, "
        "terms_accepted_at = NULL, privacy_version = NULL, privacy_accepted_at = NULL, "
        "banned = FALSE, banned_reason = NULL, banned_at = NULL, suspended_until = NULL, "
        "updated_at = now() WHERE id = $1",
        user_id,
    )

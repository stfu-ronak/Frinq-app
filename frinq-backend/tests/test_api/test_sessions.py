from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.deps import get_current_account
from app.core.session import (
    SessionReuseError,
    create_session,
    decode_access_token,
    rotate_session,
)
from app.migrations import MIGRATIONS_DIR, discover_migrations
from tests.conftest import FakePool


def _migration_011_sql() -> str:
    return (MIGRATIONS_DIR / "011_accounts_and_sessions.sql").read_text(encoding="utf-8")


def test_migration_011_is_discovered_in_order() -> None:
    versions = [version for version, _, _ in discover_migrations()]
    assert versions == sorted(versions)
    assert 11 in versions
    names = {name for _, name, _ in discover_migrations()}
    assert "011_accounts_and_sessions.sql" in names


def test_supabase_uid_becomes_nullable() -> None:
    sql = _migration_011_sql()
    assert "ALTER TABLE users ALTER COLUMN supabase_uid DROP NOT NULL" in sql
    # unique constraint must not be touched
    assert "supabase_uid UNIQUE" not in sql
    assert "DROP CONSTRAINT" not in sql


def test_onboarding_state_column_and_check() -> None:
    sql = _migration_011_sql()
    assert "onboarding_state" in sql
    assert "quiz_in_progress" in sql
    assert "profile_processing" in sql
    assert "'active'" in sql
    assert "'error'" in sql
    assert "CHECK (onboarding_state IN" in sql
    assert "DEFAULT 'quiz_in_progress'" in sql


def test_users_gains_ban_and_terms_columns() -> None:
    sql = _migration_011_sql()
    for column in ("banned", "banned_reason", "banned_at", "last_seen_at", "terms_version", "terms_accepted_at"):
        assert column in sql


def test_quiz_submissions_gains_ownership_columns() -> None:
    sql = _migration_011_sql()
    assert "quiz_submissions ADD COLUMN user_id" in sql
    assert "REFERENCES users(id) ON DELETE CASCADE" in sql
    assert "quiz_submissions ADD COLUMN archetype_slug" in sql


def test_user_sessions_table_matches_target_shape() -> None:
    sql = _migration_011_sql()
    assert "CREATE TABLE user_sessions" in sql
    for column in (
        "id",
        "user_id",
        "refresh_secret_hash",
        "platform",
        "expires_at",
        "created_at",
        "last_used_at",
        "revoked_at",
    ):
        assert column in sql
    assert "CHECK (platform IN ('ios', 'android', 'web'))" in sql


def test_required_indexes_present() -> None:
    sql = _migration_011_sql()
    assert "user_sessions(user_id)" in sql
    assert "user_sessions(expires_at)" in sql
    assert "quiz_submissions(user_id)" in sql
    assert "users(onboarding_state)" in sql


def test_quiz_submissions_user_id_column_exists_before_it_is_referenced() -> None:
    """The whole file runs as one statement inside one transaction (see
    app/migrations.py) -- referencing qs.user_id before the ADD COLUMN that
    creates it would fail the entire migration against a real database. No
    live Postgres is available in this environment to execute the SQL and
    catch that directly, so assert statement order instead."""
    sql = _migration_011_sql()
    add_column_pos = sql.index("ADD COLUMN user_id UUID REFERENCES users(id)")
    first_reference_pos = sql.index("qs.user_id")
    assert add_column_pos < first_reference_pos


# ─── Task 4: session primitives ────────────────────────────────────────

class _NoopTransaction:
    async def __aenter__(self) -> "_NoopTransaction":
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class _FakeSessionConnection:
    """Models exactly the user_sessions row lifecycle create/rotate_session
    touch: one row, mutated in place by INSERT then UPDATE. `onboarding_state`
    defaults to the mid-quiz value so callers that don't care about the
    quiz-completion TTL split can ignore it entirely."""

    def __init__(self, onboarding_state: str = "quiz_in_progress") -> None:
        self.row: dict[str, Any] | None = None
        self.onboarding_state = onboarding_state

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        if "SELECT * FROM user_sessions" in query:
            return dict(self.row) if self.row is not None else None
        if "SELECT onboarding_state FROM users" in query:
            return {"onboarding_state": self.onboarding_state}
        return None

    async def execute(self, query: str, *args: Any) -> str:
        if query.strip().startswith("INSERT INTO user_sessions"):
            session_id, user_id, secret_hash, platform, expires_at = args
            self.row = {
                "id": session_id,
                "user_id": user_id,
                "refresh_secret_hash": secret_hash,
                "platform": platform,
                "expires_at": expires_at,
                "revoked_at": None,
            }
        elif "SET refresh_secret_hash" in query:
            new_hash, new_expires_at, _session_id = args
            assert self.row is not None
            self.row["refresh_secret_hash"] = new_hash
            self.row["expires_at"] = new_expires_at
        elif "SET revoked_at = now()" in query:
            assert self.row is not None
            self.row["revoked_at"] = datetime.now(timezone.utc)
        return "OK"

    def transaction(self) -> _NoopTransaction:
        return _NoopTransaction()


async def test_access_token_contains_user_session_and_type() -> None:
    conn = _FakeSessionConnection()
    user_id = uuid4()
    pair = await create_session(conn, user_id, "android")

    claims = decode_access_token(pair.access_token)
    assert claims.sub == user_id
    assert claims.type == "access"
    assert str(claims.sid) == pair.refresh_token.split(".", 1)[0]


async def test_refresh_rotation_rejects_old_secret() -> None:
    conn = _FakeSessionConnection()
    user_id = uuid4()
    first = await create_session(conn, user_id, "android")

    second = await rotate_session(conn, first.refresh_token)
    assert second.refresh_token != first.refresh_token

    with pytest.raises(SessionReuseError):
        await rotate_session(conn, first.refresh_token)


async def test_rotation_of_expired_session_is_rejected() -> None:
    conn = _FakeSessionConnection()
    user_id = uuid4()
    pair = await create_session(conn, user_id, "ios")
    conn.row["expires_at"] = datetime.now(timezone.utc) - timedelta(days=1)

    with pytest.raises(SessionReuseError):
        await rotate_session(conn, pair.refresh_token)


# ─── Quiz-completion-dependent session TTL ─────────────────────────────

async def test_incomplete_quiz_session_gets_fixed_twelve_hour_window() -> None:
    conn = _FakeSessionConnection(onboarding_state="quiz_in_progress")
    pair = await create_session(conn, uuid4(), "android")

    expires_at = conn.row["expires_at"]
    delta = expires_at - datetime.now(timezone.utc)
    assert timedelta(hours=11, minutes=55) < delta <= timedelta(hours=12)
    assert pair.refresh_token  # sanity: token still issued normally


async def test_completed_quiz_session_gets_seven_day_window() -> None:
    conn = _FakeSessionConnection(onboarding_state="active")
    await create_session(conn, uuid4(), "android")

    expires_at = conn.row["expires_at"]
    delta = expires_at - datetime.now(timezone.utc)
    assert timedelta(days=6, hours=23) < delta <= timedelta(days=7)


async def test_incomplete_quiz_rotation_does_not_extend_the_fixed_window() -> None:
    """The whole point of the 12h window is that it does NOT grow just
    because the app was used — only finishing the quiz changes that."""
    conn = _FakeSessionConnection(onboarding_state="quiz_in_progress")
    first = await create_session(conn, uuid4(), "android")
    original_expiry = conn.row["expires_at"]

    await rotate_session(conn, first.refresh_token)

    assert conn.row["expires_at"] == original_expiry


async def test_completed_quiz_rotation_rolls_the_window_forward() -> None:
    conn = _FakeSessionConnection(onboarding_state="active")
    first = await create_session(conn, uuid4(), "android")
    # Simulate real time passing between create and rotate — a same-tick
    # comparison can't tell "rolled forward" apart from "recomputed to the
    # same instant".
    conn.row["expires_at"] -= timedelta(days=1)
    original_expiry = conn.row["expires_at"]

    await rotate_session(conn, first.refresh_token)

    assert conn.row["expires_at"] > original_expiry


async def test_finishing_the_quiz_mid_session_upgrades_to_the_rolling_window() -> None:
    """A session created while mid-quiz (fixed 12h) should switch to the
    rolling 7-day window the first time it's refreshed after the quiz is
    marked complete — matching the account's *current* state, not the state
    at the moment the session was first created."""
    conn = _FakeSessionConnection(onboarding_state="quiz_in_progress")
    first = await create_session(conn, uuid4(), "android")

    conn.onboarding_state = "active"
    await rotate_session(conn, first.refresh_token)

    delta = conn.row["expires_at"] - datetime.now(timezone.utc)
    assert delta > timedelta(days=6)


async def test_banned_user_cannot_authenticate(user_row: dict[str, Any]) -> None:
    conn = _FakeSessionConnection()
    user_id = uuid4()
    pair = await create_session(conn, user_id, "web")
    banned_row = {**user_row, "id": user_id, "banned": True}

    pool = FakePool()

    def _handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if "user_sessions" in query:
            return dict(conn.row)
        return banned_row

    pool.store.fetchrow_handler = _handler

    with pytest.raises(HTTPException) as exc_info:
        await get_current_account(authorization=f"Bearer {pair.access_token}", pool=pool)
    assert exc_info.value.status_code == 403

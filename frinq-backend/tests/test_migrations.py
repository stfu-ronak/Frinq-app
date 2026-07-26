from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from typing import Any

import pytest

from app.migrations import discover_migrations, run_migrations


class _NoopTransaction:
    async def __aenter__(self) -> "_NoopTransaction":
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class FakeDbState:
    """In-memory stand-in for the pieces of Postgres the migration runner
    touches: the schema_migrations table and whether the pre-runner legacy
    tables (users, quiz_submissions) already exist."""

    def __init__(self, legacy_tables_exist: bool = False) -> None:
        self.schema_migrations: dict[int, dict[str, Any]] = {}
        self.executed_sql: list[str] = []
        self.legacy_tables_exist = legacy_tables_exist


class FakeMigrationConnection:
    def __init__(self, state: FakeDbState) -> None:
        self.state = state

    async def execute(self, query: str, *args: Any) -> str:
        upper = query.strip().upper()
        if upper.startswith("SELECT PG_ADVISORY_LOCK") or upper.startswith("SELECT PG_ADVISORY_UNLOCK"):
            return "SELECT 1"
        if upper.startswith("CREATE TABLE IF NOT EXISTS SCHEMA_MIGRATIONS"):
            return "CREATE TABLE"
        if upper.startswith("INSERT INTO SCHEMA_MIGRATIONS"):
            version, filename, checksum = args
            if version in self.state.schema_migrations:
                return "INSERT 0 0"  # ON CONFLICT DO NOTHING path
            self.state.schema_migrations[version] = {
                "version": version, "filename": filename, "checksum": checksum,
            }
            return "INSERT 0 1"
        # Anything else is a migration file's own SQL being applied.
        self.state.executed_sql.append(query)
        return "OK"

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        if "SCHEMA_MIGRATIONS" in query.upper():
            return sorted(self.state.schema_migrations.values(), key=lambda r: r["version"])
        return []

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        if "to_regclass" in query:
            return {
                "users_exists": self.state.legacy_tables_exist,
                "quiz_submissions_exists": self.state.legacy_tables_exist,
            }
        return None

    def transaction(self) -> _NoopTransaction:
        return _NoopTransaction()


class FakeMigrationPool:
    def __init__(self, state: FakeDbState) -> None:
        self.state = state

    @contextlib.asynccontextmanager
    async def acquire(self) -> AsyncIterator[FakeMigrationConnection]:
        yield FakeMigrationConnection(self.state)


async def test_migrations_apply_in_numeric_order() -> None:
    discovered_names = [name for _, name, _ in discover_migrations()][:3]
    assert discovered_names == [
        "001_initial.sql",
        "002_quiz_submissions.sql",
        "003_otp_and_verification.sql",
    ]


async def test_applied_checksum_mismatch_fails_closed() -> None:
    state = FakeDbState(legacy_tables_exist=False)
    # Pretend version 1 was already recorded, but with a checksum that
    # doesn't match the real file on disk.
    state.schema_migrations[1] = {
        "version": 1, "filename": "001_initial.sql", "checksum": "0" * 64,
    }
    pool = FakeMigrationPool(state)
    with pytest.raises(RuntimeError, match="checksum mismatch"):
        await run_migrations(pool)


async def test_existing_legacy_database_is_baselined_once() -> None:
    state = FakeDbState(legacy_tables_exist=True)
    pool = FakeMigrationPool(state)
    executed_names = await run_migrations(pool)
    recorded_versions = sorted(state.schema_migrations.keys())
    assert recorded_versions == list(range(1, 17))
    assert executed_names == [
        "010_legacy_schema_baseline.sql",
        "011_accounts_and_sessions.sql",
        "012_communities_and_chat.sql",
        "013_quiz_retry_count.sql",
        "014_admin_moderation.sql",
        "015_legal_and_deletion.sql",
        "016_admin_user_actions.sql",
    ]

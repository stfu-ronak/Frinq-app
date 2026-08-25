from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from typing import Any

import pytest

from app.migrations import MIGRATIONS_DIR, discover_migrations, run_migrations


class _NoopTransaction:
    async def __aenter__(self) -> "_NoopTransaction":
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class FakeDbState:
    """In-memory stand-in for the pieces of Postgres the migration runner
    touches: the schema_migrations table and whether the pre-runner legacy
    tables (users, quiz_submissions) already exist."""

    def __init__(
        self,
        legacy_tables_exist: bool = False,
        adopted_column_exists: bool = True,
    ) -> None:
        self.schema_migrations: dict[int, dict[str, Any]] = {}
        self.executed_sql: list[str] = []
        self.legacy_tables_exist = legacy_tables_exist
        # False models a database baselined before the `adopted` column
        # existed, which is what triggers the one-time backfill.
        self.adopted_column_exists = adopted_column_exists


class FakeMigrationConnection:
    def __init__(self, state: FakeDbState) -> None:
        self.state = state

    async def execute(self, query: str, *args: Any) -> str:
        upper = query.strip().upper()
        if upper.startswith("SELECT PG_ADVISORY_LOCK") or upper.startswith("SELECT PG_ADVISORY_UNLOCK"):
            return "SELECT 1"
        if upper.startswith("CREATE TABLE IF NOT EXISTS SCHEMA_MIGRATIONS"):
            return "CREATE TABLE"
        if upper.startswith("ALTER TABLE SCHEMA_MIGRATIONS"):
            self.state.adopted_column_exists = True
            return "ALTER TABLE"
        if upper.startswith("UPDATE SCHEMA_MIGRATIONS SET ADOPTED"):
            (max_version,) = args
            for version, row in self.state.schema_migrations.items():
                if version <= max_version:
                    row["adopted"] = True
            return "UPDATE"
        if upper.startswith("UPDATE SCHEMA_MIGRATIONS SET FILENAME"):
            version, filename, checksum = args
            row = self.state.schema_migrations[version]
            row["filename"], row["checksum"] = filename, checksum
            return "UPDATE 1"
        if upper.startswith("INSERT INTO SCHEMA_MIGRATIONS"):
            version, filename, checksum = args
            if version in self.state.schema_migrations:
                return "INSERT 0 0"  # ON CONFLICT DO NOTHING path
            self.state.schema_migrations[version] = {
                "version": version,
                "filename": filename,
                "checksum": checksum,
                # The adopt-the-baseline INSERT names the column explicitly;
                # the ordinary post-execution INSERT does not.
                "adopted": "ADOPTED" in upper,
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
        if "information_schema.columns" in query:
            return {"present": 1} if self.state.adopted_column_exists else None
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
    # Pretend version 1 was already executed here, but with a checksum that
    # doesn't match the real file on disk. Not adopted — so the SQL really
    # ran against this database and the mismatch is real drift.
    state.schema_migrations[1] = {
        "version": 1, "filename": "001_initial.sql", "checksum": "0" * 64,
        "adopted": False,
    }
    pool = FakeMigrationPool(state)
    with pytest.raises(RuntimeError, match="checksum mismatch"):
        await run_migrations(pool)


async def test_existing_legacy_database_is_baselined_once() -> None:
    state = FakeDbState(legacy_tables_exist=True)
    pool = FakeMigrationPool(state)
    executed_names = await run_migrations(pool)
    recorded_versions = sorted(state.schema_migrations.keys())

    # Derived from the migrations actually on disk, not a hardcoded count:
    # the assertion here is "a legacy database gets every migration recorded,
    # and runs exactly the post-baseline ones" — pinning literal numbers made
    # this test fail on every new migration for no real reason.
    # discover_migrations() yields (version, filename, checksum) tuples.
    all_migrations = discover_migrations()
    assert recorded_versions == [version for version, _name, _sum in all_migrations]

    baseline_index = next(
        i for i, (_v, name, _s) in enumerate(all_migrations)
        if name == "010_legacy_schema_baseline.sql"
    )
    assert executed_names == [name for _v, name, _s in all_migrations[baseline_index:]]
    # Everything before the baseline is recorded but never executed against an
    # already-populated legacy database — that is the whole point of baselining.
    assert all(name not in executed_names for _v, name, _s in all_migrations[:baseline_index])


async def test_legacy_baseline_rows_are_recorded_as_adopted() -> None:
    state = FakeDbState(legacy_tables_exist=True)
    await run_migrations(FakeMigrationPool(state))

    baseline = [
        row for version, row in state.schema_migrations.items() if version <= 9
    ]
    assert baseline, "expected the 001-009 baseline to be recorded"
    assert all(row["adopted"] for row in baseline)
    # Migrations this runner actually executed are not adopted.
    assert all(
        not row["adopted"]
        for version, row in state.schema_migrations.items()
        if version >= 10
    )


async def test_adopted_baseline_checksum_drift_is_rerecorded_not_fatal() -> None:
    """An adopted row's checksum describes a file that never ran here, so
    drift in it must not wedge the deploy — it is re-recorded instead."""
    state = FakeDbState(legacy_tables_exist=True)
    state.schema_migrations[1] = {
        "version": 1, "filename": "001_initial.sql", "checksum": "0" * 64,
        "adopted": True,
    }

    await run_migrations(FakeMigrationPool(state))  # must not raise

    real_checksum = next(sum_ for version, _n, sum_ in discover_migrations() if version == 1)
    assert state.schema_migrations[1]["checksum"] == real_checksum
    # Re-recording must never re-run the file's SQL against a live database.
    sql_001 = (MIGRATIONS_DIR / "001_initial.sql").read_text(encoding="utf-8")
    assert sql_001 not in state.executed_sql


async def test_database_baselined_before_adopted_column_recovers() -> None:
    """Reproduces the wedged state: a legacy database baselined before the
    `adopted` column existed, whose 001 checksum no longer matches. The
    backfill must mark the baseline adopted so the deploy proceeds."""
    state = FakeDbState(legacy_tables_exist=True, adopted_column_exists=False)
    for version, filename, _checksum in discover_migrations():
        if version <= 9:
            state.schema_migrations[version] = {
                "version": version,
                "filename": filename,
                "checksum": "0" * 64 if version == 1 else _checksum,
                "adopted": False,
            }

    executed = await run_migrations(FakeMigrationPool(state))  # must not raise

    assert state.schema_migrations[1]["adopted"] is True
    real_checksum = next(sum_ for version, _n, sum_ in discover_migrations() if version == 1)
    assert state.schema_migrations[1]["checksum"] == real_checksum
    # The genuinely pending migrations still run.
    assert "010_legacy_schema_baseline.sql" in executed

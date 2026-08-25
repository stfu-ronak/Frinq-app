"""Deterministic, checksum-verified SQL migration runner.

Migration files live in migrations/NNN_name.sql (repo root) and are applied
in numeric order, each inside its own transaction, tracked in a
schema_migrations table keyed by version with a SHA-256 checksum of the
file's contents. A recorded checksum that no longer matches the on-disk
file fails closed (RuntimeError) rather than silently re-applying or
silently drifting from what's recorded as applied.

The one exception is the legacy baseline (see below): rows recorded
without ever executing their SQL are flagged `adopted`, and their
checksum describes a file this database never ran. Drift there says
nothing about the schema, so it is re-recorded with a warning instead
of wedging every future deploy.

Never logs SQL contents or environment values — only filenames/versions.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Protocol

from app.utils.logger import logger

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

_ADVISORY_LOCK_KEY = 717174

# Migrations 001-009 were applied ad-hoc by main.py's old inline startup
# DDL, before this runner existed. On any database created before 010,
# their effects already exist — adopting them here just records that fact
# in schema_migrations without re-running their SQL (which would fail
# against tables that already exist).
_LEGACY_BASELINE_VERSIONS = frozenset(range(1, 10))  # 1..9


class _Connection(Protocol):
    async def execute(self, query: str, *args: Any) -> str: ...
    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]: ...
    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None: ...
    def transaction(self) -> Any: ...


def discover_migrations() -> list[tuple[int, str, str]]:
    """Returns (version, filename, sha256 checksum) sorted by version."""
    discovered: list[tuple[int, str, str]] = []
    for path in MIGRATIONS_DIR.glob("*.sql"):
        version = int(path.name.split("_", 1)[0])
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        discovered.append((version, path.name, checksum))
    discovered.sort(key=lambda row: row[0])
    return discovered


async def _legacy_tables_exist(conn: _Connection) -> bool:
    row = await conn.fetchrow(
        "SELECT to_regclass('public.users') IS NOT NULL AS users_exists, "
        "to_regclass('public.quiz_submissions') IS NOT NULL AS quiz_submissions_exists"
    )
    return bool(row and row["users_exists"] and row["quiz_submissions_exists"])


async def _adopt_legacy_baseline(
    conn: _Connection, migrations: list[tuple[int, str, str]]
) -> None:
    legacy = [m for m in migrations if m[0] in _LEGACY_BASELINE_VERSIONS]
    async with conn.transaction():
        for version, filename, checksum in legacy:
            await conn.execute(
                "INSERT INTO schema_migrations (version, filename, checksum, adopted) "
                "VALUES ($1, $2, $3, TRUE) ON CONFLICT (version) DO NOTHING",
                version, filename, checksum,
            )
    logger.info("migrations.legacy_baseline_adopted", versions=[m[0] for m in legacy])


async def run_migrations(pool: Any) -> list[str]:
    """Applies pending migrations. Returns the filenames actually executed
    (adopted-but-not-executed legacy versions are not included)."""
    executed: list[str] = []
    migrations = discover_migrations()

    async with pool.acquire() as conn:
        await conn.execute(f"SELECT pg_advisory_lock({_ADVISORY_LOCK_KEY})")
        try:
            await conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "version INT PRIMARY KEY, "
                "filename TEXT NOT NULL, "
                "checksum TEXT NOT NULL, "
                "applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
            )

            # `adopted` distinguishes rows recorded-but-not-executed (the
            # legacy baseline) from rows whose SQL this database actually ran.
            # Only the latter carry a meaningful checksum.
            adopted_column_existed = await conn.fetchrow(
                "SELECT 1 AS present FROM information_schema.columns "
                "WHERE table_name = 'schema_migrations' AND column_name = 'adopted'"
            )
            await conn.execute(
                "ALTER TABLE schema_migrations "
                "ADD COLUMN IF NOT EXISTS adopted BOOLEAN NOT NULL DEFAULT FALSE"
            )
            if not adopted_column_existed and await _legacy_tables_exist(conn):
                # A database baselined before this column existed: its 001-009
                # rows were adopted, not executed. One-time, on upgrade only.
                await conn.execute(
                    "UPDATE schema_migrations SET adopted = TRUE WHERE version <= $1",
                    max(_LEGACY_BASELINE_VERSIONS),
                )
                logger.info(
                    "migrations.adopted_backfilled",
                    versions=sorted(_LEGACY_BASELINE_VERSIONS),
                )

            applied_rows = await conn.fetch(
                "SELECT version, filename, checksum, adopted FROM schema_migrations"
            )
            applied: dict[int, dict[str, Any]] = {row["version"]: row for row in applied_rows}

            if not applied:
                if await _legacy_tables_exist(conn):
                    await _adopt_legacy_baseline(conn, migrations)
                    applied_rows = await conn.fetch(
                        "SELECT version, filename, checksum, adopted FROM schema_migrations"
                    )
                    applied = {row["version"]: row for row in applied_rows}

            for version, filename, checksum in migrations:
                existing = applied.get(version)
                if existing is not None:
                    if existing["checksum"] != checksum:
                        if not existing.get("adopted"):
                            raise RuntimeError(
                                f"checksum mismatch for {filename} (version {version}): "
                                "recorded checksum no longer matches the file on disk"
                            )
                        # Adopted rows record a file that was never executed
                        # against this database, so a changed checksum means
                        # the file drifted — not the schema. Re-record it;
                        # failing closed here would block every deploy with
                        # no in-code way back.
                        await conn.execute(
                            "UPDATE schema_migrations SET filename = $2, checksum = $3 "
                            "WHERE version = $1",
                            version, filename, checksum,
                        )
                        logger.warning(
                            "migrations.adopted_checksum_rerecorded",
                            version=version,
                            filename=filename,
                        )
                    continue

                sql = (MIGRATIONS_DIR / filename).read_text(encoding="utf-8")
                async with conn.transaction():
                    await conn.execute(sql)
                    await conn.execute(
                        "INSERT INTO schema_migrations (version, filename, checksum) "
                        "VALUES ($1, $2, $3)",
                        version, filename, checksum,
                    )
                executed.append(filename)
                logger.info("migrations.applied", version=version, filename=filename)
        finally:
            await conn.execute(f"SELECT pg_advisory_unlock({_ADVISORY_LOCK_KEY})")

    return executed

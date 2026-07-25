"""Task 45 Step 1 — isolated, uniquely tagged test-data for release-journey
tests. NEVER runs against production (hard refusal, same convention as every
other script/boot-guard in this repo) — this is a CLI-only tool, not an
authenticated HTTP endpoint, so there's no new attack surface to protect;
the production refusal is the whole protection.

Every seeded user's phone number is deterministically derived from the given
--tag (never random), so re-running `seed` with the same tag is idempotent-
looking (same numbers every time) and `cleanup` only ever deletes rows this
script itself could have created — never a broad DELETE.

Usage:
  python scripts/seed_release_test_data.py seed --tag smoke-2026-07-25 --count 2
  python scripts/seed_release_test_data.py cleanup --ids <uuid> <uuid> ...
  python scripts/seed_release_test_data.py cleanup --tag smoke-2026-07-25
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from datetime import datetime, timezone
from uuid import UUID

from app.config import settings
from app.core.communities import assign_user_to_community, sync_communities
from app.database import close_pool, init_pool


def _phone_for(tag: str, index: int) -> str:
    """Deterministic, collision-resistant 10-digit Indian-format number —
    never random, so the same --tag always seeds the same phone numbers.
    Prefixed 7XXXXXXXXX to stay clearly distinct from the 8000000001-3 range
    already used by this repo's own scratch test scripts."""
    digest = hashlib.sha256(f"{tag}:{index}".encode()).hexdigest()
    return "7" + str(int(digest[:12], 16))[:9].zfill(9)


async def seed(tag: str, count: int, archetype_slug: str) -> list[dict[str, str]]:
    if settings.APP_ENV == "production":
        raise RuntimeError("seed_release_test_data must never run against production")

    pool = await init_pool()
    if pool is None:
        raise RuntimeError("DATABASE_URL not set — cannot seed")

    created: list[dict[str, str]] = []
    try:
        async with pool.acquire() as conn:
            await sync_communities(conn)
            for i in range(count):
                phone = f"+91{_phone_for(tag, i)}"
                now = datetime.now(timezone.utc)
                row = await conn.fetchrow(
                    """
                    INSERT INTO users (
                        phone, display_name, onboarding_complete, onboarding_state,
                        terms_version, terms_accepted_at, privacy_version, privacy_accepted_at
                    ) VALUES ($1, $2, true, 'active', $3, $4, $5, $4)
                    ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name
                    RETURNING id, phone
                    """,
                    phone,
                    f"release-test-{tag}-{i}",
                    settings.CURRENT_TERMS_VERSION,
                    now,
                    settings.CURRENT_PRIVACY_VERSION,
                )
                await assign_user_to_community(conn, row["id"], archetype_slug)
                created.append({"id": str(row["id"]), "phone": row["phone"], "tag": tag})
    finally:
        await close_pool()

    return created


async def cleanup(user_ids: list[UUID]) -> int:
    if settings.APP_ENV == "production":
        raise RuntimeError("seed_release_test_data must never run against production")
    if not user_ids:
        return 0

    pool = await init_pool()
    if pool is None:
        raise RuntimeError("DATABASE_URL not set — cannot clean up")
    try:
        async with pool.acquire() as conn:
            result = await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", user_ids)
        # asyncpg returns "DELETE <n>"
        return int(result.split()[-1])
    finally:
        await close_pool()


async def cleanup_by_tag(tag: str) -> int:
    if settings.APP_ENV == "production":
        raise RuntimeError("seed_release_test_data must never run against production")

    pool = await init_pool()
    if pool is None:
        raise RuntimeError("DATABASE_URL not set — cannot clean up")
    try:
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM users WHERE display_name LIKE $1", f"release-test-{tag}-%",
            )
        return int(result.split()[-1])
    finally:
        await close_pool()


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    seed_p = sub.add_parser("seed")
    seed_p.add_argument("--tag", required=True)
    seed_p.add_argument("--count", type=int, default=2)
    seed_p.add_argument("--archetype", default="quiet-storm")

    cleanup_p = sub.add_parser("cleanup")
    cleanup_p.add_argument("--ids", nargs="*", default=[])
    cleanup_p.add_argument("--tag", default=None)

    args = parser.parse_args()

    if args.command == "seed":
        created = asyncio.run(seed(args.tag, args.count, args.archetype))
        print(json.dumps(created, indent=2))
        return 0

    if args.command == "cleanup":
        if args.tag:
            n = asyncio.run(cleanup_by_tag(args.tag))
        else:
            n = asyncio.run(cleanup([UUID(i) for i in args.ids]))
        print(f"deleted {n} row(s)")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())

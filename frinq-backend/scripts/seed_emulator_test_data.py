"""Seed the three fixed, non-production Android emulator accounts."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone

from app.config import settings
from app.core.communities import assign_user_to_community, sync_communities
from app.core.test_fixtures import (
    TEST_CHAT_A_PHONE,
    TEST_CHAT_B_PHONE,
    TEST_RESET_PHONE,
    reset_test_account,
)
from app.database import close_pool, init_pool

EMULATOR_ACCOUNTS = [
    (TEST_RESET_PHONE, "reset"),
    (TEST_CHAT_A_PHONE, "chat_a"),
    (TEST_CHAT_B_PHONE, "chat_b"),
]


async def seed() -> list[dict[str, str]]:
    if settings.APP_ENV == "production":
        raise RuntimeError("seed_emulator_test_data must never run against production")

    pool = await init_pool()
    if pool is None:
        raise RuntimeError("DATABASE_URL not set - cannot seed emulator data")

    created: list[dict[str, str]] = []
    try:
        async with pool.acquire() as conn:
            await sync_communities(conn)
            for phone, role in EMULATOR_ACCOUNTS:
                now = datetime.now(timezone.utc)
                is_chat = role.startswith("chat")
                row = await conn.fetchrow(
                    """
                    INSERT INTO users (
                        phone, display_name, onboarding_complete, onboarding_state,
                        terms_version, terms_accepted_at, privacy_version, privacy_accepted_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $5, $6)
                    ON CONFLICT (phone) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        onboarding_complete = EXCLUDED.onboarding_complete,
                        onboarding_state = EXCLUDED.onboarding_state,
                        terms_version = EXCLUDED.terms_version,
                        terms_accepted_at = EXCLUDED.terms_accepted_at,
                        privacy_version = EXCLUDED.privacy_version,
                        privacy_accepted_at = EXCLUDED.privacy_accepted_at
                    RETURNING id, phone
                    """,
                    phone,
                    f"emulator-{role}",
                    is_chat,
                    "active" if is_chat else "quiz_in_progress",
                    settings.CURRENT_TERMS_VERSION if is_chat else None,
                    now if is_chat else None,
                )
                if role == "reset":
                    await reset_test_account(conn, row["id"])
                else:
                    await assign_user_to_community(conn, row["id"], "quiet-storm")
                created.append({"id": str(row["id"]), "phone": row["phone"], "role": role})
    finally:
        await close_pool()

    return created


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed Frinq's three local emulator accounts")
    parser.parse_args()
    print(json.dumps(asyncio.run(seed()), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

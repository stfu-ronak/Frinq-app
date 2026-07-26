"""One-off dev tool: complete a user's quiz submission with hand-written demo
content instead of a live OpenAI call (for local UI demoing when
OPENAI_API_KEY isn't configured). Writes through the EXACT same success path
as app/workers/tasks/quiz_insights.py's real worker (same UPDATE columns,
same assign_user_to_community, same archetype-taxonomy validation) so the
result the app renders is indistinguishable from a real completed quiz.

Never runs against production (same hard refusal convention as every other
script here).

Usage:
  python scripts/demo_complete_quiz.py --phone 9876543210
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from app.config import settings
from app.core.ai.archetypes import get_archetype
from app.core.communities import assign_user_to_community
from app.database import close_pool, init_pool


DEMO_SLUG = "quiet-storm"

DEMO_INSIGHTS = [
    {"label": "How you show up", "text": "You read the room before you speak in it, and people notice when you finally do."},
    {"label": "Your social battery", "text": "Small groups recharge you; big ones you can survive but rarely seek out."},
    {"label": "What people miss", "text": "You're not shy — you're just deciding if this is worth your full attention yet."},
]
DEMO_TAGS = ["observant", "steady", "low-key intense", "loyal"]

DEMO_SHARE_CARD = {
    "archetype": "Quiet Storm",
    "archetype_slug": DEMO_SLUG,
    "nickname": "the still water",
    "description": "intense interior, calm exterior. doesn't speak much but doesn't miss a thing.",
    "archetype_desc": "intense interior, calm exterior. doesn't speak much but doesn't miss a thing. when they finally say something, the room rearranges itself around it.",
    "headline": "Still water, deep read.",
    "pull_quote": "Still water, deep read.",
    "share_quote": "I don't talk much. I don't need to.",
    "tags": DEMO_TAGS,
    "stats": {
        "social_energy": 52,
        "peak_time": "9:00 pm",
        "group_role": "The Witness",
        "group_effect": 88,
        "secret_edge": "Depth",
        "rarity": "Top 6%",
    },
    "love_language": "Quality time, no small talk required",
    "ideal_hangout": "One other person, one long walk, zero agenda",
    "compatibility": {
        "clicks_with": ["tender-realist", "late-night-mind", "soft-skeptic"],
        "clashes_with": ["salt-air", "open-hand", "backup-plan"],
    },
    "friend_audit": {"seek": "people who don't need to fill silence", "avoid": "people who perform closeness"},
    "growth_edge": "Saying the thing before the room has to drag it out of you.",
}

DEMO_DEEP_SUMMARY = {
    "report_quote": "The quiet ones are usually the ones actually paying attention.",
    "signal_trait": {"label": "Depth", "text": "You go all-in on the few things that matter and skip the rest entirely."},
    "signal_archetype_text": "The one who says less and means more.",
    "narrative": [
        "You've spent years learning that not every thought needs saying out loud immediately, and it reads as calm even when you're turning something over fast.",
        "The people closest to you know the quiet isn't distance — it's you deciding whether this moment is worth the real version of you.",
    ],
    "mirror": "You're already more perceptive than most people in the room realize.",
    "first_impression": "Reserved, maybe a little unreadable — until they get one real sentence out of you.",
    "hidden_pattern": "You test people with silence before you test them with anything real.",
    "unspoken_need": "To be pulled into the conversation instead of always having to volunteer first.",
    "read_notes": [
        {"label": "In groups", "text": "You orbit the edge and clock everything before you engage."},
        {"label": "One-on-one", "text": "You open up fast once you decide someone's actually listening."},
    ],
    "closing_line": "Still waters. Deep, and worth the wait.",
    "snapshot": {
        "first_read": "quiet, maybe guarded",
        "after_time": "dry humor, surprisingly warm",
        "under_stress": "goes even quieter, not colder",
        "what_wins_you": "someone who notices the pattern before you point it out",
    },
}


async def complete(phone: str) -> None:
    if settings.APP_ENV == "production":
        raise RuntimeError("demo_complete_quiz must never run against production")

    if get_archetype(DEMO_SLUG) is None:
        raise RuntimeError(f"DEMO_SLUG {DEMO_SLUG!r} not in the archetype taxonomy")

    pool = await init_pool()
    if pool is None:
        raise RuntimeError("DATABASE_URL not set")

    # users.phone is stored as the bare 10-digit number (see app/api/v1/otp.py's
    # verify_otp_route: `INSERT INTO users (phone) VALUES ($1)` with `digits`,
    # never +91-prefixed).
    digits = phone.replace("+91", "").replace(" ", "").strip()
    try:
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                "SELECT id FROM users WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = $1",
                digits,
            )
            if user is None:
                raise RuntimeError(f"no user found for phone {phone!r} — send/verify OTP for this number first")
            user_id = user["id"]

            submission = await conn.fetchrow(
                "SELECT id FROM quiz_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
                user_id,
            )
            if submission is None:
                raise RuntimeError("no quiz_submissions row for this user — complete/submit the quiz in the app first")
            submission_id = submission["id"]

            async with conn.transaction():
                await conn.execute(
                    """UPDATE quiz_submissions SET
                        status = 'done',
                        headline = $2,
                        spirit_animal = $3,
                        spirit_desc = $4,
                        insights = $5::jsonb,
                        tags = $6,
                        share_card = $7::jsonb,
                        deep_summary = $8::jsonb,
                        archetype_slug = $9,
                        completed_at = now(),
                        updated_at = now()
                    WHERE id = $1""",
                    submission_id,
                    DEMO_SHARE_CARD["headline"],
                    DEMO_SHARE_CARD["archetype"],
                    DEMO_SHARE_CARD["archetype_desc"],
                    json.dumps(DEMO_INSIGHTS),
                    DEMO_TAGS,
                    json.dumps(DEMO_SHARE_CARD),
                    json.dumps(DEMO_DEEP_SUMMARY),
                    DEMO_SLUG,
                )
                await assign_user_to_community(conn, user_id, DEMO_SLUG)
                await conn.execute(
                    "UPDATE users SET onboarding_state = 'active', updated_at = now() WHERE id = $1",
                    user_id,
                )
        print(f"done: submission {submission_id} -> archetype={DEMO_SLUG}, user onboarding_state=active")
    finally:
        await close_pool()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phone", required=True, help="10-digit or +91-prefixed phone, matches the account that owns the submission")
    args = parser.parse_args()
    asyncio.run(complete(args.phone))
    return 0


if __name__ == "__main__":
    sys.exit(main())

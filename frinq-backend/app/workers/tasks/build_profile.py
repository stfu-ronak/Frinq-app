"""ARQ background task: build_profile

Full pipeline:
  1. Fetch questionnaire_responses from DB
  2. build_profile()   — deterministic trait seed
  3. extract_traits()  — Claude Sonnet 4.6 nudges open-text → traits
  4. summarise_profile() — Claude Sonnet 4.6 ai_summary + latent_tags
  5. Voyage embedding (skipped if VOYAGE_API_KEY not set)
  6. Upsert user_profiles + set users.onboarding_complete = TRUE
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from app.config import settings
from app.core.ai.pii import PIIContext
from app.core.profile.builder import build_profile as _build_det
from app.core.profile.extractor import extract_traits
from app.core.profile.summariser import SummariserError, summarise_profile
from app.database import get_pool
from app.utils.logger import logger


# ─── Helpers ─────────────────────────────────────────────────────────

def _j(value: Any) -> Any:
    """Coerce asyncpg Record values for JSON serialisation."""
    if isinstance(value, dict):
        return value
    return value


async def _generate_embedding(text: str) -> list[float] | None:
    """Call Voyage AI synchronously in a thread to avoid blocking the event loop."""
    if not settings.VOYAGE_API_KEY:
        return None
    try:
        import voyageai  # type: ignore[import]

        def _sync_embed() -> list[float]:
            vc = voyageai.Client(api_key=settings.VOYAGE_API_KEY)
            result = vc.embed([text], model="voyage-large-2", input_type="document")
            return result.embeddings[0]

        return await asyncio.to_thread(_sync_embed)
    except Exception as exc:
        logger.warning("build_profile.embedding_failed", error=str(exc))
        return None


# ─── Main upsert helper ──────────────────────────────────────────────

_NUMERIC_COLS = (
    "openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism",
    "honesty_humility",
    "connection_anxiety", "connection_avoidance", "reliability",
    "val_self_direction", "val_stimulation", "val_achievement",
    "val_security", "val_tradition", "val_universalism",
    "openness_to_change", "conservation",
    "affiliative_humor", "self_enhancing_humor", "aggressive_humor",
    "directness", "depth_preference",
    "slider_depth", "slider_fun_get", "slider_frequency",
    'riasec_R', 'riasec_I', 'riasec_A', 'riasec_S', 'riasec_E', 'riasec_C',
)

_TEXT_COLS = (
    "bonding_style", "chronotype", "group_pref", "plan_style",
    "drinks", "smokes", "activity_archetype",
    "social_type", "saturday_archetype", "substance_scene",
    "ai_summary", "vibe_check_raw",
    "show_up_style", "looking_for_text", "hobbies_text", "storytime_transcript",
)

_TEXT_ARRAY_COLS = (
    "primary_goals", "secondary_goals", "open_to_try", "anti_preferences",
    "languages", "latent_tags", "connection_signals", "red_flags", "red_flag_normalised",
)

_JSONB_COLS = (
    "loved_activities", "rapid_fire", "extraction_confidence",
)


async def _upsert_profile(
    conn: Any,
    user_id: UUID,
    profile: dict[str, Any],
    embedding: list[float] | None,
) -> None:
    cols: list[str] = ["user_id"]
    vals: list[Any] = [user_id]

    def add(col: str, val: Any) -> None:
        if val is not None:
            cols.append(col)
            vals.append(val)

    for col in _NUMERIC_COLS:
        add(col, profile.get(col))

    for col in _TEXT_COLS:
        add(col, profile.get(col))

    for col in _TEXT_ARRAY_COLS:
        v = profile.get(col)
        if v is not None:
            cols.append(col)
            vals.append(list(v))

    for col in _JSONB_COLS:
        v = profile.get(col)
        if v is not None:
            cols.append(col)
            vals.append(json.dumps(v))

    if embedding is not None:
        cols.append("embedding")
        vals.append(embedding)

    placeholders = ", ".join(f"${i}" for i in range(1, len(vals) + 1))
    set_clause = ", ".join(
        f"{c} = EXCLUDED.{c}" for c in cols if c != "user_id"
    ) + ", updated_at = now()"

    query = f"""
        INSERT INTO user_profiles ({', '.join(f'"{c}"' for c in cols)})
        VALUES ({placeholders})
        ON CONFLICT (user_id) DO UPDATE SET {set_clause}
    """
    await conn.execute(query, *vals)


# ─── Public task ─────────────────────────────────────────────────────

async def build_profile(ctx: dict[str, Any], user_id: str) -> None:
    """ARQ task entry point. `ctx` is the ARQ worker context dict."""
    uid = UUID(user_id)
    logger.info("build_profile.start", user_id=user_id)

    pool = get_pool()

    async with pool.acquire() as conn:
        qr_row = await conn.fetchrow(
            "SELECT answers FROM questionnaire_responses WHERE user_id = $1", uid
        )
        if qr_row is None:
            logger.warning("build_profile.no_questionnaire", user_id=user_id)
            return

        user_row = await conn.fetchrow(
            "SELECT display_name, phone FROM users WHERE id = $1", uid
        )

    answers: dict[str, Any] = (
        json.loads(qr_row["answers"])
        if isinstance(qr_row["answers"], str)
        else dict(qr_row["answers"])
    )

    pii = PIIContext(
        name=user_row["display_name"] if user_row else None,
        phone=user_row["phone"] if user_row else None,
        city=answers.get("Q02"),
    )

    # 1. Deterministic
    det_profile = _build_det(answers)
    logger.info("build_profile.deterministic_done", user_id=user_id)

    # 2. AI trait extraction
    ai_profile = await extract_traits(det_profile, pii=pii)
    logger.info("build_profile.traits_done", user_id=user_id)

    # 3. AI summary
    try:
        summary = await summarise_profile(ai_profile, pii=pii)
        ai_profile.update(summary)
        logger.info("build_profile.summary_done", user_id=user_id)
    except SummariserError as exc:
        logger.warning("build_profile.summary_skipped", error=str(exc))

    # 4. Voyage embedding
    embed_input = " ".join(filter(None, [
        ai_profile.get("ai_summary", ""),
        " ".join(ai_profile.get("latent_tags") or []),
        ai_profile.get("hobbies_text", ""),
        ai_profile.get("looking_for_text", ""),
    ]))
    embedding = await _generate_embedding(embed_input)

    # 5. Upsert
    async with pool.acquire() as conn:
        await _upsert_profile(conn, uid, ai_profile, embedding)
        await conn.execute(
            "UPDATE users SET onboarding_complete = TRUE, updated_at = now() WHERE id = $1",
            uid,
        )

    logger.info("build_profile.done", user_id=user_id, has_embedding=embedding is not None)

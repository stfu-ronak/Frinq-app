"""Admin-controlled model selection for the two quiz-generation steps.

Live-switch semantics: callers (quiz_insights.py) read the active config
exactly once, at the moment a job starts processing, and pass it down as an
explicit parameter — never re-reading mid-run. So an admin PATCH here takes
effect for the next job to start, while a job already in flight keeps
whatever it already snapshotted. See app/workers/tasks/quiz_insights.py.
"""

from __future__ import annotations

from typing import Any, Literal

import asyncpg

from app.core.ai.model_pricing import effort_supported, get_model_info, is_known_model, resolve_model_id

Step = Literal["insights", "deep_report"]


class InvalidModelConfigError(ValueError):
    pass


async def get_active_model_config(conn: asyncpg.Connection, step: Step) -> dict[str, Any]:
    row = await conn.fetchrow(
        "SELECT step, provider, model_id, effort, updated_at, updated_by "
        "FROM ai_model_config WHERE step = $1",
        step,
    )
    if row is None:
        raise InvalidModelConfigError(f"no ai_model_config row for step={step!r}")
    return dict(row)


async def get_all_model_configs(conn: asyncpg.Connection) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        "SELECT step, provider, model_id, effort, updated_at, updated_by FROM ai_model_config ORDER BY step"
    )
    return [dict(r) for r in rows]


async def set_model_config(
    conn: asyncpg.Connection,
    step: Step,
    provider: str,
    model_id: str,
    effort: str | None,
    updated_by: str,
) -> dict[str, Any]:
    """Validates against the pricing table before writing — never trust the
    admin client alone; a stale admin tab could otherwise submit a model/effort
    combination that 400s straight against the provider API."""
    if not is_known_model(model_id):
        raise InvalidModelConfigError(f"unknown model_id: {model_id!r}")
    info = get_model_info(model_id)
    assert info is not None  # is_known_model just confirmed this resolves
    # "azure" serves the SAME OpenAI model catalogue over different plumbing
    # (deployment in the URL, api-key header), so an openai-family model is
    # legitimately reachable via either provider. Every other pairing must
    # still match exactly.
    if info.provider != provider and not (provider == "azure" and info.provider == "openai"):
        raise InvalidModelConfigError(f"model {model_id!r} belongs to provider {info.provider!r}, not {provider!r}")
    if effort is not None and not effort_supported(model_id, effort):
        raise InvalidModelConfigError(f"model {model_id!r} does not support effort={effort!r}")

    # Persist the canonical id, never a convenience alias — the provider
    # clients pass model_id straight through to the real API's `model` field.
    canonical_model_id = resolve_model_id(model_id)

    row = await conn.fetchrow(
        """UPDATE ai_model_config
           SET provider = $2, model_id = $3, effort = $4, updated_at = now(), updated_by = $5
           WHERE step = $1
           RETURNING step, provider, model_id, effort, updated_at, updated_by""",
        step, provider, canonical_model_id, effort, updated_by,
    )
    if row is None:
        raise InvalidModelConfigError(f"no ai_model_config row for step={step!r}")
    return dict(row)

# Dynamic Quiz Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin add/edit/reorder/remove "content" quiz questions (from `social_type` onward) from the admin panel, using the mobile app's already-existing question templates, and have changes take effect on mobile with no app release.

**Architecture:** A new versioned `quiz_config` table stores the content-steps array as JSONB (never mutated in place — edits insert a new version and flip `is_active`). Mobile fetches the active version once at quiz start and concatenates it after a fixed, compiled-in onboarding prefix. A new admin "Questions" tab authors that array through kind-specific forms. One existing gap gets fixed along the way: the hero-card AI-insights prompt is fully hardcoded per named field and would silently ignore brand-new questions — it gets a generic trailing "additional context" section so new questions actually influence the generated profile.

**Tech Stack:** FastAPI + asyncpg (existing), Next.js/React admin (existing Tailwind patterns), React Native + TypeScript mobile (existing template registry, zero new UI libraries).

## Global Constraints

- No new npm/pip dependencies (spec: reuse existing chart/UI patterns; this plan: reuse existing mobile templates and admin Tailwind patterns — no drag-and-drop library, no new charting library).
- Onboarding steps (`s0`, `name`, `city`, `age`, `gender`, `pronoun`, `social_verification`, and their surrounding `intro`/`ready`/`nahh`/`sweet` screens) stay fixed and compiled-in — never editable through this feature (spec: "Onboarding scope" decision).
- Rapid Fire stays a single block — admin edits its pairs, never adds a second block.
- Slider is single-per-step (`kind: 'slider'`), not the bundled `preferences` model.
- 4 MCQ layouts exposed: `multiChoiceTags` (`layout: 'chips'`, optional `allowCustom`), `multiChoiceTags` (`layout: 'list'`), `singleChoiceList` (`variant: 'box'`, exactly 2 options, `chrome: 'simple'`), `singleChoiceCard` (optional `allowCustom`).
- Every migration touches `tests/test_migrations.py`'s two hardcoded spots (`range(1, N)` and `executed_names` list) — established pattern from migrations 016-019.
- Never trust the admin client alone — every step kind's required fields are validated server-side before a `quiz_config` version can be saved (mirrors `app/core/ai/model_config.py`'s validation philosophy).

---

### Task 1: `quiz_config` migration + seed data

**Files:**
- Create: `frinq-backend/migrations/020_quiz_config.sql`
- Modify: `frinq-backend/tests/test_migrations.py:105-117`

**Interfaces:**
- Produces: `quiz_config` table — `id UUID PK`, `version INT`, `steps JSONB`, `is_active BOOLEAN`, `created_at TIMESTAMPTZ`, `created_by TEXT`. Exactly one row may have `is_active = TRUE` at a time (partial unique index).

- [ ] **Step 1: Write the migration file**

```sql
-- 020_quiz_config.sql
CREATE TABLE quiz_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL,
  steps JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE UNIQUE INDEX quiz_config_one_active ON quiz_config (is_active) WHERE is_active;

-- Seed version 1 = today's exact content-steps array, copied verbatim from
-- frinq-mobile/src/features/quiz/domain/quizDefinition.ts's QUIZ_STEPS
-- constant, the slice from id:'social_type' through id:'last_question'
-- inclusive (lines 204-408 at the time this migration was written) — every
-- step object translated to JSON with IDENTICAL field names and values, no
-- paraphrasing of prompts/options/descriptions. This makes day one change
-- nothing until an admin touches the builder (same principle as migrations
-- 018/019's seed rows).
INSERT INTO quiz_config (version, steps, is_active, created_by)
VALUES (1, '[
  <paste the verbatim JSON translation of QUIZ_STEPS[social_type..last_question] here>
]'::jsonb, TRUE, 'migration_seed');
```

Do the verbatim translation by reading `quizDefinition.ts` directly (not from memory) and converting each TS object literal to JSON: `kind`, `id`, `section`, `answerKey`, `prompt`/`subtext`/`placeholder`, `options` (arrays of strings for `multiChoiceTags`, arrays of `{value,label}` for `singleChoiceList`, arrays of `{value,label,description}` for `singleChoiceCard`), `min`, `allowCustom`, `customLabel`, `customPlaceholder`, `layout`, `variant`, `pairs`/`secondsPerPair` for the one `rapidFire` block, `heading`/`ctaLabel`/`body` for `intro` screens between groups (`sweet`, `rapid_intro`, `glorious`, `preferences_intro` all count as content-section intros and are included in the slice). Drop the unused top-level `placeholder` field on `multiChoiceTags` steps that also declare `customPlaceholder` (e.g. `hobbies`) — it's dead in the current template (only `customPlaceholder` is read), not a functional change to omit it.

- [ ] **Step 2: Run the migration locally**

Run: `cd frinq-backend && .venv/Scripts/python.exe -m scripts.predeploy`
Expected: migration `020_quiz_config.sql` applies with no error; `SELECT COUNT(*) FROM quiz_config WHERE is_active` returns `1`.

- [ ] **Step 3: Update the hardcoded migration-count test**

In `tests/test_migrations.py`, change:
```python
assert recorded_versions == list(range(1, 20))
```
to:
```python
assert recorded_versions == list(range(1, 21))
```
and append to the `executed_names` list (after `"019_ai_usage_log.sql"`):
```python
        "020_quiz_config.sql",
```

- [ ] **Step 4: Run the migration test suite**

Run: `.venv/Scripts/python.exe -m pytest tests/test_migrations.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frinq-backend/migrations/020_quiz_config.sql frinq-backend/tests/test_migrations.py
git commit -m "feat: add quiz_config table with seeded content-steps version 1"
```

---

### Task 2: Backend quiz-config validation module

**Files:**
- Create: `frinq-backend/app/core/quiz_config.py`
- Test: `frinq-backend/tests/test_core/test_quiz_config.py`

**Interfaces:**
- Consumes: nothing new (raw `asyncpg.Connection`).
- Produces: `get_active_quiz_config(conn) -> dict` (`{"version": int, "steps": list[dict]}`), `set_quiz_config(conn, steps: list[dict], created_by: str) -> dict` (raises `InvalidQuizConfigError` on any validation failure), `RESERVED_ANSWER_KEYS: frozenset[str]` (the onboarding keys: `name, city, dob, gender, pronoun, social_linkedin, social_instagram`).

- [ ] **Step 1: Write the failing validation tests**

```python
# tests/test_core/test_quiz_config.py
from __future__ import annotations

import pytest

from app.core.quiz_config import InvalidQuizConfigError, validate_steps


def test_rejects_unknown_kind():
    with pytest.raises(InvalidQuizConfigError):
        validate_steps([{"id": "x", "kind": "notarealkind"}])


def test_rejects_missing_required_field_for_kind():
    with pytest.raises(InvalidQuizConfigError):
        validate_steps([{"id": "x", "kind": "text", "answerKey": "custom_1"}])  # missing prompt


def test_rejects_duplicate_answer_key():
    steps = [
        {"id": "a", "kind": "text", "answerKey": "custom_1", "prompt": "one?"},
        {"id": "b", "kind": "text", "answerKey": "custom_1", "prompt": "two?"},
    ]
    with pytest.raises(InvalidQuizConfigError):
        validate_steps(steps)


def test_rejects_reserved_answer_key():
    steps = [{"id": "a", "kind": "text", "answerKey": "name", "prompt": "what's your name?"}]
    with pytest.raises(InvalidQuizConfigError):
        validate_steps(steps)


def test_rejects_box_variant_with_wrong_option_count():
    steps = [{
        "id": "a", "kind": "singleChoiceList", "answerKey": "custom_1", "prompt": "p",
        "variant": "box", "chrome": "simple",
        "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}, {"value": "c", "label": "C"}],
    }]
    with pytest.raises(InvalidQuizConfigError):
        validate_steps(steps)


def test_rejects_box_variant_without_simple_chrome():
    steps = [{
        "id": "a", "kind": "singleChoiceList", "answerKey": "custom_1", "prompt": "p",
        "variant": "box",
        "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}],
    }]
    with pytest.raises(InvalidQuizConfigError):
        validate_steps(steps)


def test_accepts_valid_mixed_step_list():
    steps = [
        {"id": "a", "kind": "text", "answerKey": "custom_1", "prompt": "what's your favorite meal?"},
        {"id": "b", "kind": "text", "answerKey": "custom_2", "prompt": "tell us a story", "allowVoice": True},
        {
            "id": "c", "kind": "singleChoiceCard", "answerKey": "custom_3", "prompt": "pick one",
            "options": [{"value": "x", "label": "X", "description": "desc"}, {"value": "y", "label": "Y"}],
        },
        {
            "id": "d", "kind": "multiChoiceTags", "answerKey": "custom_4", "prompt": "pick some",
            "options": ["one", "two", "three"], "layout": "list",
        },
        {
            "id": "e", "kind": "singleChoiceList", "answerKey": "custom_5", "prompt": "would you rather",
            "variant": "box", "chrome": "simple",
            "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}],
        },
        {"id": "f", "kind": "slider", "answerKey": "custom_6", "prompt": "trust scale",
         "leftLabel": "logic", "leftHint": "logic", "rightLabel": "gut", "rightHint": "gut"},
        {"id": "g", "kind": "rapidFire", "answerKey": "rapid",
         "pairs": [{"a": "x", "b": "y"}], "secondsPerPair": 10},
        {"id": "h", "kind": "intro", "heading": "almost done", "ctaLabel": "continue"},
    ]
    validate_steps(steps)  # must not raise
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_core/test_quiz_config.py -q`
Expected: FAIL (`ModuleNotFoundError: app.core.quiz_config`)

- [ ] **Step 3: Write the validation module**

```python
# app/core/quiz_config.py
"""Server-side validation + versioned storage for admin-authored quiz
"content steps" (everything from social_type onward — onboarding steps
stay compiled into the mobile app and are never touched here).

Never trust the admin client alone: each step kind has required fields
checked here before a new version can be written, mirroring
app/core/ai/model_config.py's validation philosophy for the same reason —
a malformed step would either crash the mobile renderer or silently do
nothing useful.
"""

from __future__ import annotations

from typing import Any

import asyncpg

RESERVED_ANSWER_KEYS: frozenset[str] = frozenset({
    "name", "city", "dob", "gender", "pronoun", "social_linkedin", "social_instagram",
})

_KNOWN_KINDS = {
    "text", "singleChoiceCard", "singleChoiceList", "multiChoiceTags",
    "slider", "rapidFire", "intro",
}


class InvalidQuizConfigError(ValueError):
    pass


def _require(step: dict[str, Any], *fields: str, kind: str) -> None:
    for f in fields:
        if not step.get(f):
            raise InvalidQuizConfigError(f"{kind} step {step.get('id')!r} missing required field {f!r}")


def _validate_options_list(step: dict[str, Any], *, min_count: int = 2) -> list[Any]:
    options = step.get("options")
    if not isinstance(options, list) or len(options) < min_count:
        raise InvalidQuizConfigError(
            f"step {step.get('id')!r} needs at least {min_count} options"
        )
    return options


def _validate_one_step(step: dict[str, Any]) -> None:
    kind = step.get("kind")
    if kind not in _KNOWN_KINDS:
        raise InvalidQuizConfigError(f"unknown step kind: {kind!r}")

    if kind == "intro":
        _require(step, "heading", "ctaLabel", kind=kind)
        return

    if kind == "rapidFire":
        pairs = step.get("pairs")
        if not isinstance(pairs, list) or len(pairs) < 1:
            raise InvalidQuizConfigError("rapidFire step needs at least one pair")
        for p in pairs:
            if not isinstance(p, dict) or not p.get("a") or not p.get("b"):
                raise InvalidQuizConfigError("rapidFire pair needs both 'a' and 'b'")
        if not step.get("secondsPerPair"):
            raise InvalidQuizConfigError("rapidFire step needs secondsPerPair")
        return

    # Every remaining kind is answer-bearing.
    _require(step, "answerKey", "prompt", kind=kind)
    answer_key = step["answerKey"]
    if answer_key in RESERVED_ANSWER_KEYS:
        raise InvalidQuizConfigError(f"answerKey {answer_key!r} is reserved for onboarding")

    if kind == "text":
        return  # optional allowVoice: bool — no further requirement

    if kind == "slider":
        _require(step, "leftLabel", "leftHint", "rightLabel", "rightHint", kind=kind)
        return

    if kind == "singleChoiceCard":
        _validate_options_list(step)
        return

    if kind == "singleChoiceList":
        options = _validate_options_list(step)
        variant = step.get("variant", "pill")
        if variant not in ("pill", "box"):
            raise InvalidQuizConfigError(f"unknown singleChoiceList variant: {variant!r}")
        if variant == "box":
            if len(options) != 2:
                raise InvalidQuizConfigError("singleChoiceList 'box' variant requires exactly 2 options")
            if step.get("chrome") != "simple":
                raise InvalidQuizConfigError("singleChoiceList 'box' variant requires chrome='simple'")
        return

    if kind == "multiChoiceTags":
        options = step.get("options")
        if not isinstance(options, list) or len(options) < 2 or not all(isinstance(o, str) for o in options):
            raise InvalidQuizConfigError("multiChoiceTags needs at least 2 string options")
        layout = step.get("layout", "chips")
        if layout not in ("chips", "list"):
            raise InvalidQuizConfigError(f"unknown multiChoiceTags layout: {layout!r}")
        return


def validate_steps(steps: list[dict[str, Any]]) -> None:
    """Raises InvalidQuizConfigError on the first problem found. Also checks
    cross-step invariants (answerKey uniqueness) after per-step checks pass."""
    if not isinstance(steps, list) or not steps:
        raise InvalidQuizConfigError("steps must be a non-empty list")

    seen_keys: set[str] = set()
    for step in steps:
        if not isinstance(step, dict) or not step.get("id"):
            raise InvalidQuizConfigError("every step needs an 'id'")
        _validate_one_step(step)
        answer_key = step.get("answerKey")
        if answer_key:
            if answer_key in seen_keys:
                raise InvalidQuizConfigError(f"duplicate answerKey: {answer_key!r}")
            seen_keys.add(answer_key)


async def get_active_quiz_config(conn: asyncpg.Connection) -> dict[str, Any]:
    row = await conn.fetchrow(
        "SELECT version, steps FROM quiz_config WHERE is_active = TRUE"
    )
    if row is None:
        raise InvalidQuizConfigError("no active quiz_config row")
    return {"version": row["version"], "steps": row["steps"]}


async def set_quiz_config(conn: asyncpg.Connection, steps: list[dict[str, Any]], created_by: str) -> dict[str, Any]:
    validate_steps(steps)
    import json
    async with conn.transaction():
        current = await conn.fetchval("SELECT MAX(version) FROM quiz_config")
        next_version = (current or 0) + 1
        await conn.execute("UPDATE quiz_config SET is_active = FALSE WHERE is_active = TRUE")
        row = await conn.fetchrow(
            """INSERT INTO quiz_config (version, steps, is_active, created_by)
               VALUES ($1, $2::jsonb, TRUE, $3)
               RETURNING version, steps""",
            next_version, json.dumps(steps), created_by,
        )
    return {"version": row["version"], "steps": row["steps"]}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_core/test_quiz_config.py -q`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add frinq-backend/app/core/quiz_config.py frinq-backend/tests/test_core/test_quiz_config.py
git commit -m "feat: add server-side validation for admin-authored quiz steps"
```

---

### Task 3: Public `GET /api/v1/quiz/config` endpoint

**Files:**
- Modify: `frinq-backend/app/api/v1/quiz.py`
- Test: `frinq-backend/tests/test_api/test_quiz_config_endpoint.py`

**Interfaces:**
- Consumes: `app.core.quiz_config.get_active_quiz_config`
- Produces: `GET /api/v1/quiz/config` → `{"version": int, "steps": list[dict]}`, no auth (matches `start_quiz`'s pre-auth pattern — the quiz-start flow needs this before a session may exist).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_api/test_quiz_config_endpoint.py
from __future__ import annotations


async def test_get_quiz_config_returns_active_version(async_client):
    res = await async_client.get("/api/v1/quiz/config")
    assert res.status_code == 200
    data = res.json()
    assert data["version"] >= 1
    assert isinstance(data["steps"], list)
    assert len(data["steps"]) > 0
```

(Reuses this test suite's existing `async_client` fixture — check `tests/conftest.py` for its exact name if it differs; match whatever fixture the other `test_api/test_*.py` files already use for an unauthenticated request.)

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_quiz_config_endpoint.py -q`
Expected: FAIL with 404 (route doesn't exist yet)

- [ ] **Step 3: Add the endpoint**

In `app/api/v1/quiz.py`, add the import:
```python
from app.core.quiz_config import get_active_quiz_config
```
and add the route (near the other public-ish routes, matching `start_quiz`'s style — no `Depends(get_current_account)`):
```python
@router.get("/config")
async def get_quiz_config(pool: asyncpg.Pool = Depends(get_pool)) -> dict:
    async with pool.acquire() as conn:
        return await get_active_quiz_config(conn)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_quiz_config_endpoint.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frinq-backend/app/api/v1/quiz.py frinq-backend/tests/test_api/test_quiz_config_endpoint.py
git commit -m "feat: expose GET /api/v1/quiz/config for mobile to fetch content steps"
```

---

### Task 4: Admin `GET`/`PUT /admin/quiz-config` endpoints

**Files:**
- Modify: `frinq-backend/app/api/v1/admin.py`
- Test: `frinq-backend/tests/test_api/test_admin_quiz_config.py`

**Interfaces:**
- Consumes: `app.core.quiz_config.{get_active_quiz_config, set_quiz_config, InvalidQuizConfigError}`
- Produces: `GET /admin/quiz-config` (admin-only) → `{"version": int, "steps": list[dict]}`; `PUT /admin/quiz-config` (admin + action-password) → same shape, 422 on validation failure.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_api/test_admin_quiz_config.py
from __future__ import annotations


async def test_get_admin_quiz_config_requires_admin_key(async_client):
    res = await async_client.get("/api/v1/admin/quiz-config")
    assert res.status_code == 401


async def test_get_admin_quiz_config_returns_active_version(async_client, admin_headers):
    res = await async_client.get("/api/v1/admin/quiz-config", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["version"] >= 1


async def test_put_admin_quiz_config_rejects_invalid_steps(async_client, admin_action_headers):
    res = await async_client.put(
        "/api/v1/admin/quiz-config",
        json={"steps": [{"id": "x", "kind": "notarealkind"}]},
        headers=admin_action_headers,
    )
    assert res.status_code == 422


async def test_put_admin_quiz_config_saves_new_version(async_client, admin_action_headers):
    new_steps = [
        {"id": "custom_q1", "kind": "text", "answerKey": "custom_q1", "prompt": "what's new?"},
    ]
    res = await async_client.put(
        "/api/v1/admin/quiz-config", json={"steps": new_steps}, headers=admin_action_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["steps"] == new_steps

    followup = await async_client.get("/api/v1/admin/quiz-config", headers=admin_action_headers)
    assert followup.json()["steps"] == new_steps
```

(Match whatever `admin_headers`/`admin_action_headers` fixtures the existing `test_api/test_*.py` files already use for the Bearer key + `X-Action-Password` header — copy the exact fixture names from a neighboring test file, e.g. the one covering `PATCH /admin/ai-config/{step}`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_admin_quiz_config.py -q`
Expected: FAIL (404s — routes don't exist)

- [ ] **Step 3: Add the endpoints**

In `app/api/v1/admin.py`, add the import:
```python
from app.core.quiz_config import InvalidQuizConfigError, get_active_quiz_config, set_quiz_config
```
and a request model + two routes (place alongside the `ai-config` endpoints for consistency):
```python
class SetQuizConfigRequest(BaseModel):
    steps: list[dict[str, Any]]


@router.get("/quiz-config", dependencies=[Depends(_require_admin)])
async def get_quiz_config_admin(pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    async with pool.acquire() as conn:
        return await get_active_quiz_config(conn)


@router.put("/quiz-config", dependencies=[Depends(_require_admin), Depends(_require_action_password)])
async def put_quiz_config(
    body: SetQuizConfigRequest, pool: asyncpg.Pool = Depends(get_pool)
) -> dict[str, Any]:
    try:
        async with pool.acquire() as conn:
            result = await set_quiz_config(conn, body.steps, settings.ADMIN_ACTOR_ID)
    except InvalidQuizConfigError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    logger.info("admin.quiz_config.updated", version=result["version"], step_count=len(body.steps))
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_admin_quiz_config.py -q`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add frinq-backend/app/api/v1/admin.py frinq-backend/tests/test_api/test_admin_quiz_config.py
git commit -m "feat: add admin GET/PUT /admin/quiz-config endpoints"
```

---

### Task 5: AI-insights generic "additional context" fallback

**Files:**
- Modify: `frinq-backend/app/core/ai/prompts.py` (the `INSIGHTS_USER` template)
- Modify: `frinq-backend/app/core/ai/insights.py:66-203` (`_build_insights_prompt`)
- Test: `frinq-backend/tests/test_ai/test_insights_additional_context.py`

**Interfaces:**
- Produces: `_build_insights_prompt` output now includes any `answers` key not among the ~25 already-named placeholders, formatted as a trailing "additional context" block.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_ai/test_insights_additional_context.py
from __future__ import annotations

from app.core.ai.insights import _build_insights_prompt


def test_new_answer_key_appears_in_additional_context():
    answers = {"city": "mumbai", "custom_favorite_meal": "biryani"}
    prompt = _build_insights_prompt(answers)
    assert "custom_favorite_meal" in prompt
    assert "biryani" in prompt


def test_no_new_keys_produces_empty_additional_context_section():
    answers = {"city": "mumbai"}
    prompt = _build_insights_prompt(answers)
    assert "additional context" in prompt.lower()
    # The section header is present but nothing extra follows it beyond the
    # "(none)" filler — no known key ever leaks into it.
    assert "city: mumbai" not in prompt.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_ai/test_insights_additional_context.py -q`
Expected: FAIL (`KeyError: 'additional_context'` from `.format()`, since the placeholder doesn't exist yet)

- [ ] **Step 3: Add the placeholder to the prompt template**

In `app/core/ai/prompts.py`, find the end of `INSIGHTS_USER` (right before its closing `"""`, after the `{event_no}` line) and add:

```
Additional context from custom questions this person answered:
{additional_context}
```

- [ ] **Step 4: Build the generic section in `_build_insights_prompt`**

In `app/core/ai/insights.py`, add a module-level constant listing every key already named in the template, and a builder function, then wire it into the `.format(...)` call:

```python
_KNOWN_ANSWER_KEYS: Final[frozenset[str]] = frozenset({
    "dob", "city", "social_type", "saturday", "scene", "substance_scene",
    "connection", "trip", "rapid", "preferences", "opinions", "opinions_why",
    "hobbies", "interests", "red_flags", "show_up", "looking_for", "story",
    "voice_story", "storytime", "travel_style", "connection_mode",
    "would_rather", "meeting_style", "event_yes", "event_no",
    # onboarding/structural — never custom-question answers, but also never
    # worth repeating in "additional context"
    "name", "phone", "gender", "pronoun", "social_linkedin", "social_instagram",
})


def _build_additional_context(answers: dict[str, Any], pii: PIIContext) -> str:
    lines = []
    for key, value in answers.items():
        if key in _KNOWN_ANSWER_KEYS or not value:
            continue
        formatted = _scrub_free_text(value, pii) if isinstance(value, (str, list)) else str(value)
        if formatted:
            lines.append(f"  - {key}: {formatted}")
    return "\n".join(lines) if lines else "  (none)"
```

Then, inside `_build_insights_prompt`, right before the `return prompts.INSIGHTS_USER.format(...)` call, add:
```python
    additional_context = _build_additional_context(answers, pii)
```
and add `additional_context=additional_context,` as the last keyword argument to the `.format(...)` call.

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_ai/test_insights_additional_context.py -q`
Expected: PASS

- [ ] **Step 6: Run the full AI test suite to confirm no regression**

Run: `.venv/Scripts/python.exe -m pytest tests/test_ai/ -q`
Expected: PASS (existing prompt-content tests still pass — the new section only adds text, never changes any existing placeholder's value)

- [ ] **Step 7: Commit**

```bash
git add frinq-backend/app/core/ai/prompts.py frinq-backend/app/core/ai/insights.py frinq-backend/tests/test_ai/test_insights_additional_context.py
git commit -m "fix: hero-card AI prompt now includes answers from admin-added questions"
```

---

### Task 6: Mobile — parameterize `quizDefinition.ts` over a settable content-steps array

**Files:**
- Modify: `frinq-mobile/src/features/quiz/domain/quizDefinition.ts`
- Test: `frinq-mobile/src/features/quiz/domain/__tests__/quizDefinition.dynamicSteps.test.ts` (new)

**Interfaces:**
- Produces: `setContentSteps(steps: QuizStep[]): void` (module-level; replaces the content-steps slice for every subsequent `getStep`/`nextStep`/`previousStep`/`answerKeysForStep`/`stepProgress` call), `DEFAULT_CONTENT_STEPS: readonly QuizStep[]` (today's compiled-in content steps, exported so `QuizNavigator` can fall back to it on fetch failure), `ONBOARDING_PREFIX: readonly QuizStep[]` (today's fixed onboarding steps, never replaced).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/quiz/domain/__tests__/quizDefinition.dynamicSteps.test.ts
import { setContentSteps, getStep, nextStep, previousStep, FIRST_STEP_ID, ONBOARDING_PREFIX } from '../quizDefinition';

describe('dynamic content steps', () => {
  afterEach(() => {
    // Reset to nothing custom between tests — re-import-time defaults are
    // restored by calling setContentSteps with an empty array is NOT valid
    // (validate requires non-empty on the backend, but the mobile setter has
    // no such restriction — an empty array here just means "no content steps
    // configured", tested separately).
  });

  it('getStep resolves a step from a freshly-set content array', () => {
    setContentSteps([
      { id: 'custom_1', kind: 'text', section: 'content', answerKey: 'custom_1', prompt: 'test?' },
    ]);
    expect(getStep('custom_1')?.kind).toBe('text');
  });

  it('nextStep chains from the onboarding prefix into the new content array', () => {
    setContentSteps([
      { id: 'custom_1', kind: 'text', section: 'content', answerKey: 'custom_1', prompt: 'test?' },
    ]);
    const lastOnboardingId = ONBOARDING_PREFIX[ONBOARDING_PREFIX.length - 1].id;
    expect(nextStep(lastOnboardingId)).toBe('custom_1');
  });

  it('previousStep chains backward across the prefix/content boundary', () => {
    setContentSteps([
      { id: 'custom_1', kind: 'text', section: 'content', answerKey: 'custom_1', prompt: 'test?' },
    ]);
    const lastOnboardingId = ONBOARDING_PREFIX[ONBOARDING_PREFIX.length - 1].id;
    expect(previousStep('custom_1')).toBe(lastOnboardingId);
  });

  it('FIRST_STEP_ID is unaffected by setContentSteps (onboarding always starts first)', () => {
    setContentSteps([
      { id: 'custom_1', kind: 'text', section: 'content', answerKey: 'custom_1', prompt: 'test?' },
    ]);
    expect(FIRST_STEP_ID).toBe(ONBOARDING_PREFIX[0].id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frinq-mobile && npm test -- quizDefinition.dynamicSteps`
Expected: FAIL (`setContentSteps`/`ONBOARDING_PREFIX` not exported yet)

- [ ] **Step 3: Refactor `quizDefinition.ts`**

Split the existing `QUIZ_STEPS` constant into `ONBOARDING_PREFIX` (everything up through `sweet`, i.e. today's array up to and including the `{ id: 'sweet', kind: 'intro', ... }` entry) and `DEFAULT_CONTENT_STEPS` (everything from `trip` — wait, check the exact boundary: onboarding scope per the spec is "everything from `social_type` onward" is content, so the boundary is right before `social_type`, meaning `ONBOARDING_PREFIX` ends at `sweet` only if `sweet` precedes `social_type` in the array — reread the actual order: `s0, name, city, age, gender, pronoun, social_verification, ready, nahh` come first, THEN `social_type, scene, saturday_night, hobbies, interests, sweet, trip, ...`. So `sweet` is itself a CONTENT step (an intro screen between `interests` and `trip`), not part of the onboarding prefix. The correct split point is: `ONBOARDING_PREFIX` = everything through `nahh` (the step right before `social_type`); `DEFAULT_CONTENT_STEPS` = `social_type` through `last_question` inclusive (everything else, including `sweet`, `rapid_intro`, `glorious`, `preferences_intro`).

Replace the module with:

```typescript
export const ONBOARDING_PREFIX: readonly QuizStep[] = [
  // ...exactly the existing s0 through nahh entries, unchanged...
];

export const DEFAULT_CONTENT_STEPS: readonly QuizStep[] = [
  // ...exactly the existing social_type through last_question entries, unchanged...
];

let _activeSteps: readonly QuizStep[] = [...ONBOARDING_PREFIX, ...DEFAULT_CONTENT_STEPS];
let _stepIndex = new Map(_activeSteps.map((s, i) => [s.id, i]));

/** Called once by QuizNavigator after fetching (or falling back on) the
 *  active quiz_config content steps — replaces everything from
 *  ONBOARDING_PREFIX's end onward. Never called mid-quiz-session. */
export function setContentSteps(steps: readonly QuizStep[]): void {
  _activeSteps = [...ONBOARDING_PREFIX, ...steps];
  _stepIndex = new Map(_activeSteps.map((s, i) => [s.id, i]));
}

export function getStep(id: StepId): QuizStep | undefined {
  const i = _stepIndex.get(id);
  return i === undefined ? undefined : _activeSteps[i];
}

export function nextStep(id: StepId): StepId | null {
  const i = _stepIndex.get(id);
  if (i === undefined || i + 1 >= _activeSteps.length) return null;
  return _activeSteps[i + 1].id;
}

export function previousStep(id: StepId): StepId | null {
  const i = _stepIndex.get(id);
  if (i === undefined || i <= 0) return null;
  return _activeSteps[i - 1].id;
}

export function stepProgress(id: StepId): { step: number; total: number } {
  const inputSteps = _activeSteps.filter((s) => s.kind !== 'intro');
  const i = inputSteps.findIndex((s) => s.id === id);
  return { step: i === -1 ? 0 : i + 1, total: inputSteps.length };
}

export const FIRST_STEP_ID: StepId = ONBOARDING_PREFIX[0].id;
export function currentLastStepId(): StepId {
  return _activeSteps[_activeSteps.length - 1].id;
}
```

Remove the old module-level `QUIZ_STEPS`, `STEP_INDEX`, `LAST_STEP_ID` (replaced by `currentLastStepId()` since the last step can now change based on what content is active — check for any other importer of `LAST_STEP_ID` and update it to call `currentLastStepId()` instead; `answerKeysForStep` is unchanged (still a pure function of a `QuizStep`, doesn't touch the module-level array).

- [ ] **Step 4: Fix any callers of the removed `QUIZ_STEPS`/`LAST_STEP_ID` exports**

Run: `cd frinq-mobile && grep -rn "QUIZ_STEPS\|LAST_STEP_ID" src/`
Fix each result: anything reading `QUIZ_STEPS` directly (rather than through `getStep`/`nextStep`/etc.) needs to read `DEFAULT_CONTENT_STEPS`/`ONBOARDING_PREFIX` or a helper instead — check `templates/__tests__/templates.test.tsx` and `__tests__/quizJourney.test.tsx` specifically, since those are the most likely to import the array directly for iteration.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- quizDefinition.dynamicSteps`
Expected: PASS

- [ ] **Step 6: Run the full mobile test suite**

Run: `npm run verify`
Expected: PASS, no regressions (this is the highest-risk task in the whole plan — the entire quiz navigation stack depends on this file; do not proceed to Task 7 until this is fully green)

- [ ] **Step 7: Commit**

```bash
git add frinq-mobile/src/features/quiz/domain/quizDefinition.ts frinq-mobile/src/features/quiz/domain/__tests__/quizDefinition.dynamicSteps.test.ts
git commit -m "refactor: quizDefinition steps become replaceable at runtime via setContentSteps"
```

---

### Task 7: Mobile — dynamic `ANSWER_KEYS` allowlist

**Files:**
- Modify: `frinq-mobile/src/storage/quizDraftRepository.ts:19-25,48-55`
- Test: `frinq-mobile/src/storage/__tests__/quizDraftRepository.dynamicKeys.test.ts` (new)

**Interfaces:**
- Produces: `setDynamicAnswerKeys(keys: readonly string[]): void` — unions the given keys into the allowlist `validateAnswers` checks against, on top of the fixed set already there.
- Consumes: nothing new.

`validateAnswers` currently rejects any answer key not in a frozen `ANSWER_KEYS` Set — a brand-new admin question's `answerKey` would be silently rejected the moment the mobile app tries to persist that answer to the local encrypted draft, throwing `draft_unknown_answer_key:${k}`. This must be fixed or the whole feature breaks the instant a user answers a new question.

- [ ] **Step 1: Write the failing test**

```typescript
// src/storage/__tests__/quizDraftRepository.dynamicKeys.test.ts
import { validateAnswers, setDynamicAnswerKeys } from '../quizDraftRepository';

describe('dynamic answer keys', () => {
  it('rejects an unregistered custom key by default', () => {
    expect(() => validateAnswers({ custom_favorite_meal: 'biryani' })).toThrow(/unknown_answer_key/);
  });

  it('accepts a key after it is registered via setDynamicAnswerKeys', () => {
    setDynamicAnswerKeys(['custom_favorite_meal']);
    expect(() => validateAnswers({ custom_favorite_meal: 'biryani' })).not.toThrow();
  });

  it('still rejects a key that was never registered', () => {
    setDynamicAnswerKeys(['custom_favorite_meal']);
    expect(() => validateAnswers({ totally_unknown: 'x' })).toThrow(/unknown_answer_key/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- quizDraftRepository.dynamicKeys`
Expected: FAIL (`setDynamicAnswerKeys` not exported)

- [ ] **Step 3: Make the allowlist dynamic**

In `quizDraftRepository.ts`, replace:
```typescript
export const ANSWER_KEYS: ReadonlySet<string> = new Set([...]);
```
with:
```typescript
const FIXED_ANSWER_KEYS: ReadonlySet<string> = new Set([
  'name', 'city', 'dob', 'gender', 'pronoun', 'social_linkedin', 'social_instagram',
  'social_type', 'saturday', 'scene', 'hobbies', 'interests',
  'trip', 'travel_style', 'connection_mode', 'event_yes', 'event_no', 'would_rather',
  'meeting_style', 'show_up', 'connection', 'red_flags', 'rapid', 'opinions',
  'opinions_why', 'preferences', 'story', 'looking_for',
]);

let _dynamicAnswerKeys: ReadonlySet<string> = new Set();

/** Called once by QuizNavigator after resolving the active quiz_config's
 *  content steps — unions every content step's answerKey into what
 *  validateAnswers accepts, on top of the fixed onboarding/legacy set above.
 *  Never shrinks the fixed set; only additive. */
export function setDynamicAnswerKeys(keys: readonly string[]): void {
  _dynamicAnswerKeys = new Set(keys);
}

export function isKnownAnswerKey(key: string): boolean {
  return FIXED_ANSWER_KEYS.has(key) || _dynamicAnswerKeys.has(key);
}
```
and change `validateAnswers`'s check from `if (!ANSWER_KEYS.has(k))` to `if (!isKnownAnswerKey(k))`.

Check every other importer of `ANSWER_KEYS` (`grep -rn "ANSWER_KEYS" src/`, including `quizDefinition.ts`'s own re-export at its bottom) and update them to use `isKnownAnswerKey` instead, or keep a read-only re-export if something genuinely needs to enumerate the fixed set only (unlikely, but check).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- quizDraftRepository.dynamicKeys`
Expected: PASS

- [ ] **Step 5: Run the full mobile test suite**

Run: `npm run verify`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add frinq-mobile/src/storage/quizDraftRepository.ts frinq-mobile/src/storage/__tests__/quizDraftRepository.dynamicKeys.test.ts
git commit -m "feat: quiz draft's answer-key allowlist grows dynamically with admin-added questions"
```

---

### Task 8: Mobile — single-`slider` step kind

**Files:**
- Modify: `frinq-mobile/src/features/quiz/domain/quizDefinition.ts` (add `SliderStep` to the union)
- Modify: `frinq-mobile/src/features/quiz/screens/QuizStepScreen.tsx` (add the `slider` case)
- Test: `frinq-mobile/src/features/quiz/screens/templates/__tests__/templates.test.tsx` (extend)

**Interfaces:**
- Produces: `SliderStep` interface (`kind: 'slider'`, `answerKey`, `prompt`, `leftLabel`, `leftHint`, `rightLabel`, `rightHint`) added to the `QuizStep` union.

- [ ] **Step 1: Write the failing test**

Add to `templates.test.tsx` (matching however existing template tests render + assert in this file — check its existing pattern for `preferences`/`SnapSlider` and mirror it exactly for consistency):
```typescript
it('renders a single slider step and reports its value on continue', () => {
  const step: SliderStep = {
    id: 'custom_slider', kind: 'slider', section: 'content', answerKey: 'custom_slider',
    prompt: 'you trust more', leftLabel: 'what you see', leftHint: 'see', rightLabel: 'what you sense', rightHint: 'sense',
  };
  // render QuizStepScreen (or directly the new inline slider case) with this
  // step, interact with the SnapSlider, tap continue, assert onChange/onContinue
  // fired with the expected numeric value — match this file's existing
  // render-and-interact helper for the 'preferences' case.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- templates.test`
Expected: FAIL (`SliderStep` doesn't exist / `slider` case not handled)

- [ ] **Step 3: Add `SliderStep` to the union**

In `quizDefinition.ts`, add:
```typescript
export interface SliderStep extends BaseStep {
  kind: 'slider';
  answerKey: string;
  prompt: string;
  leftLabel: string;
  leftHint: string;
  rightLabel: string;
  rightHint: string;
}
```
and add `| SliderStep` to the `QuizStep` union.

- [ ] **Step 4: Add the `slider` case to `QuizStepScreen`**

`SnapSlider` (from `../components/SnapSlider`) is already imported by `PreferencesTemplate.tsx` with props `{ prompt, leftLabel, leftHint, rightLabel, rightHint, value, onChange }` — reuse it directly, following the exact same local-state pattern `QuizStepScreen` already uses for `preferences` (declared unconditionally before the early `!step` return, so Hooks order stays stable):

```typescript
const [localSlider, setLocalSlider] = useState<number | undefined>(answer as number | undefined);
useEffect(() => {
  if (step?.kind === 'slider') setLocalSlider(answer as number | undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [step?.id]);
```
and in the `switch (step.kind)`:
```typescript
case 'slider':
  return (
    <QuizScreenFrame
      stepId={step.id}
      section={step.section}
      onBack={previousStep(step.id) ? goBack : undefined}
      continueLabel="continue"
      onContinue={() => { send({ type: 'ANSWER', key: step.answerKey, value: localSlider }); advanceOrFinish(); }}
      continueDisabled={localSlider === undefined}
    >
      <SnapSlider
        prompt={step.prompt}
        leftLabel={step.leftLabel}
        leftHint={step.leftHint}
        rightLabel={step.rightLabel}
        rightHint={step.rightHint}
        value={localSlider}
        onChange={setLocalSlider}
      />
    </QuizScreenFrame>
  );
```
Add `QuizScreenFrame` and `SnapSlider` to `QuizStepScreen.tsx`'s imports.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- templates.test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frinq-mobile/src/features/quiz/domain/quizDefinition.ts frinq-mobile/src/features/quiz/screens/QuizStepScreen.tsx frinq-mobile/src/features/quiz/screens/templates/__tests__/templates.test.tsx
git commit -m "feat: add single-slider quiz step kind, reusing SnapSlider directly"
```

---

### Task 9: Mobile — fetch quiz config at quiz start, with fallback

**Files:**
- Create: `frinq-mobile/src/features/quiz/quizConfigService.ts`
- Modify: `frinq-mobile/src/navigation/QuizNavigator.tsx`
- Test: `frinq-mobile/src/features/quiz/__tests__/quizConfigService.test.ts` (new)
- Test: extend `frinq-mobile/src/features/quiz/__tests__/quizJourney.test.tsx` for the fallback path

**Interfaces:**
- Consumes: `apiClient.request<T>({ path })` (existing pattern, see `quizSyncService.ts`'s `startQuiz`).
- Produces: `fetchQuizConfig(apiClient): Promise<{ version: number; steps: QuizStep[] }>` (throws on network/HTTP failure — caller decides fallback).

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/quiz/__tests__/quizConfigService.test.ts
import { fetchQuizConfig } from '../quizConfigService';

describe('fetchQuizConfig', () => {
  it('returns the parsed version/steps on success', async () => {
    const apiClient = { request: jest.fn().mockResolvedValue({ version: 3, steps: [{ id: 'x', kind: 'text' }] }) };
    const result = await fetchQuizConfig(apiClient as any);
    expect(result.version).toBe(3);
    expect(apiClient.request).toHaveBeenCalledWith({ path: '/api/v1/quiz/config' });
  });

  it('propagates a failure for the caller to handle', async () => {
    const apiClient = { request: jest.fn().mockRejectedValue(new Error('network')) };
    await expect(fetchQuizConfig(apiClient as any)).rejects.toThrow('network');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- quizConfigService`
Expected: FAIL (module doesn't exist)

- [ ] **Step 3: Write the service**

```typescript
// src/features/quiz/quizConfigService.ts
import { ApiClient } from '../../services/api/apiClient'; // match the exact type used by quizSyncService.ts's startQuiz
import { QuizStep } from './domain/quizDefinition';

export interface QuizConfigResponse {
  version: number;
  steps: QuizStep[];
}

export async function fetchQuizConfig(apiClient: ApiClient): Promise<QuizConfigResponse> {
  return apiClient.request<QuizConfigResponse>({ path: '/api/v1/quiz/config' });
}
```

(Check `quizSyncService.ts`'s exact import path/type name for the API client and match it — don't invent a new type name if one already exists.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- quizConfigService`
Expected: PASS

- [ ] **Step 5: Wire it into `QuizNavigator`'s resolver**

In `QuizNavigator.tsx`, import `fetchQuizConfig`, `setContentSteps`, `DEFAULT_CONTENT_STEPS` from `quizDefinition`, and `setDynamicAnswerKeys` from `quizDraftRepository`. Inside the existing `useEffect`'s async resolver, before computing `initialStepId` (which depends on `nextStep`, which depends on the content steps already being set), add:

```typescript
try {
  const config = await fetchQuizConfig(apiClient);
  setContentSteps(config.steps);
} catch {
  // Offline / backend hiccup — quiz still works with today's compiled-in
  // content, matching this app's existing offline-tolerant pattern.
  setContentSteps(DEFAULT_CONTENT_STEPS);
}
setDynamicAnswerKeys(
  (fetchedStepsOrDefault).filter((s: any) => 'answerKey' in s).map((s: any) => s.answerKey),
);
```

(Restructure so the same resolved step array from the try/catch above is reused for both `setContentSteps` and computing the `answerKey` list passed to `setDynamicAnswerKeys` — don't call `fetchQuizConfig` twice. Store the resolved `steps` in a local variable inside the try/catch rather than re-deriving it.)

This must run once per quiz session (this `useEffect` already only depends on `[apiClient, attempt]`, matching "fetch once at quiz start, never mid-session" from the spec).

- [ ] **Step 6: Extend `quizJourney.test.tsx` for the fallback path**

Add a test (matching this file's existing setup/mocking conventions) that mocks `apiClient.request` to reject for the `/api/v1/quiz/config` path specifically, and asserts the quiz still renders its first content step from `DEFAULT_CONTENT_STEPS` (e.g. `social_type`) rather than crashing or hanging on the boot splash.

- [ ] **Step 7: Run the full mobile test suite**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frinq-mobile/src/features/quiz/quizConfigService.ts frinq-mobile/src/navigation/QuizNavigator.tsx frinq-mobile/src/features/quiz/__tests__/quizConfigService.test.ts frinq-mobile/src/features/quiz/__tests__/quizJourney.test.tsx
git commit -m "feat: quiz start fetches admin-authored content steps, falls back to compiled-in defaults"
```

---

### Task 10: Fix Borel display-heading clipping

**Files:**
- Modify: `frinq-mobile/src/design/tokens/typography.ts:25`
- Modify: `frinq-mobile/src/features/quiz/components/SimpleStepFrame.tsx:63`

**Interfaces:** none (pure visual fix, no signature changes).

Reported: the cursive "Borel" display heading gets visually clipped at the top on some screens. `typeScale.display` currently sets `fontSize: 40, lineHeight: 48` — a 1.2x ratio, tight for a script font whose actual ink (tall ascenders/loops) commonly exceeds standard metrics-based line-height assumptions, especially on Android. No `overflow: 'hidden'` or `numberOfLines` exists anywhere in the render path (`BrandHeading` → plain `RNText`), so the fix is headroom: a more generous `lineHeight` plus a touch of extra top margin where it's rendered.

- [ ] **Step 1: Increase the display role's line-height**

In `typography.ts`, change:
```typescript
display: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 48 },
```
to:
```typescript
display: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 58 },
```
(1.45x ratio — standard safe headroom for script/display fonts with tall ascenders.)

- [ ] **Step 2: Add top headroom where the heading renders**

In `SimpleStepFrame.tsx`, change:
```typescript
heading: { marginTop: spacing.xl, marginBottom: spacing.lg },
```
to:
```typescript
heading: { marginTop: spacing.xl, marginBottom: spacing.lg, paddingTop: spacing.xs },
```

- [ ] **Step 3: Verify visually on a real screen**

Run the app on a device/simulator (matching this project's established "screenshot the result, don't just claim success" convention — see prior session's font-fix verification), open any onboarding screen using `SimpleStepFrame` (e.g. the "what should we call you?" name-entry screen) and any content screen with a cursive heading, and confirm the full glyph — including capital-letter ascenders and any descender loops — renders with visible clearance above and below, not touching the screen edge or a sibling element. Screenshot before/after if the clipping was previously visible.

- [ ] **Step 4: Run the mobile snapshot/token tests**

Run: `npm test -- tokens.test`
Expected: PASS (this file already asserts on `typeScale` shape per the earlier grep — confirm it doesn't hardcode the old `lineHeight: 48` value; update it if it does, since 58 is now correct)

- [ ] **Step 5: Commit**

```bash
git add frinq-mobile/src/design/tokens/typography.ts frinq-mobile/src/features/quiz/components/SimpleStepFrame.tsx
git commit -m "fix: increase Borel display-heading line-height to stop top-clipping"
```

---

### Task 11: Admin — Questions tab (list, add, edit, reorder, delete)

**Files:**
- Create: `frinq-admin/app/questions/page.tsx`
- Create: `frinq-admin/app/components/QuestionsView.tsx`
- Modify: `frinq-admin/app/components/AdminShell.tsx` (add nav entry)

**Interfaces:**
- Consumes: `GET /api/v1/admin/quiz-config`, `PUT /api/v1/admin/quiz-config` (via `adminFetch`, matching every other admin view's exact call pattern).

- [ ] **Step 1: Add the nav entry**

In `AdminShell.tsx`'s `NAV_ITEMS` array, add:
```typescript
{ label: "questions", href: "/questions", isActive: (p) => p === "/questions" },
```

- [ ] **Step 2: Write the standalone page**

Mirror `app/model-config/page.tsx`'s exact structure (owns action-password state + `PasswordModal`, delegates to a view component):

```typescript
// app/questions/page.tsx
"use client";

import { useCallback, useState } from "react";
import { useAdminAuth } from "@/app/components/AdminShell";
import { QuestionsView } from "@/app/components/QuestionsView";
import PasswordModal from "@/app/components/PasswordModal";

export default function QuestionsPage() {
  const { adminKey } = useAdminAuth();
  const [actionPassword, setActionPassword] = useState("");
  const [pwdModal, setPwdModal] = useState<{ resolve: (p: string | null) => void } | null>(null);

  const requestPassword = useCallback((): Promise<string | null> => {
    if (actionPassword) return Promise.resolve(actionPassword);
    return new Promise<string | null>((resolve) => setPwdModal({ resolve }));
  }, [actionPassword]);

  return (
    <div>
      <header className="border-b border-[rgba(42,24,16,0.1)] px-6 py-4 flex items-center justify-between">
        <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-lg">questions</span>
      </header>
      <main className="px-6 py-6 max-w-4xl mx-auto">
        <QuestionsView adminKey={adminKey}
          onRequestPassword={async () => {
            const pwd = await requestPassword();
            if (pwd) setActionPassword(pwd);
            return pwd;
          }}
          onWrongPassword={() => setActionPassword("")}
        />
      </main>
      <PasswordModal
        open={!!pwdModal}
        onSubmit={(p) => { setActionPassword(p); pwdModal?.resolve(p); setPwdModal(null); }}
        onCancel={() => { pwdModal?.resolve(null); setPwdModal(null); }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Write `QuestionsView.tsx`**

Follow `ModelConfigView.tsx`'s exact fetch/save/feedback pattern (load on mount via `queueMicrotask`, `adminFetch` with `{ key: adminKey }` / `{ key: adminKey, pwd }`, 401 → `logout()`, 403 → `onWrongPassword()` + feedback, success → feedback + `setTimeout` clear). Structure:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/app/lib/adminFetch";
import { useAdminAuth } from "@/app/components/AdminShell";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type StepKind = "text" | "singleChoiceCard" | "singleChoiceList" | "multiChoiceTags" | "slider" | "rapidFire" | "intro";

interface QuizStepDraft {
  id: string;
  kind: StepKind;
  [key: string]: unknown; // kind-specific fields, edited by the form below
}

export function QuestionsView({ adminKey, onRequestPassword, onWrongPassword }: {
  adminKey: string;
  onRequestPassword: () => Promise<string | null>;
  onWrongPassword: () => void;
}) {
  const { logout } = useAdminAuth();
  const [steps, setSteps] = useState<QuizStepDraft[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // null = closed, -1 = adding new

  const load = useCallback(async () => {
    if (!adminKey) return;
    setLoadError(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/quiz-config`, {}, { key: adminKey });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { setLoadError(`error ${res.status}`); return; }
      const data = await res.json();
      setSteps(data.steps);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "network error");
    }
  }, [adminKey, logout]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  async function save(nextSteps: QuizStepDraft[]) {
    const pwd = await onRequestPassword();
    if (!pwd) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/quiz-config`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: nextSteps }) },
        { key: adminKey, pwd });
      if (res.status === 401) { logout(); return; }
      if (res.status === 403) { onWrongPassword(); setFeedback("wrong action password — try again"); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFeedback(`failed: ${d.detail || res.status}`);
        return;
      }
      const body = await res.json();
      setSteps(body.steps);
      setFeedback("saved — live for the next quiz session to start");
      setEditingIndex(null);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "network error");
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  }

  function moveStep(index: number, direction: -1 | 1) {
    if (!steps) return;
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = steps.slice();
    [next[index], next[target]] = [next[target], next[index]];
    void save(next);
  }

  function deleteStep(index: number) {
    if (!steps) return;
    void save(steps.filter((_, i) => i !== index));
  }

  if (loadError) {
    return <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B]" role="alert">{loadError}</p>;
  }
  if (!steps) {
    return <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#8B7355]">loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#2A7810]" role="status">{feedback}</p>
      )}

      <div className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <div key={step.id} className="border border-[rgba(42,24,16,0.12)] bg-white/50 px-4 py-3 flex items-center justify-between gap-3">
            <span className="flex flex-col gap-0.5">
              <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#7C1C0B]">{step.kind}</span>
              <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[13px]">
                {(step.prompt as string) || (step.heading as string) || step.id}
              </span>
            </span>
            <div className="flex gap-1.5">
              <button disabled={saving || i === 0} onClick={() => moveStep(i, -1)}
                className="font-[family-name:var(--font-motive)] text-[9px] px-2 py-1 border border-[rgba(42,24,16,0.15)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-30">
                up
              </button>
              <button disabled={saving || i === steps.length - 1} onClick={() => moveStep(i, 1)}
                className="font-[family-name:var(--font-motive)] text-[9px] px-2 py-1 border border-[rgba(42,24,16,0.15)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-30">
                down
              </button>
              <button disabled={saving} onClick={() => setEditingIndex(i)}
                className="font-[family-name:var(--font-motive)] text-[9px] px-2 py-1 border border-[rgba(42,24,16,0.15)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-30">
                edit
              </button>
              <button disabled={saving} onClick={() => deleteStep(i)}
                className="font-[family-name:var(--font-motive)] text-[9px] px-2 py-1 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-30">
                delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingIndex !== null ? (
        <QuestionForm
          initial={editingIndex >= 0 ? steps[editingIndex] : null}
          onSave={(step) => {
            const next = editingIndex >= 0
              ? steps.map((s, i) => (i === editingIndex ? step as QuizStepDraft : s))
              : [...steps, step as QuizStepDraft];
            void save(next);
          }}
          onCancel={() => setEditingIndex(null)}
        />
      ) : (
        <button onClick={() => setEditingIndex(-1)} disabled={saving}
          className="self-start font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)] disabled:opacity-40">
          + add question
        </button>
      )}
    </div>
  );
}
```

`QuestionForm` (Task 12) is imported at the top of this file: `import { QuestionForm } from "./QuestionForm";`.

- [ ] **Step 4: `npm run build && npm run lint`**

Run: `cd frinq-admin && npm run build && npm run lint`
Expected: both clean

- [ ] **Step 5: Commit**

```bash
git add frinq-admin/app/questions frinq-admin/app/components/QuestionsView.tsx frinq-admin/app/components/AdminShell.tsx
git commit -m "feat: add admin Questions tab shell (list, reorder, delete)"
```

---

### Task 12: Admin — per-kind question form

**Files:**
- Create: `frinq-admin/app/components/QuestionForm.tsx`
- Modify: `frinq-admin/app/components/QuestionsView.tsx` (wire in the add/edit form)

**Interfaces:**
- Produces: `QuestionForm({ initial, onSave, onCancel }: { initial: QuizStepDraft | null; onSave: (step: QuizStepDraft) => void; onCancel: () => void })` — `initial === null` means "adding new" (kind picker shown first); non-null means "editing" (kind locked, only that kind's fields shown).

- [ ] **Step 1: Write the kind-picker + per-kind field sets**

```typescript
"use client";

import { useState } from "react";

type StepKind = "text" | "singleChoiceCard" | "singleChoiceList" | "multiChoiceTags" | "slider" | "rapidFire" | "intro";

const KIND_LABELS: Record<StepKind, string> = {
  text: "text (+ optional voice)",
  singleChoiceCard: "MCQ — description cards",
  singleChoiceList: "MCQ — vertical list or would-you-rather",
  multiChoiceTags: "MCQ — tag flow or checklist",
  slider: "slider (1-5)",
  rapidFire: "rapid fire (edit the one block's pairs)",
  intro: "section intro screen",
};

function newAnswerKey(): string {
  return `custom_${Date.now()}`;
}

export function QuestionForm({ initial, onSave, onCancel }: {
  initial: Record<string, unknown> | null;
  onSave: (step: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<StepKind | null>((initial?.kind as StepKind) ?? null);
  const [fields, setFields] = useState<Record<string, unknown>>(initial ?? {});

  if (!kind) {
    return (
      <div className="border border-[rgba(42,24,16,0.15)] rounded-md p-4">
        <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355] mb-3">pick a question type</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND_LABELS) as StepKind[]).filter((k) => k !== "rapidFire").map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className="font-[family-name:var(--font-motive)] text-[10px] px-3 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]">
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="mt-3 font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">cancel</button>
      </div>
    );
  }

  function field(key: string, label: string, placeholder = "") {
    return (
      <label className="flex flex-col gap-1">
        <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">{label}</span>
        <input value={(fields[key] as string) ?? ""} placeholder={placeholder}
          onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
          className="frinq-input" />
      </label>
    );
  }

  function submit() {
    const answerKey = (fields.answerKey as string) || newAnswerKey();
    const id = (fields.id as string) || answerKey;
    onSave({ ...fields, id, answerKey, kind });
  }

  return (
    <div className="border border-[rgba(42,24,16,0.15)] rounded-md p-4 flex flex-col gap-3">
      <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355]">{KIND_LABELS[kind]}</p>

      {kind === "text" && (
        <>
          {field("prompt", "prompt")}
          {field("placeholder", "placeholder (optional)")}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!fields.allowVoice}
              onChange={(e) => setFields((f) => ({ ...f, allowVoice: e.target.checked }))} />
            <span className="font-[family-name:var(--font-motive)] text-[10px] text-[#2A1810]">allow voice answer</span>
          </label>
        </>
      )}

      {kind === "slider" && (
        <>
          {field("prompt", "prompt")}
          {field("leftLabel", "left label")}
          {field("leftHint", "left hint (short)")}
          {field("rightLabel", "right label")}
          {field("rightHint", "right hint (short)")}
        </>
      )}

      {kind === "intro" && (
        <>
          {field("heading", "heading")}
          {field("body", "body (optional)")}
          {field("ctaLabel", "button label")}
        </>
      )}

      {(kind === "singleChoiceCard" || kind === "singleChoiceList" || kind === "multiChoiceTags") && (
        <>
          {field("prompt", "prompt")}
          <label className="flex flex-col gap-1">
            <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">
              options (one per line{kind === "singleChoiceCard" ? ", or \"label | description\"" : ""})
            </span>
            <textarea rows={5}
              value={(fields._optionsText as string) ?? ""}
              onChange={(e) => setFields((f) => ({ ...f, _optionsText: e.target.value }))}
              className="frinq-input" />
          </label>
          {kind === "singleChoiceList" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={fields.variant === "box"}
                onChange={(e) => setFields((f) => ({ ...f, variant: e.target.checked ? "box" : "pill", chrome: e.target.checked ? "simple" : undefined }))} />
              <span className="font-[family-name:var(--font-motive)] text-[10px] text-[#2A1810]">"would you rather" style (exactly 2 options)</span>
            </label>
          )}
          {kind === "multiChoiceTags" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={fields.layout === "list"}
                onChange={(e) => setFields((f) => ({ ...f, layout: e.target.checked ? "list" : "chips" }))} />
              <span className="font-[family-name:var(--font-motive)] text-[10px] text-[#2A1810]">vertical checklist style (instead of tag flow)</span>
            </label>
          )}
        </>
      )}

      <div className="flex gap-2 mt-2">
        <button onClick={submit}
          className="font-[family-name:var(--font-motive)] text-[10px] px-3 py-1.5 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]">
          save
        </button>
        <button onClick={onCancel} className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">cancel</button>
      </div>
    </div>
  );
}
```

The free-text `_optionsText` textarea (one option per line) is converted to the real `options` array shape at save time, before calling `onSave` from `QuestionsView` — `singleChoiceCard`/`singleChoiceList` need `{value, label}` (or `{value,label,description}` split on `" | "`), `multiChoiceTags` needs a plain string array. Do this conversion in `QuestionsView.save`'s caller (the "+ add question" flow), not inside `QuestionForm`, so `QuestionForm` stays a dumb field-editor.

- [ ] **Step 2: Wire into `QuestionsView`**

Add the options-array conversion helper and render `<QuestionForm>` when `editingIndex !== null`, calling the existing `save()` function (from Task 11) with the converted step spliced into (or appended to) the current `steps` array at the right position.

- [ ] **Step 3: `npm run build && npm run lint`**

Run: `cd frinq-admin && npm run build && npm run lint`
Expected: both clean

- [ ] **Step 4: Manual click-through**

Start the admin dev server + backend, add one question of each kind through the UI, confirm each PUT succeeds and the list re-renders with the new step, confirm reorder (up/down) and delete both work, confirm a validation failure (e.g. try saving a "would you rather" with only 1 option filled in) surfaces the backend's 422 message as feedback rather than crashing.

- [ ] **Step 5: Commit**

```bash
git add frinq-admin/app/components/QuestionForm.tsx frinq-admin/app/components/QuestionsView.tsx
git commit -m "feat: add per-kind question authoring form to the admin Questions tab"
```

---

## Post-plan verification

- [ ] Full backend suite: `cd frinq-backend && .venv/Scripts/python.exe -m pytest -q` — all green.
- [ ] Full mobile suite: `cd frinq-mobile && npm run verify` — all green.
- [ ] Admin build/lint: `cd frinq-admin && npm run build && npm run lint` — both clean.
- [ ] Live end-to-end: add a new "text + voice" question via the admin Questions tab, restart (or wait for) a fresh quiz session on a device/emulator, confirm the new question appears at its saved position, confirm answering it doesn't throw a `draft_unknown_answer_key` error, confirm it completes and a subsequent hero-card generation's prompt includes it in the "additional context" section (can be confirmed via a log/breakpoint on `_build_insights_prompt`'s output without needing a real AI key).
- [ ] Code review pass (per this session's established per-phase convention): dispatch a code-reviewer subagent against the full diff before considering this plan done.

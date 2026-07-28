from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.quiz_config import InvalidQuizConfigError, validate_steps, get_active_quiz_config


def test_rejects_unknown_kind():
    with pytest.raises(InvalidQuizConfigError):
        validate_steps([{"id": "x", "kind": "notarealkind", "section": "custom"}])


def test_rejects_missing_required_field_for_kind():
    with pytest.raises(InvalidQuizConfigError):
        validate_steps([{"id": "x", "kind": "text", "section": "custom", "answerKey": "custom_1"}])  # missing prompt


def test_rejects_missing_section():
    with pytest.raises(InvalidQuizConfigError, match="section"):
        validate_steps([{"id": "x", "kind": "text", "answerKey": "custom_1", "prompt": "one?"}])


def test_rejects_duplicate_answer_key():
    steps = [
        {"id": "a", "kind": "text", "section": "custom", "answerKey": "custom_1", "prompt": "one?"},
        {"id": "b", "kind": "text", "section": "custom", "answerKey": "custom_1", "prompt": "two?"},
    ]
    with pytest.raises(InvalidQuizConfigError):
        validate_steps(steps)


def test_rejects_duplicate_step_id():
    steps = [
        {"id": "duplicate", "kind": "text", "section": "custom", "answerKey": "custom_1", "prompt": "one?"},
        {"id": "duplicate", "kind": "text", "section": "custom", "answerKey": "custom_2", "prompt": "two?"},
    ]
    with pytest.raises(InvalidQuizConfigError, match="duplicate step id"):
        validate_steps(steps)


@pytest.mark.parametrize("field, value", [("id", 7), ("id", []), ("answerKey", 7), ("answerKey", ["custom"])])
def test_rejects_non_string_step_ids_and_answer_keys(field, value):
    step = {"id": "a", "kind": "text", "section": "custom", "answerKey": "custom_1", "prompt": "one?"}
    step[field] = value
    with pytest.raises(InvalidQuizConfigError):
        validate_steps([step])


def test_rejects_reserved_answer_key():
    steps = [{"id": "a", "kind": "text", "section": "custom", "answerKey": "name", "prompt": "what's your name?"}]
    with pytest.raises(InvalidQuizConfigError):
        validate_steps(steps)


def test_rejects_box_variant_with_wrong_option_count():
    steps = [{
        "id": "a", "kind": "singleChoiceList", "answerKey": "custom_1", "prompt": "p",
        "section": "custom",
        "variant": "box", "chrome": "simple",
        "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}, {"value": "c", "label": "C"}],
    }]
    with pytest.raises(InvalidQuizConfigError):
        validate_steps(steps)


def test_rejects_box_variant_without_simple_chrome():
    steps = [{
        "id": "a", "kind": "singleChoiceList", "answerKey": "custom_1", "prompt": "p",
        "section": "custom",
        "variant": "box",
        "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}],
    }]
    with pytest.raises(InvalidQuizConfigError):
        validate_steps(steps)


def test_accepts_valid_mixed_step_list():
    steps = [
        {"id": "a", "kind": "text", "section": "custom", "answerKey": "custom_1", "prompt": "what's your favorite meal?"},
        {"id": "b", "kind": "text", "section": "custom", "answerKey": "custom_2", "prompt": "tell us a story", "allowVoice": True},
        {
            "id": "c", "kind": "singleChoiceCard", "section": "custom", "answerKey": "custom_3", "prompt": "pick one",
            "options": [{"value": "x", "label": "X", "description": "desc"}, {"value": "y", "label": "Y"}],
        },
        {
            "id": "d", "kind": "multiChoiceTags", "section": "custom", "answerKey": "custom_4", "prompt": "pick some",
            "options": ["one", "two", "three"], "layout": "list",
        },
        {
            "id": "e", "kind": "singleChoiceList", "section": "custom", "answerKey": "custom_5", "prompt": "would you rather",
            "variant": "box", "chrome": "simple",
            "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}],
        },
        {"id": "f", "kind": "slider", "section": "custom", "answerKey": "custom_6", "prompt": "trust scale",
         "leftLabel": "logic", "leftHint": "logic", "rightLabel": "gut", "rightHint": "gut"},
        {"id": "g", "kind": "rapidFire", "section": "custom", "answerKey": "rapid",
         "pairs": [{"a": "x", "b": "y"}], "secondsPerPair": 10},
        {"id": "h", "kind": "intro", "section": "custom", "heading": "almost done", "ctaLabel": "continue"},
    ]
    validate_steps(steps)  # must not raise


def test_accepts_legacy_step_kinds():
    """Legacy kinds use the payload shapes rendered by the mobile templates."""
    steps = [
        {"id": "a", "kind": "voiceOrText", "section": "story", "answerKey": "story", "heading": "tell us a story"},
        {
            "id": "b", "kind": "opinions", "section": "opinions", "answerKey": "opinions",
            "pairs": [{"prompt": "on plans:", "a": "plan ahead", "b": "go with it"}],
        },
        {
            "id": "c", "kind": "preferences", "section": "preferences", "answerKey": "preferences",
            "sliders": [{
                "prompt": "you trust more", "leftLabel": "logic", "leftHint": "logic",
                "rightLabel": "gut", "rightHint": "gut",
            }],
        },
    ]
    validate_steps(steps)  # must not raise


@pytest.mark.parametrize(
    "step, expected",
    [
        ({"id": "v", "kind": "voiceOrText", "section": "story", "answerKey": "story"}, "heading"),
        ({"id": "o", "kind": "opinions", "section": "opinions", "answerKey": "opinions", "pairs": []}, "pair"),
        (
            {
                "id": "o", "kind": "opinions", "section": "opinions", "answerKey": "opinions",
                "pairs": [{"prompt": "question", "a": "left"}],
            },
            "pair",
        ),
        ({"id": "p", "kind": "preferences", "section": "preferences", "answerKey": "preferences", "sliders": []}, "slider"),
        (
            {
                "id": "p", "kind": "preferences", "section": "preferences", "answerKey": "preferences",
                "sliders": [{"prompt": "question", "leftLabel": "left", "leftHint": "left", "rightLabel": "right"}],
            },
            "slider",
        ),
        (
            {
                "id": "r", "kind": "rapidFire", "section": "rapid-fire",
                "pairs": [{"a": "left", "b": "right"}], "secondsPerPair": 10,
            },
            "answerKey",
        ),
    ],
)
def test_rejects_invalid_legacy_payloads(step, expected):
    with pytest.raises(InvalidQuizConfigError, match=expected):
        validate_steps([step])


def test_migration_020_seed_passes_runtime_validation():
    migration = Path(__file__).parents[2] / "migrations" / "020_quiz_config.sql"
    sql = migration.read_text(encoding="utf-8")
    json_text = sql.split("VALUES (1, '", 1)[1].split("'::jsonb", 1)[0].replace("''", "'")
    validate_steps(json.loads(json_text))


@pytest.mark.asyncio
async def test_get_active_quiz_config_parses_jsonb():
    """Test that get_active_quiz_config parses jsonb strings to Python objects."""
    steps = [
        {"id": "a", "kind": "text", "section": "custom", "answerKey": "custom_1", "prompt": "hello?"},
        {"id": "b", "kind": "text", "section": "custom", "answerKey": "custom_2", "prompt": "world?"},
    ]

    # Mock asyncpg connection with jsonb as string (as returned from the DB)
    mock_conn = AsyncMock()
    mock_row = MagicMock()
    mock_row.__getitem__.side_effect = lambda key: {
        "version": 1,
        "steps": json.dumps(steps),  # DB returns string, not parsed list
    }[key]
    mock_conn.fetchrow.return_value = mock_row

    result = await get_active_quiz_config(mock_conn)

    # Verify steps were parsed from string to list
    assert isinstance(result["steps"], list)
    assert result["steps"] == steps
    assert result["version"] == 1

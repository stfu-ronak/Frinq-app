from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.quiz_config import InvalidQuizConfigError, validate_steps, get_active_quiz_config


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


def test_rejects_duplicate_step_id():
    steps = [
        {"id": "duplicate", "kind": "text", "answerKey": "custom_1", "prompt": "one?"},
        {"id": "duplicate", "kind": "text", "answerKey": "custom_2", "prompt": "two?"},
    ]
    with pytest.raises(InvalidQuizConfigError, match="duplicate step id"):
        validate_steps(steps)


@pytest.mark.parametrize("field, value", [("id", 7), ("id", []), ("answerKey", 7), ("answerKey", ["custom"])])
def test_rejects_non_string_step_ids_and_answer_keys(field, value):
    step = {"id": "a", "kind": "text", "answerKey": "custom_1", "prompt": "one?"}
    step[field] = value
    with pytest.raises(InvalidQuizConfigError):
        validate_steps([step])


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


def test_accepts_legacy_step_kinds():
    """Test that legacy step kinds (voiceOrText, opinions, preferences) pass validation."""
    steps = [
        {"id": "a", "kind": "voiceOrText", "answerKey": "story", "prompt": "tell us a story"},
        {"id": "b", "kind": "opinions", "answerKey": "opinions_why", "prompt": "why do you think that?"},
        {"id": "c", "kind": "preferences", "answerKey": "preferences", "prompt": "what are your preferences?"},
    ]
    validate_steps(steps)  # must not raise


@pytest.mark.asyncio
async def test_get_active_quiz_config_parses_jsonb():
    """Test that get_active_quiz_config parses jsonb strings to Python objects."""
    steps = [
        {"id": "a", "kind": "text", "answerKey": "custom_1", "prompt": "hello?"},
        {"id": "b", "kind": "text", "answerKey": "custom_2", "prompt": "world?"},
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

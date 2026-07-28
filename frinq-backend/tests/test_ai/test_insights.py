"""Regression coverage for _build_insights_prompt's handling of quiz answers
that arrive as arrays (hobbies/show_up/looking_for) rather than plain strings.

Before this fix, scrub_text() was called directly on these fields — a list
input hit `re.sub(pattern, repl, a_list)` and raised
`TypeError: expected string or bytes-like object, got 'list'` for EVERY
submission where these multi-select quiz steps produced a list answer
(i.e. essentially every real submission), so no quiz job could ever
complete successfully.
"""

from __future__ import annotations

from app.core.ai.insights import _build_insights_prompt


def _base_answers(**overrides):
    answers = {
        "dob": "14/03/1999",
        "city": "Ghar",
        "name": "Test User",
        "hobbies": ["solving puzzles", "fermenting things"],
        "show_up": ["i offer practical help", "i give thoughtful gifts"],
        "looking_for": ["emotionally available"],
    }
    answers.update(overrides)
    return answers


def test_list_valued_hobbies_show_up_looking_for_do_not_raise():
    prompt = _build_insights_prompt(_base_answers())
    assert "solving puzzles" in prompt
    assert "fermenting things" in prompt
    assert "i offer practical help" in prompt
    assert "emotionally available" in prompt


def test_string_valued_hobbies_show_up_looking_for_still_work():
    """Older submissions may still have plain strings here — must not regress."""
    prompt = _build_insights_prompt(_base_answers(
        hobbies="collecting vintage clocks",
        show_up="always shows up early",
        looking_for="curious people",
    ))
    assert "collecting vintage clocks" in prompt
    assert "always shows up early" in prompt
    assert "curious people" in prompt


def test_empty_hobbies_show_up_looking_for_fall_back_to_not_shared():
    prompt = _build_insights_prompt(_base_answers(hobbies=[], show_up="", looking_for=None))
    assert 'hobbies they\'re proud of: "not shared"' in prompt
    assert 'how they show up for people they care about: "not shared"' in prompt
    assert 'what kind of people they\'re actually looking for: "not shared"' in prompt


def test_custom_string_list_and_zero_values_reach_additional_context():
    prompt = _build_insights_prompt(_base_answers(
        custom_note="prefers quiet rooms",
        custom_tags=["night owl", "tea person"],
        custom_score=0,
    ))
    assert "custom_note: prefers quiet rooms" in prompt
    assert "custom_tags: night owl, tea person" in prompt
    assert "custom_score: 0" in prompt

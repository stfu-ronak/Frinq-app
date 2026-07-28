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
    # "(none)" filler — no known key ever leaks into it as an
    # "- key: value" bullet (the plain substring "city: mumbai" alone isn't
    # a safe check — the template's own named "CITY: {city}" line already
    # renders that text unconditionally, regardless of this feature).
    assert "- city: mumbai" not in prompt.lower()

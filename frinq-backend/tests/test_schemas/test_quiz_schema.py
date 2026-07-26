"""QuizSubmitRequest.answers must be bounded — it flows verbatim into the
paid AI prompts, so an unbounded payload is a per-token cost lever."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.quiz import QuizSubmitRequest


def test_normal_answers_ok():
    req = QuizSubmitRequest(answers={"name": "Asha", "hobbies": ["reading", "trekking"]})
    assert req.answers["name"] == "Asha"


def test_oversized_answers_rejected():
    with pytest.raises(ValidationError):
        QuizSubmitRequest(answers={"story": "a" * 60_000})


def test_too_many_answer_keys_rejected():
    with pytest.raises(ValidationError):
        QuizSubmitRequest(answers={str(i): "v" for i in range(101)})

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field, field_validator

# A real completed quiz serialises to a few KB. Cap well above that but far
# below the global 1MB body limit: `answers` is interpolated verbatim into the
# paid OpenAI/Claude prompts, so an unbounded payload is a direct per-token
# cost-inflation lever on an authenticated-but-repeatable path.
_MAX_ANSWERS_BYTES = 50_000
_MAX_ANSWER_KEYS = 100


class QuizSubmitRequest(BaseModel):
    phone: str | None = Field(default=None, description="Phone number (optional at this step)")
    answers: dict[str, Any] = Field(default_factory=dict)
    is_complete: bool = False
    last_page: str | None = Field(default=None)

    @field_validator("answers")
    @classmethod
    def _bound_answers(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(v) > _MAX_ANSWER_KEYS:
            raise ValueError("too many answer fields")
        if len(json.dumps(v, default=str)) > _MAX_ANSWERS_BYTES:
            raise ValueError("answers payload too large")
        return v


class QuizSubmitResponse(BaseModel):
    submission_id: str
    status: str
    job_id: str | None = None


class InsightItem(BaseModel):
    label: str
    text: str


class QuizSummaryResponse(BaseModel):
    submission_id: str
    status: str  # pending | processing | done | error
    # First name for the report tape ("an insight into <name>, by frinq").
    # Sourced from answers so previews of other users show the right name.
    name: str | None = None
    headline: str | None = None
    archetype: str | None = None
    archetype_desc: str | None = None
    share_quote: str | None = None
    # Legacy aliases for older frontend builds — keep until clients migrate.
    spirit_animal: str | None = None
    spirit_desc: str | None = None
    insights: list[InsightItem] = []
    tags: list[str] = []
    share_card: dict[str, Any] | None = None
    deep_summary: dict[str, Any] | None = None


class QuizStartRequest(BaseModel):
    phone: str | None = Field(default=None)

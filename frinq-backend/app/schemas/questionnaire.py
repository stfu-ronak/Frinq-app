from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ─── v2 enum-like literals (sourced from Frinq Design System dist/questions.jsx) ──

SocialType = Literal["introvert", "selective", "ambivert", "extrovert"]
SubstanceScene = Literal["sober", "social", "hard", "smoke", "za", "mix"]
SaturdayArchetype = Literal["dinner", "live", "workshop", "game"]
TripCancelled = Literal["upset", "annoyed", "relieved", "backup"]
ConnectionSignal = Literal["parallel", "counter", "disagree", "weird"]
RapidChoice = Literal["A", "B"]


class VoiceAnswer(BaseModel):
    """Q40 storytime — voice transcription result (frontend uploads audio,
    backend transcribes via Groq and stores the transcript in this shape).
    """

    transcript: str = Field(default="", max_length=5000)
    language: str | None = None
    duration_seconds: float | None = None


class QuestionnaireAnswers(BaseModel):
    """v2 questionnaire shape. Maps 1:1 onto question IDs in
    `Frinq Design System/dist/questions.jsx`. All fields are optional at the
    schema layer because the frontend may save partial drafts — the builder
    enforces what's structurally required.
    """

    model_config = ConfigDict(extra="allow")

    # ─── s0 · basic ──────────────────────────────────────────────
    Q01: str | None = Field(default=None, description="name")
    Q02: str | None = Field(default=None, description="city / ncr_zone slug")
    Q03: int | None = Field(default=None, ge=18, le=65, description="age")

    # ─── s1 · who you are ────────────────────────────────────────
    Q07: SocialType | None = None
    Q10: SubstanceScene | None = None
    Q08: SaturdayArchetype | None = None
    Q_HOBBIES: str | None = Field(default=None, max_length=2000)
    Q39: list[str] = Field(default_factory=list, description="three interests")

    # ─── s2 · what would you do ──────────────────────────────────
    Q22: TripCancelled | None = None
    Q40: VoiceAnswer | None = None
    Q_SIGNALS: list[ConnectionSignal] = Field(default_factory=list)
    Q_REDFLG: list[str] = Field(default_factory=list, description="three red flags")
    Q35_OPEN: str | None = Field(default=None, max_length=2000)

    # ─── s3 + s4 · rapid fire ────────────────────────────────────
    RAPID1: RapidChoice | None = None
    RAPID2: RapidChoice | None = None
    RAPID3: RapidChoice | None = None
    RAPID4: RapidChoice | None = None
    RAPID5: RapidChoice | None = None
    RAPID6: RapidChoice | None = None
    RAPID7: RapidChoice | None = None
    RAPID8: RapidChoice | None = None
    RAPID9: RapidChoice | None = None
    RAPID10: RapidChoice | None = None
    RAPID11: RapidChoice | None = None
    RAPID12: RapidChoice | None = None

    # ─── s5 · sliders (0–100) ────────────────────────────────────
    Q_SLIDER_1: int | None = Field(default=None, ge=0, le=100)
    Q_SLIDER_2: int | None = Field(default=None, ge=0, le=100)
    Q_SLIDER_3: int | None = Field(default=None, ge=0, le=100)

    # ─── s6 · open text ──────────────────────────────────────────
    Q06_OPEN: str | None = Field(default=None, max_length=2000)

    @field_validator("Q39", "Q_REDFLG")
    @classmethod
    def _strip_and_cap(cls, v: list[str]) -> list[str]:
        cleaned = [item.strip() for item in v if item and item.strip()]
        return cleaned[:3]


class QuestionnaireSubmitRequest(BaseModel):
    version: Literal["2.0"] = "2.0"
    answers: QuestionnaireAnswers


class QuestionnaireSubmitResponse(BaseModel):
    response_id: UUID
    submitted_at: datetime
    job_id: str | None = Field(
        default=None,
        description="ARQ job id for the queued build_profile task; null if the queue is unreachable",
    )


class QuestionnaireStatusResponse(BaseModel):
    has_submitted: bool
    submitted_at: datetime | None = None
    profile_ready: bool = False

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProfileMeResponse(BaseModel):
    """Full computed profile for the current user. Embedding vector is
    intentionally omitted — clients never need the raw 1024-dim array.
    """

    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: UUID
    user_id: UUID

    # Intent
    primary_goals: list[str] = Field(default_factory=list)
    secondary_goals: list[str] = Field(default_factory=list)

    # Big Five
    openness: float | None = None
    conscientiousness: float | None = None
    extraversion: float | None = None
    agreeableness: float | None = None
    neuroticism: float | None = None

    # HEXACO H-Factor
    honesty_humility: float | None = None

    # Social Bonding
    connection_anxiety: float | None = None
    connection_avoidance: float | None = None
    reliability: float | None = None
    bonding_style: str | None = None

    # Values (Schwartz)
    val_self_direction: float | None = None
    val_stimulation: float | None = None
    val_achievement: float | None = None
    val_security: float | None = None
    val_tradition: float | None = None
    val_universalism: float | None = None
    openness_to_change: float | None = None
    conservation: float | None = None

    # Activities
    loved_activities: list[dict[str, Any]] = Field(default_factory=list)
    open_to_try: list[str] = Field(default_factory=list)
    anti_preferences: list[str] = Field(default_factory=list)
    activity_archetype: str | None = None
    riasec_R: float | None = None
    riasec_I: float | None = None
    riasec_A: float | None = None
    riasec_S: float | None = None
    riasec_E: float | None = None
    riasec_C: float | None = None

    # Communication & Humor
    affiliative_humor: float | None = None
    self_enhancing_humor: float | None = None
    aggressive_humor: float | None = None
    directness: float | None = None
    depth_preference: float | None = None

    # Lifestyle
    chronotype: str | None = None
    group_pref: str | None = None
    drinks: str | None = None
    smokes: str | None = None
    drinks_tolerance: str | None = None
    smokes_tolerance: str | None = None
    diet: str | None = None
    languages: list[str] = Field(default_factory=list)

    # AI-generated
    ai_summary: str | None = None
    latent_tags: list[str] = Field(default_factory=list)
    vibe_check_raw: str | None = None

    # v2 additions
    social_type: str | None = None
    saturday_archetype: str | None = None
    substance_scene: str | None = None
    connection_signals: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    red_flag_normalised: list[str] = Field(default_factory=list)
    show_up_style: str | None = None
    looking_for_text: str | None = None
    hobbies_text: str | None = None
    storytime_transcript: str | None = None
    rapid_fire: dict[str, Any] = Field(default_factory=dict)
    slider_depth: float | None = None
    slider_fun_get: float | None = None
    slider_frequency: float | None = None
    extraction_confidence: dict[str, Any] = Field(default_factory=dict)

    # Behavioural
    meetups_attended: int = 0
    meetups_no_show: int = 0

    created_at: datetime
    updated_at: datetime


class ProfileSummaryResponse(BaseModel):
    user_id: UUID
    ai_summary: str | None = None
    latent_tags: list[str] = Field(default_factory=list)
    updated_at: datetime | None = None


class ProfileRebuildResponse(BaseModel):
    user_id: UUID
    job_id: str | None = None
    queued_at: datetime

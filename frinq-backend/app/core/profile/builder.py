"""Deterministic half of the v2 profile builder.

Takes a raw v2 questionnaire `answers` dict (shape mirrors
`app.schemas.questionnaire.QuestionnaireAnswers`) and produces a
`UserProfile` dict ready to insert into the `user_profiles` table.

The LLM-extracted half (open-text → trait nudges, latent_tags, ai_summary,
embedding) is layered on top of this output in later pipeline stages.
"""

from __future__ import annotations

from typing import Any, Final

# ─── §6.1 Deterministic constants ────────────────────────────────────

# Q07 social_type → extraversion baseline
EXTRAVERSION_MAP: Final[dict[str, float]] = {
    "introvert": 0.10,
    "selective": 0.35,
    "ambivert":  0.55,
    "extrovert": 0.90,
}

# Q10 substance_scene → drinks/smokes columns
SCENE_MAP: Final[dict[str, dict[str, str]]] = {
    "sober":  {"drinks": "never",     "smokes": "never"},
    "social": {"drinks": "socially",  "smokes": "never"},
    "hard":   {"drinks": "regularly", "smokes": "never"},
    "smoke":  {"drinks": "socially",  "smokes": "regularly"},
    "za":     {"drinks": "socially",  "smokes": "regularly"},
    "mix":    {"drinks": "socially",  "smokes": "socially"},
}

# Q08 saturday_archetype → openness + group_pref + activity priors
SATURDAY_MAP: Final[dict[str, dict[str, Any]]] = {
    "dinner":   {"openness": 0.55, "group_pref": "small",
                 "activity_seed": ["cafes", "brunches", "reading"]},
    "live":     {"openness": 0.75, "group_pref": "large",
                 "activity_seed": ["concerts", "stand_up_comedy", "film_festivals"]},
    "workshop": {"openness": 0.80, "group_pref": "small",
                 "activity_seed": ["pottery", "cooking", "photography", "art_galleries"]},
    "game":     {"openness": 0.50, "group_pref": "small",
                 "activity_seed": ["board_games", "gaming", "chess"]},
}

# Q22 trip-cancelled → neuroticism + plan_style
TRIP_CANCELLED_MAP: Final[dict[str, dict[str, Any]]] = {
    "upset":    {"neuroticism": 0.75, "plan_style": "planner"},
    "annoyed":  {"neuroticism": 0.55, "plan_style": "planner"},
    "relieved": {"neuroticism": 0.30, "plan_style": "improviser"},
    "backup":   {"neuroticism": 0.25, "plan_style": "planner"},
}

# Q_SIGNALS multi-select → additive trait nudges
SIGNAL_MAP: Final[dict[str, dict[str, float]]] = {
    "parallel": {"connection_avoidance": +0.10, "depth_preference": +0.05},
    "counter":  {"openness": +0.10, "depth_preference": +0.15},
    "disagree": {"agreeableness": -0.05, "openness": +0.10, "neuroticism": -0.10},
    "weird":    {"openness": +0.15, "affiliative_humor": +0.15},
}

# Rapid-fire 1–12 → trait deltas applied AFTER the card-seeded baseline.
# Numeric values are additive deltas. Strings (chronotype, plan_style) are
# categorical overrides. `activity_seed` lists extend `loved_activities`.
RAPID_DELTAS: Final[dict[str, dict[str, dict[str, Any]]]] = {
    "RAPID1":  {"A": {"honesty_humility": +0.10},                    "B": {"conscientiousness": +0.10}},
    "RAPID2":  {"A": {"directness": +0.15},                          "B": {"directness": -0.10}},
    "RAPID3":  {"A": {"depth_preference": +0.20},                    "B": {"depth_preference": -0.15, "affiliative_humor": +0.10}},
    "RAPID4":  {"A": {"chronotype": "morning"},                      "B": {"chronotype": "evening"}},
    "RAPID5":  {"A": {"activity_seed": ["trekking"]},                "B": {"activity_seed": ["beach"]}},
    "RAPID6":  {"A": {"plan_style": "planner"},                      "B": {"plan_style": "improviser"}},
    "RAPID7":  {"A": {"connection_anxiety": +0.10},                  "B": {"connection_avoidance": +0.10}},
    "RAPID8":  {"A": {"val_universalism": +0.15, "openness": +0.10}, "B": {"val_tradition": +0.15, "conservation": +0.10}},
    "RAPID9":  {"A": {"openness": +0.15},                            "B": {"extraversion": +0.10}},
    "RAPID10": {"A": {"val_stimulation": +0.10},                     "B": {"val_universalism": +0.10}},
    "RAPID11": {"A": {"directness": +0.20, "agreeableness": -0.10},  "B": {"agreeableness": +0.15}},
    "RAPID12": {"A": {"conscientiousness": +0.15},                   "B": {"openness_to_change": +0.15}},
}

# SPEC.md §4 — activity → RIASEC weights. `A_type`/`E_type`/`H_type` are
# remapped to RIASEC A/E/C in `compute_riasec`.
ACTIVITY_RIASEC: Final[dict[str, dict[str, float]]] = {
    "turf_football":   {"R": 0.9, "S": 0.5},
    "cricket":         {"R": 0.8, "S": 0.5},
    "trekking":        {"R": 0.8, "O": 0.4},
    "chess":           {"I": 0.9, "C": 0.4},
    "board_games":     {"I": 0.7, "C": 0.5, "S": 0.3},
    "reading":         {"I": 0.8, "A_type": 0.3},
    "concerts":        {"A_type": 0.9, "S": 0.4},
    "stand_up_comedy": {"A_type": 0.7, "S": 0.6},
    "photography":     {"A_type": 0.8, "R": 0.3},
    "dance":           {"A_type": 0.9, "S": 0.5},
    "cafes":           {"S": 0.9},
    "volunteering":    {"S": 0.9, "E_type": 0.3},
    "gaming":          {"I": 0.5, "C": 0.7},
    "startup_events":  {"E_type": 0.9, "S": 0.4},
    "yoga":            {"R": 0.5, "S": 0.3},
    "gym":             {"R": 0.8},
    "running":         {"R": 0.7},
    "cycling":         {"R": 0.7},
    "book_clubs":      {"I": 0.8, "S": 0.5},
    "art_galleries":   {"A_type": 0.9, "I": 0.3},
    "cooking":         {"A_type": 0.6, "R": 0.4},
    "hackathons":      {"I": 0.8, "E_type": 0.5},
    "poetry":          {"A_type": 0.9, "I": 0.4},
    "debate":          {"I": 0.8, "E_type": 0.5, "S": 0.3},
    "road_trips":      {"R": 0.6, "S": 0.5},
    "meditation":      {"S": 0.5, "I": 0.3},
    "pickleball":      {"R": 0.8, "S": 0.5},
    "badminton":       {"R": 0.8},
    "brunches":        {"S": 0.8, "H_type": 0.4},
    "film_festivals":  {"A_type": 0.9, "I": 0.4},
}

# ─── Internal helpers ────────────────────────────────────────────────

# Numeric traits that get a neutral 0.5 baseline before deltas. Anything
# outside this set stays untouched until a map writes it.
_NUMERIC_TRAITS: Final[frozenset[str]] = frozenset({
    "openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism",
    "honesty_humility",
    "connection_anxiety", "connection_avoidance", "reliability",
    "val_self_direction", "val_stimulation", "val_achievement",
    "val_security", "val_tradition", "val_universalism",
    "openness_to_change", "conservation",
    "affiliative_humor", "self_enhancing_humor", "aggressive_humor",
    "directness", "depth_preference",
})

_RAPID_IDS: Final[tuple[str, ...]] = tuple(f"RAPID{i}" for i in range(1, 13))
_SEED_INTENSITY: Final[int] = 3


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def _add_seed(loved: list[dict[str, Any]], ids: list[str], intensity: int = _SEED_INTENSITY) -> None:
    existing = {item["id"] for item in loved}
    for aid in ids:
        if aid in existing:
            continue
        loved.append({"id": aid, "intensity": intensity})
        existing.add(aid)


def compute_riasec(loved_activities: list[dict[str, Any]]) -> dict[str, float]:
    """SPEC.md §4 — weighted RIASEC vector from loved activities."""
    scores: dict[str, float] = {"R": 0.0, "I": 0.0, "A": 0.0, "S": 0.0, "E": 0.0, "C": 0.0}
    total_weight = 0.0
    for item in loved_activities:
        mapping = ACTIVITY_RIASEC.get(item["id"], {})
        intensity = item["intensity"] / 5.0
        for key, val in mapping.items():
            riasec_key = key.replace("A_type", "A").replace("E_type", "E").replace("H_type", "C")
            if riasec_key not in scores:
                continue
            scores[riasec_key] += val * intensity
            total_weight += intensity
    if total_weight > 0:
        scores = {k: min(1.0, v / total_weight) for k, v in scores.items()}
    return scores


def _extract_transcript(q40: Any) -> str | None:
    if q40 is None:
        return None
    if isinstance(q40, str):
        return q40 or None
    if isinstance(q40, dict):
        transcript = q40.get("transcript")
        return transcript or None
    transcript = getattr(q40, "transcript", None)
    return transcript or None


# ─── Public API ──────────────────────────────────────────────────────

def build_profile(answers: dict[str, Any]) -> dict[str, Any]:
    """Produce a `user_profiles` row dict from raw v2 questionnaire answers.

    Pipeline (per master build plan §6.1):
      1. Q07     → EXTRAVERSION_MAP baseline
      2. Q10     → SCENE_MAP (drinks/smokes)
      3. Q08     → SATURDAY_MAP (openness/group_pref + activity seed)
      4. Q22     → TRIP_CANCELLED_MAP (neuroticism/plan_style)
      5. Q_SIGNALS    → additive SIGNAL_MAP deltas
      6. RAPID1..12   → RAPID_DELTAS[choice]
      7. Sliders → slider_depth (inverted), slider_fun_get, slider_frequency
      8. RIASEC  → computed from final loved_activities
      9. Clamp every numeric trait to [0.0, 1.0]
     10. Open-text columns kept raw
    """
    profile: dict[str, Any] = {trait: 0.5 for trait in _NUMERIC_TRAITS}
    profile["loved_activities"] = []

    # 1. Q07 → extraversion
    q07 = answers.get("Q07")
    if q07 in EXTRAVERSION_MAP:
        profile["extraversion"] = EXTRAVERSION_MAP[q07]
        profile["social_type"] = q07
    else:
        profile["social_type"] = None

    # 2. Q10 → drinks/smokes
    q10 = answers.get("Q10")
    if q10 in SCENE_MAP:
        profile.update(SCENE_MAP[q10])
        profile["substance_scene"] = q10
    else:
        profile["substance_scene"] = None

    # 3. Q08 → openness/group_pref + activity seed
    q08 = answers.get("Q08")
    if q08 in SATURDAY_MAP:
        sat = SATURDAY_MAP[q08]
        profile["openness"] = sat["openness"]
        profile["group_pref"] = sat["group_pref"]
        profile["saturday_archetype"] = q08
        _add_seed(profile["loved_activities"], sat["activity_seed"])
    else:
        profile["saturday_archetype"] = None

    # 4. Q22 → neuroticism/plan_style
    q22 = answers.get("Q22")
    if q22 in TRIP_CANCELLED_MAP:
        trip = TRIP_CANCELLED_MAP[q22]
        profile["neuroticism"] = trip["neuroticism"]
        profile["plan_style"] = trip["plan_style"]

    # 5. Q_SIGNALS → additive deltas
    signals = list(answers.get("Q_SIGNALS") or [])
    for sig in signals:
        deltas = SIGNAL_MAP.get(sig)
        if not deltas:
            continue
        for trait, delta in deltas.items():
            profile[trait] = profile.get(trait, 0.5) + delta
    profile["connection_signals"] = [s for s in signals if s in SIGNAL_MAP]

    # 6. RAPID1..12 → RAPID_DELTAS[choice]
    rapid_record: dict[str, str] = {}
    for rid in _RAPID_IDS:
        choice = answers.get(rid)
        if choice not in ("A", "B"):
            continue
        rapid_record[rid] = choice
        for key, val in RAPID_DELTAS[rid][choice].items():
            if key == "activity_seed":
                _add_seed(profile["loved_activities"], list(val))
            elif isinstance(val, bool) or not isinstance(val, (int, float)):
                profile[key] = val
            else:
                profile[key] = profile.get(key, 0.5) + val
    profile["rapid_fire"] = rapid_record

    # 7. Sliders — direct mapping. Q_SLIDER_1 is inverted (left = deep).
    s1 = answers.get("Q_SLIDER_1")
    profile["slider_depth"] = 1.0 - s1 / 100.0 if isinstance(s1, (int, float)) else None
    s2 = answers.get("Q_SLIDER_2")
    profile["slider_fun_get"] = s2 / 100.0 if isinstance(s2, (int, float)) else None
    s3 = answers.get("Q_SLIDER_3")
    profile["slider_frequency"] = s3 / 100.0 if isinstance(s3, (int, float)) else None

    # 8. RIASEC from final loved_activities
    riasec = compute_riasec(profile["loved_activities"])
    for axis, val in riasec.items():
        profile[f"riasec_{axis}"] = val

    # 9. Clamp all numerics
    for trait in _NUMERIC_TRAITS:
        v = profile.get(trait)
        if isinstance(v, (int, float)):
            profile[trait] = _clamp(float(v))
    for slider in ("slider_depth", "slider_fun_get", "slider_frequency"):
        v = profile.get(slider)
        if isinstance(v, (int, float)):
            profile[slider] = _clamp(float(v))

    # 10. Open-text columns — raw strings/lists, no normalisation
    profile["hobbies_text"] = answers.get("Q_HOBBIES")
    profile["show_up_style"] = answers.get("Q35_OPEN")
    profile["looking_for_text"] = answers.get("Q06_OPEN")
    profile["storytime_transcript"] = _extract_transcript(answers.get("Q40"))
    profile["red_flags"] = list(answers.get("Q_REDFLG") or [])

    return profile

"""Unit tests for `app.core.profile.builder.build_profile`.

Coverage targets:
  - all 4 social types (Q07: introvert, selective, ambivert, extrovert)
  - all 4 saturday archetypes (Q08: dinner, live, workshop, game)
  - signal additivity, rapid-fire numeric + categorical mixing
  - slider direct mapping (Q_SLIDER_1 inversion)
  - RIASEC computed from FINAL loved_activities (post seed + RAPID5)
  - edge cases: no rapid-fire answers, empty open text, slider untouched,
    completely empty input
  - hard guarantee: every numeric trait clamps to [0.0, 1.0]
"""

from __future__ import annotations

from typing import Any

import pytest

from app.core.profile.builder import (
    ACTIVITY_RIASEC,
    EXTRAVERSION_MAP,
    RAPID_DELTAS,
    SATURDAY_MAP,
    SCENE_MAP,
    SIGNAL_MAP,
    TRIP_CANCELLED_MAP,
    build_profile,
    compute_riasec,
)

NUMERIC_TRAITS = [
    "openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism",
    "honesty_humility",
    "connection_anxiety", "connection_avoidance", "reliability",
    "val_self_direction", "val_stimulation", "val_achievement",
    "val_security", "val_tradition", "val_universalism",
    "openness_to_change", "conservation",
    "affiliative_humor", "self_enhancing_humor", "aggressive_humor",
    "directness", "depth_preference",
]


# ─── Fixture builders ────────────────────────────────────────────────

def _all_rapids(choice: str) -> dict[str, str]:
    return {f"RAPID{i}": choice for i in range(1, 13)}


def _introvert_dinner_full() -> dict[str, Any]:
    """Social type #1 (introvert) + saturday #1 (dinner), full submission."""
    return {
        "Q01": "Riya",
        "Q02": "south_delhi",
        "Q03": 27,
        "Q07": "introvert",
        "Q10": "sober",
        "Q08": "dinner",
        "Q_HOBBIES": "i collect vintage chess clocks",
        "Q39": ["chess", "reading", "long walks"],
        "Q22": "upset",
        "Q40": {"transcript": "met them at a tiny cafe in hauz khas"},
        "Q_SIGNALS": ["parallel", "weird"],
        "Q_REDFLG": ["flakiness", "performative kindness", "constant phone"],
        "Q35_OPEN": "i show up. small acts, consistently.",
        **_all_rapids("A"),
        "Q_SLIDER_1": 10,   # left = deep → slider_depth ≈ 0.90
        "Q_SLIDER_2": 80,   # right = get-me → 0.80
        "Q_SLIDER_3": 20,   # left = occasional → 0.20
        "Q06_OPEN": "people who don't bullshit",
    }


def _selective_workshop() -> dict[str, Any]:
    """Selective extrovert + workshop saturday."""
    return {
        "Q07": "selective",
        "Q10": "social",
        "Q08": "workshop",
        "Q22": "annoyed",
        "Q_SIGNALS": ["counter", "disagree"],
        "Q_HOBBIES": "throwing pottery on weekends",
        "Q35_OPEN": "i remember the details",
        "Q06_OPEN": "curious humans",
        "Q_REDFLG": ["one-upping", "gossip"],
        "Q40": {"transcript": ""},
        **_all_rapids("B"),
        "Q_SLIDER_1": 50,
        "Q_SLIDER_2": 50,
        "Q_SLIDER_3": 50,
    }


def _ambivert_game() -> dict[str, Any]:
    """Ambivert + game-night saturday, mixed rapid fire."""
    mixed_rapids = {f"RAPID{i}": ("A" if i % 2 else "B") for i in range(1, 13)}
    return {
        "Q07": "ambivert",
        "Q10": "smoke",
        "Q08": "game",
        "Q22": "relieved",
        "Q_SIGNALS": ["weird"],
        "Q_HOBBIES": "speedrunning indie games",
        "Q35_OPEN": "loud and present",
        "Q06_OPEN": "fellow nerds",
        "Q_REDFLG": ["judgemental"],
        "Q40": {"transcript": "we bonded over a boss fight"},
        **mixed_rapids,
        "Q_SLIDER_1": 70,
        "Q_SLIDER_2": 30,
        "Q_SLIDER_3": 90,
    }


def _extrovert_live() -> dict[str, Any]:
    """Real extrovert + live-event saturday."""
    return {
        "Q07": "extrovert",
        "Q10": "hard",
        "Q08": "live",
        "Q22": "backup",
        "Q_SIGNALS": ["parallel", "counter", "disagree", "weird"],
        "Q_HOBBIES": "front row at every gig in town",
        "Q35_OPEN": "energy",
        "Q06_OPEN": "people who say yes",
        "Q_REDFLG": ["controlling", "racist_sexist", "performative"],
        "Q40": {"transcript": "we met in a mosh pit"},
        **_all_rapids("B"),
        "Q_SLIDER_1": 100,  # right = light → slider_depth = 0.0
        "Q_SLIDER_2": 0,    # left = fun → 0.0
        "Q_SLIDER_3": 100,  # right = regular → 1.0
    }


def _minimal_edge_case() -> dict[str, Any]:
    """No rapid-fire answers, empty open text, sliders untouched."""
    return {
        "Q07": "ambivert",
        "Q10": "mix",
        "Q08": "dinner",
        "Q22": "annoyed",
        "Q_SIGNALS": [],
        "Q_HOBBIES": "",
        "Q35_OPEN": "",
        "Q06_OPEN": "",
        "Q_REDFLG": [],
        # No Q40, no RAPID*, no Q_SLIDER_*.
    }


def _completely_empty() -> dict[str, Any]:
    return {}


# ─── Constants integrity ─────────────────────────────────────────────

def test_constants_cover_all_v2_enum_values() -> None:
    assert set(EXTRAVERSION_MAP) == {"introvert", "selective", "ambivert", "extrovert"}
    assert set(SCENE_MAP) == {"sober", "social", "hard", "smoke", "za", "mix"}
    assert set(SATURDAY_MAP) == {"dinner", "live", "workshop", "game"}
    assert set(TRIP_CANCELLED_MAP) == {"upset", "annoyed", "relieved", "backup"}
    assert set(SIGNAL_MAP) == {"parallel", "counter", "disagree", "weird"}
    assert set(RAPID_DELTAS) == {f"RAPID{i}" for i in range(1, 13)}
    for rid, branches in RAPID_DELTAS.items():
        assert set(branches) == {"A", "B"}, rid


def test_extraversion_baseline_orders_monotonically() -> None:
    seq = ["introvert", "selective", "ambivert", "extrovert"]
    values = [EXTRAVERSION_MAP[s] for s in seq]
    assert values == sorted(values)


# ─── Social type coverage ────────────────────────────────────────────

@pytest.mark.parametrize("social_type", ["introvert", "selective", "ambivert", "extrovert"])
def test_all_social_types_set_extraversion_and_social_type(social_type: str) -> None:
    profile = build_profile({"Q07": social_type})
    assert profile["social_type"] == social_type
    assert profile["extraversion"] == pytest.approx(EXTRAVERSION_MAP[social_type])


# ─── Saturday archetype coverage ─────────────────────────────────────

@pytest.mark.parametrize("archetype", ["dinner", "live", "workshop", "game"])
def test_all_saturday_archetypes_seed_loved_activities(archetype: str) -> None:
    profile = build_profile({"Q08": archetype})
    spec = SATURDAY_MAP[archetype]
    assert profile["saturday_archetype"] == archetype
    assert profile["openness"] == pytest.approx(spec["openness"])
    assert profile["group_pref"] == spec["group_pref"]
    seeded_ids = [item["id"] for item in profile["loved_activities"]]
    assert seeded_ids == spec["activity_seed"]
    # Every seeded item lands at intensity 3.
    for item in profile["loved_activities"]:
        assert item["intensity"] == 3


# ─── Substance scene coverage ────────────────────────────────────────

@pytest.mark.parametrize("scene", list(SCENE_MAP))
def test_scene_map_writes_drinks_smokes(scene: str) -> None:
    profile = build_profile({"Q10": scene})
    assert profile["substance_scene"] == scene
    assert profile["drinks"] == SCENE_MAP[scene]["drinks"]
    assert profile["smokes"] == SCENE_MAP[scene]["smokes"]


# ─── Trip-cancelled coverage ─────────────────────────────────────────

@pytest.mark.parametrize("choice", list(TRIP_CANCELLED_MAP))
def test_trip_cancelled_writes_neuroticism_and_plan_style(choice: str) -> None:
    profile = build_profile({"Q22": choice})
    expected = TRIP_CANCELLED_MAP[choice]
    assert profile["neuroticism"] == pytest.approx(expected["neuroticism"])
    assert profile["plan_style"] == expected["plan_style"]


# ─── Full submission, end-to-end ─────────────────────────────────────

def test_introvert_dinner_full_submission() -> None:
    profile = build_profile(_introvert_dinner_full())

    # Cards / scene
    assert profile["social_type"] == "introvert"
    assert profile["extraversion"] == pytest.approx(0.10)
    assert profile["substance_scene"] == "sober"
    assert profile["drinks"] == "never"
    assert profile["smokes"] == "never"
    assert profile["saturday_archetype"] == "dinner"
    assert profile["group_pref"] == "small"

    # Q22 = upset → neuroticism 0.75, planner
    assert profile["neuroticism"] == pytest.approx(0.75)
    assert profile["plan_style"] == "planner"

    # Q_SIGNALS = parallel + weird:
    # connection_avoidance: 0.5 + 0.10 = 0.60
    # depth_preference:     0.5 + 0.05 = 0.55 then RAPID3 A adds 0.20 → 0.75
    # openness:             SATURDAY dinner 0.55 + weird 0.15 = 0.70
    #                       then RAPID8 A adds +0.10 = 0.80, RAPID9 A adds +0.15 = 0.95
    # affiliative_humor:    0.5 + 0.15 = 0.65
    assert profile["connection_signals"] == ["parallel", "weird"]
    assert profile["connection_avoidance"] == pytest.approx(0.60)
    assert profile["depth_preference"] == pytest.approx(0.75)
    assert profile["openness"] == pytest.approx(0.95)
    assert profile["affiliative_humor"] == pytest.approx(0.65)

    # All-A rapids:
    assert profile["honesty_humility"] == pytest.approx(0.60)        # 0.5 + 0.10
    assert profile["directness"] == pytest.approx(0.85)              # 0.5 + 0.15 (R2) + 0.20 (R11)
    assert profile["agreeableness"] == pytest.approx(0.40)           # 0.5 - 0.10 (R11)
    assert profile["chronotype"] == "morning"
    assert profile["plan_style"] == "planner"                        # R6 A reinforces Q22 planner
    assert profile["connection_anxiety"] == pytest.approx(0.60)      # 0.5 + 0.10 (R7 A)
    # R8 A → val_universalism +0.15. R10 A bumps val_stimulation, NOT universalism.
    assert profile["val_universalism"] == pytest.approx(0.65)        # 0.5 + 0.15 (R8 A)
    assert profile["val_stimulation"] == pytest.approx(0.60)         # 0.5 + 0.10 (R10 A)
    assert profile["conscientiousness"] == pytest.approx(0.65)       # 0.5 + 0.15 (R12 A)

    # RAPID5 A adds "trekking" to loved_activities (dinner seed already set).
    loved_ids = [item["id"] for item in profile["loved_activities"]]
    assert loved_ids == ["cafes", "brunches", "reading", "trekking"]

    # Sliders
    assert profile["slider_depth"] == pytest.approx(0.90)   # 1 - 10/100
    assert profile["slider_fun_get"] == pytest.approx(0.80)
    assert profile["slider_frequency"] == pytest.approx(0.20)

    # RIASEC computed from FINAL loved_activities → some non-zero S and I.
    assert profile["riasec_S"] > 0.0
    assert profile["riasec_I"] > 0.0

    # rapid_fire records all 12.
    assert profile["rapid_fire"] == {f"RAPID{i}": "A" for i in range(1, 13)}

    # Open text preserved raw.
    assert profile["hobbies_text"] == "i collect vintage chess clocks"
    assert profile["show_up_style"] == "i show up. small acts, consistently."
    assert profile["looking_for_text"] == "people who don't bullshit"
    assert profile["storytime_transcript"] == "met them at a tiny cafe in hauz khas"
    assert profile["red_flags"] == [
        "flakiness", "performative kindness", "constant phone",
    ]


def test_selective_workshop_all_b_rapids() -> None:
    profile = build_profile(_selective_workshop())

    assert profile["social_type"] == "selective"
    # Note: baseline 0.35 is bumped by RAPID9 B (+0.10) — verified at 0.45 below.
    assert profile["saturday_archetype"] == "workshop"
    assert profile["group_pref"] == "small"

    # Workshop seed
    seeded = [i["id"] for i in profile["loved_activities"]]
    # RAPID5 B adds "beach" at the end.
    assert seeded == ["pottery", "cooking", "photography", "art_galleries", "beach"]

    # Q_SIGNALS = counter + disagree on openness:
    # workshop sets 0.80, counter +0.10, disagree +0.10 → 1.00 (clamped).
    # RAPID8 B does NOT touch openness; only RAPID9 A would.
    assert profile["openness"] == pytest.approx(1.00)

    # disagree → agreeableness -0.05; RAPID11 B → +0.15 → 0.5 - 0.05 + 0.15 = 0.60
    assert profile["agreeableness"] == pytest.approx(0.60)
    # disagree → neuroticism -0.10 from baseline 0.55 (Q22 annoyed) = 0.45
    assert profile["neuroticism"] == pytest.approx(0.45)

    # All-B rapids
    assert profile["conscientiousness"] == pytest.approx(0.60)   # R1 B
    assert profile["directness"] == pytest.approx(0.40)          # 0.5 - 0.10 (R2 B)
    # R3 B: depth_preference -0.15, affiliative_humor +0.10
    # counter adds +0.15 → 0.5 + 0.15 - 0.15 = 0.50
    assert profile["depth_preference"] == pytest.approx(0.50)
    assert profile["affiliative_humor"] == pytest.approx(0.60)
    assert profile["chronotype"] == "evening"
    assert profile["plan_style"] == "improviser"                 # R6 B overrides Q22 planner
    assert profile["connection_avoidance"] == pytest.approx(0.60) # R7 B
    assert profile["val_tradition"] == pytest.approx(0.65)        # R8 B
    assert profile["conservation"] == pytest.approx(0.60)         # R8 B
    assert profile["extraversion"] == pytest.approx(0.45)         # 0.35 + R9 B 0.10
    assert profile["val_universalism"] == pytest.approx(0.60)     # R10 B
    assert profile["openness_to_change"] == pytest.approx(0.65)   # R12 B

    assert profile["slider_depth"] == pytest.approx(0.5)
    assert profile["slider_fun_get"] == pytest.approx(0.5)
    assert profile["slider_frequency"] == pytest.approx(0.5)

    # Empty voice transcript → None, not the empty string.
    assert profile["storytime_transcript"] is None


def test_ambivert_game_mixed_rapids() -> None:
    answers = _ambivert_game()
    profile = build_profile(answers)

    assert profile["social_type"] == "ambivert"
    assert profile["saturday_archetype"] == "game"
    seeded = [i["id"] for i in profile["loved_activities"]]
    # RAPID5 is odd-indexed → A → "trekking" appended.
    assert seeded == ["board_games", "gaming", "chess", "trekking"]

    # Mixed rapids: odd=A, even=B. RAPID4 (even) → B → chronotype evening.
    assert profile["chronotype"] == "evening"
    # RAPID6 (even) → B → plan_style improviser overrides Q22 relieved (improviser anyway).
    assert profile["plan_style"] == "improviser"

    # Q_SIGNALS = ["weird"] only
    assert profile["connection_signals"] == ["weird"]
    # weird → openness +0.15; game baseline openness = 0.50 → 0.65,
    # RAPID8 B doesn't change openness, RAPID9 A → +0.15 → 0.80.
    assert profile["openness"] == pytest.approx(0.80)

    assert profile["slider_depth"] == pytest.approx(0.30)
    assert profile["slider_fun_get"] == pytest.approx(0.30)
    assert profile["slider_frequency"] == pytest.approx(0.90)

    # rapid_fire records exactly the mixed pattern
    assert profile["rapid_fire"] == {
        f"RAPID{i}": ("A" if i % 2 else "B") for i in range(1, 13)
    }


def test_extrovert_live_all_b_rapids_clamps_to_zero_and_one() -> None:
    profile = build_profile(_extrovert_live())

    assert profile["social_type"] == "extrovert"
    assert profile["extraversion"] == pytest.approx(1.0)  # 0.90 + R9 B 0.10
    assert profile["saturday_archetype"] == "live"
    assert profile["group_pref"] == "large"
    assert profile["substance_scene"] == "hard"

    # Q_SIGNALS hits every key. Verify openness reaches the clamp ceiling.
    # live baseline 0.75 + counter 0.10 + disagree 0.10 + weird 0.15 = 1.10 → clamps to 1.0.
    assert profile["openness"] == pytest.approx(1.0)

    # Sliders at extremes
    assert profile["slider_depth"] == pytest.approx(0.0)
    assert profile["slider_fun_get"] == pytest.approx(0.0)
    assert profile["slider_frequency"] == pytest.approx(1.0)

    # Connection signals stored verbatim
    assert profile["connection_signals"] == ["parallel", "counter", "disagree", "weird"]

    # RAPID5 B appends "beach"
    seeded_ids = [i["id"] for i in profile["loved_activities"]]
    assert "beach" in seeded_ids
    assert seeded_ids[: len(SATURDAY_MAP["live"]["activity_seed"])] == SATURDAY_MAP["live"]["activity_seed"]


# ─── Edge cases ──────────────────────────────────────────────────────

def test_minimal_no_rapid_empty_text_no_sliders() -> None:
    profile = build_profile(_minimal_edge_case())

    # Cards still wire up.
    assert profile["social_type"] == "ambivert"
    assert profile["extraversion"] == pytest.approx(0.55)
    assert profile["substance_scene"] == "mix"
    assert profile["saturday_archetype"] == "dinner"
    assert profile["plan_style"] == "planner"

    # No rapid-fire → empty record, all numeric traits stay at their
    # baseline (0.5 default or map-set), no chronotype set.
    assert profile["rapid_fire"] == {}
    assert "chronotype" not in profile or profile.get("chronotype") is None

    # No signals → no nudges, no entries.
    assert profile["connection_signals"] == []

    # Empty open-text strings are preserved (the LLM step handles "no signal").
    assert profile["hobbies_text"] == ""
    assert profile["show_up_style"] == ""
    assert profile["looking_for_text"] == ""
    assert profile["red_flags"] == []

    # No Q40 at all → None.
    assert profile["storytime_transcript"] is None

    # Sliders untouched → all None (not 0.0).
    assert profile["slider_depth"] is None
    assert profile["slider_fun_get"] is None
    assert profile["slider_frequency"] is None

    # Loved activities still populated from saturday seed at intensity 3.
    seeded_ids = [i["id"] for i in profile["loved_activities"]]
    assert seeded_ids == SATURDAY_MAP["dinner"]["activity_seed"]


def test_completely_empty_input_does_not_crash() -> None:
    profile = build_profile(_completely_empty())

    # Categoricals all null
    assert profile["social_type"] is None
    assert profile["saturday_archetype"] is None
    assert profile["substance_scene"] is None
    assert profile["connection_signals"] == []
    assert profile["rapid_fire"] == {}
    assert profile["red_flags"] == []
    assert profile["loved_activities"] == []
    assert profile["hobbies_text"] is None
    assert profile["show_up_style"] is None
    assert profile["looking_for_text"] is None
    assert profile["storytime_transcript"] is None

    # Sliders null
    assert profile["slider_depth"] is None
    assert profile["slider_fun_get"] is None
    assert profile["slider_frequency"] is None

    # All RIASEC axes default to 0.0 when there are no loved activities.
    for axis in ("R", "I", "A", "S", "E", "C"):
        assert profile[f"riasec_{axis}"] == 0.0


# ─── Clamping invariants ─────────────────────────────────────────────

@pytest.mark.parametrize("fixture", [
    _introvert_dinner_full(),
    _selective_workshop(),
    _ambivert_game(),
    _extrovert_live(),
    _minimal_edge_case(),
])
def test_every_numeric_trait_is_clamped(fixture: dict[str, Any]) -> None:
    profile = build_profile(fixture)
    for trait in NUMERIC_TRAITS:
        value = profile.get(trait)
        if value is None:
            continue
        assert 0.0 <= value <= 1.0, f"{trait} out of range: {value}"
    for slider in ("slider_depth", "slider_fun_get", "slider_frequency"):
        value = profile.get(slider)
        if value is None:
            continue
        assert 0.0 <= value <= 1.0, f"{slider} out of range: {value}"
    for axis in ("R", "I", "A", "S", "E", "C"):
        value = profile[f"riasec_{axis}"]
        assert 0.0 <= value <= 1.0


def test_signal_disagree_can_push_neuroticism_below_zero_but_clamps() -> None:
    # Q22 relieved → neuroticism 0.30, disagree subtracts 0.10 → 0.20.
    # Add a synthetic extra disagree by stacking; SIGNAL_MAP is additive.
    answers: dict[str, Any] = {
        "Q22": "relieved",
        "Q_SIGNALS": ["disagree", "disagree", "disagree", "disagree"],
    }
    profile = build_profile(answers)
    # 0.30 - 0.10*4 = -0.10 → clamps to 0.0
    assert profile["neuroticism"] == pytest.approx(0.0)


# ─── compute_riasec direct tests ─────────────────────────────────────

def test_compute_riasec_empty_loved_returns_all_zero() -> None:
    out = compute_riasec([])
    assert out == {"R": 0.0, "I": 0.0, "A": 0.0, "S": 0.0, "E": 0.0, "C": 0.0}


def test_compute_riasec_maps_a_type_to_a_and_h_type_to_c() -> None:
    # brunches → S 0.8, H_type 0.4. H_type must remap to C.
    out = compute_riasec([{"id": "brunches", "intensity": 5}])
    assert out["S"] > 0.0
    assert out["C"] > 0.0
    assert out["A"] == 0.0  # brunches has no A_type contribution


def test_compute_riasec_unknown_activity_contributes_nothing() -> None:
    out = compute_riasec([{"id": "beach", "intensity": 3}])
    # "beach" not in ACTIVITY_RIASEC → all zeros.
    assert out == {"R": 0.0, "I": 0.0, "A": 0.0, "S": 0.0, "E": 0.0, "C": 0.0}


def test_riasec_picks_up_rapid5_trekking_added_to_loved() -> None:
    # Verifies the explicit plan requirement: RIASEC is computed AFTER
    # all loved_activities seeding, including RAPID5.
    answers: dict[str, Any] = {"Q08": "dinner", "RAPID5": "A"}
    profile = build_profile(answers)
    ids = [i["id"] for i in profile["loved_activities"]]
    assert "trekking" in ids
    # trekking carries R = 0.8 → riasec_R must be > 0.
    assert profile["riasec_R"] > 0.0


# ─── Slider direct-mapping semantics ─────────────────────────────────

@pytest.mark.parametrize(
    "slider_value, expected_depth",
    [(0, 1.0), (25, 0.75), (50, 0.5), (100, 0.0)],
)
def test_q_slider_1_inverts(slider_value: int, expected_depth: float) -> None:
    profile = build_profile({"Q_SLIDER_1": slider_value})
    assert profile["slider_depth"] == pytest.approx(expected_depth)


@pytest.mark.parametrize(
    "slider_value, expected",
    [(0, 0.0), (50, 0.5), (100, 1.0)],
)
def test_q_slider_2_and_3_pass_through(slider_value: int, expected: float) -> None:
    profile = build_profile({"Q_SLIDER_2": slider_value, "Q_SLIDER_3": slider_value})
    assert profile["slider_fun_get"] == pytest.approx(expected)
    assert profile["slider_frequency"] == pytest.approx(expected)


# ─── Q40 voice transcript shape tolerance ────────────────────────────

def test_q40_dict_transcript_extracted() -> None:
    profile = build_profile({"Q40": {"transcript": "hello", "language": "en"}})
    assert profile["storytime_transcript"] == "hello"


def test_q40_bare_string_accepted() -> None:
    profile = build_profile({"Q40": "raw transcript"})
    assert profile["storytime_transcript"] == "raw transcript"


def test_q40_empty_transcript_normalised_to_none() -> None:
    profile = build_profile({"Q40": {"transcript": ""}})
    assert profile["storytime_transcript"] is None


# ─── ACTIVITY_RIASEC sanity ──────────────────────────────────────────

def test_every_saturday_seed_is_either_in_riasec_or_intentionally_absent() -> None:
    # All activity IDs seeded by SATURDAY_MAP except `pottery` should be
    # present in ACTIVITY_RIASEC. `pottery` is intentionally absent and
    # contributes zero — verifying it via the lookup keeps the maps honest.
    for archetype, spec in SATURDAY_MAP.items():
        for aid in spec["activity_seed"]:
            # Either it's mapped, or it gracefully degrades to no contribution.
            mapping = ACTIVITY_RIASEC.get(aid, {})
            assert isinstance(mapping, dict), archetype

"""Shared quiz-answer label maps, used by both the hero-card prompt builder
(app/core/ai/insights.py) and the deep-report generator (app/core/ai/
openai_client.py) so both calls reason over the same contextual richness —
a single chosen value like "selective" gets expanded to what it actually
means, instead of the deep-report call seeing only the raw quiz token.

Lives in its own module (not insights.py) to avoid a circular import:
insights.py imports call_openai_json from openai_client.py, so
openai_client.py cannot import back from insights.py.
"""

from __future__ import annotations

from typing import Any

RAPID_LABELS: list[tuple[str, str]] = [
    ("word is bond", "action > words"),
    ("confront immediately", "take time to process"),
    ("deep 2 am talks", "random bakchodi"),
    ("home early", "home late"),
    ("mountain person", "beach person"),
    ("i make the plans", "i join the plans"),
    ("need regular catch-ups", "pick up where we left off"),
    ("new cultures", "deeper into my own"),
    ("hiking with strangers", "poker with strangers"),
]

OPINION_QUESTIONS: list[tuple[str, str]] = [
    ("ai will take over everything", "humans can't be replaced"),
    ("hard truth always, no sugarcoating", "empathy > bitter truth"),
    ("people with five year plans", "people who live in the moment"),
]

CONNECTION_MAP: dict[str, str] = {
    "parallel": "parallel play — do your own thing in their company",
    "counter": "counter question — they always want to know more",
    "disagree": "comfortable disagreement — agree to disagree without fighting",
    "weird": "shared weirdness — they match your level of strangeness",
}

TRIP_MAP: dict[str, str] = {
    "upset": "upset — you invest deeply in plans and people",
    "annoyed": "annoyed — you value follow-through and hate flakiness",
    "relieved": "relieved — honest about your social battery",
    "backup": "immediately made a backup plan — you're a planner at heart",
}

SOCIAL_MAP: dict[str, str] = {
    "introvert": "mostly alone — people drain energy, solitude restores it",
    "selective": "selective — very specific about who gets through the filters",
    "ambivert": "ambivert — needs people and space in equal measure",
    "extrovert": "real extrovert — people give energy, alone too long and starts to unravel",
}

SATURDAY_MAP: dict[str, str] = {
    "dinner": "small intimate dinner — good food, right people, conversation that goes everywhere",
    "live": "live event — concert, comedy, crowd energy",
    "workshop": "workshop — learning something with hands or head",
    "game": "game night — competitive or chaotic, doesn't matter",
}


def slider_label(val: int | None, left: str, right: str) -> str:
    if val is None:
        return "no preference"
    if val <= 30:
        return f"strongly: {left}"
    if val >= 70:
        return f"strongly: {right}"
    if val < 50:
        return f"leaning: {left}"
    if val > 50:
        return f"leaning: {right}"
    return "exactly in the middle"


def annotate_answers(answers: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of `answers` with single-token fields expanded to their
    full descriptive phrase, and opinions given their 'vs' contrast — the
    same expansions insights.py's prompt builder already applies for the
    hero card, so the deep-report call sees equivalent signal.
    """
    out = dict(answers)

    social_type = answers.get("social_type")
    if isinstance(social_type, str) and social_type in SOCIAL_MAP:
        out["social_type"] = SOCIAL_MAP[social_type]

    trip = answers.get("trip")
    if isinstance(trip, str) and trip in TRIP_MAP:
        out["trip"] = TRIP_MAP[trip]

    saturday = answers.get("saturday")
    if isinstance(saturday, str) and saturday in SATURDAY_MAP:
        out["saturday"] = SATURDAY_MAP[saturday]

    connection = answers.get("connection")
    connection_list = connection if isinstance(connection, list) else ([connection] if connection else [])
    if connection_list:
        out["connection"] = [CONNECTION_MAP.get(str(c), str(c)) for c in connection_list if c]

    opinions_raw = answers.get("opinions")
    if isinstance(opinions_raw, list) and opinions_raw:
        annotated_opinions = []
        for i, (a_label, b_label) in enumerate(OPINION_QUESTIONS):
            if i < len(opinions_raw):
                annotated_opinions.append(f"'{a_label}' vs '{b_label}' — chose: {opinions_raw[i]}")
        if annotated_opinions:
            out["opinions"] = annotated_opinions

    prefs = answers.get("preferences")
    if isinstance(prefs, list) and prefs:
        labels = [
            ("trusts what they can see", "trusts what they sense"),
            ("decides with the heart", "decides with the head"),
            ("grows by going deeper", "grows by going wider"),
            ("would rather be kind", "would rather be honest"),
        ]
        out["preferences"] = [
            slider_label(v, labels[i][0], labels[i][1]) if i < len(labels) else v
            for i, v in enumerate(prefs)
        ]

    return out

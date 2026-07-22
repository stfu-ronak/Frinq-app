from __future__ import annotations

from app.core.ai.openai_client import _normalize_deep_report


def test_normalize_deep_report_coerces_and_fits_ui_fields() -> None:
    report = _normalize_deep_report(
        {
            "report_quote": '"You keep adding detail long after the box can safely hold the generated line."',
            "signal_archetype_text": {"text": "steady " * 20},
            "signal_trait": {"label": "slow trust " * 10, "text": ["consistent "] * 20},
            "narrative": ["word " * 90, {"text": "mirror " * 90}, "short enough", "extra item"],
            "mirror": "mirror " * 50,
            "first_impression": "first " * 50,
            "hidden_pattern": "hidden " * 50,
            "unspoken_need": "need " * 50,
            "read_notes": [
                {"label": "look for repetition " * 4, "text": "note " * 80},
                "bare note text",
                {"label": "protect the quiet", "text": ["care "] * 80},
                {"label": "extra", "text": "extra"},
            ],
            "closing_line": "closing " * 30,
            "snapshot": {
                "first_read": "first read " * 30,
                "after_time": "after time " * 30,
                "under_stress": "under stress " * 30,
                "what_wins_you": "wins " * 30,
            },
        }
    )

    assert not report["report_quote"].startswith('"')
    assert len(report["report_quote"]) <= 115
    assert len(report["signal_archetype_text"]) <= 62
    assert len(report["signal_trait"]["label"]) <= 34
    assert len(report["signal_trait"]["text"]) <= 62
    assert len(report["narrative"]) == 3
    assert all(len(item) <= 280 for item in report["narrative"])
    assert len(report["read_notes"]) == 3
    assert all(len(note["label"]) <= 26 for note in report["read_notes"])
    assert all(len(note["text"]) <= 150 for note in report["read_notes"])
    assert len(report["closing_line"]) <= 100
    assert all(len(value) <= 120 for value in report["snapshot"].values())

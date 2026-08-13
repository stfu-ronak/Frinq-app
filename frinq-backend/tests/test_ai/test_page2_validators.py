from __future__ import annotations

from app.core.ai.page2_prompts import FRIEND_ROLE_NAMES, FRIEND_ROLE_SLUGS
from app.core.ai.page2_summary import validate_public_report, validate_stage1, validate_stage2

QUESTIONNAIRE = {"questionnaire": [{"source_field": "story", "source_modality": "text", "value": "x"}]}


def _evidence(n: int = 8) -> list[dict]:
    return [
        {
            "id": f"e{i + 1}", "source_field": "story", "source_kind": "self_authored",
            "source_modality": "text", "excerpt": "x", "interpretation": "y", "strength": "medium",
        }
        for i in range(n)
    ]


def test_validate_stage1_rejects_too_few_evidence_items():
    data = {"evidence": _evidence(3), "patterns": [], "tensions": [], "first_impression_candidates": [], "social_move_candidates": [], "do_not_claim": []}
    errors = validate_stage1(data, QUESTIONNAIRE)
    assert any("8-10" in e for e in errors)


def test_validate_stage1_rejects_unknown_source_field():
    evidence = _evidence(8)
    evidence[0]["source_field"] = "not_a_real_field"
    data = {"evidence": evidence, "patterns": [], "tensions": [], "first_impression_candidates": [], "social_move_candidates": [], "do_not_claim": []}
    errors = validate_stage1(data, QUESTIONNAIRE)
    assert any("unknown source field" in e for e in errors)


def test_validate_stage1_marks_underspecified_pattern_tentative_instead_of_erroring():
    evidence = _evidence(8)
    data = {
        "evidence": evidence,
        "patterns": [{"claim": "x", "evidence_ids": ["e1"], "counterevidence_ids": [], "tentative": False}],
        "tensions": [], "first_impression_candidates": [], "social_move_candidates": [], "do_not_claim": [],
    }
    errors = validate_stage1(data, QUESTIONNAIRE)
    assert errors == []
    assert data["patterns"][0]["tentative"] is True


def _words(n: int, seed: int) -> str:
    """n lowercase filler words, avoiding every banned/jargon/hard-word
    pattern, ending as a sentence (required by validate_stage2/public_report).
    Each field gets a distinct seed so overlap stays below the
    "public fields are too repetitive" similarity threshold."""
    base = [
        ["you", "notice", "small", "things", "and", "still", "show", "up", "for", "people", "in", "your", "own", "quiet", "steady", "way"],
        ["friends", "trust", "how", "calm", "you", "stay", "even", "when", "plans", "change", "at", "the", "last", "minute", "today", "again"],
        ["a", "room", "feels", "different", "once", "you", "walk", "in", "because", "people", "relax", "around", "your", "easy", "manner", "here"],
        ["what", "matters", "most", "to", "you", "is", "honesty", "over", "time", "not", "one", "grand", "gesture", "or", "loud", "promise"],
        ["late", "night", "talks", "make", "you", "feel", "closer", "than", "any", "group", "outing", "ever", "really", "could", "somehow", "still"],
        ["a", "new", "friendship", "with", "you", "grows", "slowly", "through", "tiny", "shared", "jokes", "and", "small", "acts", "of", "care"],
        ["you", "pull", "back", "quietly", "instead", "of", "saying", "what", "actually", "bothered", "you", "in", "that", "exact", "moment", "there"],
        ["one", "useful", "thing", "to", "try", "next", "is", "naming", "the", "small", "feeling", "before", "it", "grows", "into", "distance"],
        ["at", "first", "glance", "you", "read", "as", "relaxed", "but", "underneath", "that", "you", "are", "paying", "close", "attention", "always"],
        ["what", "quietly", "tires", "you", "out", "is", "hosting", "for", "a", "crowd", "long", "after", "the", "energy", "has", "faded"],
        ["you", "protect", "your", "circle", "fiercely", "even", "when", "nobody", "else", "notices", "the", "quiet", "work", "that", "takes", "daily"],
        ["i", "keep", "showing", "up", "for", "the", "people", "who", "matter", "even", "on", "the", "quiet", "days", "too", "always"],
        ["sharing", "this", "feels", "a", "little", "silly", "but", "also", "kind", "of", "true", "about", "how", "i", "actually", "am"],
    ][seed % 13]
    words = [base[i % len(base)] for i in range(n)]
    return " ".join(words) + "."


def _valid_report(**overrides) -> dict:
    report = {
        "typeName": FRIEND_ROLE_NAMES[0],
        "typeDefinition": _words(17, 0),
        "quickRows": {
            "bring": _words(20, 1),
            "notice": _words(20, 2),
            "connect": _words(20, 3),
            "care": _words(20, 4),
        },
        "detailedOpening": _words(28, 5),
        "portrait": [_words(50, i + 6) for i in range(6)],
        "shareCaption": _words(10, 12),
    }
    report.update(overrides)
    return report


def test_validate_public_report_accepts_well_formed_report():
    assert validate_public_report(_valid_report()) == []


def test_validate_public_report_rejects_bad_type_name():
    errors = validate_public_report(_valid_report(typeName="not a real role"))
    assert any("approved friend roles" in e for e in errors)


def test_validate_public_report_rejects_cold_reading_phrase():
    report = _valid_report()
    report["shareCaption"] = "most people don't get me, but you will."
    errors = validate_public_report(report)
    assert any("cold-reading" in e for e in errors)


def test_validate_public_report_rejects_wrong_portrait_length():
    errors = validate_public_report(_valid_report(portrait=["short"] * 6))
    assert any("270-350" in e for e in errors)


def _stage2_result(**report_overrides) -> dict:
    scores = [{"slug": slug, "score": 50} for slug in FRIEND_ROLE_SLUGS]
    scores[0]["score"] = 90
    top = [
        {"slug": FRIEND_ROLE_SLUGS[0], "score": 90, "evidence_ids": ["e1", "e2"], "counterevidence_ids": [], "fit_reason": "x"},
        {"slug": FRIEND_ROLE_SLUGS[1], "score": 60, "evidence_ids": ["e1"], "counterevidence_ids": [], "fit_reason": "x"},
        {"slug": FRIEND_ROLE_SLUGS[2], "score": 55, "evidence_ids": ["e1"], "counterevidence_ids": [], "fit_reason": "x"},
    ]
    report = _valid_report(**report_overrides)
    fields = [
        "typeDefinition", "quickRows.bring", "quickRows.notice", "quickRows.connect", "quickRows.care",
        "detailedOpening", *[f"portrait.{i}" for i in range(6)], "shareCaption",
    ]
    # Round-robin across e1-e8 so no evidence id backs more than 2 fields.
    evidence_map = [
        {"reportField": field, "evidenceIds": [f"e{(i % 8) + 1}"]}
        for i, field in enumerate(fields)
    ]
    qa_keys = [
        "barnumFree", "rainbowRuseFree", "flatteryFree", "sugarLumpFree", "jacquesFree",
        "psychicCreditFree", "shotgunningFree", "recapFree", "causalOverreachFree",
        "invertibilityPassed", "evidenceReusePassed", "characterLimitsPassed", "lowercasePassed",
        "completeSentencesPassed", "plainEnglishPassed", "distinctFieldsPassed", "portraitWordCountPassed",
    ]
    return {
        "selection": {"allTypeScores": scores, "topCandidates": top, "selectedSlug": FRIEND_ROLE_SLUGS[0], "confidence": "high", "runnerUpLoss": "x"},
        "report": report,
        "evidenceMap": evidence_map,
        "qa": {k: True for k in qa_keys},
    }


def test_validate_stage2_accepts_well_formed_result():
    evidence_ledger = {"evidence": _evidence(8)}
    assert validate_stage2(_stage2_result(), evidence_ledger) == []


def test_validate_stage2_rejects_wrong_number_of_scores():
    data = _stage2_result()
    data["selection"]["allTypeScores"] = data["selection"]["allTypeScores"][:5]
    errors = validate_stage2(data, {"evidence": _evidence(8)})
    assert any("allTypeScores" in e for e in errors)


def test_validate_stage2_rejects_selected_slug_type_name_mismatch():
    data = _stage2_result(typeName="the wit")
    errors = validate_stage2(data, {"evidence": _evidence(8)})
    assert any("typeName does not match" in e for e in errors)


def test_validate_stage2_rejects_evidence_id_not_in_ledger():
    data = _stage2_result()
    data["evidenceMap"][0]["evidenceIds"] = ["e999"]
    errors = validate_stage2(data, {"evidence": _evidence(8)})
    assert any("unknown evidence id" in e for e in errors)


def test_validate_stage2_rejects_false_qa_flag():
    data = _stage2_result()
    data["qa"]["barnumFree"] = False
    errors = validate_stage2(data, {"evidence": _evidence(8)})
    assert any("QA flags" in e for e in errors)

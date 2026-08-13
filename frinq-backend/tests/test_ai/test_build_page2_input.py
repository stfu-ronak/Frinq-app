from __future__ import annotations

from app.core.ai.page2_summary import build_page2_input


def test_voice_field_with_no_transcript_is_dropped():
    """No typed answer and no transcript for a voice-only field: the
    frontend's own sentinel must never reach the model as if it were the
    person's actual answer."""
    source = build_page2_input({"story": "[voice response]"})
    assert source["questionnaire"] == []


def test_voice_field_with_a_transcript_is_included_as_voice_transcript():
    """The transcript override used to be unreachable: the placeholder-skip
    ran before the transcript check, so a real Whisper transcript for a
    voice-only field was silently discarded along with the sentinel it was
    meant to replace."""
    source = build_page2_input(
        {"story": "[voice response]"},
        transcripts={"story": "we got lost driving up and laughed the whole way."},
    )
    assert len(source["questionnaire"]) == 1
    row = source["questionnaire"][0]
    assert row["source_field"] == "story"
    assert row["source_modality"] == "voice_transcript"
    assert row["value"] == "we got lost driving up and laughed the whole way."


def test_typed_field_is_unaffected_by_an_unrelated_transcript():
    source = build_page2_input(
        {"story": "we stayed up all night talking."},
        transcripts={"opinions_why": "unrelated transcript for a different field"},
    )
    assert len(source["questionnaire"]) == 1
    row = source["questionnaire"][0]
    assert row["source_field"] == "story"
    assert row["source_modality"] == "text"
    assert row["value"] == "we stayed up all night talking."

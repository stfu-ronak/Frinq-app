import pytest

from app.core.ai.model_pricing import (
    compute_cost,
    effort_supported,
    get_model_info,
    is_known_model,
    resolve_model_id,
)


def test_is_known_model_true_for_every_catalog_entry():
    for model_id in ("gpt-5.5", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna",
                      "claude-fable-5", "claude-opus-5", "claude-sonnet-5",
                      "claude-haiku-4-5-20251001"):
        assert is_known_model(model_id)


def test_gemini_and_gemma_models_are_selectable():
    for model_id in (
        "gemini-3-flash-preview",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemma-4-31b-it",
    ):
        assert is_known_model(model_id)
        assert get_model_info(model_id).provider == "gemini"


def test_is_known_model_false_for_unknown_id():
    assert not is_known_model("claude-nonexistent")


def test_aliases_resolve_to_canonical_id():
    assert resolve_model_id("claude-haiku-4-5") == "claude-haiku-4-5-20251001"
    assert resolve_model_id("gpt-5.6") == "gpt-5.6-sol"
    assert is_known_model("claude-haiku-4-5")
    assert is_known_model("gpt-5.6")


def test_haiku_does_not_support_effort():
    info = get_model_info("claude-haiku-4-5-20251001")
    assert info.supports_effort is False
    assert info.effort_levels == ()
    assert not effort_supported("claude-haiku-4-5-20251001", "low")
    assert not effort_supported("claude-haiku-4-5-20251001", "high")


def test_opus_sonnet_fable_reject_temperature_but_support_effort():
    for model_id in ("claude-opus-5", "claude-sonnet-5", "claude-fable-5"):
        info = get_model_info(model_id)
        assert info.supports_temperature is False
        assert info.supports_effort is True
        assert effort_supported(model_id, "high")
        assert not effort_supported(model_id, "not-a-real-level")


def test_gpt_models_support_temperature_and_full_effort_range():
    for model_id in ("gpt-5.5", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"):
        info = get_model_info(model_id)
        assert info.supports_temperature is True
        assert effort_supported(model_id, "max")


def test_effort_supported_false_for_unknown_model():
    assert not effort_supported("claude-nonexistent", "low")


def test_compute_cost_matches_pricing_table():
    # gpt-5.6-luna: $1.00/$6.00 per MTok
    cost = compute_cost("gpt-5.6-luna", input_tokens=1_000_000, output_tokens=500_000)
    assert cost == pytest.approx(1.00 + 3.00)


def test_compute_cost_zero_tokens_is_zero():
    assert compute_cost("claude-opus-5", 0, 0) == 0.0


def test_compute_cost_resolves_alias():
    direct = compute_cost("claude-haiku-4-5-20251001", 100_000, 50_000)
    aliased = compute_cost("claude-haiku-4-5", 100_000, 50_000)
    assert direct == aliased


def test_compute_cost_raises_for_unknown_model():
    with pytest.raises(ValueError):
        compute_cost("claude-nonexistent", 100, 100)


def test_claude_sonnet_default_is_priced():
    """claude_client.CLAUDE_SONNET must always be a real MODEL_INFO key —
    a code-level default constant never goes through set_model_config's
    validation, so this is the only guard against a silent cost=0.0 /
    unconditional-temperature regression (it happened once already)."""
    from app.core.ai.claude_client import CLAUDE_SONNET

    assert is_known_model(CLAUDE_SONNET)
    assert get_model_info(CLAUDE_SONNET).provider == "claude"


def test_gemini_default_is_priced():
    from app.core.ai.model_pricing import GEMINI_DEFAULT

    assert is_known_model(GEMINI_DEFAULT)
    assert get_model_info(GEMINI_DEFAULT).provider == "gemini"

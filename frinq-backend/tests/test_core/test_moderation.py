from __future__ import annotations

from app.core.moderation import blocked_terms_from_settings, content_hash, moderate


def test_nfkc_normalization_fullwidth_to_ascii() -> None:
    # Fullwidth Unicode "Hello" (U+FF28...) NFKC-normalizes to plain ASCII.
    result = moderate("Ｈｅｌｌｏ")
    assert result.verdict == "accepted"
    assert result.normalized_body == "Hello"


def test_leading_trailing_whitespace_trimmed() -> None:
    result = moderate("   hello there   ")
    assert result.verdict == "accepted"
    assert result.normalized_body == "hello there"


def test_empty_after_normalization_rejected() -> None:
    assert moderate("     ").verdict == "rejected"
    assert moderate("     ").reason == "empty_after_normalization"
    assert moderate("").reason == "empty_after_normalization"


def test_over_max_length_rejected() -> None:
    result = moderate("a" * 1001)
    assert result.verdict == "rejected"
    assert result.reason == "too_long"


def test_control_characters_rejected_except_newline() -> None:
    assert moderate("hello\x00world").reason == "control_characters"
    assert moderate("hello\x1bworld").reason == "control_characters"
    result = moderate("hello\nworld")
    assert result.verdict == "accepted"
    assert result.normalized_body == "hello\nworld"


def test_excessive_repeated_characters_rejected() -> None:
    result = moderate("hellooooooooooooooooo")
    assert result.verdict == "rejected"
    assert result.reason == "excessive_repetition"


def test_max_five_urls_allowed_sixth_rejected() -> None:
    five = " ".join(f"https://example.com/{i}" for i in range(5))
    six = " ".join(f"https://example.com/{i}" for i in range(6))
    assert moderate(five).verdict == "accepted"
    assert moderate(six).verdict == "rejected"
    assert moderate(six).reason == "too_many_urls"


def test_configurable_blocked_terms_flagged_for_review() -> None:
    result = moderate("this contains badword right here", blocked_terms=frozenset({"badword"}))
    assert result.verdict == "review"
    assert result.reason == "blocked_term"
    # Case-insensitive.
    result2 = moderate("this contains BADWORD too", blocked_terms=frozenset({"badword"}))
    assert result2.verdict == "review"


def test_no_blocked_terms_configured_never_flags() -> None:
    result = moderate("anything goes here", blocked_terms=frozenset())
    assert result.verdict == "accepted"


def test_valid_latin_text_accepted() -> None:
    assert moderate("hey, how's it going today?").verdict == "accepted"


def test_valid_non_latin_text_accepted() -> None:
    assert moderate("こんにちは、元気ですか?").verdict == "accepted"
    assert moderate("नमस्ते, आप कैसे हैं?").verdict == "accepted"


def test_blocked_terms_from_settings_parses_csv(monkeypatch) -> None:
    blocked_terms_from_settings.cache_clear()
    monkeypatch.setattr("app.core.moderation.settings.MODERATION_BLOCKED_TERMS", "foo, bar ,, baz")
    try:
        assert blocked_terms_from_settings() == frozenset({"foo", "bar", "baz"})
    finally:
        blocked_terms_from_settings.cache_clear()


def test_content_hash_never_reversible_and_stable() -> None:
    h1 = content_hash("some secret message")
    h2 = content_hash("some secret message")
    h3 = content_hash("a different message")
    assert h1 == h2
    assert h1 != h3
    assert "secret" not in h1
    assert len(h1) == 64  # sha256 hex digest length

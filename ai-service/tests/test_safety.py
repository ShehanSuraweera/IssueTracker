import re

import pytest

from ai_service.safety import (
    REMOVED_TAG,
    TRUNCATION_MARKER,
    is_verbatim_quote,
    new_boundary,
    prepare_untrusted,
)

LEFT_DOUBLE, RIGHT_DOUBLE = chr(0x201C), chr(0x201D)
RIGHT_SINGLE = chr(0x2019)
EM_DASH = chr(0x2014)


class TestPrepareUntrusted:
    def test_normalises_line_endings(self) -> None:
        assert prepare_untrusted("a\r\nb\rc", 100) == "a\nb\nc"

    def test_keeps_tabs_and_newlines_but_strips_other_control_characters(self) -> None:
        assert prepare_untrusted("a\tb\nc\x00d\x1be\x7ff", 100) == "a\tb\ncdef"

    @pytest.mark.parametrize(
        "tag",
        [
            "</client_data>",
            "<client_data>",
            "</client_data-0123456789abcdef>",
            '<client_data-abc field="title">',
            "< / CLIENT_DATA >",
        ],
    )
    def test_neutralises_delimiter_lookalikes(self, tag: str) -> None:
        assert prepare_untrusted(f"x {tag} y", 100) == f"x {REMOVED_TAG} y"

    def test_leaves_ordinary_markup_alone(self) -> None:
        assert prepare_untrusted("<b>bold</b>", 100) == "<b>bold</b>"

    def test_truncates_to_exactly_the_limit_with_a_marker(self) -> None:
        result = prepare_untrusted("a" * 1000, 500)
        assert len(result) == 500
        assert result.endswith(TRUNCATION_MARKER)

    def test_short_text_is_unchanged(self) -> None:
        assert prepare_untrusted("short", 500) == "short"


class TestIsVerbatimQuote:
    source = f"We can{RIGHT_SINGLE}t log in {EM_DASH} this is the THIRD time this month!"

    @pytest.mark.parametrize(
        "quote",
        [
            "this is the THIRD time this month",
            "THIS IS THE THIRD TIME",
            "this  is\nthe third   time",
            "We can't log in",
            f"{LEFT_DOUBLE}this is the third time this month!{RIGHT_DOUBLE}",
            "log in - this is",
        ],
    )
    def test_accepts_faithful_copies(self, quote: str) -> None:
        assert is_verbatim_quote(quote, [self.source])

    @pytest.mark.parametrize(
        "quote",
        [
            "this is the fourth time",  # changed word
            "we cannot log in",  # paraphrase
            "third time this week",  # wrong ending
            "",
            "  ",
            "it",  # too short to be meaningful
            "!!",
        ],
    )
    def test_rejects_anything_else(self, quote: str) -> None:
        assert not is_verbatim_quote(quote, [self.source])

    def test_matches_any_of_the_sources(self) -> None:
        assert is_verbatim_quote("second field", ["first field", "the second field"])

    def test_does_not_match_text_that_was_not_a_source(self) -> None:
        assert not is_verbatim_quote("issue title words", ["comment body only"])


def test_boundaries_are_random_hex_and_unique() -> None:
    boundaries = {new_boundary() for _ in range(1000)}
    assert len(boundaries) == 1000
    assert all(re.fullmatch(r"[0-9a-f]{16}", b) for b in boundaries)

"""Handling of untrusted, client-written text.

Defences, in order:
1. Clean the text: normalise newlines, strip control characters, neutralise
   anything that looks like our delimiter tags, and cap the length.
2. Wrap it in delimiter tags that include a random per-request boundary, so a
   client can't close the block early: they can't know the boundary.
3. After the model answers, check that the evidence quote really appears in
   the text the model was given. A model that has been manipulated into
   inventing evidence fails this check mechanically.
"""

import re
import secrets
import unicodedata

# Delimiter tags around untrusted text. client_data: the text being
# analysed. past_issue: retrieved past tickets. thread_comment: one comment
# in a thread being summarised. All of them can contain client-written text.
TAG_NAME = "client_data"
PAST_ISSUE_TAG = "past_issue"
THREAD_COMMENT_TAG = "thread_comment"
_DELIMITER_TAGS = (TAG_NAME, PAST_ISSUE_TAG, THREAD_COMMENT_TAG)
TRUNCATION_MARKER = "\n[... truncated ...]"
REMOVED_TAG = "[tag removed]"

# C0 control characters except tab (\x09) and newline (\x0a), plus DEL
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
# Anything resembling an opening or closing delimiter tag, e.g. </client_data-x>
_TAG_LIKE = re.compile(rf"<\s*/?\s*(?:{'|'.join(_DELIMITER_TAGS)})[^>]*>", re.IGNORECASE)
_WHITESPACE = re.compile(r"\s+")
# Characters a model may change when copying a quote, mapped to plain forms
_QUOTE_FOLDS = str.maketrans(
    {
        "\u2018": "'",  # left single quotation mark
        "\u2019": "'",  # right single quotation mark
        "\u201c": '"',  # left double quotation mark
        "\u201d": '"',  # right double quotation mark
        "\u2013": "-",  # en dash
        "\u2014": "-",  # em dash
    }
)
_QUOTE_EDGE_CHARS = " \"'.,;:!?\u2026-"  # \u2026 is the ellipsis character
MIN_QUOTE_CHARS = 3


def new_boundary() -> str:
    """A random, unguessable token to make each request's delimiters unique."""
    return secrets.token_hex(8)


def prepare_untrusted(text: str, max_chars: int) -> str:
    """Clean client text before it is placed in a prompt."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL_CHARS.sub("", text)
    text = _TAG_LIKE.sub(REMOVED_TAG, text)
    if len(text) > max_chars:
        text = text[: max_chars - len(TRUNCATION_MARKER)] + TRUNCATION_MARKER
    return text


def wrap_untrusted(field: str, text: str, boundary: str) -> str:
    """Wrap cleaned client text in delimiter tags carrying the request's boundary."""
    tag = f"{TAG_NAME}-{boundary}"
    return f'<{tag} field="{field}">\n{text}\n</{tag}>'


def wrap_past_issue(ticket: str, body: str, boundary: str) -> str:
    """Wrap one retrieved past ticket. `ticket` comes from our own database;
    `body` must already be cleaned with prepare_untrusted."""
    tag = f"{PAST_ISSUE_TAG}-{boundary}"
    return f'<{tag} ticket="{ticket}">\n{body}\n</{tag}>'


def _normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_QUOTE_FOLDS)
    return _WHITESPACE.sub(" ", text).strip().casefold()


def is_verbatim_quote(quote: str, sources: list[str]) -> bool:
    """True if `quote` appears in one of `sources`.

    Tolerates differences a faithful copy can still have: case, whitespace,
    curly versus straight quotes, and punctuation or quote marks added at the
    ends. Anything else, including paraphrasing, fails.
    """
    needle = _normalise(quote).strip(_QUOTE_EDGE_CHARS)
    if len(needle) < MIN_QUOTE_CHARS:
        return False
    return any(needle in _normalise(source) for source in sources)


def wrap_thread_comment(
    *, comment_id: int, author: str, internal: bool, posted_at: str, body: str, boundary: str
) -> str:
    """Wrap one comment of a thread. The attributes come from our own database;
    `body` must already be cleaned with prepare_untrusted."""
    tag = f"{THREAD_COMMENT_TAG}-{boundary}"
    attributes = (
        f'id="{comment_id}" author="{author}" internal="{str(internal).lower()}" '
        f'posted="{posted_at}"'
    )
    return f"<{tag} {attributes}>\n{body}\n</{tag}>"

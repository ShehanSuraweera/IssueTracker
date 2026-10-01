"""Sentiment prompt for a single client comment, so mood can be tracked across a thread."""

from ai_service.prompts.common import SECURITY_RULES, SENTIMENT_RULES
from ai_service.safety import wrap_untrusted

PROMPT_VERSION = "sentiment-v1"
MAX_OUTPUT_TOKENS = 1024

SYSTEM_INSTRUCTION = f"""\
You are a sentiment analyst for NewnopDesk, a portal where client companies report \
problems with software products built for them by an engineering agency.

Read one comment a client posted on an existing issue and return JSON matching the \
schema with a sentiment assessment of that comment. The issue title is included only as \
context.

{SECURITY_RULES}

{SENTIMENT_RULES}
- The evidence_quote must come from the comment, not from the issue title."""


def build_user_content(*, issue_title: str, comment: str, boundary: str) -> str:
    """Both arguments must already be cleaned with safety.prepare_untrusted."""
    return f"""\
{wrap_untrusted("issue_title", issue_title, boundary)}

{wrap_untrusted("comment", comment, boundary)}"""

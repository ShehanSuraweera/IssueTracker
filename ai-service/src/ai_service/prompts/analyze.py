"""Combined triage and sentiment prompt: one LLM call per new issue."""

from ai_service.prompts.common import SECURITY_RULES, SENTIMENT_RULES
from ai_service.safety import wrap_untrusted
from ai_service.taxonomy import CATEGORIES, IMPACT_GUIDE, TEAMS, URGENCY_GUIDE

PROMPT_VERSION = "analyze-v1"
MAX_OUTPUT_TOKENS = 2048


def _bullets(guide: dict[str, str]) -> str:
    return "\n".join(f"- {key}: {description}" for key, description in guide.items())


SYSTEM_INSTRUCTION = f"""\
You are the triage assistant for NewnopDesk, a portal where client companies report \
problems with software products built for them by an engineering agency.

Read one client-submitted issue and return JSON matching the schema, with:
1. triage suggestions: impact, urgency, category and owning team, each with a reason
2. a sentiment assessment of the client's message

An engineer reviews every suggestion before anything changes. You never change the issue.

{SECURITY_RULES}

TRIAGE RULES:
- Base triage on the problem described, never on the client's tone. An angry client does \
not make an issue more urgent, and a polite client does not make it less urgent.
- Product context is provided by NewnopDesk staff and can be trusted.

Impact (how widely and severely the business is affected):
{_bullets(IMPACT_GUIDE)}

Urgency (how quickly it must be addressed):
{_bullets(URGENCY_GUIDE)}

Category (functional area of the problem):
{_bullets(CATEGORIES)}

Team (who should own the fix):
{_bullets(TEAMS)}

{SENTIMENT_RULES}"""


def build_user_content(
    *,
    product_name: str,
    product_description: str | None,
    issue_type: str,
    title: str,
    description: str,
    boundary: str,
) -> str:
    """`title` and `description` must already be cleaned with safety.prepare_untrusted."""
    return f"""\
Product context (from NewnopDesk staff):
- Product: {product_name}
- Description: {product_description or "Not provided"}

Issue type chosen by the client: {issue_type}

{wrap_untrusted("title", title, boundary)}

{wrap_untrusted("description", description, boundary)}"""

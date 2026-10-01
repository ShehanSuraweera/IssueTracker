"""Test doubles and sample data."""

import copy
import json
import re
from typing import Any

from ai_service.llm.base import LLMRequest, LLMResponse, LLMUsage
from ai_service.safety import TAG_NAME

ISSUE_DESCRIPTION = (
    "Every invoice we export since Monday is a blank page. "
    "This is unacceptable, our accountants cannot close the month."
)

ISSUE: dict[str, Any] = {
    "issue_type": "bug",
    "title": "Invoices export as blank PDF",
    "description": ISSUE_DESCRIPTION,
    "product": {"name": "Acme Portal", "description": "Billing web app for Acme"},
}

COMMENT: dict[str, Any] = {
    "issue_title": "Invoices export as blank PDF",
    "comment": "Still broken after a week. If this isn't fixed by Friday we will escalate.",
}

USAGE = LLMUsage(input_tokens=812, output_tokens=164, thinking_tokens=12)


def analyze_output(**overrides: Any) -> dict[str, Any]:
    """A valid analyze output for ISSUE. Overrides are dotted paths, e.g. triage__impact."""
    output: dict[str, Any] = {
        "triage": {
            "impact": "high",
            "impact_reason": "All invoice exports fail for the accounting team.",
            "urgency": "high",
            "urgency_reason": "Month-end closing is blocked.",
            "category": "file_handling",
            "category_reason": "The problem is in PDF export.",
            "team": "backend",
            "team_reason": "PDF generation runs on the server.",
        },
        "sentiment": {
            "sentiment": "negative",
            "frustration_level": 4,
            "escalation_risk": "medium",
            "evidence_quote": "This is unacceptable",
            "reason": "The client calls the situation unacceptable.",
        },
        "manipulation_attempt": False,
    }
    return _apply(output, overrides)


def sentiment_output(**overrides: Any) -> dict[str, Any]:
    output: dict[str, Any] = {
        "sentiment": {
            "sentiment": "negative",
            "frustration_level": 4,
            "escalation_risk": "high",
            "evidence_quote": "we will escalate",
            "reason": "The client threatens escalation.",
        },
        "manipulation_attempt": False,
    }
    return _apply(output, overrides)


_DELETE = object()


def delete() -> object:
    """Use as an override value to remove a key."""
    return _DELETE


def _apply(output: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    output = copy.deepcopy(output)
    for path, value in overrides.items():
        *parents, leaf = path.split("__")
        target = output
        for key in parents:
            target = target[key]
        if value is _DELETE:
            del target[leaf]
        else:
            target[leaf] = value
    return output


class ScriptedProvider:
    """Returns whatever a test queued up, and records every request it receives."""

    name = "scripted"
    model = "scripted-model"

    def __init__(self) -> None:
        self.requests: list[LLMRequest] = []
        self._queue: list[LLMResponse | BaseException] = []
        self.closed = False

    def will_return(self, payload: dict[str, Any] | str, *, truncated: bool = False) -> None:
        text = payload if isinstance(payload, str) else json.dumps(payload)
        self._queue.append(
            LLMResponse(
                text=text, model=self.model, usage=USAGE, latency_ms=321, truncated=truncated
            )
        )

    def will_raise(self, exc: BaseException) -> None:
        self._queue.append(exc)

    async def generate_json(self, request: LLMRequest) -> LLMResponse:
        self.requests.append(request)
        if not self._queue:
            raise AssertionError("ScriptedProvider called with nothing queued")
        item = self._queue.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item

    async def aclose(self) -> None:
        self.closed = True

    @property
    def last(self) -> LLMRequest:
        return self.requests[-1]


def client_blocks(user_content: str) -> dict[str, str]:
    """Extract {field: text} from the delimited client-data blocks in a prompt."""
    pattern = re.compile(
        rf'<{TAG_NAME}-(?P<b>[0-9a-f]{{16}}) field="(?P<field>\w+)">\n(?P<text>.*?)\n'
        rf"</{TAG_NAME}-(?P=b)>",
        re.DOTALL,
    )
    return {m["field"]: m["text"] for m in pattern.finditer(user_content)}


def boundary_of(user_content: str) -> str:
    match = re.search(rf"<{TAG_NAME}-([0-9a-f]{{16}}) ", user_content)
    if match is None:
        raise AssertionError("no client-data block in prompt")
    return match.group(1)

"""A deterministic stand-in for a real model, for local development without an API key.

It reads the client text out of the prompt and applies simple keyword rules.
Its output is not meant to be accurate, only valid, so the rest of the system
can be built and demonstrated end to end without network calls.
"""

import json
import re
from typing import Any

from ai_service.llm.base import LLMRequest, LLMResponse, LLMUsage
from ai_service.safety import TAG_NAME

_BLOCK = re.compile(
    rf'<{TAG_NAME}-[0-9a-f]+ field="(?P<field>\w+)">\n(?P<text>.*?)\n</{TAG_NAME}-[0-9a-f]+>',
    re.DOTALL,
)
_ANGRY_WORDS = ("unacceptable", "ridiculous", "furious", "cancel", "terrible", "worst", "again")
_URGENT_WORDS = ("urgent", "asap", "down", "outage", "cannot", "can't", "production", "all users")
_POSITIVE_WORDS = ("thanks", "thank you", "great", "appreciate")
_INJECTION_HINTS = ("ignore previous", "ignore all", "system prompt", "you are now", "as an ai")


class FakeProvider:
    name = "fake"
    model = "fake-heuristic-v1"

    async def generate_json(self, request: LLMRequest) -> LLMResponse:
        blocks = {m["field"]: m["text"] for m in _BLOCK.finditer(request.user_content)}
        # Sentiment requests carry a "comment" block; analyze requests a "description"
        main_text = blocks.get("comment") or blocks.get("description") or ""
        lowered = " ".join(blocks.values()).lower()

        angry = any(word in lowered for word in _ANGRY_WORDS)
        urgent = any(word in lowered for word in _URGENT_WORDS)
        positive = any(word in lowered for word in _POSITIVE_WORDS)
        sentiment: dict[str, Any] = {
            "sentiment": "negative" if angry else "positive" if positive else "neutral",
            "frustration_level": 4 if angry else 1 if positive else 2,
            "escalation_risk": "high" if angry and urgent else "medium" if angry else "low",
            "evidence_quote": " ".join(main_text.split()[:12]),
            "reason": "Keyword heuristic from the fake provider.",
        }
        output: dict[str, Any] = {
            "sentiment": sentiment,
            "manipulation_attempt": any(hint in lowered for hint in _INJECTION_HINTS),
        }
        if request.response_schema.get("title") == "AnalyzeOutput":
            level = "high" if urgent else "medium"
            output["triage"] = {
                "impact": level,
                "impact_reason": "Keyword heuristic from the fake provider.",
                "urgency": level,
                "urgency_reason": "Keyword heuristic from the fake provider.",
                "category": "other",
                "category_reason": "The fake provider does not classify categories.",
                "team": "backend",
                "team_reason": "The fake provider always suggests backend.",
            }
        return LLMResponse(
            text=json.dumps(output), model=self.model, usage=LLMUsage(), latency_ms=0
        )

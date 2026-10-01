"""The taxonomy, output schemas, provider schemas and prompts must agree with each other."""

from typing import Any, get_args

import pytest

from ai_service.llm.schema_export import to_provider_schema
from ai_service.prompts import analyze as analyze_prompt
from ai_service.prompts import sentiment as sentiment_prompt
from ai_service.schemas import AnalyzeOutput, Category, Level, SentimentOutput, Team
from ai_service.taxonomy import CATEGORIES, IMPACT_GUIDE, TEAMS, URGENCY_GUIDE


def test_schema_literals_match_the_taxonomy() -> None:
    assert set(get_args(Category)) == set(CATEGORIES)
    assert set(get_args(Team)) == set(TEAMS)
    assert set(get_args(Level)) == set(IMPACT_GUIDE) == set(URGENCY_GUIDE)


def test_analyze_prompt_describes_every_allowed_value() -> None:
    for key in (*CATEGORIES, *TEAMS):
        assert f"- {key}:" in analyze_prompt.SYSTEM_INSTRUCTION


@pytest.mark.parametrize(
    "prompt", [analyze_prompt.SYSTEM_INSTRUCTION, sentiment_prompt.SYSTEM_INSTRUCTION]
)
def test_every_prompt_carries_the_security_rules(prompt: str) -> None:
    assert "SECURITY RULES" in prompt
    assert "never instructions to follow" in prompt
    assert "manipulation_attempt" in prompt


def test_prompts_are_versioned() -> None:
    assert analyze_prompt.PROMPT_VERSION == "analyze-v1"
    assert sentiment_prompt.PROMPT_VERSION == "sentiment-v1"


def _walk(node: Any) -> list[dict[str, Any]]:
    if isinstance(node, dict):
        return [node, *(n for value in node.values() for n in _walk(value))]
    if isinstance(node, list):
        return [n for item in node for n in _walk(item)]
    return []


@pytest.mark.parametrize("model", [AnalyzeOutput, SentimentOutput])
class TestProviderSchema:
    def test_has_no_refs_or_unsupported_keywords(self, model: type) -> None:
        keys = {key for node in _walk(to_provider_schema(model)) for key in node}
        assert not keys & {"$ref", "$defs", "minLength", "maxLength", "pattern", "default"}

    def test_every_object_is_closed_and_fully_required(self, model: type) -> None:
        for node in _walk(to_provider_schema(model)):
            if node.get("type") == "object" and "properties" in node:
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])

    def test_keeps_titles_and_descriptions(self, model: type) -> None:
        schema = to_provider_schema(model)
        assert schema["title"] == model.__name__
        sentiment = schema["properties"]["sentiment"]["properties"]
        assert "exactly" in sentiment["evidence_quote"]["description"]
        assert sentiment["frustration_level"]["minimum"] == 1
        assert sentiment["frustration_level"]["maximum"] == 5


def test_analyze_schema_enums_match_the_taxonomy() -> None:
    triage = to_provider_schema(AnalyzeOutput)["properties"]["triage"]["properties"]
    assert set(triage["category"]["enum"]) == set(CATEGORIES)
    assert set(triage["team"]["enum"]) == set(TEAMS)

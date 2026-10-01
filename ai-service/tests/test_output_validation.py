"""Every LLM response is validated strictly. Anything off-schema is rejected, never repaired."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.fakes import ISSUE, ScriptedProvider, analyze_output, delete

RIGHT_SINGLE_QUOTE = chr(0x2019)


@pytest.mark.parametrize(
    ("label", "output", "detail"),
    [
        ("not JSON", "Sure! Here is the analysis.", "schema_invalid"),
        ("truncated JSON", '{"triage": {"impact": "hi', "schema_invalid"),
        ("JSON array", "[]", "schema_invalid"),
        ("missing section", analyze_output(sentiment=delete()), "schema_invalid"),
        ("missing field", analyze_output(triage__team=delete()), "schema_invalid"),
        ("unknown top-level field", analyze_output(priority="critical"), "schema_invalid"),
        ("unknown nested field", analyze_output(sentiment__mood="angry"), "schema_invalid"),
        ("impact not a level", analyze_output(triage__impact="critical"), "schema_invalid"),
        ("unknown category", analyze_output(triage__category="billing"), "schema_invalid"),
        ("unknown team", analyze_output(triage__team="qa"), "schema_invalid"),
        ("unknown sentiment", analyze_output(sentiment__sentiment="angry"), "schema_invalid"),
        ("unknown risk", analyze_output(sentiment__escalation_risk="extreme"), "schema_invalid"),
        ("frustration below 1", analyze_output(sentiment__frustration_level=0), "schema_invalid"),
        ("frustration above 5", analyze_output(sentiment__frustration_level=6), "schema_invalid"),
        (
            "frustration as string",
            analyze_output(sentiment__frustration_level="3"),
            "schema_invalid",
        ),
        (
            "frustration as float",
            analyze_output(sentiment__frustration_level=3.5),
            "schema_invalid",
        ),
        ("flag as string", analyze_output(manipulation_attempt="yes"), "schema_invalid"),
        ("empty reason", analyze_output(triage__impact_reason="   "), "schema_invalid"),
        ("reason too long", analyze_output(triage__urgency_reason="x" * 301), "schema_invalid"),
        (
            "paraphrased quote",
            analyze_output(sentiment__evidence_quote="This is not acceptable"),
            "quote_not_verbatim",
        ),
        (
            "quote too short",
            analyze_output(sentiment__evidence_quote="is"),
            "quote_not_verbatim",
        ),
    ],
)
def test_invalid_output_is_rejected(
    client: TestClient,
    provider: ScriptedProvider,
    label: str,
    output: dict[str, Any] | str,
    detail: str,
) -> None:
    provider.will_return(output)
    response = client.post("/v1/analyze", json=ISSUE)

    assert response.status_code == 502, label
    body = response.json()
    assert body["error"]["code"] == "LLM_INVALID_OUTPUT"
    assert body["error"]["retryable"] is True
    assert body["error"]["detail"] == detail
    # Rejected calls still cost tokens, so the backend can still record them
    assert body["meta"]["input_tokens"] == 812
    assert body["meta"]["prompt_version"] == "analyze-v1"


def test_output_cut_off_at_the_token_limit_is_rejected(
    client: TestClient, provider: ScriptedProvider
) -> None:
    provider.will_return(analyze_output(), truncated=True)
    response = client.post("/v1/analyze", json=ISSUE)
    assert response.status_code == 502
    assert response.json()["error"]["detail"] == "truncated"


@pytest.mark.parametrize(
    "quote",
    [
        "This is unacceptable",
        "this is UNACCEPTABLE",  # case
        "This  is\nunacceptable",  # whitespace
        '"This is unacceptable."',  # quote marks and punctuation added at the ends
        "our accountants cannot close the month",
    ],
)
def test_faithful_quotes_are_accepted(
    client: TestClient, provider: ScriptedProvider, quote: str
) -> None:
    provider.will_return(analyze_output(sentiment__evidence_quote=quote))
    response = client.post("/v1/analyze", json=ISSUE)
    assert response.status_code == 200


def test_curly_apostrophes_match_straight_ones(
    client: TestClient, provider: ScriptedProvider
) -> None:
    description = f"We can{RIGHT_SINGLE_QUOTE}t log in at all."
    provider.will_return(analyze_output(sentiment__evidence_quote="We can't log in"))
    response = client.post("/v1/analyze", json={**ISSUE, "description": description})
    assert response.status_code == 200

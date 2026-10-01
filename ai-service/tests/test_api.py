"""HTTP contract: auth, health, request validation, request IDs, and successful responses."""

import re

import pytest
from fastapi.testclient import TestClient

from ai_service.main import create_app
from tests.conftest import TOKEN, make_settings
from tests.fakes import COMMENT, ISSUE, ScriptedProvider, analyze_output, sentiment_output

# ─── Health and auth ─────────────────────────────────────────────────────────


def test_health_needs_no_auth(provider: ScriptedProvider) -> None:
    with TestClient(create_app(make_settings(), provider)) as anonymous:
        response = anonymous.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.parametrize(
    "authorization",
    [
        None,
        "",
        "Bearer",
        f"Basic {TOKEN}",
        f"Bearer {TOKEN[:-1]}",  # one character short
        f"Bearer {TOKEN}x",  # one character too many
        "Bearer wrong-token-wrong-token-wrong-token",
    ],
)
def test_v1_endpoints_reject_a_missing_or_wrong_token(
    provider: ScriptedProvider, authorization: str | None
) -> None:
    headers = {} if authorization is None else {"Authorization": authorization}
    with TestClient(create_app(make_settings(), provider)) as anonymous:
        for path, body in (("/v1/analyze", ISSUE), ("/v1/sentiment", COMMENT)):
            response = anonymous.post(path, json=body, headers=headers)
            assert response.status_code == 401
            assert response.json()["error"]["code"] == "UNAUTHORIZED"
            assert response.headers["WWW-Authenticate"] == "Bearer"
    # Rejected before any LLM call was made
    assert provider.requests == []


def test_shutdown_closes_the_provider(provider: ScriptedProvider) -> None:
    with TestClient(create_app(make_settings(), provider)):
        assert provider.closed is False
    assert provider.closed is True


def test_api_docs_are_off_by_default(client: TestClient) -> None:
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_api_docs_can_be_switched_on(provider: ScriptedProvider) -> None:
    app = create_app(make_settings(ai_service_docs=True), provider)
    with TestClient(app) as docs_client:
        assert docs_client.get("/docs").status_code == 200


# ─── /v1/analyze ─────────────────────────────────────────────────────────────


def test_analyze_returns_validated_result_and_call_metadata(
    client: TestClient, provider: ScriptedProvider
) -> None:
    provider.will_return(analyze_output())
    response = client.post("/v1/analyze", json=ISSUE)

    assert response.status_code == 200
    body = response.json()
    assert body["result"] == analyze_output()
    assert body["meta"] == {
        "provider": "scripted",
        "model": "scripted-model",
        "prompt_version": "analyze-v1",
        "latency_ms": 321,
        "input_tokens": 812,
        "output_tokens": 164,
        "thinking_tokens": 12,
    }


def test_analyze_sends_product_context_and_issue_type(
    client: TestClient, provider: ScriptedProvider
) -> None:
    provider.will_return(analyze_output())
    client.post("/v1/analyze", json=ISSUE)
    prompt = provider.last.user_content
    assert "Product: Acme Portal" in prompt
    assert "Billing web app for Acme" in prompt
    assert "Issue type chosen by the client: bug" in prompt


@pytest.mark.parametrize(
    ("label", "change", "field"),
    [
        ("missing title", {"title": None}, "title"),
        ("empty description", {"description": ""}, "description"),
        ("title too long", {"title": "x" * 201}, "title"),
        ("unknown issue type", {"issue_type": "complaint"}, "issue_type"),
        ("unknown field", {"priority": "critical"}, "priority"),
    ],
)
def test_analyze_rejects_invalid_requests(
    client: TestClient,
    provider: ScriptedProvider,
    label: str,
    change: dict[str, object],
    field: str,
) -> None:
    body = {**ISSUE, **change}
    body = {k: v for k, v in body.items() if v is not None}
    response = client.post("/v1/analyze", json=body)

    assert response.status_code == 422, label
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"
    assert field in response.json()["error"]["fields"]
    assert provider.requests == []


# ─── /v1/sentiment ───────────────────────────────────────────────────────────


def test_sentiment_returns_validated_result(client: TestClient, provider: ScriptedProvider) -> None:
    provider.will_return(sentiment_output())
    response = client.post("/v1/sentiment", json=COMMENT)
    assert response.status_code == 200
    assert response.json()["result"] == sentiment_output()
    assert response.json()["meta"]["prompt_version"] == "sentiment-v1"


def test_sentiment_evidence_must_come_from_the_comment_not_the_title(
    client: TestClient, provider: ScriptedProvider
) -> None:
    provider.will_return(sentiment_output(sentiment__evidence_quote="Invoices export as blank"))
    response = client.post("/v1/sentiment", json=COMMENT)
    assert response.status_code == 502
    assert response.json()["error"]["detail"] == "quote_not_verbatim"


# ─── Request IDs ─────────────────────────────────────────────────────────────


def test_request_id_from_the_caller_is_echoed(
    client: TestClient, provider: ScriptedProvider
) -> None:
    provider.will_return(analyze_output())
    response = client.post("/v1/analyze", json=ISSUE, headers={"X-Request-ID": "req-123.abc"})
    assert response.headers["X-Request-ID"] == "req-123.abc"


@pytest.mark.parametrize("bad_id", ["has space", "x" * 65, "semi;colon", ""])
def test_unsafe_request_ids_are_replaced(client: TestClient, bad_id: str) -> None:
    response = client.get("/healthz", headers={"X-Request-ID": bad_id})
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["X-Request-ID"])

"""Provider failures become a consistent error envelope that tells the caller whether to retry."""

import pytest
from fastapi.testclient import TestClient

from ai_service.llm.base import (
    LLMBlockedError,
    LLMError,
    LLMRateLimitedError,
    LLMRequestRejectedError,
    LLMTimeoutError,
    LLMUnavailableError,
    LLMUsage,
)
from tests.fakes import ISSUE, ScriptedProvider


@pytest.mark.parametrize(
    ("error", "status", "retryable"),
    [
        (LLMTimeoutError("slow"), 504, True),
        (LLMRateLimitedError("quota"), 503, True),
        (LLMUnavailableError("down"), 503, True),
        (LLMBlockedError("safety"), 422, False),
        (LLMRequestRejectedError("bad key"), 502, False),
    ],
)
def test_provider_errors_map_to_status_and_retry_hint(
    client: TestClient,
    provider: ScriptedProvider,
    error: LLMError,
    status: int,
    retryable: bool,
) -> None:
    provider.will_raise(error)
    response = client.post("/v1/analyze", json=ISSUE)
    assert response.status_code == status
    assert response.json()["error"] == {
        "code": error.code,
        "message": error.message,
        "retryable": retryable,
    }


def test_error_includes_cost_when_the_call_happened(
    client: TestClient, provider: ScriptedProvider
) -> None:
    provider.will_raise(
        LLMBlockedError(
            "safety",
            model="m",
            usage=LLMUsage(input_tokens=50, output_tokens=0),
            latency_ms=900,
        )
    )
    meta = client.post("/v1/analyze", json=ISSUE).json()["meta"]
    assert meta == {
        "provider": "scripted",
        "model": "m",
        "prompt_version": "analyze-v1",
        "latency_ms": 900,
        "input_tokens": 50,
        "output_tokens": 0,
        "thinking_tokens": None,
    }


def test_unexpected_errors_return_a_generic_500(
    client: TestClient, provider: ScriptedProvider
) -> None:
    provider.will_raise(RuntimeError("internal detail that must not leak"))
    response = client.post("/v1/analyze", json=ISSUE)
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    # Possibly transient, so the caller may retry within its attempt limit
    assert response.json()["error"]["retryable"] is True
    assert "internal detail" not in response.text
    assert response.headers["X-Request-ID"]

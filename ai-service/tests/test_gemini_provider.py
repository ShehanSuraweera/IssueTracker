"""GeminiProvider against a stubbed SDK call: request building and response/error mapping."""

import asyncio
from typing import Any

import httpx
import pytest
from google.genai import errors, types

from ai_service.llm.base import (
    LLMBlockedError,
    LLMRateLimitedError,
    LLMRequest,
    LLMRequestRejectedError,
    LLMTimeoutError,
    LLMUnavailableError,
)
from ai_service.llm.gemini import GeminiProvider

REQUEST = LLMRequest(
    system_instruction="SYSTEM",
    user_content="USER",
    response_schema={"type": "object", "title": "X"},
    max_output_tokens=512,
)


def gemini_response(
    text: str | None = '{"ok": true}',
    finish_reason: types.FinishReason = types.FinishReason.STOP,
    block_reason: types.BlockedReason | None = None,
    candidates: bool = True,
) -> types.GenerateContentResponse:
    parts = [types.Part(text=text)] if text is not None else []
    return types.GenerateContentResponse(
        candidates=(
            [
                types.Candidate(
                    content=types.Content(role="model", parts=parts), finish_reason=finish_reason
                )
            ]
            if candidates
            else []
        ),
        prompt_feedback=(
            types.GenerateContentResponsePromptFeedback(block_reason=block_reason)
            if block_reason
            else None
        ),
        usage_metadata=types.GenerateContentResponseUsageMetadata(
            prompt_token_count=700, candidates_token_count=150, thoughts_token_count=9
        ),
        model_version="gemini-3.5-flash-lite-001",
    )


class StubCall:
    """Stands in for client.aio.models.generate_content."""

    def __init__(self, result: types.GenerateContentResponse | BaseException) -> None:
        self.result = result
        self.calls: list[dict[str, Any]] = []

    async def __call__(self, **kwargs: Any) -> types.GenerateContentResponse:
        self.calls.append(kwargs)
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


def provider(stub: Any, **overrides: Any) -> GeminiProvider:
    options: dict[str, Any] = {
        "model": "gemini-3.5-flash-lite",
        "timeout_seconds": 5,
        "thinking_level": "minimal",
        "generate_content": stub,
        **overrides,
    }
    return GeminiProvider(**options)


def api_error(code: int, status: str) -> errors.APIError:
    return errors.APIError(code, {"error": {"code": code, "message": "msg", "status": status}})


async def test_builds_the_request_with_schema_safety_and_thinking_config() -> None:
    stub = StubCall(gemini_response())
    await provider(stub).generate_json(REQUEST)

    (call,) = stub.calls
    assert call["model"] == "gemini-3.5-flash-lite"
    assert call["contents"] == "USER"
    config: types.GenerateContentConfig = call["config"]
    assert config.system_instruction == "SYSTEM"
    assert config.response_mime_type == "application/json"
    assert config.response_json_schema == REQUEST.response_schema
    assert config.max_output_tokens == 512
    assert config.temperature is None  # model default unless configured
    assert config.thinking_config is not None
    assert config.thinking_config.thinking_level == types.ThinkingLevel.MINIMAL
    assert config.safety_settings is not None
    assert {s.threshold for s in config.safety_settings} == {
        types.HarmBlockThreshold.BLOCK_ONLY_HIGH
    }
    assert len(config.safety_settings) == 4


async def test_returns_text_usage_and_model_version() -> None:
    result = await provider(StubCall(gemini_response())).generate_json(REQUEST)
    assert result.text == '{"ok": true}'
    assert result.model == "gemini-3.5-flash-lite-001"
    assert result.usage.input_tokens == 700
    assert result.usage.output_tokens == 150
    assert result.usage.thinking_tokens == 9
    assert result.truncated is False


async def test_flags_output_cut_off_at_the_token_limit() -> None:
    stub = StubCall(gemini_response(finish_reason=types.FinishReason.MAX_TOKENS))
    assert (await provider(stub).generate_json(REQUEST)).truncated is True


@pytest.mark.parametrize(
    "response",
    [
        gemini_response(block_reason=types.BlockedReason.SAFETY),
        gemini_response(finish_reason=types.FinishReason.SAFETY),
        gemini_response(finish_reason=types.FinishReason.PROHIBITED_CONTENT),
        gemini_response(candidates=False),
    ],
)
async def test_safety_blocks_raise_a_non_retryable_error(
    response: types.GenerateContentResponse,
) -> None:
    with pytest.raises(LLMBlockedError) as caught:
        await provider(StubCall(response)).generate_json(REQUEST)
    assert caught.value.retryable is False
    assert caught.value.usage is not None


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (api_error(429, "RESOURCE_EXHAUSTED"), LLMRateLimitedError),
        (api_error(500, "INTERNAL"), LLMUnavailableError),
        (api_error(503, "UNAVAILABLE"), LLMUnavailableError),
        (api_error(400, "INVALID_ARGUMENT"), LLMRequestRejectedError),
        (api_error(403, "PERMISSION_DENIED"), LLMRequestRejectedError),
        (api_error(404, "NOT_FOUND"), LLMRequestRejectedError),
        (httpx.ConnectError("refused"), LLMUnavailableError),
        (httpx.ReadTimeout("slow"), LLMTimeoutError),
    ],
)
async def test_maps_sdk_failures_to_provider_errors(
    error: BaseException, expected: type[Exception]
) -> None:
    with pytest.raises(expected):
        await provider(StubCall(error)).generate_json(REQUEST)


async def test_enforces_a_hard_timeout() -> None:
    async def never_returns(**_: Any) -> types.GenerateContentResponse:
        await asyncio.sleep(10)
        raise AssertionError("unreachable")

    with pytest.raises(LLMTimeoutError) as caught:
        await provider(never_returns, timeout_seconds=0.05).generate_json(REQUEST)
    assert caught.value.retryable is True
    assert caught.value.latency_ms is not None


def test_real_client_is_built_without_network_access() -> None:
    gemini = GeminiProvider(api_key="test-key", model="gemini-3.5-flash-lite", timeout_seconds=5)
    assert gemini.name == "gemini"

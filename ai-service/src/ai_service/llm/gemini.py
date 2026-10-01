"""Gemini provider, using Google's official google-genai SDK."""

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from google import genai
from google.genai import errors, types

from ai_service.config import ThinkingLevel
from ai_service.llm.base import (
    LLMBlockedError,
    LLMError,
    LLMRateLimitedError,
    LLMRequest,
    LLMRequestRejectedError,
    LLMResponse,
    LLMTimeoutError,
    LLMUnavailableError,
    LLMUsage,
)
from ai_service.logging_config import get_logger

logger = get_logger("llm.gemini")

GenerateContent = Callable[..., Awaitable[types.GenerateContentResponse]]

_BLOCKED_FINISH_REASONS = frozenset(
    {
        types.FinishReason.SAFETY,
        types.FinishReason.PROHIBITED_CONTENT,
        types.FinishReason.BLOCKLIST,
        types.FinishReason.SPII,
        types.FinishReason.RECITATION,
    }
)

# Client complaints are often angry or rude. The default filters could block a
# legitimate complaint we need to classify, so only high-probability harm is
# blocked. The output is constrained JSON, so the model can't write free text.
_SAFETY_SETTINGS = [
    types.SafetySetting(category=category, threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH)
    for category in (
        types.HarmCategory.HARM_CATEGORY_HARASSMENT,
        types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    )
]

_THINKING_LEVELS: dict[ThinkingLevel, types.ThinkingLevel] = {
    "minimal": types.ThinkingLevel.MINIMAL,
    "low": types.ThinkingLevel.LOW,
    "medium": types.ThinkingLevel.MEDIUM,
    "high": types.ThinkingLevel.HIGH,
}


class GeminiProvider:
    name = "gemini"

    def __init__(
        self,
        *,
        model: str,
        timeout_seconds: float,
        api_key: str | None = None,
        thinking_level: ThinkingLevel | None = None,
        temperature: float | None = None,
        generate_content: GenerateContent | None = None,
    ) -> None:
        """`generate_content` replaces the SDK call in tests; normally it is built from api_key."""
        self.model = model
        self._timeout_seconds = timeout_seconds
        self._thinking_level = thinking_level
        self._temperature = temperature
        if generate_content is None:
            # No retry_options: the SDK makes exactly one attempt. Retries are
            # the Node backend's decision, so they never stack up.
            client = genai.Client(
                api_key=api_key,
                http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000)),
            )
            generate_content = client.aio.models.generate_content
        self._generate_content = generate_content

    def build_config(self, request: LLMRequest) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            system_instruction=request.system_instruction,
            response_mime_type="application/json",
            response_json_schema=request.response_schema,
            max_output_tokens=request.max_output_tokens,
            safety_settings=_SAFETY_SETTINGS,
            temperature=self._temperature,
            thinking_config=(
                types.ThinkingConfig(thinking_level=_THINKING_LEVELS[self._thinking_level])
                if self._thinking_level
                else None
            ),
        )

    async def generate_json(self, request: LLMRequest) -> LLMResponse:
        config = self.build_config(request)
        started = time.perf_counter()

        def elapsed_ms() -> int:
            return round((time.perf_counter() - started) * 1000)

        try:
            # A hard ceiling on top of the HTTP timeout, which only bounds each
            # network phase separately
            async with asyncio.timeout(self._timeout_seconds):
                response = await self._generate_content(
                    model=self.model, contents=request.user_content, config=config
                )
        except TimeoutError as exc:
            raise LLMTimeoutError(
                f"Gemini did not respond within {self._timeout_seconds:g}s",
                model=self.model,
                latency_ms=elapsed_ms(),
            ) from exc
        except errors.APIError as exc:
            raise _map_api_error(exc, self.model, elapsed_ms()) from exc
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError(
                "Gemini request timed out", model=self.model, latency_ms=elapsed_ms()
            ) from exc
        except httpx.TransportError as exc:
            raise LLMUnavailableError(
                "Could not reach Gemini", model=self.model, latency_ms=elapsed_ms()
            ) from exc

        latency_ms = elapsed_ms()
        usage = _usage(response)
        model = response.model_version or self.model

        if response.prompt_feedback and response.prompt_feedback.block_reason:
            raise LLMBlockedError(
                "Gemini blocked the prompt",
                model=model,
                usage=usage,
                latency_ms=latency_ms,
                detail=str(response.prompt_feedback.block_reason),
            )
        if not response.candidates:
            raise LLMBlockedError(
                "Gemini returned no candidates", model=model, usage=usage, latency_ms=latency_ms
            )
        finish_reason = response.candidates[0].finish_reason
        if finish_reason in _BLOCKED_FINISH_REASONS:
            raise LLMBlockedError(
                "Gemini stopped generating for safety or policy reasons",
                model=model,
                usage=usage,
                latency_ms=latency_ms,
                detail=str(finish_reason),
            )

        return LLMResponse(
            text=response.text or "",
            model=model,
            usage=usage,
            latency_ms=latency_ms,
            truncated=finish_reason == types.FinishReason.MAX_TOKENS,
        )


def _usage(response: types.GenerateContentResponse) -> LLMUsage:
    metadata = response.usage_metadata
    if metadata is None:
        return LLMUsage()
    return LLMUsage(
        input_tokens=metadata.prompt_token_count,
        output_tokens=metadata.candidates_token_count,
        thinking_tokens=metadata.thoughts_token_count,
    )


_RETRYABLE_STATUS_CODES = frozenset({408, 500, 502, 503, 504})


def _map_api_error(exc: errors.APIError, model: str, latency_ms: int) -> LLMError:
    # Provider messages can be long; keep a short version for our own logs only
    logger.warning(
        "gemini_api_error",
        extra={"event": {"status_code": exc.code, "status": exc.status, "detail": _short(exc)}},
    )
    kwargs: dict[str, Any] = {"model": model, "latency_ms": latency_ms, "detail": str(exc.status)}
    if exc.code == 429:
        return LLMRateLimitedError("Gemini rate limit or quota exceeded", **kwargs)
    if exc.code in _RETRYABLE_STATUS_CODES or exc.code >= 500:
        return LLMUnavailableError(f"Gemini returned {exc.code}", **kwargs)
    return LLMRequestRejectedError(f"Gemini rejected the request ({exc.code})", **kwargs)


def _short(exc: errors.APIError) -> str:
    return (exc.message or "")[:200]

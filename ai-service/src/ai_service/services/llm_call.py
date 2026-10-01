"""One LLM call, validated: shared by every feature that asks the model for JSON.

The flow is always the same: call the provider once, reject truncated output,
parse strictly against the feature's Pydantic model, then run the feature's own
check (e.g. "the evidence quote appears in the client text" or "every citation
was actually retrieved"). Anything that fails raises LLMInvalidOutputError.
Every call, successful or not, is logged with its cost.
"""

from collections.abc import Callable
from dataclasses import dataclass

from pydantic import BaseModel, ValidationError

from ai_service.llm.base import LLMError, LLMInvalidOutputError, LLMProvider, LLMRequest
from ai_service.logging_config import get_logger
from ai_service.schemas import CallMeta

logger = get_logger("llm_call")


@dataclass(frozen=True, slots=True)
class CallSpec:
    feature: str
    prompt_version: str
    request: LLMRequest
    # Size of the client text sent, for the log line (never the text itself)
    input_chars: int


class OutputCheckError(Exception):
    """Raised by a feature check when output parses but isn't acceptable."""

    def __init__(self, message: str, detail: str) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail


async def call_validated[OutputT: BaseModel](
    spec: CallSpec,
    output_model: type[OutputT],
    provider: LLMProvider,
    check: Callable[[OutputT], None],
) -> tuple[OutputT, CallMeta]:
    """`check` raises OutputCheckError to reject output that parsed correctly."""
    try:
        response = await provider.generate_json(spec.request)
        meta = CallMeta(
            provider=provider.name,
            model=response.model,
            prompt_version=spec.prompt_version,
            latency_ms=response.latency_ms,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            thinking_tokens=response.usage.thinking_tokens,
        )

        def invalid(message: str, detail: str) -> LLMInvalidOutputError:
            return LLMInvalidOutputError(
                message,
                model=response.model,
                usage=response.usage,
                latency_ms=response.latency_ms,
                detail=detail,
            )

        if response.truncated:
            raise invalid("Model output was cut off at the token limit", "truncated")
        try:
            output = output_model.model_validate_json(response.text)
        except ValidationError as exc:
            # Log which fields failed, never the values (they may echo client text)
            fields = sorted({".".join(map(str, e["loc"])) or "<root>" for e in exc.errors()})
            logger.warning("llm_output_rejected", extra={"event": {"fields": fields}})
            raise invalid("Model output did not match the schema", "schema_invalid") from None
        try:
            check(output)
        except OutputCheckError as failed:
            raise invalid(failed.message, failed.detail) from None
    except LLMError as exc:
        exc.provider = provider.name
        exc.prompt_version = spec.prompt_version
        _log(spec, provider, status=exc.code, error=exc)
        raise

    _log(spec, provider, status="ok", meta=meta)
    return output, meta


def _log(
    spec: CallSpec,
    provider: LLMProvider,
    *,
    status: str,
    meta: CallMeta | None = None,
    error: LLMError | None = None,
) -> None:
    usage = error.usage if error else None
    event = {
        "feature": spec.feature,
        "provider": provider.name,
        "model": meta.model if meta else (error.model if error else None) or provider.model,
        "prompt_version": spec.prompt_version,
        "status": status,
        "detail": error.detail if error else None,
        "latency_ms": meta.latency_ms if meta else (error.latency_ms if error else None),
        "input_tokens": meta.input_tokens if meta else (usage.input_tokens if usage else None),
        "output_tokens": meta.output_tokens if meta else (usage.output_tokens if usage else None),
        "thinking_tokens": (
            meta.thinking_tokens if meta else (usage.thinking_tokens if usage else None)
        ),
        "input_chars": spec.input_chars,
    }
    logger.info("llm_call", extra={"event": event})

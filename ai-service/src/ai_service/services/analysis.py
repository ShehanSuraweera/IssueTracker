"""Issue analysis (triage + sentiment) and comment sentiment.

Each function makes one LLM call and returns only output that passed every
check. Anything else raises an LLMError, which the API turns into an error
response. Nothing invalid is repaired or passed through.
"""

from collections.abc import Callable
from dataclasses import dataclass

from pydantic import BaseModel, ValidationError

from ai_service.config import Settings
from ai_service.llm.base import LLMError, LLMInvalidOutputError, LLMProvider, LLMRequest
from ai_service.llm.schema_export import to_provider_schema
from ai_service.logging_config import get_logger
from ai_service.prompts import analyze as analyze_prompt
from ai_service.prompts import sentiment as sentiment_prompt
from ai_service.safety import is_verbatim_quote, new_boundary, prepare_untrusted
from ai_service.schemas import (
    AnalyzeOutput,
    AnalyzeRequest,
    AnalyzeResponse,
    CallMeta,
    SentimentOutput,
    SentimentRequest,
    SentimentResponse,
)

logger = get_logger("analysis")

_ANALYZE_SCHEMA = to_provider_schema(AnalyzeOutput)
_SENTIMENT_SCHEMA = to_provider_schema(SentimentOutput)


@dataclass(frozen=True, slots=True)
class _Call:
    feature: str
    prompt_version: str
    request: LLMRequest
    # The cleaned client texts the evidence quote must come from
    quote_sources: list[str]
    input_chars: int


async def analyze_issue(
    body: AnalyzeRequest, *, provider: LLMProvider, settings: Settings
) -> AnalyzeResponse:
    boundary = new_boundary()
    title = prepare_untrusted(body.title, settings.max_input_chars)
    description = prepare_untrusted(body.description, settings.max_input_chars)
    call = _Call(
        feature="analyze",
        prompt_version=analyze_prompt.PROMPT_VERSION,
        request=LLMRequest(
            system_instruction=analyze_prompt.SYSTEM_INSTRUCTION,
            user_content=analyze_prompt.build_user_content(
                product_name=body.product.name,
                product_description=body.product.description,
                issue_type=body.issue_type,
                title=title,
                description=description,
                boundary=boundary,
            ),
            response_schema=_ANALYZE_SCHEMA,
            max_output_tokens=analyze_prompt.MAX_OUTPUT_TOKENS,
        ),
        quote_sources=[title, description],
        input_chars=len(title) + len(description),
    )
    output, meta = await _run(call, AnalyzeOutput, provider, lambda o: o.sentiment.evidence_quote)
    return AnalyzeResponse(result=output, meta=meta)


async def analyze_comment_sentiment(
    body: SentimentRequest, *, provider: LLMProvider, settings: Settings
) -> SentimentResponse:
    boundary = new_boundary()
    issue_title = prepare_untrusted(body.issue_title, settings.max_input_chars)
    comment = prepare_untrusted(body.comment, settings.max_input_chars)
    call = _Call(
        feature="sentiment",
        prompt_version=sentiment_prompt.PROMPT_VERSION,
        request=LLMRequest(
            system_instruction=sentiment_prompt.SYSTEM_INSTRUCTION,
            user_content=sentiment_prompt.build_user_content(
                issue_title=issue_title, comment=comment, boundary=boundary
            ),
            response_schema=_SENTIMENT_SCHEMA,
            max_output_tokens=sentiment_prompt.MAX_OUTPUT_TOKENS,
        ),
        # Evidence must come from the comment itself, not the title
        quote_sources=[comment],
        input_chars=len(issue_title) + len(comment),
    )
    output, meta = await _run(call, SentimentOutput, provider, lambda o: o.sentiment.evidence_quote)
    return SentimentResponse(result=output, meta=meta)


async def _run[OutputT: BaseModel](
    call: _Call,
    output_model: type[OutputT],
    provider: LLMProvider,
    get_quote: Callable[[OutputT], str],
) -> tuple[OutputT, CallMeta]:
    try:
        response = await provider.generate_json(call.request)
        meta = CallMeta(
            provider=provider.name,
            model=response.model,
            prompt_version=call.prompt_version,
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
        if not is_verbatim_quote(get_quote(output), call.quote_sources):
            raise invalid("Evidence quote does not appear in the client text", "quote_not_verbatim")
    except LLMError as exc:
        exc.provider = provider.name
        exc.prompt_version = call.prompt_version
        _log_call(call, provider, status=exc.code, error=exc)
        raise

    _log_call(call, provider, status="ok", meta=meta)
    return output, meta


def _log_call(
    call: _Call,
    provider: LLMProvider,
    *,
    status: str,
    meta: CallMeta | None = None,
    error: LLMError | None = None,
) -> None:
    usage = error.usage if error else None
    event = {
        "feature": call.feature,
        "provider": provider.name,
        "model": meta.model if meta else (error.model if error else None) or provider.model,
        "prompt_version": call.prompt_version,
        "status": status,
        "detail": error.detail if error else None,
        "latency_ms": meta.latency_ms if meta else (error.latency_ms if error else None),
        "input_tokens": meta.input_tokens if meta else (usage.input_tokens if usage else None),
        "output_tokens": meta.output_tokens if meta else (usage.output_tokens if usage else None),
        "thinking_tokens": (
            meta.thinking_tokens if meta else (usage.thinking_tokens if usage else None)
        ),
        # Size only; client text itself is never logged
        "input_chars": call.input_chars,
    }
    logger.info("llm_call", extra={"event": event})

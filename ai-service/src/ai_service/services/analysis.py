"""Issue analysis (triage + sentiment) and comment sentiment.

Each function makes one LLM call and returns only output that passed every
check. Anything else raises an LLMError, which the API turns into an error
response. Nothing invalid is repaired or passed through.
"""

from ai_service.config import Settings
from ai_service.llm.base import LLMProvider, LLMRequest
from ai_service.llm.schema_export import to_provider_schema
from ai_service.prompts import analyze as analyze_prompt
from ai_service.prompts import sentiment as sentiment_prompt
from ai_service.safety import is_verbatim_quote, new_boundary, prepare_untrusted
from ai_service.schemas import (
    AnalyzeOutput,
    AnalyzeRequest,
    AnalyzeResponse,
    SentimentOutput,
    SentimentRequest,
    SentimentResponse,
)
from ai_service.services.llm_call import CallSpec, OutputCheckError, call_validated

_ANALYZE_SCHEMA = to_provider_schema(AnalyzeOutput)
_SENTIMENT_SCHEMA = to_provider_schema(SentimentOutput)


def _require_verbatim(quote: str, sources: list[str]) -> None:
    if not is_verbatim_quote(quote, sources):
        raise OutputCheckError(
            "Evidence quote does not appear in the client text", "quote_not_verbatim"
        )


async def analyze_issue(
    body: AnalyzeRequest, *, provider: LLMProvider, settings: Settings
) -> AnalyzeResponse:
    boundary = new_boundary()
    title = prepare_untrusted(body.title, settings.max_input_chars)
    description = prepare_untrusted(body.description, settings.max_input_chars)
    spec = CallSpec(
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
        input_chars=len(title) + len(description),
    )
    output, meta = await call_validated(
        spec,
        AnalyzeOutput,
        provider,
        lambda o: _require_verbatim(o.sentiment.evidence_quote, [title, description]),
    )
    return AnalyzeResponse(result=output, meta=meta)


async def analyze_comment_sentiment(
    body: SentimentRequest, *, provider: LLMProvider, settings: Settings
) -> SentimentResponse:
    boundary = new_boundary()
    issue_title = prepare_untrusted(body.issue_title, settings.max_input_chars)
    comment = prepare_untrusted(body.comment, settings.max_input_chars)
    spec = CallSpec(
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
        input_chars=len(issue_title) + len(comment),
    )
    # Evidence must come from the comment itself, not the title
    output, meta = await call_validated(
        spec,
        SentimentOutput,
        provider,
        lambda o: _require_verbatim(o.sentiment.evidence_quote, [comment]),
    )
    return SentimentResponse(result=output, meta=meta)

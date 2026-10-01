"""Thread summaries. One LLM call; every key point must cite comments that are in the thread."""

from ai_service.config import Settings
from ai_service.llm.base import LLMProvider, LLMRequest
from ai_service.llm.schema_export import to_provider_schema
from ai_service.prompts import summary as summary_prompt
from ai_service.safety import new_boundary, prepare_untrusted
from ai_service.schemas import SummaryOutput, SummaryRequest, SummaryResponse
from ai_service.services.llm_call import CallSpec, OutputCheckError, call_validated

_SUMMARY_SCHEMA = to_provider_schema(SummaryOutput)
# Long threads keep their most recent comments, which describe the current state
MAX_COMMENTS = 40
MAX_COMMENT_CHARS = 1_500


async def summarize_thread(
    body: SummaryRequest, *, provider: LLMProvider, settings: Settings
) -> SummaryResponse:
    ordered = sorted(body.comments, key=lambda c: (c.created_at, c.id))
    included = ordered[-MAX_COMMENTS:]
    omitted = len(ordered) - len(included)

    boundary = new_boundary()
    title = prepare_untrusted(body.title, settings.max_input_chars)
    description = prepare_untrusted(body.description, settings.max_input_chars)
    comments = [
        summary_prompt.PreparedComment(
            comment_id=c.id,
            author=c.author_role,
            internal=c.internal,
            posted_at=c.created_at.isoformat(),
            body=prepare_untrusted(c.body, MAX_COMMENT_CHARS),
        )
        for c in included
    ]
    # Points may cite the comments shown, or the description itself
    citable = {c.id for c in included} | {summary_prompt.DESCRIPTION_ID}

    def check(output: SummaryOutput) -> None:
        for point in output.key_points:
            if not set(point.comment_ids) <= citable:
                raise OutputCheckError(
                    "A key point cites a comment that is not in the thread",
                    "citation_not_in_thread",
                )

    spec = CallSpec(
        feature="summary",
        prompt_version=summary_prompt.PROMPT_VERSION,
        request=LLMRequest(
            system_instruction=summary_prompt.SYSTEM_INSTRUCTION,
            user_content=summary_prompt.build_user_content(
                issue_type=body.issue_type,
                title=title,
                description=description,
                comments=comments,
                omitted=omitted,
                boundary=boundary,
            ),
            response_schema=_SUMMARY_SCHEMA,
            max_output_tokens=summary_prompt.MAX_OUTPUT_TOKENS,
        ),
        input_chars=len(title) + len(description) + sum(len(c.body) for c in comments),
    )
    output, meta = await call_validated(spec, SummaryOutput, provider, check)
    # Drop duplicate citations within each point, keeping the model's order
    output = output.model_copy(
        update={
            "key_points": [
                p.model_copy(update={"comment_ids": list(dict.fromkeys(p.comment_ids))})
                for p in output.key_points
            ]
        }
    )
    return SummaryResponse(
        result=output, meta=meta, comments_included=len(included), comments_omitted=omitted
    )

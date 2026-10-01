"""Indexing resolved issues, finding similar ones, and suggesting a resolution.

What gets embedded is the problem (title + description), so a new issue
matches past issues by symptom. The fix (staff resolution notes) is stored
alongside and given to the model when suggesting a resolution, but it is not
embedded: mixing the fix into the vector would blur matching by symptom.

Every operation is scoped to one company_id, which the backend derives from
the issue's product. The vector store filters on it in SQL.
"""

import hashlib
import time

from ai_service.config import Settings
from ai_service.embeddings import Embedder
from ai_service.llm.base import LLMProvider, LLMRequest
from ai_service.llm.schema_export import to_provider_schema
from ai_service.logging_config import get_logger
from ai_service.prompts import resolution as resolution_prompt
from ai_service.safety import new_boundary, prepare_untrusted
from ai_service.schemas import (
    DocumentRequest,
    DocumentResponse,
    ResolutionOutput,
    ResolutionRequest,
    ResolutionResponse,
    SimilarIssue,
    SimilarRequest,
    SimilarResponse,
)
from ai_service.services.llm_call import CallSpec, OutputCheckError, call_validated
from ai_service.vector_store import IssueDocument, SearchHit, VectorStore

logger = get_logger("retrieval")

_RESOLUTION_SCHEMA = to_provider_schema(ResolutionOutput)
# Embedding models read ~512 tokens; longer text adds nothing but cost
_MAX_EMBED_CHARS = 2_000
# Per past issue, in the resolution prompt
_MAX_PAST_PROBLEM_CHARS = 1_500
_MAX_PAST_RESOLUTION_CHARS = 2_000

NO_HISTORY_SUMMARY = "No similar resolved issues were found for this company."


def embedding_text(title: str, description: str) -> str:
    return f"{title}\n\n{description}"[:_MAX_EMBED_CHARS]


def content_hash(model: str, text: str) -> str:
    return hashlib.sha256(f"{model}\n{text}".encode()).hexdigest()


# ─── Indexing ────────────────────────────────────────────────────────────────


async def index_document(
    issue_id: int, body: DocumentRequest, *, embedder: Embedder, store: VectorStore
) -> DocumentResponse:
    text = embedding_text(body.title, body.problem)
    digest = content_hash(embedder.model, text)
    document = IssueDocument(
        issue_id=issue_id,
        company_id=body.company_id,
        product_id=body.product_id,
        ticket_number=body.ticket_number,
        title=body.title,
        problem=body.problem,
        resolution=body.resolution,
        resolved_at=body.resolved_at,
        embedding_model=embedder.model,
        content_hash=digest,
    )
    unchanged = (
        await store.get_content_hash(company_id=body.company_id, issue_id=issue_id) == digest
    )
    if unchanged:
        # Same embedded text and model: keep the vector, refresh the stored notes
        await store.upsert(document, None)
    else:
        [vector] = await embedder.embed([text])
        await store.upsert(document, vector)
    logger.info(
        "document_indexed",
        extra={
            "event": {
                "issue_id": issue_id,
                "company_id": body.company_id,
                "embedded": not unchanged,
            }
        },
    )
    return DocumentResponse(indexed=True, embedded=not unchanged, embedding_model=embedder.model)


async def delete_document(issue_id: int, *, company_id: int, store: VectorStore) -> bool:
    deleted = await store.delete(company_id=company_id, issue_id=issue_id)
    logger.info(
        "document_deleted",
        extra={"event": {"issue_id": issue_id, "company_id": company_id, "deleted": deleted}},
    )
    return deleted


# ─── Similar issues ──────────────────────────────────────────────────────────


async def search_similar(
    *,
    company_id: int,
    title: str,
    description: str,
    exclude_issue_id: int | None,
    product_ids: list[int] | None,
    limit: int,
    embedder: Embedder,
    store: VectorStore,
    settings: Settings,
) -> list[SearchHit]:
    started = time.perf_counter()
    [vector] = await embedder.embed([embedding_text(title, description)])
    hits = await store.search(
        company_id=company_id,
        embedding=vector,
        limit=limit,
        exclude_issue_id=exclude_issue_id,
        product_ids=product_ids,
    )
    relevant = [hit for hit in hits if hit.similarity >= settings.retrieval_min_similarity]
    logger.info(
        "similarity_search",
        extra={
            "event": {
                "company_id": company_id,
                "candidates": len(hits),
                "results": len(relevant),
                "top_similarity": round(hits[0].similarity, 3) if hits else None,
                "latency_ms": round((time.perf_counter() - started) * 1000),
            }
        },
    )
    return relevant


def _to_similar_issue(hit: SearchHit) -> SimilarIssue:
    return SimilarIssue(
        issue_id=hit.document.issue_id,
        ticket_number=hit.document.ticket_number,
        title=hit.document.title,
        similarity=round(hit.similarity, 4),
    )


async def find_similar(
    body: SimilarRequest, *, embedder: Embedder, store: VectorStore, settings: Settings
) -> SimilarResponse:
    hits = await search_similar(
        company_id=body.company_id,
        title=body.title,
        description=body.description,
        exclude_issue_id=body.exclude_issue_id,
        product_ids=body.product_ids,
        limit=body.limit,
        embedder=embedder,
        store=store,
        settings=settings,
    )
    return SimilarResponse(
        results=[_to_similar_issue(hit) for hit in hits],
        embedding_model=embedder.model,
        min_similarity=settings.retrieval_min_similarity,
    )


# ─── Suggested resolution ────────────────────────────────────────────────────


async def suggest_resolution(
    body: ResolutionRequest,
    *,
    provider: LLMProvider,
    embedder: Embedder,
    store: VectorStore,
    settings: Settings,
) -> ResolutionResponse:
    hits = await search_similar(
        company_id=body.company_id,
        title=body.title,
        description=body.description,
        exclude_issue_id=body.exclude_issue_id,
        product_ids=body.product_ids,
        limit=settings.retrieval_max_results,
        embedder=embedder,
        store=store,
        settings=settings,
    )
    sources = [_to_similar_issue(hit) for hit in hits]
    if not hits:
        # Nothing to ground a suggestion in, so don't spend an LLM call
        return ResolutionResponse(
            result=ResolutionOutput(
                has_relevant_history=False,
                summary=NO_HISTORY_SUMMARY,
                steps=[],
                cited_tickets=[],
                confidence="low",
                manipulation_attempt=False,
            ),
            sources=[],
            meta=None,
        )

    boundary = new_boundary()
    title = prepare_untrusted(body.title, settings.max_input_chars)
    description = prepare_untrusted(body.description, settings.max_input_chars)
    past = [
        resolution_prompt.PastIssue(
            ticket_number=hit.document.ticket_number,
            title=prepare_untrusted(hit.document.title, 200),
            problem=prepare_untrusted(hit.document.problem, _MAX_PAST_PROBLEM_CHARS),
            resolution=prepare_untrusted(hit.document.resolution, _MAX_PAST_RESOLUTION_CHARS),
        )
        for hit in hits
    ]
    retrieved = {hit.document.ticket_number for hit in hits}

    def check(output: ResolutionOutput) -> None:
        # The model may only cite tickets it was actually given
        if not set(output.cited_tickets) <= retrieved:
            raise OutputCheckError(
                "Suggestion cites a ticket that was not retrieved", "citation_not_retrieved"
            )
        if output.has_relevant_history and not (output.steps and output.cited_tickets):
            raise OutputCheckError("Suggestion has no steps or no citations", "inconsistent_output")
        if not output.has_relevant_history and (output.steps or output.cited_tickets):
            raise OutputCheckError(
                "Suggestion without relevant history has steps", "inconsistent_output"
            )

    spec = CallSpec(
        feature="resolution",
        prompt_version=resolution_prompt.PROMPT_VERSION,
        request=LLMRequest(
            system_instruction=resolution_prompt.SYSTEM_INSTRUCTION,
            user_content=resolution_prompt.build_user_content(
                issue_type=body.issue_type,
                title=title,
                description=description,
                past_issues=past,
                boundary=boundary,
            ),
            response_schema=_RESOLUTION_SCHEMA,
            max_output_tokens=resolution_prompt.MAX_OUTPUT_TOKENS,
        ),
        input_chars=len(title) + len(description),
    )
    output, meta = await call_validated(spec, ResolutionOutput, provider, check)
    # Order citations as retrieved and drop duplicates
    output = output.model_copy(
        update={
            "cited_tickets": [
                s.ticket_number for s in sources if s.ticket_number in output.cited_tickets
            ]
        }
    )
    return ResolutionResponse(result=output, sources=sources, meta=meta)

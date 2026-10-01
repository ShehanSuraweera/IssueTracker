from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request

from ai_service import __version__
from ai_service.api.deps import (
    EmbedderDep,
    ProviderDep,
    SettingsDep,
    StoreDep,
    require_service_token,
)
from ai_service.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    DocumentListResponse,
    DocumentRequest,
    DocumentResponse,
    IndexedDocument,
    ResolutionRequest,
    ResolutionResponse,
    SentimentRequest,
    SentimentResponse,
    SimilarRequest,
    SimilarResponse,
    SummaryRequest,
    SummaryResponse,
)
from ai_service.services import retrieval
from ai_service.services.analysis import analyze_comment_sentiment, analyze_issue
from ai_service.services.summary import summarize_thread

IssueId = Annotated[int, Path(gt=0)]
CompanyIdQuery = Annotated[int, Query(gt=0)]

health_router = APIRouter()


@health_router.get("/healthz")
async def healthz(request: Request) -> dict[str, str]:
    """Liveness check. No auth, and nothing sensitive in the response."""
    retrieval_ready = getattr(request.app.state, "store", None) is not None
    return {
        "status": "ok",
        "version": __version__,
        "retrieval": "enabled" if retrieval_ready else "disabled",
    }


v1_router = APIRouter(prefix="/v1", dependencies=[Depends(require_service_token)])


@v1_router.post("/analyze")
async def analyze(
    body: AnalyzeRequest, provider: ProviderDep, settings: SettingsDep
) -> AnalyzeResponse:
    """Triage suggestions and sentiment for a new issue, in one LLM call."""
    return await analyze_issue(body, provider=provider, settings=settings)


@v1_router.post("/sentiment")
async def sentiment(
    body: SentimentRequest, provider: ProviderDep, settings: SettingsDep
) -> SentimentResponse:
    """Sentiment for one client comment on an existing issue."""
    return await analyze_comment_sentiment(body, provider=provider, settings=settings)


# ─── Retrieval ───────────────────────────────────────────────────────────────


@v1_router.put("/documents/{issue_id}")
async def put_document(
    issue_id: IssueId, body: DocumentRequest, embedder: EmbedderDep, store: StoreDep
) -> DocumentResponse:
    """Index (or re-index) a resolved issue. Re-embeds only when its text changed."""
    return await retrieval.index_document(issue_id, body, embedder=embedder, store=store)


@v1_router.delete("/documents/{issue_id}")
async def delete_document(
    issue_id: IssueId, company_id: CompanyIdQuery, store: StoreDep
) -> dict[str, bool]:
    """Remove an issue from the index, e.g. when it is reopened. company_id is required."""
    deleted = await retrieval.delete_document(issue_id, company_id=company_id, store=store)
    return {"deleted": deleted}


@v1_router.get("/documents")
async def list_documents(
    store: StoreDep, company_id: Annotated[int | None, Query(gt=0)] = None
) -> DocumentListResponse:
    """Which issues are indexed, so the backend can reconcile the index with its data."""
    pairs = await store.list_issue_ids(company_id=company_id)
    return DocumentListResponse(
        documents=[IndexedDocument(company_id=c, issue_id=i) for c, i in pairs]
    )


@v1_router.post("/similar")
async def similar(
    body: SimilarRequest, embedder: EmbedderDep, store: StoreDep, settings: SettingsDep
) -> SimilarResponse:
    """Resolved issues from the same company that describe a similar problem."""
    return await retrieval.find_similar(body, embedder=embedder, store=store, settings=settings)


@v1_router.post("/suggest-resolution")
async def suggest_resolution(
    body: ResolutionRequest,
    provider: ProviderDep,
    embedder: EmbedderDep,
    store: StoreDep,
    settings: SettingsDep,
) -> ResolutionResponse:
    """A suggested fix grounded in the same company's past resolutions, with citations."""
    return await retrieval.suggest_resolution(
        body, provider=provider, embedder=embedder, store=store, settings=settings
    )


# ─── Thread summary ──────────────────────────────────────────────────────────


@v1_router.post("/summarize-thread")
async def summarize(
    body: SummaryRequest, provider: ProviderDep, settings: SettingsDep
) -> SummaryResponse:
    """A short summary of an issue's thread; every key point cites its comments."""
    return await summarize_thread(body, provider=provider, settings=settings)

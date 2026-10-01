from fastapi import APIRouter, Depends

from ai_service import __version__
from ai_service.api.deps import ProviderDep, SettingsDep, require_service_token
from ai_service.schemas import AnalyzeRequest, AnalyzeResponse, SentimentRequest, SentimentResponse
from ai_service.services.analysis import analyze_comment_sentiment, analyze_issue

health_router = APIRouter()


@health_router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness check. No auth, and nothing sensitive in the response."""
    return {"status": "ok", "version": __version__}


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

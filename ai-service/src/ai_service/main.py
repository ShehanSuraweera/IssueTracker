"""Application factory.

Run with:  uv run uvicorn ai_service.main:create_app --factory --host 127.0.0.1 --port 8000
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from ai_service import __version__
from ai_service.api.errors import register_error_handlers
from ai_service.api.middleware import request_context
from ai_service.api.routes import health_router, v1_router
from ai_service.config import Settings, get_settings
from ai_service.embeddings import Embedder, FakeEmbedder, FastEmbedder
from ai_service.llm.base import LLMProvider
from ai_service.llm.factory import build_provider
from ai_service.logging_config import configure_logging, get_logger
from ai_service.vector_store import PgVectorStore, VectorStore

logger = get_logger("startup")


def create_app(
    settings: Settings | None = None,
    provider: LLMProvider | None = None,
    *,
    store: VectorStore | None = None,
    embedder: Embedder | None = None,
) -> FastAPI:
    """Tests pass their own components; production builds them from the environment."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    llm_provider = provider or build_provider(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if store is None and settings.ai_database_url is not None:
            await _start_retrieval(app, settings)
        yield
        await llm_provider.aclose()
        if app.state.store is not None:
            await app.state.store.aclose()

    docs = settings.ai_service_docs
    app = FastAPI(
        lifespan=lifespan,
        title="NewnopDesk AI Service",
        version=__version__,
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.state.settings = settings
    app.state.provider = llm_provider
    # Retrieval is optional: absent store/embedder means its endpoints return 503
    app.state.store = store
    app.state.embedder = embedder

    app.middleware("http")(request_context)
    register_error_handlers(app)
    app.include_router(health_router)
    app.include_router(v1_router)
    return app


async def _start_retrieval(app: FastAPI, settings: Settings) -> None:
    """Connect to the vector database and load the embedding model.

    A failure here disables retrieval but keeps the service up: triage and
    sentiment don't depend on it. The model loads now, not on the first
    request, which would otherwise wait for it (tens of seconds on a cold start)."""
    if settings.ai_database_url is None:
        return
    try:
        embedder: Embedder = (
            FakeEmbedder()
            if settings.embedding_provider == "fake"
            else await asyncio.to_thread(
                FastEmbedder, settings.embedding_model, settings.embedding_cache_dir
            )
        )
        store = await PgVectorStore.connect(settings.ai_database_url.get_secret_value())
    except Exception:
        logger.exception("retrieval_disabled: could not start the vector store or embedder")
        return
    app.state.embedder = embedder
    app.state.store = store
    logger.info("retrieval_enabled", extra={"event": {"embedding_model": embedder.model}})

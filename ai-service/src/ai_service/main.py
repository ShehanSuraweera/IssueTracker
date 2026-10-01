"""Application factory.

Run with:  uv run uvicorn ai_service.main:create_app --factory --host 127.0.0.1 --port 8000
"""

from fastapi import FastAPI

from ai_service import __version__
from ai_service.api.errors import register_error_handlers
from ai_service.api.middleware import request_context
from ai_service.api.routes import health_router, v1_router
from ai_service.config import Settings, get_settings
from ai_service.llm.base import LLMProvider
from ai_service.llm.factory import build_provider
from ai_service.logging_config import configure_logging


def create_app(settings: Settings | None = None, provider: LLMProvider | None = None) -> FastAPI:
    """Tests pass their own settings and provider; production reads the environment."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    docs = settings.ai_service_docs
    app = FastAPI(
        title="NewnopDesk AI Service",
        version=__version__,
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.state.settings = settings
    app.state.provider = provider or build_provider(settings)

    app.middleware("http")(request_context)
    register_error_handlers(app)
    app.include_router(health_router)
    app.include_router(v1_router)
    return app

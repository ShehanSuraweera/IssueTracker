import asyncio
import os
import sys
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass, field
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from ai_service.config import Settings
from ai_service.db.bootstrap import bootstrap
from ai_service.db.cli import migrate
from ai_service.main import create_app
from ai_service.vector_store import PgVectorStore
from tests.fakes import ScriptedProvider

if sys.platform == "win32":
    # psycopg's async mode can't use Windows' default ProactorEventLoop.
    # Production runs on Linux, where this doesn't arise.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

TOKEN = "test-service-token-0123456789abcdef"
AUTH = {"Authorization": f"Bearer {TOKEN}"}

_ENV_VARS = (
    "AI_SERVICE_TOKEN",
    "AI_PROVIDER",
    "GEMINI_API_KEY",
    "AI_MODEL",
    "LLM_THINKING_LEVEL",
    "LLM_TEMPERATURE",
    "LLM_TIMEOUT_SECONDS",
    "MAX_INPUT_CHARS",
    "LOG_LEVEL",
    "AI_SERVICE_DOCS",
    "AI_DATABASE_URL",
    "EMBEDDING_PROVIDER",
    "RETRIEVAL_MIN_SIMILARITY",
)


@pytest.fixture(autouse=True)
def _isolated_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep a developer's shell environment out of the tests."""
    for name in _ENV_VARS:
        monkeypatch.delenv(name, raising=False)


def make_settings(**overrides: Any) -> Settings:
    """Settings for tests. _env_file=None stops a local .env from being read."""
    values: dict[str, Any] = {"ai_service_token": TOKEN, "ai_provider": "fake", **overrides}
    return Settings(_env_file=None, **values)


@pytest.fixture
def provider() -> ScriptedProvider:
    return ScriptedProvider()


@pytest.fixture
def client(provider: ScriptedProvider) -> Iterator[TestClient]:
    with TestClient(create_app(make_settings(), provider)) as test_client:
        test_client.headers.update(AUTH)
        yield test_client


# ─── PostgreSQL + pgvector (tests marked `db`) ───────────────────────────────

SERVICE_ROLE = "ai_service"
SERVICE_PASSWORD = "ai-service-test-password"


@dataclass(frozen=True)
class PgUrls:
    admin: str
    service: str
    # The testcontainers container, or None when AI_TEST_DATABASE_URL is used
    container: Any = field(default=None, compare=False)


@pytest.fixture(scope="session")
def pg_urls() -> Iterator[PgUrls]:
    """A throwaway Postgres with pgvector, bootstrapped and migrated like production.

    Set AI_TEST_DATABASE_URL (an admin URL to an empty database) to use an
    existing server instead of starting a container.
    """
    container = None
    admin = os.environ.get("AI_TEST_DATABASE_URL")
    if not admin:
        from testcontainers.community.postgres import PostgresContainer

        container = PostgresContainer(
            "pgvector/pgvector:pg17",
            username="admin",
            password="admin",
            dbname="aitest",
            driver=None,
        )
        container.start()
        # 127.0.0.1, not localhost: libpq tries IPv6 first, and Docker may only
        # publish on IPv4, which turns every connection into a timeout wait
        admin = f"postgresql://admin:admin@127.0.0.1:{container.get_exposed_port(5432)}/aitest"
    host_part = admin.split("@", 1)[1]
    service = f"postgresql://{SERVICE_ROLE}:{SERVICE_PASSWORD}@{host_part}"
    bootstrap(admin, SERVICE_ROLE, SERVICE_PASSWORD)
    migrate(service)
    try:
        yield PgUrls(admin=admin, service=service, container=container)
    finally:
        if container is not None:
            container.stop()


def clear_documents(pg_urls: PgUrls) -> None:
    with psycopg.connect(pg_urls.service, autocommit=True) as conn:
        conn.execute("TRUNCATE ai.issue_documents")


async def open_clean_pg_store(pg_urls: PgUrls) -> PgVectorStore:
    clear_documents(pg_urls)
    return await PgVectorStore.connect(pg_urls.service)


@pytest.fixture
async def pg_store(pg_urls: PgUrls) -> AsyncIterator[PgVectorStore]:
    store = await open_clean_pg_store(pg_urls)
    try:
        yield store
    finally:
        await store.aclose()

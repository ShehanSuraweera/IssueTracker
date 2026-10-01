from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from ai_service.config import Settings
from ai_service.main import create_app
from tests.fakes import ScriptedProvider

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

import pytest
from pydantic import ValidationError

from ai_service.config import Settings
from ai_service.llm.factory import build_provider
from ai_service.llm.fake import FakeProvider
from ai_service.llm.gemini import GeminiProvider
from tests.conftest import make_settings


def test_short_service_token_is_rejected() -> None:
    with pytest.raises(ValidationError, match="at least 32 characters"):
        make_settings(ai_service_token="too-short")


def test_gemini_provider_requires_an_api_key() -> None:
    with pytest.raises(ValidationError, match="GEMINI_API_KEY is required"):
        make_settings(ai_provider="gemini")


def test_secrets_are_hidden_from_repr() -> None:
    settings = make_settings(ai_provider="gemini", gemini_api_key="AIza-real-looking-key")
    assert "AIza-real-looking-key" not in repr(settings)
    assert settings.ai_service_token.get_secret_value() not in repr(settings)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("llm_temperature", 2.5),
        ("llm_timeout_seconds", 0),
        ("llm_timeout_seconds", 500),
        ("max_input_chars", 10),
        ("llm_thinking_level", "maximum"),
        ("ai_provider", "openai"),
    ],
)
def test_out_of_range_values_are_rejected(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        make_settings(**{field: value})


def test_settings_load_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_SERVICE_TOKEN", "e" * 40)
    monkeypatch.setenv("AI_PROVIDER", "fake")
    monkeypatch.setenv("MAX_INPUT_CHARS", "1234")
    monkeypatch.setenv("AI_SERVICE_DOCS", "false")
    settings = Settings(_env_file=None)
    assert settings.max_input_chars == 1234
    assert settings.ai_service_docs is False


def test_factory_builds_the_configured_provider() -> None:
    assert isinstance(build_provider(make_settings(ai_provider="fake")), FakeProvider)
    gemini = build_provider(
        make_settings(ai_provider="gemini", gemini_api_key="k", ai_model="gemini-x")
    )
    assert isinstance(gemini, GeminiProvider)
    assert gemini.model == "gemini-x"

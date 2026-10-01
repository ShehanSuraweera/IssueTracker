"""Builds the provider selected by AI_PROVIDER."""

from ai_service.config import Settings
from ai_service.llm.base import LLMProvider
from ai_service.llm.fake import FakeProvider
from ai_service.llm.gemini import GeminiProvider


def build_provider(settings: Settings) -> LLMProvider:
    if settings.ai_provider == "fake":
        return FakeProvider()
    if settings.gemini_api_key is None:  # Settings validation already prevents this
        raise RuntimeError("GEMINI_API_KEY is required when AI_PROVIDER=gemini")
    return GeminiProvider(
        api_key=settings.gemini_api_key.get_secret_value(),
        model=settings.ai_model,
        timeout_seconds=settings.llm_timeout_seconds,
        thinking_level=settings.llm_thinking_level,
        temperature=settings.llm_temperature,
    )

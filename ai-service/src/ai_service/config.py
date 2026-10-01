"""Service configuration, loaded from environment variables (or a local .env file)."""

from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ThinkingLevel = Literal["minimal", "low", "medium", "high"]

MIN_TOKEN_LENGTH = 32


class Settings(BaseSettings):
    """Validated at startup: the service refuses to start with a bad configuration."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ai_service_token: SecretStr
    ai_provider: Literal["gemini", "fake"] = "gemini"
    gemini_api_key: SecretStr | None = None
    ai_model: str = "gemini-3.5-flash-lite"
    llm_thinking_level: ThinkingLevel | None = "minimal"
    llm_temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    llm_timeout_seconds: float = Field(default=20.0, gt=0.0, le=120.0)
    max_input_chars: int = Field(default=8000, ge=500, le=50_000)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # ─── Retrieval (similar issues, suggested resolutions) ───────────────
    # Connection as the restricted ai_service role. Retrieval endpoints are
    # disabled when unset; triage and sentiment still work.
    ai_database_url: SecretStr | None = None
    embedding_provider: Literal["fastembed", "fake"] = "fastembed"
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    # Where fastembed keeps the downloaded model. Default: its own temp folder.
    embedding_cache_dir: str | None = None
    # Cosine similarity a past issue needs to count as similar. bge-small
    # scores the same problem around 0.85 and unrelated ones below 0.65.
    retrieval_min_similarity: float = Field(default=0.70, ge=0.0, le=1.0)
    retrieval_max_results: int = Field(default=5, ge=1, le=10)
    ai_service_docs: bool = False

    @field_validator("ai_service_token")
    @classmethod
    def _token_is_long_enough(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < MIN_TOKEN_LENGTH:
            raise ValueError(f"must be at least {MIN_TOKEN_LENGTH} characters")
        return value

    @model_validator(mode="after")
    def _gemini_needs_a_key(self) -> Self:
        if self.ai_provider == "gemini" and not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is required when AI_PROVIDER=gemini")
        return self


@lru_cache
def get_settings() -> Settings:
    # Required values come from the environment
    return Settings()

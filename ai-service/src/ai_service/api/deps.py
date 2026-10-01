"""FastAPI dependencies: settings and provider live on app.state, set by create_app()."""

import hmac
from typing import Annotated

from fastapi import Depends, Request

from ai_service.config import Settings
from ai_service.llm.base import LLMProvider


class ServiceAuthError(Exception):
    """Missing or wrong service token."""


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_provider_dep(request: Request) -> LLMProvider:
    provider: LLMProvider = request.app.state.provider
    return provider


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
ProviderDep = Annotated[LLMProvider, Depends(get_provider_dep)]


async def require_service_token(request: Request, settings: SettingsDep) -> None:
    """Only the Node backend holds the token. Compared in constant time, so response
    timing reveals nothing about how much of a guessed token was right."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    expected = settings.ai_service_token.get_secret_value()
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.encode(), expected.encode()):
        raise ServiceAuthError

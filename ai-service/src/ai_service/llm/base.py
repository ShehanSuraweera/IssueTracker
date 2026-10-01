"""The provider interface and the errors every provider maps its failures to.

The rest of the service depends only on this module, never on a vendor SDK.
Adding a provider means one new class implementing LLMProvider.
"""

from dataclasses import dataclass
from typing import Any, ClassVar, Protocol


@dataclass(frozen=True, slots=True)
class LLMUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    thinking_tokens: int | None = None


@dataclass(frozen=True, slots=True)
class LLMRequest:
    system_instruction: str
    user_content: str
    # JSON Schema the provider should constrain the output to
    response_schema: dict[str, Any]
    max_output_tokens: int


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """Raw model output. The service layer validates it, the same way for every provider."""

    text: str
    model: str
    usage: LLMUsage
    latency_ms: int
    truncated: bool = False


class LLMProvider(Protocol):
    name: str
    model: str

    async def generate_json(self, request: LLMRequest) -> LLMResponse:
        """Make exactly one call. Raise an LLMError subclass on failure; never retry."""
        ...

    async def aclose(self) -> None:
        """Release network resources. Called once, on application shutdown."""
        ...


class LLMError(Exception):
    """Base class. `retryable` tells the caller whether trying again might succeed."""

    code: ClassVar[str] = "LLM_ERROR"
    status_code: ClassVar[int] = 502
    retryable: ClassVar[bool] = False

    def __init__(
        self,
        message: str,
        *,
        model: str | None = None,
        usage: LLMUsage | None = None,
        latency_ms: int | None = None,
        detail: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.model = model
        self.usage = usage
        self.latency_ms = latency_ms
        # Short machine-readable reason, e.g. "quote_not_verbatim"
        self.detail = detail
        # Filled in by the service layer so the error response can report them
        self.provider: str | None = None
        self.prompt_version: str | None = None


class LLMTimeoutError(LLMError):
    code = "LLM_TIMEOUT"
    status_code = 504
    retryable = True


class LLMRateLimitedError(LLMError):
    code = "LLM_RATE_LIMITED"
    status_code = 503
    retryable = True


class LLMUnavailableError(LLMError):
    """The provider failed or couldn't be reached (5xx, network error)."""

    code = "LLM_UNAVAILABLE"
    status_code = 503
    retryable = True


class LLMBlockedError(LLMError):
    """The provider refused to answer, e.g. a safety filter. Retrying won't help."""

    code = "LLM_BLOCKED"
    status_code = 422
    retryable = False


class LLMRequestRejectedError(LLMError):
    """The provider rejected the request itself (bad key, unknown model, invalid schema)."""

    code = "LLM_REQUEST_REJECTED"
    status_code = 502
    retryable = False


class LLMInvalidOutputError(LLMError):
    """The model answered, but the answer failed validation and was discarded.

    Retryable: model output varies, so a second attempt may be valid.
    """

    code = "LLM_INVALID_OUTPUT"
    status_code = 502
    retryable = True

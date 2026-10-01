"""Request ID propagation and a last-resort error handler."""

import re
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse

from ai_service.api.errors import error_body
from ai_service.logging_config import get_logger, request_id_var

logger = get_logger("http")

REQUEST_ID_HEADER = "X-Request-ID"
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")


async def request_context(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Reuse the caller's request ID, so one ID follows a request from the browser
    through Node to this service and into every log line. Untrusted IDs that
    could inject odd characters into logs are replaced."""
    incoming = request.headers.get(REQUEST_ID_HEADER, "")
    request_id = incoming if _VALID_REQUEST_ID.fullmatch(incoming) else uuid.uuid4().hex
    token = request_id_var.set(request_id)
    try:
        response = await call_next(request)
    except Exception:
        # Handled here, while the request ID is still set, so the log line has it
        logger.exception("unhandled_error")
        response = JSONResponse(
            status_code=500,
            # Possibly transient; the caller's attempt limit bounds the retries
            content=error_body("INTERNAL_ERROR", "Unexpected server error", retryable=True),
        )
    finally:
        request_id_var.reset(token)
    response.headers[REQUEST_ID_HEADER] = request_id
    return response

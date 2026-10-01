"""Error responses. Every error uses one envelope:

    {"error": {"code": "...", "message": "...", "retryable": bool}, "meta": {...}}

`meta` is present when an LLM call happened, because a failed call can still
cost tokens. Error bodies never include request values, which may be client text.
"""

from typing import Any

import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg_pool import PoolTimeout

from ai_service.api.deps import RetrievalUnavailableError, ServiceAuthError
from ai_service.llm.base import LLMError


def error_body(code: str, message: str, *, retryable: bool = False) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "retryable": retryable}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ServiceAuthError)
    async def _auth(_: Request, __: ServiceAuthError) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content=error_body("UNAUTHORIZED", "Missing or invalid service token"),
            headers={"WWW-Authenticate": "Bearer"},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # FastAPI's default response echoes the rejected input. Report only
        # which fields failed and why.
        fields = {
            ".".join(str(part) for part in error["loc"][1:]) or "<body>": error["msg"]
            for error in exc.errors()
        }
        body = error_body("VALIDATION_FAILED", "Request validation failed")
        body["error"]["fields"] = fields
        return JSONResponse(status_code=422, content=body)

    @app.exception_handler(RetrievalUnavailableError)
    async def _retrieval_off(_: Request, __: RetrievalUnavailableError) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content=error_body("RETRIEVAL_UNAVAILABLE", "Similar-issue search is not available"),
        )

    @app.exception_handler(psycopg.OperationalError)
    @app.exception_handler(PoolTimeout)
    async def _database_down(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content=error_body(
                "RETRIEVAL_DATABASE_UNAVAILABLE",
                "The vector database is unreachable",
                retryable=True,
            ),
        )

    @app.exception_handler(LLMError)
    async def _llm(_: Request, exc: LLMError) -> JSONResponse:
        body = error_body(exc.code, exc.message, retryable=exc.retryable)
        if exc.detail:
            body["error"]["detail"] = exc.detail
        if exc.latency_ms is not None:
            usage = exc.usage
            body["meta"] = {
                "provider": exc.provider,
                "model": exc.model,
                "prompt_version": exc.prompt_version,
                "latency_ms": exc.latency_ms,
                "input_tokens": usage.input_tokens if usage else None,
                "output_tokens": usage.output_tokens if usage else None,
                "thinking_tokens": usage.thinking_tokens if usage else None,
            }
        return JSONResponse(status_code=exc.status_code, content=body)

"""Application error hierarchy and FastAPI exception handlers.

All error responses share a uniform envelope::

    {"error": {"code": str, "message": str, "detail": any | null}}
"""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Base class for application errors that map to a JSON error envelope."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "internal_error"

    def __init__(self, message: str, detail: Any = None) -> None:
        self.message = message
        self.detail = detail
        super().__init__(message)


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class BadRequestError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "bad_request"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


class UpstreamError(AppError):
    """Raised when a dependency (e.g. the config store) fails or is unreachable."""

    status_code = status.HTTP_502_BAD_GATEWAY
    code = "upstream_error"


class InternalError(AppError):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    code = "internal_error"


def _envelope(code: str, message: str, detail: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "detail": detail}}


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_envelope(exc.code, exc.message, exc.detail),
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "not_found" if exc.status_code == status.HTTP_404_NOT_FOUND else "http_error"
    message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=_envelope(code, message),
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_envelope("validation_error", "Request validation failed", exc.errors()),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_envelope("internal_error", "An unexpected error occurred"),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Wire up uniform JSON error handling for the given FastAPI app."""
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

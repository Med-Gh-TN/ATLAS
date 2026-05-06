from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AtlasAPIException(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        field: str | None = None,
        status_code: int = 400,
    ) -> None:
        self.code = code
        self.message = message
        self.field = field
        self.status_code = status_code
        super().__init__(message)


def atlas_error(
    code: str,
    message: str,
    *,
    field: str | None = None,
    status_code: int = 400,
) -> AtlasAPIException:
    return AtlasAPIException(
        code=code,
        message=message,
        field=field,
        status_code=status_code,
    )


def render_error_payload(exc: AtlasAPIException) -> dict[str, Any]:
    return {
        "error": {
            "code": exc.code,
            "message": exc.message,
            "field": exc.field,
        }
    }


from fastapi.exceptions import HTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException

def install_exception_handlers(app: FastAPI) -> None:
    # Define CORS headers for error responses
    cors_headers = {
        "Access-Control-Allow-Origin": "http://localhost:3000",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    }

    @app.exception_handler(AtlasAPIException)
    async def handle_atlas_exception(
        _request: Request,
        exc: AtlasAPIException,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=render_error_payload(exc),
            headers=cors_headers,
        )

    @app.exception_handler(StarletteHTTPException)
    @app.exception_handler(HTTPException)
    async def handle_http_exception(
        _request: Request,
        exc: HTTPException | StarletteHTTPException,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": f"HTTP_{exc.status_code}", "message": exc.detail}},
            headers=cors_headers,
        )

    @app.exception_handler(Exception)
    async def handle_generic_exception(
        _request: Request,
        exc: Exception,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL_ERROR", "message": str(exc)}},
            headers=cors_headers,
        )


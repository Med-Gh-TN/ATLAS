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


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AtlasAPIException)
    async def handle_atlas_exception(
        _request: Request,
        exc: AtlasAPIException,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=render_error_payload(exc),
        )

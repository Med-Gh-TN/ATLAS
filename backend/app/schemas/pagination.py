from __future__ import annotations

from typing import Any, Sequence

from pydantic import BaseModel


class PageMeta(BaseModel):
    total: int
    limit: int
    offset: int
    has_more: bool


def build_paginated_response(
    items: Sequence[Any],
    *,
    total: int,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    return {
        "items": list(items),
        "meta": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(items) < total,
        },
    }

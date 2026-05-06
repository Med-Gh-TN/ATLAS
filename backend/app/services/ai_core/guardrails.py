from __future__ import annotations

import re

from app.core.exceptions import atlas_error


MAX_RAG_QUERY_LENGTH = 1000

BLOCKED_PATTERNS = (
    r"ignore\s+(previous|above|all)\s+instructions",
    r"you\s+are\s+now",
    r"pretend\s+(you\s+are|to\s+be)",
    r"(drop|delete|truncate|insert|update)\s+(table|database|from)",
    r"<script",
    r"javascript:",
    r"system\s*\(",
)


def sanitize_rag_query(query: str) -> str:
    cleaned = query.strip()
    if not cleaned:
        raise atlas_error(
            "RAG_002",
            "Message content cannot be empty.",
            field="content",
            status_code=400,
        )

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, cleaned, re.IGNORECASE):
            raise atlas_error(
                "RAG_003",
                "Message contains blocked or unsafe instructions.",
                field="content",
                status_code=400,
            )

    return cleaned[:MAX_RAG_QUERY_LENGTH]

"""
@file backend/app/infrastructure/meilisearch_client.py
@description Meilisearch client singleton and indexing helpers for ATLAS.
@layer Core Logic
@dependencies meilisearch, app.core.config
"""

from __future__ import annotations

import logging
from typing import Any

import meilisearch
from meilisearch.errors import MeilisearchApiError

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: meilisearch.Client | None = None

COURSE_INDEX_NAME = "courses"
DOCUMENT_INDEX_NAME = "documents"


def get_client() -> meilisearch.Client:
    global _client
    if _client is None:
        _client = meilisearch.Client(
            settings.MEILISEARCH_URL,
            settings.MEILISEARCH_API_KEY,
        )
    return _client


def _ensure_index(uid: str, primary_key: str = "id") -> None:
    client = get_client()
    try:
        client.get_index(uid)
    except MeilisearchApiError as e:
        if e.code == "index_not_found":
            client.create_index(uid, {"primaryKey": primary_key})
            logger.info("Created Meilisearch index '%s'", uid)
        else:
            raise


def index_course(course: dict[str, Any]) -> None:
    client = get_client()
    _ensure_index(COURSE_INDEX_NAME, "id")
    idx = client.index(COURSE_INDEX_NAME)
    idx.add_documents([course])


def index_courses_batch(courses: list[dict[str, Any]]) -> None:
    if not courses:
        return
    client = get_client()
    _ensure_index(COURSE_INDEX_NAME, "id")
    idx = client.index(COURSE_INDEX_NAME)
    idx.add_documents(courses)


def delete_course_from_index(course_id: str) -> None:
    client = get_client()
    try:
        idx = client.index(COURSE_INDEX_NAME)
        idx.delete_document(course_id)
    except MeilisearchApiError as e:
        logger.error("Failed to delete course %s from Meilisearch: %s", course_id, e)


def search_courses(
    query: str,
    limit: int = 20,
    offset: int = 0,
    filters: str | None = None,
    sort: list[str] | None = None,
) -> dict[str, Any]:
    client = get_client()
    _ensure_index(COURSE_INDEX_NAME, "id")
    idx = client.index(COURSE_INDEX_NAME)
    params: dict[str, Any] = {
        "limit": limit,
        "offset": offset,
    }
    if filters:
        params["filter"] = filters
    if sort:
        params["sort"] = sort
    return idx.search(query, params)


def reset_index(index_name: str) -> None:
    client = get_client()
    try:
        idx = client.index(index_name)
        idx.delete_all_documents()
        logger.info("Reset Meilisearch index '%s'", index_name)
    except MeilisearchApiError as e:
        logger.error("Failed to reset index '%s': %s", index_name, e)
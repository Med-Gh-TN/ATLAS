"""
@file backend/app/tasks/meilisearch_sync.py
@description Background task to sync Course metadata to Meilisearch.
@layer State Persistence / Side Effect
@dependencies app.infrastructure.meilisearch_client, app.db.session, app.models
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.meilisearch_client import (
    index_courses_batch,
    index_course,
    delete_course_from_index,
    reset_index,
    COURSE_INDEX_NAME,
)
from app.models.course import Course
from app.models.user import Department

logger = logging.getLogger(__name__)


def _serialize_course_for_index(course: Course, department_name: str | None) -> dict[str, Any]:
    """
    Convert a Course ORM object into a flat dict suitable for Meilisearch.
    Only fields that are searchable/filterable should be included.
    """
    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description or "",
        "level": course.level.value if hasattr(course.level, "value") else str(course.level) if course.level else "",
        "academic_year": course.academic_year or "",
        "tags": course.tags or [],
        "department_name": department_name or "",
        "major_id": str(course.major_id) if course.major_id else "",
        "filiere": course.filiere or "",
        "is_deleted": course.is_deleted,
        "created_at": course.created_at.isoformat() if course.created_at else "",
    }


async def sync_all_courses_to_meilisearch(db: AsyncSession) -> int:
    """
    Full re-index: fetch all courses (including soft-deleted, so we can filter later)
    and push them to Meilisearch in batches.
    Returns the number of courses indexed.
    """
    result = await db.execute(
        select(Course, Department.name.label("department_name"))
        .outerjoin(Department, Department.id == Course.department_id)
        .order_by(Course.created_at.desc())
    )
    rows = result.all()

    documents = [
        _serialize_course_for_index(course, dept_name)
        for course, dept_name in rows
    ]

    # Reset the index for a clean slate; then add all.
    reset_index(COURSE_INDEX_NAME)
    if documents:
        index_courses_batch(documents)
        logger.info("Indexed %d courses to Meilisearch.", len(documents))
    else:
        logger.warning("No courses found to index.")

    return len(documents)


async def sync_course_to_index(course_id: UUID, db: AsyncSession) -> None:
    """
    Index or update a single course (e.g. after creation/update).
    """
    result = await db.execute(
        select(Course, Department.name.label("department_name"))
        .outerjoin(Department, Department.id == Course.department_id)
        .where(Course.id == course_id)
    )
    row = result.first()
    if row is None:
        logger.error("Course %s not found for Meilisearch indexing.", course_id)
        return

    course, dept_name = row
    doc = _serialize_course_for_index(course, dept_name)
    index_course(doc)
    logger.info("Course %s synced to Meilisearch.", course_id)


async def remove_course_from_index(course_id: UUID) -> None:
    """
    Remove a course from the index (e.g. after deletion).
    """
    delete_course_from_index(str(course_id))
    logger.info("Course %s removed from Meilisearch.", course_id)
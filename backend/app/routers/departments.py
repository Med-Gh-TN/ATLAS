"""
@file backend/app/routers/departments.py
@description Department and Major endpoints.
@layer Core Logic
@dependencies app.models, app.db.session, app.dependencies
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.user import User
from app.models.major import Major

router = APIRouter(tags=["Departments"])


@router.get("/departments/{department_id}/majors")
async def get_majors_for_department(
    department_id: UUID,
    level: str | None = Query(None, description="Filter by level (L1, L2, …)"),
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(get_current_user),
) -> list[dict]:
    query = select(Major).where(Major.department_id == department_id)
    if level:
        query = query.where(Major.level == level)

    result = await db.execute(query.order_by(Major.level, Major.name))
    majors = result.scalars().all()

    return [
        {
            "id": str(m.id),
            "name": m.name,
            "department_id": str(m.department_id),
            "level": m.level.value if hasattr(m.level, "value") else str(m.level),
        }
        for m in majors
    ]
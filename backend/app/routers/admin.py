from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.dependencies import require_role
from app.models.user import User


router = APIRouter(tags=["Admin"])


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None


@router.post("/admin/teachers/import")
async def import_teachers(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> Any:
    from app.services.iam.teacher_service import process_teacher_batch_import

    return await process_teacher_batch_import(file=file, admin_user=current_user, session=db)


@router.get("/admin/users")
async def list_users(
    _current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    result = await db.execute(select(User).order_by(desc(User.created_at)))
    users = result.scalars().all()
    return [
        {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "created_at": user.created_at,
        }
        for user in users
    ]


@router.patch("/admin/users/{user_id}")
async def update_user(
    user_id: UUID,
    payload: UserUpdateRequest,
    _current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await db.get(User, user_id)
    if user is None:
        raise atlas_error("USER_001", "User not found.", status_code=404)

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role is not None and payload.role in {"STUDENT", "TEACHER", "ADMIN"}:
        user.role = payload.role

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
    }

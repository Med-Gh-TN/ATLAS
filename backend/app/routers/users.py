from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.user import User


router = APIRouter(tags=["Users"])


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    filiere: str | None = None
    onboarding_completed: bool | None = None


@router.patch("/users/me")
async def update_me(
    payload: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.filiere is not None:
        current_user.filiere = payload.filiere
    if payload.onboarding_completed is not None:
        current_user.onboarding_completed = payload.onboarding_completed

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "filiere": current_user.filiere,
        "role": current_user.role,
        "onboarding_completed": current_user.onboarding_completed,
    }

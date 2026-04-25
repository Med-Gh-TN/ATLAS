from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_session
from app.dependencies import get_current_user, require_role
from app.models.user import Establishment, User

router = APIRouter(tags=["Superadmin"])

@router.get("/superadmin/establishments")
async def list_establishments(
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(require_role("SUPERADMIN", "ADMIN")),
) -> list[dict[str, Any]]:
    result = await db.execute(select(Establishment).order_by(Establishment.created_at.desc()))
    establishments = result.scalars().all()

    payload = []
    for est in establishments:
        payload.append({
            "id": str(est.id),
            "name": est.name,
            "domain": est.domain,
            "created_at": est.created_at,
            # we provide some mock fallback for the frontend UI which expects these, or just 0
            "users": 0,
            "students": 0,
            "teachers": 0,
            "admins": 0,
            "status": "active",
            "health": 100,
            "code": est.domain.split(".")[0].upper() if est.domain else "EST",
            "region": "Tunisia", # Fallback
            "city": "Tunis", # Fallback
        })
    return payload

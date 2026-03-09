from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import get_session
from app.models.all_models import Contribution, ContributionStatus, User, UserRole
from app.core.rbac import require_roles

router = APIRouter()

def _require_role(user: User, roles: list[str]):
    if user.role not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

@router.post("/contributions/{contribution_id}/approve")
async def approve(contribution_id: str, current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.TEACHER)), session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Contribution).where(Contribution.id == contribution_id))
    c = result.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    c.status = ContributionStatus.APPROVED
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c

@router.post("/contributions/{contribution_id}/reject")
async def reject(contribution_id: str, current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.TEACHER)), session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Contribution).where(Contribution.id == contribution_id))
    c = result.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    c.status = ContributionStatus.REJECTED
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c

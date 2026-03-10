from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import get_session
from app.models.new.user import User, UserRole
from app.models.new.contribution import Contribution, ContributionStatus
from app.models.new.gamification import XPTransaction, XPTransactionType
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
    
    if c.status == ContributionStatus.APPROVED:
        return c

    c.status = ContributionStatus.APPROVED
    session.add(c)

    # Award +50 XP to the uploader
    xp = XPTransaction(
        user_id=c.uploader_id,
        amount=50,
        transaction_type=XPTransactionType.APPROVAL,
        description=f"Approval of contribution: {c.title}"
    )
    session.add(xp)

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

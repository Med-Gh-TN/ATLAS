import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel

from app.db.session import get_session
from app.models.all_models import (
    User, 
    UserRole, 
    Contribution, 
    ContributionStatus, 
    ContributionRead,
    DocumentVersion,
    XPTransaction, 
    XPTransactionType
)
from app.core.rbac import require_roles
from app.services.email_service import send_contribution_status_email

logger = logging.getLogger(__name__)

router = APIRouter()

class ReviewContributionRequest(BaseModel):
    """Payload for US-11 Admin Moderation actions."""
    status: ContributionStatus
    rejection_reason: Optional[str] = None


@router.patch("/admin/contributions/{contribution_id}", response_model=ContributionRead)
async def review_contribution(
    contribution_id: str,
    payload: ReviewContributionRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.TEACHER)),
    session: AsyncSession = Depends(get_session)
):
    """
    US-11: Centralized state machine for contribution approvals/rejections.
    Handles atomic XP crediting, mandatory rejection reasons, soft-deletions,
    and asynchronous side-effects (Email/In-App notifications).
    """
    # 1. Fetch the Contribution
    result = await session.execute(select(Contribution).where(Contribution.id == contribution_id))
    c = result.scalars().first()
    
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contribution not found.")

    # Idempotency check
    if c.status == payload.status:
        return c

    # 2. State Machine Validation
    if payload.status in [ContributionStatus.REJECTED, ContributionStatus.REVISION_REQUESTED]:
        if not payload.rejection_reason or not payload.rejection_reason.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A 'rejection_reason' is strictly required when rejecting or requesting a revision."
            )
        c.rejection_reason = payload.rejection_reason.strip()
    
    # 3. Handle APPROVED State & Gamification
    if payload.status == ContributionStatus.APPROVED:
        c.rejection_reason = None  # Clear any previous rejection reasons
        c.status = ContributionStatus.APPROVED
        session.add(c)

        # DEFENSIVE ARCHITECTURE: Read-before-write to prevent duplicate XP exploitation
        existing_xp = await session.execute(
            select(XPTransaction).where(
                XPTransaction.reference_id == c.id,
                XPTransaction.transaction_type == XPTransactionType.APPROVAL
            )
        )
        if not existing_xp.scalars().first():
            # Gamification: Grant +50 XP securely linked to this contribution
            xp = XPTransaction(
                user_id=c.uploader_id,
                amount=50,
                transaction_type=XPTransactionType.APPROVAL,
                reference_id=c.id,
                description=f"Approval of contribution: {c.title}"
            )
            session.add(xp)
        
        # If the document was previously soft-deleted, restore it
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.contribution_id == c.id)
            .values(is_deleted=False)
        )

    # 4. Handle REJECTED State & Soft-Deletion
    elif payload.status == ContributionStatus.REJECTED:
        c.status = ContributionStatus.REJECTED
        session.add(c)
        
        # Soft-delete associated DocumentVersions so they disappear from search
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.contribution_id == c.id)
            .values(is_deleted=True)
        )

    # 5. Handle REVISION_REQUESTED State
    elif payload.status == ContributionStatus.REVISION_REQUESTED:
        c.status = ContributionStatus.REVISION_REQUESTED
        session.add(c)
        
        # Ensure the document remains hidden from search while under revision
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.contribution_id == c.id)
            .values(is_deleted=True)
        )

    # 6. Atomic Commit with Race Condition Protection
    try:
        await session.commit()
        await session.refresh(c)
        
        # 7. Side-Effects Dispatch (US-11 Notifications)
        # Fetch the uploader's email to target the notification
        uploader_query = await session.execute(select(User).where(User.id == c.uploader_id))
        uploader = uploader_query.scalars().first()
        
        if uploader and getattr(uploader, "email", None):
            # Extract the raw string value from the Enum for the email template logic
            status_str = payload.status.value if hasattr(payload.status, 'value') else str(payload.status)
            
            # Queue the SMTP email dispatch on the background thread
            background_tasks.add_task(
                send_contribution_status_email,
                to_email=uploader.email,
                title=c.title,
                status=status_str,
                reason=payload.rejection_reason
            )
            logger.info(f"Queued background status notification email to {uploader.email}")
            
            # Architecture Stub: In-App Notification (WebSocket/DB) would be injected here
            # e.g., background_tasks.add_task(create_in_app_notification, uploader.id, c.id, status_str)
        
        logger.info(f"Contribution {c.id} transitioned to {payload.status} by {current_user.email}")
        return c
        
    except IntegrityError as e:
        await session.rollback()
        logger.warning(f"Prevented duplicate XP exploit or race condition on contribution {c.id}: {str(e)}")
        await session.refresh(c)
        return c
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to update contribution status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while updating the contribution."
        )

# ==========================================
# Legacy Endpoints (Maintained for backwards compatibility during frontend refactoring)
# ==========================================

@router.post("/contributions/{contribution_id}/approve", deprecated=True)
async def approve_legacy(
    contribution_id: str, 
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.TEACHER)), 
    session: AsyncSession = Depends(get_session)
):
    """Legacy endpoint. Use PATCH /admin/contributions/{id} instead."""
    payload = ReviewContributionRequest(status=ContributionStatus.APPROVED)
    return await review_contribution(contribution_id, payload, background_tasks, current_user, session)

@router.post("/contributions/{contribution_id}/reject", deprecated=True)
async def reject_legacy(
    contribution_id: str, 
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.TEACHER)), 
    session: AsyncSession = Depends(get_session)
):
    """Legacy endpoint. Use PATCH /admin/contributions/{id} instead."""
    # Force a generic reason since the legacy endpoint didn't require one
    payload = ReviewContributionRequest(
        status=ContributionStatus.REJECTED, 
        rejection_reason="Rejected via legacy admin panel without specific feedback."
    )
    return await review_contribution(contribution_id, payload, background_tasks, current_user, session)
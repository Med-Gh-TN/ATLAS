import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.session import get_session
from app.models.all_models import (
    User,
    UserRole,
    ContributionStatus,
    ContributionRead
)
from app.core.rbac import require_roles

# DEFENSIVE ARCHITECTURE: All business logic and side-effects are delegated to the domain layer.
# You must implement this service to handle Meilisearch syncing, XP granting, and Notifications.
try:
    from app.services.doc_processing.moderation_service import execute_contribution_review
except ImportError:
    # Fallback/stub for development until the service layer is fully implemented
    async def execute_contribution_review(*args, **kwargs):
        raise NotImplementedError("Service layer execute_contribution_review is not yet implemented.")

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
    Endpoint acts strictly as a traffic controller and RBAC enforcer.
    """
    logger.info(
        f"Moderation action initiated | Admin: {current_user.email} | "
        f"Target Contribution: {contribution_id} | Proposed Status: {payload.status}"
    )

    try:
        # Delegate atomic operations, gamification, and side-effects to the service layer
        result = await execute_contribution_review(
            contribution_id=contribution_id,
            status=payload.status,
            rejection_reason=payload.rejection_reason,
            admin_user=current_user,
            session=session,
            background_tasks=background_tasks
        )
        return result

    except ValueError as ve:
        # Catch explicit domain-level validation errors (e.g., missing rejection reason)
        logger.warning(f"Moderation validation failed: {str(ve)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Moderation service failure for {contribution_id}: {str(e)}", exc_info=True)
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
    return await review_contribution(
        contribution_id=contribution_id,
        payload=payload,
        background_tasks=background_tasks,
        current_user=current_user,
        session=session
    )

@router.post("/contributions/{contribution_id}/reject", deprecated=True)
async def reject_legacy(
    contribution_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.TEACHER)),
    session: AsyncSession = Depends(get_session)
):
    """Legacy endpoint. Use PATCH /admin/contributions/{id} instead."""
    payload = ReviewContributionRequest(
        status=ContributionStatus.REJECTED,
        rejection_reason="Rejected via legacy admin panel without specific feedback."
    )
    return await review_contribution(
        contribution_id=contribution_id,
        payload=payload,
        background_tasks=background_tasks,
        current_user=current_user,
        session=session
    )
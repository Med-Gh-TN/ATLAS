import os
import logging
from typing import Optional
import meilisearch
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
    XPTransactionType,
    Notification
)
from app.core.rbac import require_roles
from app.services.email_service import send_contribution_status_email
from app.api.v1.endpoints.notifications import manager

logger = logging.getLogger(__name__)

router = APIRouter()

class ReviewContributionRequest(BaseModel):
    """Payload for US-11 Admin Moderation actions."""
    status: ContributionStatus
    rejection_reason: Optional[str] = None


# --- US-09: MEILISEARCH SIDE-EFFECTS ---
def _sync_to_meilisearch(doc_payload: dict):
    """IO-bound background task to index approved documents with FR/AR typo tolerance."""
    try:
        client = meilisearch.Client(
            os.getenv("MEILI_URL", "http://localhost:7700"), 
            os.getenv("MEILI_MASTER_KEY", "meili_master_key")
        )
        index = client.index("documents")
        
        # Enforce Typo Tolerance for Arabic/French (US-09)
        index.update_settings({
            "typoTolerance": {
                "enabled": True,
                "minWordSizeForTypos": {"oneTypo": 4, "twoTypos": 8}
            }
        })
        
        index.add_documents([doc_payload])
        logger.info(f"[SEARCH AUDIT] Successfully indexed document {doc_payload['id']} to MeiliSearch")
    except Exception as e:
        logger.error(f"[SEARCH AUDIT] MeiliSearch indexing failed for {doc_payload.get('id')}: {e}")

def _remove_from_meilisearch(doc_id: str):
    """IO-bound background task to purge rejected/hidden documents."""
    try:
        client = meilisearch.Client(
            os.getenv("MEILI_URL", "http://localhost:7700"), 
            os.getenv("MEILI_MASTER_KEY", "meili_master_key")
        )
        client.index("documents").delete_document(doc_id)
        logger.info(f"[SEARCH AUDIT] Successfully purged document {doc_id} from MeiliSearch")
    except Exception as e:
        logger.error(f"[SEARCH AUDIT] MeiliSearch purge failed for {doc_id}: {e}")

async def _dispatch_ws_notification(user_id, payload: dict):
    """US-11: Background task to push real-time notification to the connected user."""
    await manager.send_personal_message(payload, user_id)
# ---------------------------------------


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
    and asynchronous side-effects (Search Indexing, Email/In-App notifications).
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

        # US-09: Prepare MeiliSearch Payload for Background Sync
        dv_query = await session.execute(
            select(DocumentVersion).where(DocumentVersion.contribution_id == c.id)
        )
        dv = dv_query.scalars().first()
        
        if dv:
            # Extract fields defensively to prevent index crashes on dynamic models
            doc_payload = {
                "id": str(dv.id),
                "document_version_id": str(dv.id),
                "title": getattr(c, "title", "Untitled Document"),
                "teacher_name": getattr(c, "teacher_name", "Unknown"),
                "is_official": getattr(c, "is_official", False),
                "quality_score": getattr(c, "quality_score", 0.0),
                "tags": getattr(c, "tags", []),
                "filiere": getattr(c, "filiere", None),
                "level": getattr(c, "niveau", None),
                "academic_year": getattr(c, "annee", None),
                "course_type": getattr(c, "type_cours", None),
                "language": getattr(c, "langue", "FR"),
                "ocr_text": getattr(dv, "ocr_text", "")
            }
            background_tasks.add_task(_sync_to_meilisearch, doc_payload)

    # 4. Handle REJECTED State & Soft-Deletion
    elif payload.status == ContributionStatus.REJECTED:
        c.status = ContributionStatus.REJECTED
        session.add(c)
        
        # Soft-delete associated DocumentVersions so they disappear from semantic search
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.contribution_id == c.id)
            .values(is_deleted=True)
        )
        
        # US-09: Purge from Lexical Search Index
        dv_query = await session.execute(select(DocumentVersion.id).where(DocumentVersion.contribution_id == c.id))
        dv_id = dv_query.scalars().first()
        if dv_id:
            background_tasks.add_task(_remove_from_meilisearch, str(dv_id))

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
        
        # US-09: Purge from Lexical Search Index
        dv_query = await session.execute(select(DocumentVersion.id).where(DocumentVersion.contribution_id == c.id))
        dv_id = dv_query.scalars().first()
        if dv_id:
            background_tasks.add_task(_remove_from_meilisearch, str(dv_id))

    # 6. Atomic Commit with Race Condition Protection
    try:
        # --- US-11: State Persistence for In-App Notifications ---
        status_text = "Approved" if payload.status == ContributionStatus.APPROVED else "Revision Requested" if payload.status == ContributionStatus.REVISION_REQUESTED else "Rejected"
        notification = Notification(
            user_id=c.uploader_id,
            title=f"Contribution {status_text}",
            message=f"Your document '{getattr(c, 'title', 'Untitled')}' has been {status_text.lower()}.",
            contribution_id=c.id
        )
        session.add(notification)

        await session.commit()
        await session.refresh(c)
        await session.refresh(notification)
        
        # 7. Side-Effects Dispatch (US-11 Notifications)
        uploader_query = await session.execute(select(User).where(User.id == c.uploader_id))
        uploader = uploader_query.scalars().first()
        
        if uploader and getattr(uploader, "email", None):
            status_str = payload.status.value if hasattr(payload.status, 'value') else str(payload.status)
            
            # Email Push
            background_tasks.add_task(
                send_contribution_status_email,
                to_email=uploader.email,
                title=getattr(c, "title", "Your contribution"),
                status=status_str,
                reason=payload.rejection_reason
            )
            logger.info(f"Queued background status notification email to {uploader.email}")

            # WebSocket In-App Push
            ws_payload = {
                "type": "NEW_NOTIFICATION",
                "notification": {
                    "id": str(notification.id),
                    "title": notification.title,
                    "message": notification.message,
                    "is_read": False,
                    "contribution_id": str(c.id),
                    "created_at": notification.created_at.isoformat()
                }
            }
            background_tasks.add_task(_dispatch_ws_notification, c.uploader_id, ws_payload)
            
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
    payload = ReviewContributionRequest(
        status=ContributionStatus.REJECTED, 
        rejection_reason="Rejected via legacy admin panel without specific feedback."
    )
    return await review_contribution(contribution_id, payload, background_tasks, current_user, session)
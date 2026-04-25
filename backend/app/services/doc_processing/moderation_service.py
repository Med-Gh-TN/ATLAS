import os
import logging
from typing import Optional
import meilisearch
from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from app.models.all_models import (
    User,
    UserRole,
    Contribution,
    ContributionStatus,
    Course,
    DocumentVersion,
    XPTransaction,
    XPTransactionType,
    Notification,
    Department
)

# DEFENSIVE ARCHITECTURE: Import external communication services
try:
    from app.services.communications.email_service import send_contribution_status_email
except ImportError:
    # Stub for development if email service is not yet fully implemented
    async def send_contribution_status_email(*args, **kwargs):
        logging.getLogger(__name__).warning("Email service stub called. Please implement send_contribution_status_email.")

try:
    from app.services.communications.notification_service import ws_manager
except ImportError:
    # Stub for development to prevent breaking the background task before Step 3 is completed
    class DummyWSManager:
        async def send_personal_message(self, message: dict, user_id):
            pass
    ws_manager = DummyWSManager()

logger = logging.getLogger(__name__)

# ==========================================
# SIDE-EFFECTS: MEILISEARCH SYNCHRONIZATION
# ==========================================

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
    try:
        await ws_manager.send_personal_message(payload, user_id)
    except Exception as e:
        logger.error(f"[WS AUDIT] Failed to dispatch WebSocket notification to {user_id}: {e}")


# ==========================================
# CORE DOMAIN LOGIC: MODERATION STATE MACHINE
# ==========================================

async def execute_contribution_review(
    contribution_id: str,
    status: ContributionStatus,
    rejection_reason: Optional[str],
    admin_user: User,
    session: AsyncSession,
    background_tasks: BackgroundTasks
) -> Contribution:
    """
    Centralized state machine for contribution approvals/rejections.
    Handles atomic XP crediting, mandatory rejection reasons, soft-deletions,
    and asynchronous side-effects (Search Indexing, Email/In-App notifications).
    """
    # 1. Fetch the Target Contribution
    result = await session.execute(select(Contribution).where(Contribution.id == contribution_id))
    c = result.scalars().first()

    if not c:
        raise ValueError(f"Contribution {contribution_id} not found.")

    # Idempotency check: Do not re-process if the state is already identical
    if c.status == status:
        return c

    # 2. State Machine Validation
    if status in [ContributionStatus.REJECTED, ContributionStatus.REVISION_REQUESTED]:
        if not rejection_reason or not rejection_reason.strip():
            raise ValueError("A 'rejection_reason' is strictly required when rejecting or requesting a revision.")
        c.rejection_reason = rejection_reason.strip()

    # 3. Handle APPROVED State & Gamification
    if status == ContributionStatus.APPROVED:
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

        # Build comprehensive payload for MeiliSearch
        dv_query = await session.execute(select(DocumentVersion).where(DocumentVersion.contribution_id == c.id))
        dv = dv_query.scalars().first()

        course = None
        if c.course_id:
            course = (await session.execute(select(Course).where(Course.id == c.course_id))).scalars().first()

        uploader = (await session.execute(select(User).where(User.id == c.uploader_id))).scalars().first()

        department_name = None
        if course and course.department_id:
            dept = (await session.execute(select(Department).where(Department.id == course.department_id))).scalars().first()
            if dept:
                department_name = dept.name

        if dv:
            teacher_name = (uploader.full_name or uploader.email) if uploader else "Unknown"
            is_official = True if (uploader and uploader.role in (UserRole.TEACHER, UserRole.ADMIN)) else False

            course_level = getattr(course.level, "value", course.level) if course and hasattr(course, "level") else None
            course_type = getattr(course.course_type, "value", course.course_type) if course and hasattr(course, "course_type") else None
            course_lang = getattr(course.language, "value", course.language) if course and hasattr(course, "language") else "FR"
            course_year = getattr(course, "academic_year", None) if course else None
            course_tags = getattr(course, "tags", []) if course else []
            filiere = department_name or (uploader.filiere if uploader and hasattr(uploader, "filiere") else None)

            doc_payload = {
                "id": str(dv.id),
                "document_version_id": str(dv.id),
                "title": getattr(c, "title", None) or (course.title if course else "Untitled Document"),
                "teacher_name": teacher_name,
                "is_official": is_official,
                "quality_score": dv.quality_score,
                "tags": course_tags,
                "filiere": filiere,
                "level": course_level,
                "academic_year": course_year,
                "course_type": course_type,
                "language": course_lang,
                "ocr_text": getattr(dv, "ocr_text", "")
            }
            background_tasks.add_task(_sync_to_meilisearch, doc_payload)

    # 4. Handle REJECTED or REVISION_REQUESTED State & Soft-Deletion
    elif status in [ContributionStatus.REJECTED, ContributionStatus.REVISION_REQUESTED]:
        c.status = status
        session.add(c)

        # Soft-delete associated DocumentVersions so they disappear from semantic search
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.contribution_id == c.id)
            .values(is_deleted=True)
        )

        # Purge from Lexical Search Index
        dv_query = await session.execute(select(DocumentVersion.id).where(DocumentVersion.contribution_id == c.id))
        dv_id = dv_query.scalars().first()
        if dv_id:
            background_tasks.add_task(_remove_from_meilisearch, str(dv_id))

    # 5. Atomic Commit with Race Condition Protection & Notifications
    try:
        # State Persistence for In-App Notifications
        status_text = "Approved" if status == ContributionStatus.APPROVED else "Revision Requested" if status == ContributionStatus.REVISION_REQUESTED else "Rejected"

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

        # 6. Side-Effects Dispatch
        uploader_query = await session.execute(select(User).where(User.id == c.uploader_id))
        uploader = uploader_query.scalars().first()

        if uploader and getattr(uploader, "email", None):
            status_str = status.value if hasattr(status, 'value') else str(status)

            # Email Push
            background_tasks.add_task(
                send_contribution_status_email,
                to_email=uploader.email,
                title=getattr(c, "title", "Your contribution"),
                status=status_str,
                reason=rejection_reason
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

        logger.info(f"Contribution {c.id} transitioned to {status} by {admin_user.email}")
        return c

    except IntegrityError as e:
        await session.rollback()
        logger.warning(f"Prevented duplicate XP exploit or race condition on contribution {c.id}: {str(e)}")
        await session.refresh(c)
        return c
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to commit contribution status update: {str(e)}")
        raise
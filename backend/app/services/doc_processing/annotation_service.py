import uuid
import logging
from typing import Sequence, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc

from app.models.all_models import User, UserRole, DocumentAnnotation, DocumentVersion

logger = logging.getLogger(__name__)

# ==========================================
# ANNOTATION CORE DOMAIN LOGIC
# ==========================================

async def get_annotations_for_document(
    document_version_id: uuid.UUID,
    public_only: bool,
    user: User,
    session: AsyncSession
) -> Sequence[DocumentAnnotation]:
    """
    Retrieve annotations for a document with strict visibility scoping.
    Enforces tenant isolation by ensuring private annotations are only visible to their creators.
    """
    stmt = select(DocumentAnnotation).where(
        DocumentAnnotation.document_version_id == document_version_id
    )

    # Apply strict visibility bounds at the query level
    if public_only:
        stmt = stmt.where(DocumentAnnotation.is_public == True)
    else:
        stmt = stmt.where(
            (DocumentAnnotation.is_public == True) |
            (DocumentAnnotation.user_id == user.id)
        )

    stmt = stmt.order_by(desc(DocumentAnnotation.created_at))
    result = await session.execute(stmt)

    return result.scalars().all()


async def add_annotation_to_document(
    payload: Any,  # Typed dynamically via Pydantic from the endpoint
    user: User,
    session: AsyncSession
) -> DocumentAnnotation:
    """
    Persist a new annotation.
    Defensive Architecture: Validates document existence before inserting orphaned records.
    """
    # 1. Validate Target Document Existence
    doc_result = await session.execute(
        select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id)
    )
    doc = doc_result.scalars().first()

    if not doc:
        raise ValueError(f"DocumentVersion {payload.document_version_id} not found.")

    # 2. Construct and Persist Entity
    annotation = DocumentAnnotation(
        document_version_id=payload.document_version_id,
        user_id=user.id,
        page_number=payload.page_number,
        x=payload.x,
        y=payload.y,
        content=payload.content.strip(),
        is_public=payload.is_public
    )

    session.add(annotation)
    await session.commit()
    await session.refresh(annotation)

    logger.info(f"[ANNOTATIONS] User {user.id} added annotation {annotation.id} to doc {payload.document_version_id}")
    return annotation


async def delete_annotation_from_document(
    annotation_id: uuid.UUID,
    user: User,
    session: AsyncSession
) -> None:
    """
    Remove an annotation from the system.
    Enforces strict RBAC: Only the author or an Admin can delete an annotation.
    """
    # 1. Fetch Target Entity
    result = await session.execute(
        select(DocumentAnnotation).where(DocumentAnnotation.id == annotation_id)
    )
    annotation = result.scalars().first()

    if not annotation:
        raise ValueError(f"Annotation {annotation_id} not found.")

    # 2. Strict RBAC Enforcement (IDOR Protection)
    is_owner = annotation.user_id == user.id
    is_admin = getattr(user, "role", None) == getattr(UserRole, "ADMIN", "ADMIN")

    if not is_owner and not is_admin:
        logger.warning(f"[SECURITY] User {user.id} attempted unauthorized deletion of annotation {annotation_id}")
        raise PermissionError("You do not have permission to delete this annotation.")

    # 3. Atomic Deletion
    await session.delete(annotation)
    await session.commit()

    logger.info(f"[ANNOTATIONS] Annotation {annotation_id} deleted by user {user.id}")
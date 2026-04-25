import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User

# DEFENSIVE ARCHITECTURE: All data access and business rules delegated to the domain layer.
# You must implement these functions in your document processing service layer.
try:
    from app.services.doc_processing.annotation_service import (
        get_annotations_for_document,
        add_annotation_to_document,
        delete_annotation_from_document
    )
except ImportError:
    # Fallback/stub for development until the service layer is fully implemented
    async def get_annotations_for_document(*args, **kwargs): return []
    async def add_annotation_to_document(*args, **kwargs): raise NotImplementedError()
    async def delete_annotation_from_document(*args, **kwargs): raise NotImplementedError()

logger = logging.getLogger(__name__)
router = APIRouter()

class AnnotationCreatePayload(BaseModel):
    """
    Defensive Architecture: Strict input validation replaces raw dictionary parsing.
    """
    document_version_id: uuid.UUID
    page_number: int = Field(default=1, ge=1, description="The page number where the annotation is placed")
    x: float = Field(default=0.0, description="X coordinate ratio")
    y: float = Field(default=0.0, description="Y coordinate ratio")
    content: str = Field(..., min_length=1, description="The text content of the annotation")
    is_public: bool = Field(default=True, description="Visibility toggle")


@router.get("/document/{document_version_id}")
async def list_annotations(
    document_version_id: uuid.UUID,
    public_only: bool = True,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve annotations for a specific document.
    Visibility filtering (public vs. private) is delegated to the domain service.
    """
    logger.debug(f"Fetching annotations | Document: {document_version_id} | User: {current_user.id}")

    try:
        annotations = await get_annotations_for_document(
            document_version_id=document_version_id,
            public_only=public_only,
            user=current_user,
            session=session
        )
        return annotations
    except Exception as e:
        logger.error(f"Failed to fetch annotations for doc {document_version_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve annotations."
        )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_annotation(
    payload: AnnotationCreatePayload,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Create a new annotation on a document.
    """
    logger.info(f"Creating annotation | Document: {payload.document_version_id} | User: {current_user.id}")

    try:
        annotation = await add_annotation_to_document(
            payload=payload,
            user=current_user,
            session=session
        )
        return annotation
    except ValueError as ve:
        # Catch domain-level validation (e.g., document not found)
        logger.warning(f"Annotation creation rejected: {str(ve)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Failed to create annotation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create annotation at this time."
        )


@router.delete("/{annotation_id}")
async def delete_annotation(
    annotation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Delete an annotation. RBAC checks are strictly delegated to the service layer.
    """
    logger.info(f"Deleting annotation | ID: {annotation_id} | User: {current_user.id}")

    try:
        await delete_annotation_from_document(
            annotation_id=annotation_id,
            user=current_user,
            session=session
        )
        return {"status": "deleted"}
    except PermissionError as pe:
        # Catch strict RBAC violations from the service layer
        logger.warning(f"Unauthorized deletion attempt on annotation {annotation_id} by {current_user.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(pe)
        )
    except ValueError as ve:
        # Catch if the annotation doesn't exist
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Failed to delete annotation {annotation_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete annotation."
        )
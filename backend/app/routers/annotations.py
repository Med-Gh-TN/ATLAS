from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.annotation import DocumentAnnotation
from app.models.user import User


router = APIRouter(tags=["Annotations"])


class AnnotationCreateRequest(BaseModel):
    document_version_id: UUID
    page_number: int = Field(ge=1)
    x: float
    y: float
    content: str = Field(min_length=1)
    is_public: bool = True


@router.post("/annotations", status_code=status.HTTP_201_CREATED)
async def create_annotation(
    payload: AnnotationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    annotation = DocumentAnnotation(
        document_version_id=payload.document_version_id,
        user_id=current_user.id,
        page_number=payload.page_number,
        x=payload.x,
        y=payload.y,
        content=payload.content,
        is_public=payload.is_public,
    )
    db.add(annotation)
    await db.commit()
    await db.refresh(annotation)
    return {
        "id": str(annotation.id),
        "document_version_id": str(annotation.document_version_id),
        "page_number": annotation.page_number,
        "x": annotation.x,
        "y": annotation.y,
        "content": annotation.content,
        "is_public": annotation.is_public,
        "created_at": annotation.created_at,
    }


@router.get("/annotations")
async def list_annotations(
    doc_version_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(DocumentAnnotation)
        .where(
            DocumentAnnotation.document_version_id == doc_version_id,
            (DocumentAnnotation.user_id == current_user.id) | (DocumentAnnotation.is_public.is_(True)),
        )
        .order_by(desc(DocumentAnnotation.created_at))
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(item.id),
            "document_version_id": str(item.document_version_id),
            "page_number": item.page_number,
            "x": item.x,
            "y": item.y,
            "content": item.content,
            "is_public": item.is_public,
            "created_at": item.created_at,
        }
        for item in rows
    ]


@router.delete("/annotations/{annotation_id}")
async def delete_annotation(
    annotation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    annotation = await db.get(DocumentAnnotation, annotation_id)
    if annotation is None:
        raise atlas_error("ANNOTATION_001", "Annotation not found.", status_code=404)
    if annotation.user_id != current_user.id:
        raise atlas_error("AUTH_008", "You do not have permission to perform this action.", status_code=403)

    await db.delete(annotation)
    await db.commit()
    return {"success": True}

import uuid
import logging
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, Field

from app.db.session import get_session
# ARCHITECTURAL FIX: Explicitly import from the specific IAM dependency provider
from app.api.v1.endpoints.auth.me import get_current_user
from app.models.all_models import User, DocumentVersion, Summary, SummaryFormat
from app.core.limits import limiter

# ARCHITECTURAL FIX: Re-routed to the new Study Engine and Doc Processing Bounded Contexts
from app.services.study_engine import generation_service
from app.services.doc_processing import export_service

# ARCHITECTURAL ENFORCEMENT: Explicit boundary logging for Summary tool telemetry
logger = logging.getLogger("app.api.v1.endpoints.study.summaries")
router = APIRouter()

# --- Pydantic Schemas ---

class GenerateSummaryRequest(BaseModel):
    """Schema for requesting AI-generated summaries across multiple formats."""
    document_version_id: uuid.UUID
    document_version_id_v2: Optional[uuid.UUID] = Field(
        default=None,
        description="Required only for COMPARATIVE format"
    )
    format_type: SummaryFormat = Field(
        default=SummaryFormat.EXECUTIVE,
        description="EXECUTIVE, STRUCTURED, or COMPARATIVE"
    )
    target_lang: str = Field(
        default="fr",
        description="Language code e.g., 'fr', 'ar', 'en'"
    )

# --- Summary Endpoints ---

@router.post("/generate", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(5, 86400))])
async def generate_summary(
    payload: GenerateSummaryRequest,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """
    US-18: AI Summary Generation.
    Interfaces with the Study Engine to process OCR text into structured summaries.
    Supports single-doc and multi-doc comparative analysis.
    """
    doc_query = await db_session.execute(
        select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id)
    )
    doc = doc_query.scalars().first()

    if not doc or not doc.ocr_text:
        logger.warning(f"Summary Fail: User {current_user.id} requested summary for invalid doc {payload.document_version_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Primary document not ready or missing OCR text."
        )

    text_v2 = None
    if payload.format_type == SummaryFormat.COMPARATIVE:
        if not payload.document_version_id_v2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="COMPARATIVE format requires a secondary document_version_id_v2."
            )

        doc_v2_query = await db_session.execute(
            select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id_v2)
        )
        doc_v2 = doc_v2_query.scalars().first()

        if not doc_v2 or not doc_v2.ocr_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Secondary document version not ready or missing text."
            )
        text_v2 = doc_v2.ocr_text

    # Cross-layer Domain Logic: Generation Service (Study Engine)
    summary_data = await generation_service.generate_summary_from_text(
        text=doc.ocr_text,
        format_type=payload.format_type.value,
        target_lang=payload.target_lang,
        text_v2=text_v2
    )

    if "error" in summary_data:
        logger.error(f"LLM Summary Error for User {current_user.id}: {summary_data['error']}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=summary_data["error"]
        )

    # State persistence
    summary = Summary(
        student_id=current_user.id,
        document_version_id=doc.id,
        format=payload.format_type,
        target_lang=payload.target_lang,
        content=summary_data
    )
    db_session.add(summary)
    await db_session.commit()
    await db_session.refresh(summary)

    logger.info(f"AUDIT: Summary [{summary.id}] generated successfully for User [{current_user.id}].")

    return {
        "summary_id": summary.id,
        "format": summary.format,
        "content": summary.content
    }


@router.get("/{summary_id}/export/pdf")
async def export_summary_pdf(
    summary_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """
    US-18: PDF Exportation.
    Interfaces with the Document Processing domain to render an HTML-based
    summary into a high-fidelity PDF binary.
    """
    query = await db_session.execute(
        select(Summary).where(Summary.id == summary_id, Summary.student_id == current_user.id)
    )
    summary = query.scalars().first()

    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found or unauthorized access."
        )

    try:
        # Cross-layer Domain Logic: Export Service (Doc Processing)
        pdf_bytes = export_service.generate_pdf_from_summary(summary)

        logger.info(f"AUDIT: Summary [{summary.id}] exported to PDF by User [{current_user.id}].")

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=ATLAS_Summary_{summary.id}.pdf",
                "Cache-Control": "no-cache"
            }
        )
    except RuntimeError as e:
        logger.error(f"PDF Engine Failure for Summary {summary_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PDF generation service is currently unavailable. Please try again later."
        )
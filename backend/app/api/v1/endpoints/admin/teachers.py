import logging
from typing import List
from fastapi import APIRouter, UploadFile, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.session import get_session
from app.core.rbac import require_roles
from app.models.user import User, UserRole

# DEFENSIVE ARCHITECTURE: Import domain logic
# The outdated 'app.services.email_service' is completely removed from the routing layer.
try:
    from app.services.iam.teacher_service import (
        generate_dynamic_teacher_template,
        process_teacher_batch_import
    )
except ImportError:
    # Stub for development to prevent Uvicorn crash until the service is implemented
    async def generate_dynamic_teacher_template(*args, **kwargs):
        raise NotImplementedError("Service not implemented.")
    async def process_teacher_batch_import(*args, **kwargs):
        raise NotImplementedError("Service not implemented.")

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Response Schemas ---
class ImportErrorDetail(BaseModel):
    row: int
    email: str
    reason: str

class ImportDuplicateDetail(BaseModel):
    row: int
    email: str

class ImportReportResponse(BaseModel):
    success_count: int
    errors: List[ImportErrorDetail]
    duplicates: List[ImportDuplicateDetail]


# --- Teacher Onboarding Endpoints ---

@router.get("/teachers/template")
async def download_teacher_template(
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session)
):
    """
    SOTA Dynamic Template Generator.
    Endpoint delegates Excel workbook generation to the IAM domain service.
    """
    logger.info(f"Admin {current_user.email} requested teacher import template.")

    try:
        # Service returns a StreamingResponse ready for the client
        return await generate_dynamic_teacher_template(current_user, session)
    except ValueError as ve:
        logger.warning(f"Template generation rejected: {str(ve)}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(ve))
    except Exception as e:
        logger.error(f"Template generation failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate template at this time."
        )


@router.post("/teachers/import", response_model=ImportReportResponse)
async def import_teachers(
    file: UploadFile,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session)
):
    """
    US-05: Batch imports teachers.
    Endpoint acts strictly as a traffic controller, delegating file parsing,
    validation, and email dispatch to the IAM service layer.
    """
    logger.info(f"Admin {current_user.email} initiated teacher batch import via {file.filename}.")

    if not file.filename.lower().endswith(('.csv', '.xlsx')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Please upload a .csv or .xlsx file."
        )

    try:
        # Delegate heavy lifting (Pandas, DB batch inserts, Emails) to the service layer
        report_data = await process_teacher_batch_import(file, current_user, session)
        return report_data
    except ValueError as ve:
        logger.warning(f"Batch import validation failed: {str(ve)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Batch import failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="A critical error occurred during batch processing."
        )
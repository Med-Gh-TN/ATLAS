import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User
from app.core.limits import limiter

# DEFENSIVE ARCHITECTURE: Import domain logic from the encapsulated study engine
# The outdated 'app.services.generation_service' is completely removed.
try:
    from app.services.study_engine.generation_service import generate_and_persist_mindmap
except ImportError:
    # Stub for development to prevent Uvicorn crash until the service is implemented
    async def generate_and_persist_mindmap(*args, **kwargs):
        raise NotImplementedError("Service not implemented.")

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Pydantic Schemas ---
class GenerateMindMapRequest(BaseModel):
    document_version_id: uuid.UUID
    target_lang: str = Field(default="fr", description="Language code e.g., 'fr', 'ar', 'en'")


# --- Mind Map Endpoints ---

@router.post(
    "/mindmaps/generate",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limiter(5, 86400))]
)
async def generate_mindmap(
    payload: GenerateMindMapRequest,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """
    US-18: Generates and persists an interactive React Flow compatible concept map.
    Endpoint acts strictly as a traffic controller, delegating AI generation
    and state persistence to the study engine domain.
    """
    logger.info(
        f"MindMap generation requested | User: {current_user.id} | "
        f"Document: {payload.document_version_id} | Lang: {payload.target_lang}"
    )

    try:
        # Delegate AI execution, validation, and DB persistence to the service layer
        result = await generate_and_persist_mindmap(
            document_version_id=payload.document_version_id,
            target_lang=payload.target_lang,
            user=current_user,
            session=db_session
        )
        return result

    except ValueError as ve:
        # Catch explicit domain-level validation errors (e.g., Document not found)
        logger.warning(f"MindMap validation failed: {str(ve)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve)
        )
    except RuntimeError as re:
        # Catch generation engine failures
        logger.error(f"MindMap AI generation failed: {str(re)}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(re)
        )
    except Exception as e:
        logger.error(f"Unexpected error during MindMap generation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="A critical error occurred while generating the concept map."
        )
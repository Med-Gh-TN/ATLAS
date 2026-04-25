# Comprehensive, production-ready code with clear JSDoc/Docstring comments.
# ENTIRE FILE CONTENTS HERE. NO PLACEHOLDERS.
import json
import logging
from uuid import UUID
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from pydantic import BaseModel, Field

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User, UserRole, ReadingProgress

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/progress", tags=["study-progress"])

# ==========================================
# STRICT PYDANTIC SCHEMAS
# ==========================================

class ReadingProgressUpdate(BaseModel):
    document_version_id: UUID
    last_page: int = Field(ge=1, description="Current page number the user is viewing")
    scroll_y: float = Field(ge=0.0, description="Exact vertical scroll offset in pixels")

class ActiveReadingState(BaseModel):
    document_version_id: UUID
    last_page: int
    scroll_y: float
    last_accessed_at: datetime

# ==========================================
# ENDPOINTS
# ==========================================

@router.patch("/", status_code=status.HTTP_202_ACCEPTED)
async def update_reading_progress(
    payload: ReadingProgressUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    US-XX: High-Frequency Telemetry Ingestion.
    Accepts debounced scroll and page updates from the PDF viewer.
    Utilizes a Redis Write-Behind strategy to protect the SQL connection pool.
    """
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students can save reading progress.")

    user_id_str = str(current_user.id)
    doc_id_str = str(payload.document_version_id)
    now = datetime.utcnow()

    redis_cache = getattr(request.app.state, "redis_cache", None)

    # State Payload
    state_data: Dict[str, Any] = {
        "document_version_id": doc_id_str,
        "last_page": payload.last_page,
        "scroll_y": payload.scroll_y,
        "last_accessed_at": now.isoformat() + "Z"
    }

    if redis_cache:
        try:
            # 1. Update the specific document's progress state (7 day TTL)
            doc_key = f"progress:user:{user_id_str}:doc:{doc_id_str}"
            await redis_cache.setex(doc_key, 604800, json.dumps(state_data))

            # 2. Update the user's "Active Document" pointer for instant dashboard resume
            active_pointer_key = f"progress:user:{user_id_str}:active_doc"
            await redis_cache.setex(active_pointer_key, 604800, doc_id_str)

            logger.debug(f"[TELEMETRY] Cached progress for User: {user_id_str} | Doc: {doc_id_str}")
            return {"status": "accepted", "source": "cache"}
        except Exception as e:
            logger.warning(f"[TELEMETRY] Redis Write-Behind failed: {e}. Degrading to direct DB upsert.")

    # DEFENSIVE FALLBACK: If Redis is down, perform a synchronous DB upsert.
    # We query first to check if a record exists to update it, preventing unique constraint violations.
    try:
        query = await session.execute(
            select(ReadingProgress)
            .where(
                ReadingProgress.user_id == current_user.id,
                ReadingProgress.document_version_id == payload.document_version_id
            )
        )
        progress_record = query.scalar_one_or_none()

        if progress_record:
            progress_record.last_page = payload.last_page
            progress_record.scroll_y = payload.scroll_y
            progress_record.last_accessed_at = now
        else:
            progress_record = ReadingProgress(
                user_id=current_user.id,
                document_version_id=payload.document_version_id,
                last_page=payload.last_page,
                scroll_y=payload.scroll_y,
                last_accessed_at=now
            )
            session.add(progress_record)

        await session.commit()
        return {"status": "accepted", "source": "database"}

    except Exception as e:
        await session.rollback()
        logger.error(f"[TELEMETRY] Database fallback failed for User: {user_id_str}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save progress.")


@router.get("/active", response_model=Optional[ActiveReadingState])
async def get_active_reading_state(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    US-XX: Active Learning Panel Hydration.
    Fetches the exact coordinates of the user's most recently viewed document.
    Prioritizes Redis cache; falls back to the persistent SQL database.
    """
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students possess reading states.")

    user_id_str = str(current_user.id)
    redis_cache = getattr(request.app.state, "redis_cache", None)

    # 1. Attempt Cache Retrieval
    if redis_cache:
        try:
            active_pointer_key = f"progress:user:{user_id_str}:active_doc"
            active_doc_id = await redis_cache.get(active_pointer_key)

            if active_doc_id:
                # If pointer exists, fetch the document's specific state
                if isinstance(active_doc_id, bytes):
                    active_doc_id = active_doc_id.decode("utf-8")

                doc_key = f"progress:user:{user_id_str}:doc:{active_doc_id}"
                state_data_raw = await redis_cache.get(doc_key)

                if state_data_raw:
                    logger.debug(f"[TELEMETRY] Cache hit for Active State | User: {user_id_str}")
                    state_dict = json.loads(state_data_raw)
                    # Convert string timestamp back to datetime for Pydantic validation
                    state_dict["last_accessed_at"] = datetime.fromisoformat(state_dict["last_accessed_at"].replace('Z', '+00:00')).replace(tzinfo=None)
                    return state_dict
        except Exception as e:
            logger.warning(f"[TELEMETRY] Redis Read failed: {e}. Degrading to DB lookup.")

    # 2. Database Fallback Retrieval
    logger.debug(f"[TELEMETRY] Querying DB for Active State | User: {user_id_str}")
    try:
        query = await session.execute(
            select(ReadingProgress)
            .where(ReadingProgress.user_id == current_user.id)
            .order_by(desc(ReadingProgress.last_accessed_at))
            .limit(1)
        )
        active_record = query.scalar_one_or_none()

        if active_record:
            return {
                "document_version_id": active_record.document_version_id,
                "last_page": active_record.last_page,
                "scroll_y": active_record.scroll_y,
                "last_accessed_at": active_record.last_accessed_at
            }

        # Returns null/None if no reading history exists
        return None

    except Exception as e:
        logger.error(f"[TELEMETRY] Database query failed for User {user_id_str}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not retrieve active state.")
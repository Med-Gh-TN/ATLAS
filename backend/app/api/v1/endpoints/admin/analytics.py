import json
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, func, desc
from sqlalchemy.future import select
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel
from typing import List, Any

from app.db.session import get_session
from app.core.rbac import require_roles
from app.models.user import User, UserRole
from app.models.contribution import Contribution
from app.models.course import Course

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Pydantic Schemas ---
class AdminAnalyticsResponse(BaseModel):
    total_teachers: int
    total_departments: int
    total_courses: int
    active_rag_sessions: int

# Note: Using returning dict for TeacherAnalytics to match legacy flexibility
# but strongly typing the Admin response.

# --- Analytics Endpoints ---

@router.get("/admin", response_model=AdminAnalyticsResponse)
async def get_admin_analytics(
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session)
):
    """
    US-0X: Dashboard Metrics.
    Aggregates realtime metrics bounded strictly to the Admin's institutional tenant.
    Features sub-millisecond Redis caching.
    """
    est_id = current_user.establishment_id
    if not est_id:
        raise HTTPException(status_code=403, detail="Admin not linked to an establishment.")

    # --- REDIS CACHE LAYER ---
    cache = getattr(request.app.state, "redis_cache", None)
    cache_key = f"analytics:admin:est:{est_id}"

    if cache:
        try:
            cached = await cache.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Redis cache read failed, falling back to DB: {e}")

    # --- DATABASE LAYER ---
    try:
        teacher_query = text("""
            SELECT COUNT(id) FROM "user"
            WHERE establishment_id = :est_id AND role = 'TEACHER'
        """)

        dept_query = text("""
            SELECT COUNT(id) FROM department
            WHERE establishment_id = :est_id
        """)

        course_query = text("""
            SELECT COUNT(c.id)
            FROM course c
            JOIN department d ON c.department_id = d.id
            WHERE d.establishment_id = :est_id
        """)

        rag_query = text("""
            SELECT COUNT(r.id)
            FROM ragsession r
            JOIN "user" u ON r.student_id = u.id
            WHERE u.establishment_id = :est_id AND r.is_active = true
        """)

        param = {"est_id": str(est_id).replace("-", "") if not isinstance(est_id, str) else est_id}

        teachers = await session.scalar(teacher_query, param)
        departments = await session.scalar(dept_query, param)
        courses = await session.scalar(course_query, param)
        sessions = await session.scalar(rag_query, param)

        payload = {
            "total_teachers": teachers or 0,
            "total_departments": departments or 0,
            "total_courses": courses or 0,
            "active_rag_sessions": sessions or 0
        }

        # SOTA SIDE-EFFECT: Populate Cache
        if cache:
            try:
                await cache.setex(cache_key, 120, json.dumps(payload))
            except Exception as e:
                logger.warning(f"Redis cache write failed: {e}")

        return payload

    except SQLAlchemyError as e:
        logger.error(f"Database error aggregating analytics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to aggregate dashboard metrics"
        )


@router.get("/teacher")
async def get_teacher_analytics(
    request: Request,
    current_user: User = Depends(require_roles(UserRole.TEACHER, UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session)
):
    """
    Teacher-scoped analytics dashboard.
    """
    cache = getattr(request.app.state, "redis_cache", None)
    cache_key = f"analytics:teacher:{current_user.id}"

    if cache:
        try:
            cached = await cache.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Redis cache read failed, falling back to DB: {e}")

    try:
        # Teacher-specific uploads
        total_uploads = (
            await session.execute(
                select(func.count(Contribution.id)).where(
                    Contribution.uploader_id == current_user.id
                )
            )
        ).scalar_one()

        approved_uploads = (
            await session.execute(
                select(func.count(Contribution.id)).where(
                    Contribution.uploader_id == current_user.id,
                    Contribution.status == "APPROVED",
                )
            )
        ).scalar_one()

        recent_uploads = (
            await session.execute(
                select(Contribution)
                .where(Contribution.uploader_id == current_user.id)
                .order_by(desc(Contribution.created_at))
                .limit(5)
            )
        ).scalars().all()

        # Convert recent_uploads to dicts for JSON serialization
        recent_uploads_data = []
        for upload in recent_uploads:
            recent_uploads_data.append({
                "id": str(upload.id),
                "title": upload.title,
                "status": upload.status,
                "created_at": upload.created_at.isoformat() if upload.created_at else None
            })

        # Department insights if teacher profile is present
        dept_id = getattr(getattr(current_user, "teacher_profile", None), "department_id", None)
        dept_pending = 0

        if dept_id:
            dept_pending = (
                await session.execute(
                    select(func.count(Contribution.id))
                    .join(Course, Course.id == Contribution.course_id)
                    .where(
                        Course.department_id == dept_id,
                        Contribution.status == "PENDING",
                    )
                )
            ).scalar_one()

        payload = {
            "total_uploads": int(total_uploads or 0),
            "approved_uploads": int(approved_uploads or 0),
            "department_pending": int(dept_pending or 0),
            "recent_uploads": recent_uploads_data,
        }

        if cache:
            try:
                await cache.setex(cache_key, 300, json.dumps(payload))
            except Exception as e:
                logger.warning(f"Redis cache write failed: {e}")

        return payload

    except SQLAlchemyError as e:
        logger.error(f"Database error aggregating teacher analytics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to aggregate teacher metrics"
        )
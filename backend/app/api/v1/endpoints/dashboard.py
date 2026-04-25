import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User, UserRole

# --- Pydantic Schemas for Strict Response Contracts (Smart Overview) ---
class CourseRecommendation(BaseModel):
    course_id: str
    title: str
    progress_percentage: int

class WeakTopic(BaseModel):
    topic_name: str
    accuracy_percentage: float
    suggested_action: str

class SuggestedFlashcardDeck(BaseModel):
    deck_id: str
    title: str
    due_cards_count: int

class AIGoal(BaseModel):
    id: str
    description: str
    is_completed: bool

class DashboardProgress(BaseModel):
    overall_completion_percentage: int
    active_streak_days: int

class SmartOverviewResponse(BaseModel):
    greeting: str = Field(..., description="Personalized greeting, e.g., 'Welcome back, Tony'")
    progress: DashboardProgress
    daily_goals: List[AIGoal]
    recommended_courses: List[CourseRecommendation]
    weak_topics: List[WeakTopic]
    suggested_flashcards: List[SuggestedFlashcardDeck]

# --- Pydantic Schemas for Advanced Analytics (New) ---
class CourseProgressDetail(BaseModel):
    course_id: str
    title: str
    completion_percentage: float
    time_spent_hours: float

class LearningEfficiency(BaseModel):
    focus_score: float = Field(..., description="Calculated efficiency 0-100")
    xp_per_hour: float
    trend: str = Field(..., description="'improving', 'declining', or 'stable'")

class KnowledgeRetention(BaseModel):
    retention_score: float = Field(..., description="Current Ebbinghaus retention estimate (0-100)")
    decay_warning: bool
    optimal_review_window: str = Field(..., description="e.g., 'Next 12 hours'")

class AIForecast(BaseModel):
    target_course: str
    predicted_completion_date: str = Field(..., description="ISO 8601 Date string")
    confidence_interval: str = Field(..., description="e.g., '85%'")

class ActionableInsight(BaseModel):
    insight_text: str = Field(..., description="e.g., 'You forget concepts after 3 days...'")
    action_type: str = Field(..., description="'REVIEW_FLASHCARDS', 'TAKE_QUIZ', 'CONTINUE_COURSE'")
    action_payload: str = Field(..., description="ID or URL route for the action")

class AdvancedAnalyticsResponse(BaseModel):
    course_progress: List[CourseProgressDetail]
    efficiency: LearningEfficiency
    retention: KnowledgeRetention
    forecasts: List[AIForecast]
    insights: List[ActionableInsight]

# DEFENSIVE ARCHITECTURE: Service layer delegation
try:
    from app.services.study_engine.dashboard_service import (
        fetch_student_dashboard_data,
        generate_student_calendar_ics
    )
except ImportError:
    async def fetch_student_dashboard_data(*args, **kwargs):
        return {
            "greeting": "Welcome back, Fallback User",
            "progress": {"overall_completion_percentage": 0, "active_streak_days": 0},
            "daily_goals": [],
            "recommended_courses": [],
            "weak_topics": [],
            "suggested_flashcards": []
        }
    async def generate_student_calendar_ics(*args, **kwargs): return "BEGIN:VCALENDAR\nEND:VCALENDAR"

try:
    from app.services.study_engine.analytics_service import fetch_advanced_analytics
except ImportError:
    # Stub to prevent routing crash while we build the heavy math engine
    async def fetch_advanced_analytics(*args, **kwargs):
        return {
            "course_progress": [],
            "efficiency": {"focus_score": 0.0, "xp_per_hour": 0.0, "trend": "stable"},
            "retention": {"retention_score": 100.0, "decay_warning": False, "optimal_review_window": "N/A"},
            "forecasts": [],
            "insights": [{"insight_text": "Analytics engine booting up...", "action_type": "NONE", "action_payload": ""}]
        }

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/students/me", response_model=SmartOverviewResponse)
async def student_dashboard(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    US-07 & US-11: Aggregated Student Dashboard (Smart Overview).
    """
    if current_user.role != UserRole.STUDENT:
        logger.warning(f"Unauthorized dashboard access attempt by {current_user.email}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students can access this dashboard.")

    logger.debug(f"Fetching dashboard data | Student: {current_user.id}")

    try:
        payload = await fetch_student_dashboard_data(
            user_id=current_user.id,
            user_name=current_user.full_name or current_user.email,
            session=session,
            app_state=request.app.state
        )
        return payload
    except Exception as e:
        logger.error(f"Failed to aggregate dashboard for {current_user.id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to load dashboard data.")


@router.get("/students/me/calendar.ics")
async def student_calendar_ics(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    US-07: Export due dates and study sessions as an ICS calendar.
    """
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students can access this calendar.")

    try:
        ics_content = await generate_student_calendar_ics(user_id=current_user.id, session=session)
        return Response(content=ics_content, media_type="text/calendar")
    except Exception as e:
        logger.error(f"Failed to generate ICS for {current_user.id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to generate calendar.")


@router.get("/students/me/analytics", response_model=AdvancedAnalyticsResponse)
async def student_advanced_analytics(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    US-XX: Advanced Learning Analytics.
    Highly intensive endpoint utilizing memory decay algorithms and AI forecasting.
    Must be heavily cached via Redis in the service layer.
    """
    if current_user.role != UserRole.STUDENT:
        logger.warning(f"Unauthorized analytics access attempt by {current_user.email}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students can access analytics.")

    logger.info(f"Initiating Advanced Analytics calculation | Student: {current_user.id}")

    try:
        payload = await fetch_advanced_analytics(
            user_id=current_user.id,
            session=session,
            app_state=request.app.state
        )
        return payload
    except Exception as e:
        logger.error(f"Failed to calculate analytics for {current_user.id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Analytics engine encountered an error while calculating forecasts."
        )
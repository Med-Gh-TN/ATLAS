import json
import uuid
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, func

from app.models.all_models import (
    Contribution,
    Flashcard,
    QuizSession,
    Notification
)

# DEFENSIVE ARCHITECTURE: Gamification context boundary
try:
    from app.services.study_engine.gamification_service import get_total_xp, get_level_for_xp
except ImportError:
    # Fallback/stub for development
    async def get_total_xp(session, user_id): return 0
    def get_level_for_xp(xp): return {"level": 1, "next_level": 2, "next_at": 100}

# DEFENSIVE ARCHITECTURE: AI Core context boundary
try:
    from app.services.ai_core.rag_inference import generate_dashboard_insights
except ImportError:
    # Fallback logic to ensure compilation and immediate frontend unblocking
    async def generate_dashboard_insights(user_name: str, stats: Dict[str, Any]) -> Dict[str, Any]:
        """
        Simulates RAG/LLM insight generation based on user telemetry.
        In production, this queries the LLM with the user's weak topics and recent activity.
        """
        due_cards = stats.get("due_flashcards", 0)
        recent_quizzes = stats.get("recent_quizzes", [])

        # Calculate a simulated progress based on activity
        progress_pct = min(100, 20 + (len(recent_quizzes) * 5) + (stats.get("total_xp", 0) // 100))

        # Dynamic Greeting Generation
        if progress_pct > 70:
            greeting = f"Welcome back, {user_name} — you're {progress_pct}% done with your core learning track. Keep it up!"
        else:
            greeting = f"Welcome back, {user_name} — let's knock out some goals today."

        # Dynamic Goal Generation
        goals = []
        if due_cards > 0:
            goals.append({"id": str(uuid.uuid4()), "description": f"Clear {due_cards} pending flashcards", "is_completed": False})
        goals.append({"id": str(uuid.uuid4()), "description": "Complete one quiz session", "is_completed": False})

        return {
            "greeting": greeting,
            "daily_goals": goals,
            "recommended_courses": [
                {"course_id": "c_default_1", "title": "Advanced RAG Implementations", "progress_percentage": progress_pct}
            ],
            "weak_topics": [
                {"topic_name": "Data Serialization", "accuracy_percentage": 45.5, "suggested_action": "Review Flashcards"}
            ],
            "suggested_flashcards": [
                {"deck_id": "d_default_1", "title": "Core Architecture Patterns", "due_cards_count": due_cards}
            ]
        }

logger = logging.getLogger(__name__)

# ==========================================
# AGGREGATION ENGINE (DASHBOARD)
# ==========================================

async def fetch_student_dashboard_data(
    user_id: uuid.UUID,
    user_name: str,
    session: AsyncSession,
    app_state: Any
) -> Dict[str, Any]:
    """
    US-07 & US-11: Aggregates multi-domain data and pipes it through the AI Core
    to generate a personalized 'Smart Overview'. Strictly returns a dict matching
    the SmartOverviewResponse Pydantic schema.
    """
    cache_key = f"dashboard:smart_overview:{user_id}"
    redis_cache = getattr(app_state, "redis_cache", None)

    # 1. Check Cache Layer (Crucial for mitigating LLM costs and latency)
    if redis_cache:
        try:
            cached = await redis_cache.get(cache_key)
            if cached:
                logger.debug(f"[DASHBOARD] Cache hit for Smart Overview | User: {user_id}")
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"[DASHBOARD] Redis cache GET failed for user {user_id}: {e}")

    # 2. Extract Base Telemetry (Sequential for safety, optimize with gather if pool allows)
    logger.debug(f"[DASHBOARD] Extracting raw telemetry for User: {user_id}")

    due_count_query = await session.execute(
        select(func.count(Flashcard.id))
        .where(
            Flashcard.user_id == user_id,
            Flashcard.next_review_at <= datetime.utcnow()
        )
    )
    due_count = due_count_query.scalar_one_or_none() or 0

    quizzes_query = await session.execute(
        select(QuizSession)
        .where(QuizSession.student_id == user_id)
        .order_by(desc(QuizSession.created_at))
        .limit(5)
    )
    quiz_sessions = quizzes_query.scalars().all()

    total_xp = await get_total_xp(session, user_id)

    # Compile telemetry for the AI Engine
    telemetry_stats = {
        "due_flashcards": due_count,
        "recent_quizzes": [q.id for q in quiz_sessions], # Just passing IDs/presence to avoid heavy serialization
        "total_xp": total_xp
    }

    # 3. Generate AI Insights
    # In a fully deployed state, this invokes the LLM. We log the action for audit/cost tracking.
    start_time = datetime.utcnow()
    ai_insights = await generate_dashboard_insights(user_name, telemetry_stats)
    latency = (datetime.utcnow() - start_time).total_seconds()

    logger.info(f"[AI_CORE_AUDIT] Generated Dashboard Insights | User: {user_id} | Latency: {latency:.2f}s")

    # 4. Payload Construction (Must strictly match SmartOverviewResponse Schema)
    payload = {
        "greeting": ai_insights["greeting"],
        "progress": {
            "overall_completion_percentage": min(100, 10 + (total_xp // 50)), # Example derived calculation
            "active_streak_days": len(quiz_sessions) # Simplified streak logic
        },
        "daily_goals": ai_insights["daily_goals"],
        "recommended_courses": ai_insights["recommended_courses"],
        "weak_topics": ai_insights["weak_topics"],
        "suggested_flashcards": ai_insights["suggested_flashcards"]
    }

    # 5. Populate Cache Layer (300 seconds / 5 min TTL)
    if redis_cache:
        try:
            await redis_cache.setex(cache_key, 300, json.dumps(payload, default=str))
            logger.debug(f"[DASHBOARD] Cached Smart Overview for User: {user_id}")
        except Exception as e:
            logger.warning(f"[DASHBOARD] Redis cache SET failed for user {user_id}: {e}")

    return payload


# ==========================================
# EXPORT ENGINE (ICS CALENDAR)
# ==========================================

async def generate_student_calendar_ics(
    user_id: uuid.UUID,
    session: AsyncSession
) -> str:
    """
    US-07: Translates upcoming flashcard reviews and recent study sessions
    into an iCalendar (.ics) formatted string.
    """
    now = datetime.utcnow()
    window_end = now + timedelta(days=14)

    # Query 1: Upcoming Flashcard Reviews (Next 14 Days)
    cards_query = await session.execute(
        select(Flashcard)
        .where(
            Flashcard.user_id == user_id,
            Flashcard.next_review_at >= now,
            Flashcard.next_review_at <= window_end,
        )
        .order_by(Flashcard.next_review_at.asc())
        .limit(50)
    )
    due_flashcards = cards_query.scalars().all()

    # Query 2: Recent Quiz Sessions (Past 7 Days)
    quizzes_query = await session.execute(
        select(QuizSession)
        .where(
            QuizSession.student_id == user_id,
            QuizSession.created_at >= now - timedelta(days=7),
        )
        .order_by(QuizSession.created_at.desc())
        .limit(20)
    )
    quiz_sessions = quizzes_query.scalars().all()

    # Build ICS Standard Header
    lines: List[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ATLAS//Student Dashboard//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH"
    ]

    # Append Flashcard Events
    for card in due_flashcards:
        if not card.next_review_at:
            continue
        dt = card.next_review_at.strftime("%Y%m%dT%H%M%SZ")
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:flashcard-{card.id}@atlas",
            f"DTSTAMP:{dt}",
            f"DTSTART:{dt}",
            "DURATION:PT10M",  # Assume 10 min review block
            "SUMMARY:Flashcard Review",
            "DESCRIPTION:Scheduled spaced repetition review.",
            "END:VEVENT",
        ])

    # Append Quiz Session Events
    for quiz in quiz_sessions:
        if not quiz.created_at:
            continue
        dt = quiz.created_at.strftime("%Y%m%dT%H%M%SZ")
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:quiz-{quiz.id}@atlas",
            f"DTSTAMP:{dt}",
            f"DTSTART:{dt}",
            "DURATION:PT30M", # Assume 30 min quiz block
            "SUMMARY:Quiz Session",
            "DESCRIPTION:Recorded study session.",
            "END:VEVENT",
        ])

    lines.append("END:VCALENDAR")

    # The ICS spec strictly requires CRLF (\r\n) line endings
    ics_content = "\r\n".join(lines)

    logger.info(f"[DASHBOARD] ICS Calendar generated for user {user_id} with {len(due_flashcards) + len(quiz_sessions)} events.")
    return ics_content
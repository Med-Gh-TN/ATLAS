"""
@file backend/app/routers/student_dashboard.py
@description Student dashboard — real dynamic data, using study sessions for activity.
@layer Core Logic
@dependencies app.models.all_models, app.schemas.dashboard, app.db.session, app.dependencies
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.dependencies import require_role
from app.models.all_models import (
    User,
    UserStreak,
    QuizSession,
    FlashcardDeck,
    Flashcard,
    TopicKnowledge,
    Course,
    Department,
    DailyGoal,
    StudySession,
)
from app.schemas.dashboard import (
    SmartOverviewResponse,
    DashboardProgress,
    AIGoal,
    CourseRecommendation,
    WeakTopic,
    SuggestedFlashcardDeck,
    WeeklyActivityData,
)

router = APIRouter(tags=["Dashboard"])


def _build_greeting(user: User) -> str:
    first_name = (user.full_name or "").split(" ")[0]
    return f"Welcome back, {first_name}!" if first_name else "Welcome back!"


async def _get_streak_days(user_id: UUID, db: AsyncSession) -> int:
    streak_row = (
        await db.execute(select(UserStreak).where(UserStreak.user_id == user_id))
    ).scalar_one_or_none()
    if streak_row and streak_row.current_streak:
        return streak_row.current_streak
    return 0


async def _get_today_study_minutes(user_id: UUID, db: AsyncSession) -> int:
    today = datetime.utcnow().date()
    result = await db.execute(
        select(func.coalesce(func.sum(
            func.extract("epoch", StudySession.ended_at - StudySession.started_at)
        ), 0)).where(
            StudySession.user_id == user_id,
            func.date(StudySession.started_at) == today,
            StudySession.ended_at.isnot(None),
        )
    )
    total_seconds = result.scalar_one() or 0
    return int(total_seconds // 60)


async def _get_overall_completion(user_id: UUID, db: AsyncSession) -> int:
    return 0


async def _get_weekly_activity(user_id: UUID, db: AsyncSession) -> list[WeeklyActivityData]:
    now = datetime.utcnow()
    start_date = now.date() - timedelta(days=6)

    result = await db.execute(
        select(
            cast(StudySession.started_at, Date).label("day"),
            func.coalesce(func.sum(
                func.extract("epoch", StudySession.ended_at - StudySession.started_at)
            ), 0).label("total_seconds"),
        )
        .where(
            StudySession.user_id == user_id,
            func.date(StudySession.started_at) >= start_date,
            StudySession.ended_at.isnot(None),
        )
        .group_by(cast(StudySession.started_at, Date))
    )

    db_map = {row.day: int(row.total_seconds // 60) for row in result.all()}

    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    activity: list[WeeklyActivityData] = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        day_str = day_names[day.weekday()]
        minutes = db_map.get(day, 0)
        activity.append(WeeklyActivityData(day=day_str, activities=minutes))
    return activity


async def _get_recommended_courses(user: User, db: AsyncSession) -> list[CourseRecommendation]:
    query = (
        select(Course, Department.name.label("department_name"))
        .outerjoin(Department, Department.id == Course.department_id)
    )

    if user.major_id:
        query = query.where(Course.major_id == user.major_id)
    elif user.filiere:
        query = query.where(Department.name == user.filiere, Course.level == user.level)
    elif user.level:
        query = query.where(Course.level == user.level)

    rows = (
        await db.execute(query.order_by(desc(Course.created_at)).limit(5))
    ).all()
    return [
        CourseRecommendation(
            course_id=course.id,
            title=course.title,
            progress_percentage=0,
        )
        for course, _ in rows
    ]


async def _get_weak_topics(user_id: UUID, db: AsyncSession) -> list[WeakTopic]:
    rows = (
        await db.execute(
            select(TopicKnowledge)
            .where(TopicKnowledge.user_id == user_id, TopicKnowledge.needs_review.is_(True))
            .order_by(TopicKnowledge.confidence_score.asc())
            .limit(5)
        )
    ).scalars().all()
    return [
        WeakTopic(
            topic_name=row.topic_name,
            accuracy_percentage=int(row.confidence_score),
            suggested_action="Review related quizzes",
        )
        for row in rows
    ]


async def _get_suggested_flashcards(user_id: UUID, db: AsyncSession) -> list[SuggestedFlashcardDeck]:
    decks = (
        await db.execute(select(FlashcardDeck).where(FlashcardDeck.student_id == user_id))
    ).scalars().all()

    now_naive = datetime.utcnow()

    result: list[SuggestedFlashcardDeck] = []
    for deck in decks:
        due = (
            await db.execute(
                select(func.count(Flashcard.id)).where(
                    Flashcard.deck_id == deck.id,
                    Flashcard.next_review_at <= now_naive,
                )
            )
        ).scalar_one()
        result.append(
            SuggestedFlashcardDeck(
                deck_id=deck.id,
                title=deck.title,
                due_cards_count=int(due or 0),
            )
        )
    result.sort(key=lambda d: d.due_cards_count, reverse=True)
    return result[:5]


async def _get_user_goals(user_id: UUID, db: AsyncSession) -> list[AIGoal]:
    rows = (
        await db.execute(
            select(DailyGoal)
            .where(DailyGoal.user_id == user_id)
            .order_by(DailyGoal.created_at.desc())
            .limit(5)
        )
    ).scalars().all()
    return [
        AIGoal(
            id=goal.id,
            description=goal.description,
            is_completed=goal.is_completed,
            priority=goal.priority,
        )
        for goal in rows
    ]


async def _get_system_goals(
    user_id: UUID,
    db: AsyncSession,
    today_minutes: int,
    due_decks: list[SuggestedFlashcardDeck],
) -> list[AIGoal]:
    goals: list[AIGoal] = []

    if today_minutes < 30:
        goals.append(
            AIGoal(
                id=UUID("00000000-0000-0000-0000-000000000001"),
                description="Study for at least 30 minutes today",
                is_completed=today_minutes >= 30,
                priority=1,
            )
        )

    total_due = sum(d.due_cards_count for d in due_decks)
    if total_due > 0:
        goals.append(
            AIGoal(
                id=UUID("00000000-0000-0000-0000-000000000002"),
                description=f"Review your {total_due} due flashcards",
                is_completed=False,
                priority=2,
            )
        )

    today_date = datetime.utcnow().date()
    quiz_today = (
        await db.execute(
            select(func.count(QuizSession.id)).where(
                QuizSession.student_id == user_id,
                func.date(QuizSession.created_at) == today_date,
            )
        )
    ).scalar_one()
    if quiz_today == 0:
        goals.append(
            AIGoal(
                id=UUID("00000000-0000-0000-0000-000000000003"),
                description="Take a quiz on one of your recommended courses",
                is_completed=False,
                priority=3,
            )
        )

    return goals


@router.get("/students/me/dashboard", response_model=SmartOverviewResponse)
async def student_dashboard(
    current_user: User = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_session),
) -> SmartOverviewResponse:
    user_id = current_user.id

    streak = await _get_streak_days(user_id, db)
    recommended = await _get_recommended_courses(current_user, db)
    weak_topics = await _get_weak_topics(user_id, db)
    flashcards = await _get_suggested_flashcards(user_id, db)
    user_goals = await _get_user_goals(user_id, db)
    weekly = await _get_weekly_activity(user_id, db)

    today_minutes = await _get_today_study_minutes(user_id, db)
    system_goals = await _get_system_goals(user_id, db, today_minutes, flashcards)
    combined_goals = user_goals + system_goals

    completion = await _get_overall_completion(user_id, db)

    return SmartOverviewResponse(
        greeting=_build_greeting(current_user),
        progress=DashboardProgress(
            overall_completion_percentage=completion,
            active_streak_days=streak,
            today_study_minutes=today_minutes,
        ),
        daily_goals=combined_goals,
        recommended_courses=recommended,
        weak_topics=weak_topics,
        suggested_flashcards=flashcards,
        weekly_activity=weekly,
    )


@router.get("/students/me/history")
async def student_history(
    current_user: User = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(StudySession)
        .where(StudySession.user_id == current_user.id)
        .order_by(desc(StudySession.started_at))
        .limit(100)
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(item.id),
            "started_at": item.started_at.isoformat() if item.started_at else None,
            "ended_at": item.ended_at.isoformat() if item.ended_at else None,
            "source": item.source,
        }
        for item in rows
    ]
from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Any, List, Dict
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.dependencies import require_role
from app.models.all_models import Notification
from app.models.annotation import DocumentAnnotation
from app.models.contribution import Contribution, DocumentVersion
from app.models.course import Course
from app.models.study_tools import FlashcardDeck, QuizSession
from app.models.user import Department, User
from app.models.study_goals import StudySession  # new: for active study activity

router = APIRouter(tags=["Dashboard"])
REPORT_TITLE_PREFIX = "Feedback received: "

@router.get("/analytics/daily-activity")
async def daily_activity(
    days: int = 365,
    current_user: User = Depends(require_role("TEACHER", "ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> List[Dict[str, Any]]:
    start_date = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(
            func.date(Contribution.created_at).label("date"),
            func.count(Contribution.id).label("value"),
        )
        .where(Contribution.uploader_id == current_user.id, Contribution.created_at >= start_date)
        .group_by(func.date(Contribution.created_at))
        .order_by(func.date(Contribution.created_at))
    )
    rows = result.all()
    data = [ {"date": r.date.isoformat(), "value": int(r.value)} for r in rows ]
    return data


@router.get("/teacher/analytics")
async def teacher_analytics(
    current_user: User = Depends(require_role("TEACHER", "ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)
    quarter_start = now - timedelta(days=90)

    summary_row = (
        await db.execute(
            select(
                func.count(Contribution.id),
                func.count(func.distinct(Contribution.course_id)),
                func.sum(case((Contribution.status == "APPROVED", 1), else_=0)),
                func.sum(case((Contribution.status == "PENDING", 1), else_=0)),
                func.sum(case((Contribution.status == "REJECTED", 1), else_=0)),
                func.sum(case((Contribution.created_at >= week_start, 1), else_=0)),
                func.sum(case((Contribution.created_at >= month_start, 1), else_=0)),
            ).where(Contribution.uploader_id == current_user.id)
        )
    ).one()

    doc_stats = (
        await db.execute(
            select(
                func.count(DocumentVersion.id),
            )
            .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
            .where(Contribution.uploader_id == current_user.id)
        )
    ).one()

    annotation_count = (
        await db.execute(
            select(func.count(DocumentAnnotation.id))
            .join(DocumentVersion, DocumentVersion.id == DocumentAnnotation.document_version_id)
            .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
            .where(Contribution.uploader_id == current_user.id)
        )
    ).scalar_one()

    # Legacy forum stats removed; returned as 0
    forum_posts = 0
    forum_replies = 0

    weeks = 12
    trend_data = []
    for i in range(weeks):
        week_end = now - timedelta(weeks=i)
        week_begin = week_end - timedelta(weeks=1)
        trend_row = (
            await db.execute(
                select(
                    func.count(Contribution.id),
                    func.sum(case((Contribution.status == "APPROVED", 1), else_=0)),
                )
                .where(
                    Contribution.uploader_id == current_user.id,
                    Contribution.created_at >= week_begin,
                    Contribution.created_at < week_end,
                )
            )
        ).one()
        trend_data.append({
            "week": f"W-{weeks - i}",
            "uploads": int(trend_row[0] or 0),
            "approved": int(trend_row[1] or 0),
        })

    top_courses_rows = (
        await db.execute(
            select(
                Course.id,
                Course.title,
                func.count(Contribution.id).label("uploads"),
                func.sum(case((Contribution.status == "APPROVED", 1), else_=0)).label("approved_uploads"),
                func.max(Contribution.created_at).label("last_submission_at"),
            )
            .join(Contribution, Contribution.course_id == Course.id)
            .where(Contribution.uploader_id == current_user.id)
            .group_by(Course.id, Course.title)
            .order_by(desc("uploads"), desc("last_submission_at"))
            .limit(5)
        )
    ).all()

    total_uploads = int(summary_row[0] or 0)
    approved_uploads = int(summary_row[2] or 0)
    engagement_rate = (approved_uploads / total_uploads * 100) if total_uploads > 0 else 0.0

    return {
        "summary": {
            "total_courses": int(summary_row[1] or 0),
            "total_uploads": total_uploads,
            "approved_uploads": approved_uploads,
            "pending_uploads": int(summary_row[3] or 0),
            "rejected_uploads": int(summary_row[4] or 0),
            "engagement_rate": round(engagement_rate, 2),
        },
        "activity": {
            "recent_uploads_7d": int(summary_row[5] or 0),
            "recent_uploads_30d": int(summary_row[6] or 0),
            "weekly_trend": trend_data,
        },
        "engagement": {
            "total_document_views": 0,
            "total_downloads": 0,
            "student_annotations": int(annotation_count or 0),
            "forum_posts": int(forum_posts or 0),
            "forum_replies": int(forum_replies or 0),
            "total_interactions": int(annotation_count or 0) + int(forum_posts or 0) + int(forum_replies or 0),
        },
        "top_courses": [
            {
                "course_id": str(row[0]),
                "title": row[1],
                "uploads": int(row[2] or 0),
                "approved_uploads": int(row[3] or 0),
                "last_submission_at": row[4],
            }
            for row in top_courses_rows
        ],
        "period": {
            "current_week_start": week_start.isoformat(),
            "current_month_start": month_start.isoformat(),
            "quarter_start": quarter_start.isoformat(),
        },
    }


@router.get("/teacher/courses/{course_id}/analytics")
async def teacher_course_analytics(
    course_id: UUID,
    _current_user: User = Depends(require_role("TEACHER", "ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    document_version_ids = (
        await db.execute(
            select(DocumentVersion.id)
            .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
            .where(Contribution.course_id == course_id)
        )
    ).scalars().all()

    doc_stats = (
        await db.execute(
            select(
                func.count(DocumentVersion.id),
            )
            .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
            .where(Contribution.course_id == course_id)
        )
    ).one()

    annotation_count = (
        await db.execute(
            select(func.count(DocumentAnnotation.id))
            .join(DocumentVersion, DocumentVersion.id == DocumentAnnotation.document_version_id)
            .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
            .where(Contribution.course_id == course_id)
        )
    ).scalar_one()

    unique_students = (
        await db.execute(
            select(func.count(func.distinct(DocumentAnnotation.user_id)))
            .join(DocumentVersion, DocumentVersion.id == DocumentAnnotation.document_version_id)
            .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
            .where(Contribution.course_id == course_id)
        )
    ).scalar_one()

    # Legacy forum posts removed; set to 0
    forum_posts = 0

    flashcard_decks = 0
    quiz_sessions = 0
    if document_version_ids:
        flashcard_decks = (
            await db.execute(
                select(func.count(FlashcardDeck.id))
                .where(FlashcardDeck.document_version_id.in_(document_version_ids))
            )
        ).scalar_one()

        quiz_sessions = (
            await db.execute(
                select(func.count(QuizSession.id))
                .where(QuizSession.document_version_id.in_(document_version_ids))
            )
        ).scalar_one()

    return {
        "course_id": str(course_id),
        "documents": {
            "total_versions": int(doc_stats[0] or 0),
            "total_views": 0,
            "total_downloads": 0,
        },
        "engagement": {
            "total_annotations": int(annotation_count or 0),
            "unique_students_engaged": int(unique_students or 0),
            "forum_posts": int(forum_posts or 0),
            "study_tools": {
                "flashcard_decks_created": int(flashcard_decks or 0),
                "quiz_sessions_completed": int(quiz_sessions or 0),
            },
        },
    }


@router.get("/admin/dashboard")
async def admin_dashboard(
    _current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)

    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_courses = (await db.execute(select(func.count(Course.id)))).scalar_one()
    total_contributions = (await db.execute(select(func.count(Contribution.id)))).scalar_one()

    pending_contributions = (
        await db.execute(select(func.count(Contribution.id)).where(Contribution.status == "PENDING"))
    ).scalar_one()
    approved_contributions = (
        await db.execute(select(func.count(Contribution.id)).where(Contribution.status == "APPROVED"))
    ).scalar_one()
    rejected_contributions = (
        await db.execute(select(func.count(Contribution.id)).where(Contribution.status == "REJECTED"))
    ).scalar_one()

    new_users_7d = (
        await db.execute(select(func.count(User.id)).where(User.created_at >= week_start))
    ).scalar_one()
    new_contributions_7d = (
        await db.execute(select(func.count(Contribution.id)).where(Contribution.created_at >= week_start))
    ).scalar_one()
    new_courses_7d = (
        await db.execute(select(func.count(Course.id)).where(Course.created_at >= week_start))
    ).scalar_one()

    total_reports = (
        await db.execute(
            select(func.count(Notification.id)).where(Notification.title.like(f"{REPORT_TITLE_PREFIX}%"))
        )
    ).scalar_one()
    pending_reports = (
        await db.execute(
            select(func.count(Notification.id)).where(
                Notification.title.like(f"{REPORT_TITLE_PREFIX}%"),
                Notification.is_read.is_(False),
            )
        )
    ).scalar_one()

    total_quizzes = (await db.execute(select(func.count(QuizSession.id)))).scalar_one()
    total_flashcard_decks = (await db.execute(select(func.count(FlashcardDeck.id)))).scalar_one()
    quiz_sessions_7d = (
        await db.execute(select(func.count(QuizSession.id)).where(QuizSession.created_at >= week_start))
    ).scalar_one()

    # Legacy forum stats removed; set to 0
    total_forum_posts = 0
    forum_posts_7d = 0

    # Active users: distinct users with a StudySession in the last 7 days
    active_users_7d = (
        await db.execute(
            select(func.count(func.distinct(StudySession.user_id)))
            .where(StudySession.started_at >= week_start)
        )
    ).scalar_one()

    weekly_activity = []
    for i in range(7):
        day_end = now - timedelta(days=i)
        day_begin = day_end - timedelta(days=1)
        day_users = (
            await db.execute(
                select(func.count(func.distinct(StudySession.user_id)))
                .where(StudySession.started_at >= day_begin, StudySession.started_at < day_end)
            )
        ).scalar_one()
        day_contributions = (
            await db.execute(
                select(func.count(Contribution.id))
                .where(Contribution.created_at >= day_begin, Contribution.created_at < day_end)
            )
        ).scalar_one()
        day_name = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day_end.weekday()]
        weekly_activity.append({
            "day": day_name,
            "users": int(day_users or 0),
            "contributions": int(day_contributions or 0),
        })
    weekly_activity.reverse()

    user_role_rows = (
        await db.execute(select(User.role, func.count(User.id)).group_by(User.role))
    ).all()

    contribution_status_rows = (
        await db.execute(
            select(Contribution.status, func.count(Contribution.id)).group_by(Contribution.status)
        )
    ).all()

    # Top contributors by contribution count (last 30 days)
    top_contributors_rows = (
        await db.execute(
            select(
                User.id,
                User.full_name,
                User.email,
                func.count(Contribution.id).label("contribution_count"),
            )
            .join(Contribution, Contribution.uploader_id == User.id)
            .where(Contribution.created_at >= month_start)
            .group_by(User.id, User.full_name, User.email)
            .order_by(desc("contribution_count"))
            .limit(10)
        )
    ).all()

    top_courses_rows = (
        await db.execute(
            select(
                Course.id,
                Course.title,
                func.count(Contribution.id).label("contribution_count"),
            )
            .join(Contribution, Contribution.course_id == Course.id)
            .group_by(Course.id, Course.title)
            .order_by(desc("contribution_count"))
            .limit(10)
        )
    ).all()

    return {
        "totals": {
            "users": int(total_users or 0),
            "courses": int(total_courses or 0),
            "contributions": {
                "total": int(total_contributions or 0),
                "approved": int(approved_contributions or 0),
                "pending": int(pending_contributions or 0),
                "rejected": int(rejected_contributions or 0),
            },
            "reports": {
                "total": int(total_reports or 0),
                "pending": int(pending_reports or 0),
            },
        },
        "activity_7d": {
            "new_users": int(new_users_7d or 0),
            "new_contributions": int(new_contributions_7d or 0),
            "new_courses": int(new_courses_7d or 0),
            "quiz_sessions": int(quiz_sessions_7d or 0),
            "forum_posts": int(forum_posts_7d or 0),
            "active_users": int(active_users_7d or 0),
        },
        "weekly_activity": weekly_activity,
        "study_tools": {
            "total_quizzes_taken": int(total_quizzes or 0),
            "total_flashcard_decks": int(total_flashcard_decks or 0),
        },
        "forum": {
            "total_posts": int(total_forum_posts or 0),
        },
        "breakdown": {
            "users_by_role": {str(role): int(count or 0) for role, count in user_role_rows},
            "contributions_by_status": {str(status): int(count or 0) for status, count in contribution_status_rows},
        },
        "top_performers": {
            "users_by_contributions": [
                {
                    "id": str(row[0]),
                    "full_name": row[1],
                    "email": row[2],
                    "contribution_count_30d": int(row[3] or 0),
                }
                for row in top_contributors_rows
            ],
            "courses_by_contributions": [
                {
                    "id": str(row[0]),
                    "title": row[1],
                    "contribution_count": int(row[2] or 0),
                }
                for row in top_courses_rows
            ],
        },
        "period": {
            "week_start": week_start.isoformat(),
            "month_start": month_start.isoformat(),
        },
    }


@router.get("/admin/analytics/export")
async def export_admin_analytics(
    _current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> Response:
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_courses = (await db.execute(select(func.count(Course.id)))).scalar_one()
    total_contributions = (await db.execute(select(func.count(Contribution.id)))).scalar_one()
    pending_contributions = (
        await db.execute(select(func.count(Contribution.id)).where(Contribution.status == "PENDING"))
    ).scalar_one()
    total_reports = (
        await db.execute(
            select(func.count(Notification.id)).where(Notification.title.like(f"{REPORT_TITLE_PREFIX}%"))
        )
    ).scalar_one()
    pending_reports = (
        await db.execute(
            select(func.count(Notification.id)).where(
                Notification.title.like(f"{REPORT_TITLE_PREFIX}%"),
                Notification.is_read.is_(False),
            )
        )
    ).scalar_one()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["metric", "value"])
    writer.writerow(["total_users", int(total_users or 0)])
    writer.writerow(["total_courses", int(total_courses or 0)])
    writer.writerow(["total_contributions", int(total_contributions or 0)])
    writer.writerow(["pending_contributions", int(pending_contributions or 0)])
    writer.writerow(["total_reports", int(total_reports or 0)])
    writer.writerow(["pending_reports", int(pending_reports or 0)])

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=atlas-admin-analytics.csv"},
    )
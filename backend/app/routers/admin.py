from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.dependencies import require_role
from app.models.course import Course, CourseLevel
from app.models.major import Major
from app.models.user import (
    AccountStatus,
    Department,
    Establishment,
    TeacherProfile,
    TeacherRequestStatus,
    TeacherVerificationRequest,
    User,
    UserRole,
    UserStreak,
)
from app.schemas.pagination import build_paginated_response

from app.models.contribution import Contribution
from app.models.collaboration import ForumPost, ForumReply, ForumVote, StudyGroup, StudyGroupMember, LiveSession, LearningPathJob
from app.models.notification import Notification
from app.models.progress import ReadingProgress
from app.models.annotation import DocumentAnnotation
from app.models.intelligence import UserProfile, TopicKnowledge, UserMemory, LearningInsight

router = APIRouter(tags=["Admin"])


class TeacherRequestReviewRequest(BaseModel):
    review_note: str | None = None


class DepartmentCreateRequest(BaseModel):
    name: str


class DepartmentUpdateRequest(BaseModel):
    name: str | None = None
    is_deleted: bool | None = None   # Added for archiving


class CatalogCourseCreateRequest(BaseModel):
    title: str
    description: str | None = None
    department_id: UUID
    level: str
    academic_year: str
    major_id: UUID | None = None
    filiere: str | None = None


class CatalogCourseUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    department_id: UUID | None = None
    level: str | None = None
    academic_year: str | None = None
    is_deleted: bool | None = None
    major_id: UUID | None = None
    filiere: str | None = None


class MajorCreate(BaseModel):
    name: str
    department_id: UUID
    level: str


class MajorUpdate(BaseModel):
    name: str | None = None
    department_id: UUID | None = None
    level: str | None = None
    is_deleted: bool | None = None


class MajorOut(BaseModel):
    id: str
    name: str
    department_id: str
    level: str
    created_at: str
    is_deleted: bool | None = None   # Added for frontend


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    filiere: str | None = None
    level: str | None = None
    date_of_birth: str | None = None
    gender: str | None = None
    phone_number: str | None = None
    address: str | None = None
    preferred_language: str | None = None
    is_deleted: bool | None = None


def _serialize_department(department: Department) -> dict[str, Any]:
    return {
        "id": str(department.id),
        "name": department.name,
        "establishment_id": str(department.establishment_id),
        "created_at": department.created_at,
        "is_deleted": department.is_deleted if hasattr(department, "is_deleted") else False,
    }


def _serialize_catalog_course(
    course: Course, department: Department | None = None
) -> dict[str, Any]:
    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "department_id": str(course.department_id) if course.department_id else None,
        "department_name": department.name if department else None,
        "major_id": str(course.major_id) if course.major_id else None,
        "filiere": course.filiere,
        "level": course.level.value if hasattr(course.level, "value") else course.level,
        "academic_year": course.academic_year,
        "created_at": course.created_at,
        "is_deleted": course.is_deleted,
    }


@router.get("/admin/majors", response_model=list[MajorOut])
async def list_majors(
    department_id: UUID | None = Query(None),
    level: str | None = Query(None),
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(require_role("ADMIN")),
):
    query = select(Major)
    if department_id:
        query = query.where(Major.department_id == department_id)
    if level:
        query = query.where(Major.level == level)
    if not include_archived:
        query = query.where(Major.is_deleted == False)
    result = await db.execute(query.order_by(Major.level, Major.name))
    majors = result.scalars().all()
    return [
        MajorOut(
            id=str(m.id),
            name=m.name,
            department_id=str(m.department_id),
            level=m.level.value if hasattr(m.level, "value") else str(m.level),
            created_at=m.created_at.isoformat() if m.created_at else "",
            is_deleted=m.is_deleted,
        )
        for m in majors
    ]


@router.post("/admin/majors", status_code=201, response_model=MajorOut)
async def create_major(
    payload: MajorCreate,
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(require_role("ADMIN")),
):
    major = Major(
        name=payload.name,
        department_id=payload.department_id,
        level=CourseLevel(payload.level),
        is_deleted=False,
    )
    db.add(major)
    await db.commit()
    await db.refresh(major)
    return MajorOut(
        id=str(major.id),
        name=major.name,
        department_id=str(major.department_id),
        level=major.level.value if hasattr(major.level, "value") else str(major.level),
        created_at=major.created_at.isoformat() if major.created_at else "",
        is_deleted=major.is_deleted,
    )


@router.patch("/admin/majors/{major_id}", response_model=MajorOut)
async def update_major(
    major_id: UUID,
    payload: MajorUpdate,
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(require_role("ADMIN")),
):
    major = await db.get(Major, major_id)
    if major is None:
        raise atlas_error("MAJOR_001", "Major not found", status_code=404)
    if payload.name is not None:
        major.name = payload.name
    if payload.department_id is not None:
        major.department_id = payload.department_id
    if payload.level is not None:
        major.level = CourseLevel(payload.level)
    if payload.is_deleted is not None:
        # If archiving this major, also archive all its courses
        if payload.is_deleted and not major.is_deleted:
            await db.execute(
                update(Course)
                .where(Course.major_id == major_id)
                .values(is_deleted=True)
            )
        # If restoring, we could optionally restore courses? Business decision: keep courses archived.
        major.is_deleted = payload.is_deleted
    db.add(major)
    await db.commit()
    await db.refresh(major)
    return MajorOut(
        id=str(major.id),
        name=major.name,
        department_id=str(major.department_id),
        level=major.level.value if hasattr(major.level, "value") else str(major.level),
        created_at=major.created_at.isoformat() if major.created_at else "",
        is_deleted=major.is_deleted,
    )


@router.delete("/admin/majors/{major_id}")
async def delete_major(
    major_id: UUID,
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(require_role("ADMIN")),
):
    # Soft delete: set is_deleted = True and cascade to courses
    major = await db.get(Major, major_id)
    if major is None:
        raise atlas_error("MAJOR_001", "Major not found", status_code=404)
    major.is_deleted = True
    await db.execute(
        update(Course)
        .where(Course.major_id == major_id)
        .values(is_deleted=True)
    )
    db.add(major)
    await db.commit()
    return {"success": True, "message": "Major archived successfully."}


@router.get("/admin/departments")
async def list_departments(
    include_archived: bool = Query(False),
    _current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    filters = [Department.establishment_id == _current_user.establishment_id]
    if not include_archived:
        filters.append(Department.is_deleted == False)
    result = await db.execute(select(Department).where(*filters).order_by(Department.name.asc()))
    return [_serialize_department(item) for item in result.scalars().all()]


@router.post("/admin/departments")
async def create_department(
    payload: DepartmentCreateRequest,
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    if not current_user.establishment_id:
        raise atlas_error("ADMIN_001", "Admin must belong to an establishment.", status_code=400)

    department = Department(
        name=payload.name.strip(),
        establishment_id=current_user.establishment_id,
        is_deleted=False,
    )
    db.add(department)
    await db.commit()
    await db.refresh(department)
    return _serialize_department(department)


@router.patch("/admin/departments/{department_id}")
async def update_department(
    department_id: UUID,
    payload: DepartmentUpdateRequest,
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    department = await db.get(Department, department_id)
    if department is None:
        raise atlas_error("DEPT_001", "Department not found.", status_code=404)
    if (
        current_user.establishment_id
        and department.establishment_id != current_user.establishment_id
    ):
        raise atlas_error("AUTH_008", "You do not have access to this department.", status_code=403)

    if payload.name is not None:
        department.name = payload.name.strip()

    if payload.is_deleted is not None:
        # If archiving this department, archive all its majors and courses
        if payload.is_deleted and not department.is_deleted:
            # Archive all majors in this department
            await db.execute(
                update(Major)
                .where(Major.department_id == department_id)
                .values(is_deleted=True)
            )
            # Archive all courses in this department (including those without a major)
            await db.execute(
                update(Course)
                .where(Course.department_id == department_id)
                .values(is_deleted=True)
            )
        department.is_deleted = payload.is_deleted

    db.add(department)
    await db.commit()
    await db.refresh(department)
    return _serialize_department(department)


@router.delete("/admin/departments/{department_id}")
async def delete_department(
    department_id: UUID,
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    # Soft delete: set is_deleted = True and cascade to majors and courses
    department = await db.get(Department, department_id)
    if department is None:
        raise atlas_error("DEPT_001", "Department not found.", status_code=404)
    if (
        current_user.establishment_id
        and department.establishment_id != current_user.establishment_id
    ):
        raise atlas_error("AUTH_008", "You do not have access to this department.", status_code=403)

    department.is_deleted = True
    await db.execute(
        update(Major)
        .where(Major.department_id == department_id)
        .values(is_deleted=True)
    )
    await db.execute(
        update(Course)
        .where(Course.department_id == department_id)
        .values(is_deleted=True)
    )
    db.add(department)
    await db.commit()
    return {"success": True, "message": "Department archived successfully."}


@router.get("/admin/catalog/courses")
async def list_catalog_courses(
    include_archived: bool = Query(False),
    _current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    query = (
        select(Course, Department)
        .outerjoin(Department, Department.id == Course.department_id)
        .where(Department.establishment_id == _current_user.establishment_id)
    )
    if not include_archived:
        query = query.where(Course.is_deleted == False)
    result = await db.execute(query.order_by(desc(Course.created_at)))
    rows = result.all()
    return [_serialize_catalog_course(course, department) for course, department in rows]


@router.post("/admin/catalog/courses")
async def create_catalog_course(
    payload: CatalogCourseCreateRequest,
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    department = await db.get(Department, payload.department_id)
    if department is None:
        raise atlas_error("DEPT_001", "Department not found.", status_code=404)
    if (
        current_user.establishment_id
        and department.establishment_id != current_user.establishment_id
    ):
        raise atlas_error("AUTH_008", "You do not have access to this department.", status_code=403)

    level_value = payload.level
    major_name = None

    if payload.major_id:
        major = await db.get(Major, payload.major_id)
        if major is None:
            raise atlas_error("MAJOR_001", "Major not found.", status_code=404)
        if major.department_id != department.id:
            raise atlas_error("MAJOR_002", "Major does not belong to the selected department.", status_code=400)
        level_value = major.level.value if hasattr(major.level, "value") else str(major.level)
        major_name = payload.filiere or major.name

    course = Course(
        title=payload.title.strip(),
        description=payload.description,
        department_id=payload.department_id,
        level=CourseLevel(level_value),
        academic_year=payload.academic_year,
        major_id=payload.major_id,
        filiere=major_name or payload.filiere,
        is_deleted=False,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return _serialize_catalog_course(course, department)


@router.patch("/admin/catalog/courses/{course_id}")
async def update_catalog_course(
    course_id: UUID,
    payload: CatalogCourseUpdateRequest,
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    course = await db.get(Course, course_id)
    if course is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)

    current_dept = await db.get(Department, course.department_id)
    if (
        current_dept is None 
        or (current_user.establishment_id and current_dept.establishment_id != current_user.establishment_id)
    ):
        raise atlas_error("AUTH_008", "You do not have access to this course.", status_code=403)

    target_dept = current_dept
    if payload.department_id and payload.department_id != course.department_id:
        target_dept = await db.get(Department, payload.department_id)
        if target_dept is None:
            raise atlas_error("DEPT_001", "New department not found.", status_code=404)
        if (
            current_user.establishment_id 
            and target_dept.establishment_id != current_user.establishment_id
        ):
            raise atlas_error("AUTH_008", "You cannot move courses to another establishment.", status_code=403)
        course.department_id = payload.department_id

    if payload.major_id is not None:
        if payload.major_id:
            major = await db.get(Major, payload.major_id)
            if major is None:
                raise atlas_error("MAJOR_001", "Major not found.", status_code=404)
            if major.department_id != (payload.department_id or course.department_id):
                raise atlas_error("MAJOR_002", "Major does not belong to the selected department.", status_code=400)
            course.level = major.level
            course.filiere = payload.filiere or major.name
        else:
            if payload.level is not None:
                course.level = CourseLevel(payload.level)
            course.filiere = payload.filiere
        course.major_id = payload.major_id
    elif payload.level is not None:
        course.level = CourseLevel(payload.level)

    if payload.title is not None:
        course.title = payload.title.strip()
    if payload.description is not None:
        course.description = payload.description.strip() or None
    if payload.academic_year is not None:
        course.academic_year = payload.academic_year
    if payload.is_deleted is not None:
        course.is_deleted = payload.is_deleted
    if payload.filiere is not None:
        course.filiere = payload.filiere

    db.add(course)
    await db.commit()
    await db.refresh(course)
    return _serialize_catalog_course(course, target_dept)


@router.delete("/admin/catalog/courses/{course_id}")
async def delete_catalog_course(
    course_id: UUID,
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    # Soft delete: set is_deleted = True
    course = await db.get(Course, course_id)
    if course is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)

    dept = await db.get(Department, course.department_id)
    if (
        dept is None 
        or (current_user.establishment_id and dept.establishment_id != current_user.establishment_id)
    ):
        raise atlas_error("AUTH_008", "You do not have access to this course.", status_code=403)

    course.is_deleted = True
    db.add(course)
    await db.commit()
    return {"message": "Course archived successfully."}



@router.get("/admin/establishments")
async def list_establishments(
    _current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    query = select(Establishment).where(Establishment.id == _current_user.establishment_id)
    result = await db.execute(query.order_by(Establishment.name.asc()))
    establishments = result.scalars().all()
    return [
        {"id": str(e.id), "name": e.name, "domain": e.domain, "is_authorized": e.is_authorized}
        for e in establishments
    ]


@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: UUID,
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    user = await db.get(User, user_id)
    if user is None:
        raise atlas_error("USER_001", "User not found.", status_code=404)
    
    if (
        current_user.establishment_id
        and user.establishment_id != current_user.establishment_id
    ):
        raise atlas_error("AUTH_008", "You do not have access to this user.", status_code=403)
    
    if user.id == current_user.id:
        raise atlas_error("USER_003", "You cannot delete your own account.", status_code=400)
    
    await db.execute(
        update(Contribution)
        .where(Contribution.uploader_id == user_id)
        .values(uploader_id=None)
    )
    
    await db.execute(
        update(ForumPost)
        .where(ForumPost.author_id == user_id)
        .values(author_id=None)
    )
    await db.execute(
        update(ForumReply)
        .where(ForumReply.author_id == user_id)
        .values(author_id=None)
    )
    
    await db.execute(
        update(DocumentAnnotation)
        .where(DocumentAnnotation.user_id == user_id)
        .values(user_id=None)
    )
    
    await db.execute(delete(ForumVote).where(ForumVote.user_id == user_id))
    await db.execute(delete(StudyGroupMember).where(StudyGroupMember.user_id == user_id))
    await db.execute(delete(UserStreak).where(UserStreak.user_id == user_id))
    await db.execute(delete(Notification).where(Notification.user_id == user_id))
    await db.execute(delete(ReadingProgress).where(ReadingProgress.user_id == user_id))
    await db.execute(delete(LiveSession).where(LiveSession.teacher_id == user_id))
    await db.execute(delete(LearningPathJob).where(LearningPathJob.user_id == user_id))
    await db.execute(delete(UserProfile).where(UserProfile.user_id == user_id))
    await db.execute(delete(TopicKnowledge).where(TopicKnowledge.user_id == user_id))
    await db.execute(delete(UserMemory).where(UserMemory.user_id == user_id))
    await db.execute(delete(LearningInsight).where(LearningInsight.user_id == user_id))
    
    await db.execute(delete(StudyGroup).where(StudyGroup.owner_id == user_id))
    
    await db.delete(user)
    await db.commit()
    
    return {"message": f"User {user_id} deleted successfully. Their contributions and documents remain but are now orphaned."}


@router.get("/admin/analytics/export")
async def export_analytics_pdf(
    period: str = Query(default="monthly", description="Report period (monthly, weekly)"),
    lang: str = Query(default="en", description="Language for report"),
    current_user: User = Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_session),
):
    from app.services.doc_processing.analytics_export_service import generate_analytics_pdf

    today = datetime.utcnow()
    if period == "monthly":
        start_date = today.replace(day=1)
        period_label = today.strftime("%B %Y")
    else:
        start_date = today - timedelta(days=7)
        period_label = f"{start_date.strftime('%Y-%m-%d')} to {today.strftime('%Y-%m-%d')}"

    total_users = await db.execute(select(func.count(User.id)))
    total_courses = await db.execute(select(func.count(Course.id)).where(Course.is_deleted == False))
    total_uploads = await db.execute(
        select(func.count(Contribution.id))
        .where(Contribution.created_at >= start_date)
    )
    approved_uploads = await db.execute(
        select(func.count(Contribution.id))
        .where(Contribution.created_at >= start_date, Contribution.status == "APPROVED")
    )

    report_data = {
        "summary": {
            "total_users": total_users.scalar() or 0,
            "total_courses": total_courses.scalar() or 0,
            "total_uploads": total_uploads.scalar() or 0,
            "approved_uploads": approved_uploads.scalar() or 0,
        },
        "top_courses": [],
        "period": period_label,
    }

    pdf_bytes = generate_analytics_pdf("admin", period_label, report_data, lang)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="atlas-admin-report-{today.strftime("%Y-%m-%d")}.pdf"'
        }
    )
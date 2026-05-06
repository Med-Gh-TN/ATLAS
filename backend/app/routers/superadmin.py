from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import case, func, select, desc
from sqlalchemy.exc import IntegrityError
from typing import Any
from uuid import UUID

from app.core.exceptions import atlas_error
from app.core.security import get_password_hash
from app.db.session import get_session
from app.dependencies import require_role
from app.models.user import Establishment, User
from app.schemas.pagination import build_paginated_response

router = APIRouter(tags=["Superadmin"])

class EstablishmentCreate(BaseModel):
    name: str
    domain: str

class AdminCreate(BaseModel):
    full_name: str
    email: str
    password: str
    establishment_id: UUID

class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None

class EstablishmentUpdate(BaseModel):
    name: str | None = None
    domain: str | None = None

@router.get("/superadmin/establishments")
async def list_establishments(
    db: AsyncSession = Depends(get_session),
    _current_user: User = Depends(require_role("SUPERADMIN")),
) -> list[dict[str, Any]]:
    result = await db.execute(select(Establishment).order_by(Establishment.created_at.desc()))
    establishments = result.scalars().all()

    payload = []
    for est in establishments:
        counts = (
            await db.execute(
                select(
                    func.count(User.id),
                    func.sum(case((User.role == "STUDENT", 1), else_=0)),
                    func.sum(case((User.role == "TEACHER", 1), else_=0)),
                    func.sum(case((User.role == "ADMIN", 1), else_=0)),
                ).where(User.establishment_id == est.id)
            )
        ).one()
        payload.append({
            "id": str(est.id),
            "name": est.name,
            "domain": est.domain,
            "created_at": est.created_at,
            "users": int(counts[0] or 0),
            "students": int(counts[1] or 0),
            "teachers": int(counts[2] or 0),
            "admins": int(counts[3] or 0),
            "is_authorized": est.is_authorized,
        })
    return payload


@router.post("/superadmin/establishments")
async def create_establishment(
    data: EstablishmentCreate,
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    domain = data.domain.strip().lower()

    # Check for duplicate domain before attempting insert
    existing = await db.execute(select(Establishment).where(Establishment.domain == domain))
    if existing.scalar_one_or_none() is not None:
        raise atlas_error(
            "EST_002",
            f"An establishment with domain '{domain}' already exists.",
            status_code=409,
        )

    establishment = Establishment(
        name=data.name.strip(), domain=domain, is_authorized=True
    )
    db.add(establishment)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise atlas_error(
            "EST_002",
            f"An establishment with domain '{domain}' already exists.",
            status_code=409,
        )
    await db.refresh(establishment)
    return {
        "id": str(establishment.id),
        "name": establishment.name,
        "domain": establishment.domain,
        "is_authorized": establishment.is_authorized,
    }


@router.patch("/superadmin/establishments/{establishment_id}/toggle-authorization")
async def toggle_establishment_authorization(
    establishment_id: UUID,
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    establishment = await db.get(Establishment, establishment_id)
    if not establishment:
        raise atlas_error("EST_001", "Establishment not found.", status_code=404)

    establishment.is_authorized = not establishment.is_authorized
    db.add(establishment)
    await db.commit()
    await db.refresh(establishment)
    return {"id": str(establishment.id), "is_authorized": establishment.is_authorized}


@router.post("/superadmin/admins")
async def create_admin(
    data: AdminCreate,
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    email = data.email.strip().lower()
    
    # Check if user already exists
    existing_user = await db.execute(select(User).where(User.email == email))
    if existing_user.scalar_one_or_none() is not None:
        raise atlas_error("AUTH_003", f"A user with email '{email}' already exists.", status_code=409)
        
    # Check if establishment exists
    establishment = await db.get(Establishment, data.establishment_id)
    if not establishment:
        raise atlas_error("EST_001", "Establishment not found.", status_code=404)

    # Validate email domain matches establishment domain
    if not email.endswith(f"@{establishment.domain}"):
        raise atlas_error("AUTH_007", f"Email must end with @{establishment.domain} for this establishment.", status_code=400)

    admin = User(
        email=email,
        full_name=data.full_name.strip(),
        hashed_password=get_password_hash(data.password),
        role="ADMIN",
        establishment_id=data.establishment_id,
        is_verified=True,
        is_active=True,
    )
    db.add(admin)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise atlas_error("AUTH_003", f"A user with email '{email}' already exists.", status_code=409)
    await db.refresh(admin)
    
    return {
        "id": str(admin.id),
        "email": admin.email,
        "full_name": admin.full_name,
        "role": admin.role,
        "establishment_id": str(admin.establishment_id)
    }


@router.get("/superadmin/dashboard/stats")
async def get_dashboard_stats(
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    # Total Establishments
    establishments_count = (await db.execute(select(func.count(Establishment.id)))).scalar_one()
    # Total Users
    users_count = (await db.execute(select(func.count(User.id)))).scalar_one()
    # Admins Count
    admins_count = (await db.execute(select(func.count(User.id)).where(User.role == "ADMIN"))).scalar_one()
    # Teachers Count
    teachers_count = (await db.execute(select(func.count(User.id)).where(User.role == "TEACHER"))).scalar_one()
    
    return {
        "total_establishments": establishments_count,
        "total_users": users_count,
        "total_admins": admins_count,
        "total_teachers": teachers_count,
        "active_sessions_estimated": max(0, int(users_count * 0.05)), # Mocking realistic session count for now
        "system_health": 99.9
    }


@router.get("/superadmin/users")
async def list_users(
    role: str | None = Query(default=None),
    establishment_id: UUID | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    filters = []
    if role:
        filters.append(User.role == role.upper())
    if establishment_id:
        filters.append(User.establishment_id == establishment_id)
    if is_active is not None:
        filters.append(User.is_active.is_(is_active))

    total = await db.execute(select(func.count()).select_from(User).where(*filters))
    result = await db.execute(
        select(User).where(*filters).order_by(desc(User.created_at)).offset(offset).limit(limit)
    )
    users = result.scalars().all()
    items = [
        {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "filiere": user.filiere,
            "level": getattr(user.level, "value", user.level) if user.level else None,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "status": user.status,
            "created_at": user.created_at,
            "establishment_id": str(user.establishment_id) if user.establishment_id else None,
        }
        for user in users
    ]
    return build_paginated_response(
        items,
        total=total.scalar_one(),
        limit=limit,
        offset=offset,
    )


@router.get("/superadmin/establishments/{establishment_id}")
async def get_establishment(
    establishment_id: UUID,
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    establishment = await db.get(Establishment, establishment_id)
    if not establishment:
        raise atlas_error("EST_001", "Establishment not found.", status_code=404)
        
    counts = (
        await db.execute(
            select(
                func.count(User.id),
                func.sum(case((User.role == "STUDENT", 1), else_=0)),
                func.sum(case((User.role == "TEACHER", 1), else_=0)),
                func.sum(case((User.role == "ADMIN", 1), else_=0)),
            ).where(User.establishment_id == establishment_id)
        )
    ).one()
        
    return {
        "id": str(establishment.id),
        "name": establishment.name,
        "domain": establishment.domain,
        "created_at": establishment.created_at,
        "is_authorized": establishment.is_authorized,
        "users": int(counts[0] or 0),
        "students": int(counts[1] or 0),
        "teachers": int(counts[2] or 0),
        "admins": int(counts[3] or 0),
    }


@router.patch("/superadmin/establishments/{establishment_id}")
async def update_establishment(
    establishment_id: UUID,
    payload: EstablishmentUpdate,
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    establishment = await db.get(Establishment, establishment_id)
    if not establishment:
        raise atlas_error("EST_001", "Establishment not found.", status_code=404)

    if payload.domain is not None:
        domain = payload.domain.strip().lower()
        if domain != establishment.domain:
            existing = await db.execute(select(Establishment).where(Establishment.domain == domain))
            if existing.scalar_one_or_none() is not None:
                raise atlas_error(
                    "EST_002",
                    f"An establishment with domain '{domain}' already exists.",
                    status_code=409,
                )
            establishment.domain = domain

    if payload.name is not None:
        establishment.name = payload.name.strip()

    db.add(establishment)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise atlas_error("EST_002", "Establishment update failed due to a constraint violation.", status_code=409)
        
    await db.refresh(establishment)
    return {
        "id": str(establishment.id),
        "name": establishment.name,
        "domain": establishment.domain,
        "is_authorized": establishment.is_authorized,
    }


@router.delete("/superadmin/establishments/{establishment_id}")
async def delete_establishment(
    establishment_id: UUID,
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    establishment = await db.get(Establishment, establishment_id)
    if not establishment:
        raise atlas_error("EST_001", "Establishment not found.", status_code=404)

    # Perform deletion
    # Note: cascade_delete=True in the model relationship handles related users and departments
    await db.delete(establishment)
    await db.commit()
    
    return {"message": f"Establishment {establishment_id} and all related data deleted successfully."}


@router.patch("/superadmin/users/{user_id}")
async def superadmin_update_user(
    user_id: UUID,
    payload: UserUpdateRequest,
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await db.get(User, user_id)
    if user is None:
        raise atlas_error("USER_001", "User not found.", status_code=404)

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role is not None:
        user.role = payload.role

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "is_active": user.is_active,
    }

@router.delete("/superadmin/users/{user_id}")
async def superadmin_delete_user(
    user_id: UUID,
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await db.get(User, user_id)
    if user is None:
        raise atlas_error("USER_001", "User not found.", status_code=404)

    await db.delete(user)
    await db.commit()
    return {"message": f"User {user_id} deleted successfully."}


REPORT_TITLE_PREFIX = "Feedback received: "


class ResolveReportRequest(BaseModel):
    action: str = "dismiss"
    note: str | None = None


def _serialize_report(item):
    return {
        "id": str(item.id),
        "user_id": str(item.user_id),
        "title": item.title,
        "message": item.message,
        "is_read": item.is_read,
        "contribution_id": str(item.contribution_id) if item.contribution_id else None,
        "created_at": item.created_at.isoformat(),
    }


@router.get("/superadmin/reports")
async def list_reports(
    status: str | None = Query(default=None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    from app.models.notification import Notification

    filters = [Notification.title.like(f"{REPORT_TITLE_PREFIX}%")]
    if status:
        normalized_status = status.upper()
        if normalized_status == "RESOLVED":
            filters.append(Notification.is_read.is_(True))
        elif normalized_status == "PENDING":
            filters.append(Notification.is_read.is_(False))

    total = (
        await db.execute(select(func.count()).select_from(Notification).where(*filters))
    ).scalar_one()
    result = await db.execute(
        select(Notification)
        .where(*filters)
        .order_by(desc(Notification.created_at))
        .offset(offset)
        .limit(limit)
    )
    notifications = result.scalars().all()
    items = [_serialize_report(item) for item in notifications]
    return build_paginated_response(items, total=total, limit=limit, offset=offset)


@router.patch("/superadmin/reports/{report_id}")
async def resolve_report(
    report_id: UUID,
    payload: ResolveReportRequest,
    _current_user: User = Depends(require_role("SUPERADMIN")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    from app.models.notification import Notification

    report = await db.get(Notification, report_id)
    if report is None or not report.title.startswith(REPORT_TITLE_PREFIX):
        raise atlas_error("REPORT_001", "Report not found.", status_code=404)
    report.is_read = True
    db.add(report)
    await db.commit()
    return {
        "message": f"Report marked as resolved with action '{payload.action}'.",
        "id": str(report.id),
        "resolved": True,
    }

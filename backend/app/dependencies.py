from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.models.user import AccountStatus, User, UserRole


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_session),
) -> User:
    # Debug logging for auth issues
    print(f"[Auth] credentials type: {type(credentials)}")
    print(f"[Auth] credentials: {credentials}")
    if credentials:
        print(f"[Auth] token preview: {credentials.credentials[:50]}...")
    
    if credentials is None:
        raise atlas_error("AUTH_007", "Authentication credentials are required.", status_code=401)

    payload = security.decode_token(credentials.credentials)
    subject = payload.get("sub") if payload else None
    if not subject:
        raise atlas_error(
            "AUTH_007",
            "The access token is invalid or has expired.",
            status_code=401,
        )

    result = await db.execute(
        select(User)
        .where(User.id == UUID(subject))
        .options(selectinload(User.teacher_profile))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise atlas_error(
            "AUTH_007",
            "The access token is invalid or has expired.",
            status_code=401,
        )
    
    if not user.is_active or user.status == AccountStatus.SUSPENDED:
        raise atlas_error("AUTH_007", "Account is inactive or suspended.", status_code=403)

    return user

async def require_active(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to block PENDING_VERIFICATION users from standard endpoints."""
    if current_user.status != AccountStatus.ACTIVE:
        raise atlas_error(
            "AUTH_008",
            "Your account is pending verification and cannot access this resource.",
            status_code=403,
        )
    return current_user


def require_role(*roles: str) -> Callable[[User], User]:
    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if user_role not in roles:
            raise atlas_error(
                "AUTH_008",
                "You do not have permission to perform this action.",
                status_code=403,
            )
        return current_user

    return dependency


def verify_department_access(user: User, target_department_id: UUID) -> bool:
    """ABAC Rule: Verify if user has rights over a specific department."""
    if user.role == UserRole.SUPERADMIN:
        return True
    if user.role == UserRole.TEACHER:
        if user.teacher_profile and user.teacher_profile.department_id == target_department_id:
            return True
        return False
    # Admins check organization
    # For now, allow Admins if they are in the same Establishment tree (simplification)
    if user.role == UserRole.ADMIN:
        return True
    return False


def require_teacher():
    """Dependency: Strictly TEACHER or ADMIN role required (Spec §7.4)."""
    return require_role("TEACHER", "ADMIN")


def require_contributor():
    """Dependency: STUDENT role + is_contributor flag required (Spec §7.4)."""
    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        role_value = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if role_value != "STUDENT":
            raise atlas_error(
                "AUTH_008",
                "Only students can submit contributions.",
                status_code=403,
            )
        if not current_user.is_contributor:
            raise atlas_error(
                "CONTRIBUTION_004",
                "Contributor access is required before submitting community uploads.",
                status_code=403,
            )
        return current_user

    return dependency

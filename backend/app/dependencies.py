from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import atlas_error
from app.database import get_db
from app.models.user import User


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise atlas_error("AUTH_007", "Authentication credentials are required.")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise atlas_error("AUTH_007", "The access token is invalid or has expired.") from exc

    subject = payload.get("sub")
    if not subject:
        raise atlas_error("AUTH_007", "The access token is invalid or has expired.")

    result = await db.execute(select(User).where(User.id == subject))
    user = result.scalar_one_or_none()
    if user is None:
        raise atlas_error("AUTH_007", "The access token is invalid or has expired.")
    return user


def require_role(*roles: str) -> Callable[[User], User]:
    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if user_role not in roles:
            raise atlas_error(
                "AUTH_008",
                "You do not have permission to perform this action.",
            )
        return current_user

    return dependency

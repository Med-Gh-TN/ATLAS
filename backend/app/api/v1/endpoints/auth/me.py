import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from jose import JWTError

from app.db.session import get_session
from app.models.user import User, UserRead
from app.core import security
from app.core.config import settings

# ARCHITECTURAL ENFORCEMENT: Explicit boundary logging for API telemetry
logger = logging.getLogger("app.api.v1.endpoints.auth.me")
router = APIRouter()

# Defines the OpenAPI schema for the bearer token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

# DEFENSIVE ARCHITECTURE: Centralized Identity Resolution Dependency
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session)
) -> User:
    """
    Dependency to validate JWT and return the current user object.
    Raises strict 401 if token is invalid, expired, or user does not exist.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Decode the token using the centralized security core
        payload = security.decode_token(token)

        # Verify token type to prevent using refresh tokens as access tokens
        if not payload or payload.get("type") != "access":
            raise credentials_exception

        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception

    except JWTError as e:
        # SIDE-EFFECT: Log JWT validation failures for potential tampering detection
        logger.warning(f"SECURITY ALERT: JWT Validation failed: {str(e)}")
        raise credentials_exception

    # Eagerly load the teacher profile to prevent N+1 queries down the line
    result = await session.execute(
        select(User)
        .options(selectinload(User.teacher_profile))
        .where(User.id == user_id_str)
    )
    user = result.scalars().first()

    if user is None:
        logger.warning(f"SECURITY ALERT: Valid JWT used for non-existent user ID: {user_id_str}")
        raise credentials_exception

    return user


@router.get("/me", response_model=UserRead)
async def read_users_me(current_user: User = Depends(get_current_user)) -> Any:
    """
    Retrieve current authenticated user profile.
    Protected endpoint requiring a valid Bearer token.
    """
    # SIDE-EFFECT: Audit log profile access to track active session activity
    logger.debug(f"Profile data accessed for user ID: {current_user.id}")
    return current_user
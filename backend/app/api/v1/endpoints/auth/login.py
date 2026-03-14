import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.core.config import settings
from app.core.limits import limiter
from app.services import auth_service

logger = logging.getLogger(__name__)
router = APIRouter()

async def get_redis_client(request: Request) -> Any:
    """
    Retrieves the Redis client from the application state.
    Requires Redis to be initialized in main.py.
    """
    if not hasattr(request.app.state, "redis"):
        logger.error("Redis client not initialized in application state.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Internal caching service unavailable."
        )
    return request.app.state.redis

# US-24: Strict rate limiting applied to authentication (5 req/min/IP)
@router.post("/login", dependencies=[Depends(limiter(5, 60))])
async def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(), 
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    Standard OAuth2 compatible token login.
    Generates an access token and securely sets a refresh token in an httpOnly cookie.
    Guarded by US-24 strict rate limiting.
    """
    user = await auth_service.authenticate_user(session, form_data.username, form_data.password)
    
    if not user:
        # SIDE-EFFECT: Log failed attempts for potential Fail2Ban / SIEM ingestion
        logger.warning(f"SECURITY ALERT: Failed login attempt for username: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_verified or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Your account is not activated or verified."
        )
    
    access_token, refresh_token = auth_service.create_user_tokens(
        user.id, 
        user.role.value if hasattr(user.role, 'value') else str(user.role)
    )
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        max_age=7 * 24 * 60 * 60 # 7 days
    )
    
    # SIDE-EFFECT: Audit log successful login
    logger.info(f"User {user.id} logged in successfully.")
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/refresh")
async def refresh_token(
    request: Request,
    response: Response,
    redis_client: Any = Depends(get_redis_client)
) -> Any:
    """
    Validates the refresh token from the httpOnly cookie, blacklists it, 
    and issues a new pair of access/refresh tokens.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing.")
        
    new_tokens = await auth_service.process_refresh_token(redis_client, token)
    if not new_tokens:
        response.delete_cookie("refresh_token")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")
        
    access_token, refresh_token = new_tokens
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        max_age=7 * 24 * 60 * 60
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    redis_client: Any = Depends(get_redis_client)
) -> Any:
    """
    Logs the user out by blacklisting their refresh token and clearing the cookie.
    """
    token = request.cookies.get("refresh_token")
    if token:
        await auth_service.revoke_token(redis_client, token)
        
    response.delete_cookie("refresh_token")
    return {"message": "Successfully logged out."}
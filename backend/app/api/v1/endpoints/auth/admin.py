import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from redis.asyncio import Redis

from app.db.session import get_session
from app.models.user import User, UserRole, Establishment
from app.core import security
from app.core.redis import get_redis_client

# ARCHITECTURAL FIX: Re-routed to the new IAM Bounded Context
from app.services.iam import auth_service

from app.core.config import settings
from fastapi import Request

logger = logging.getLogger(__name__)

# Note: The prefix will stack with the main auth router so this becomes /auth/admin/...
router = APIRouter(prefix="/admin", tags=["admin-auth"])

class AdminRegister(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    establishment_name: str
    domain: str

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_admin(
    payload: AdminRegister,
    request: Request,
    session: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client)
) -> Any:
    """
    Register a new administrator.
    This implicitly creates an establishment and binds the admin to it, acting as the root tenant user.
    """
    # 0. SOTA: Basic IP-based Rate Limiting for Abuse Mitigation (DDoS/Brute-force)
    client_ip = request.client.host if request.client else "unknown"
    rate_limit_key = f"ratelimit:register:{client_ip}"
    requests_count = await redis_client.incr(rate_limit_key)
    if requests_count == 1:
        await redis_client.expire(rate_limit_key, 60 * 15) # 15 minute window

    if requests_count > 5:
        logger.warning(f"SECURITY: Rate limit exceeded for admin registration from IP {client_ip}")
        raise HTTPException(status_code=429, detail="Too many registration attempts. Please try again later.")

    # 1. Validation Checks
    est_res = await session.execute(
        select(Establishment).where(Establishment.domain == payload.domain.lower().strip())
    )
    if est_res.scalars().first():
        logger.warning(f"SECURITY: Admin registration failed. Domain {payload.domain} already exists.")
        raise HTTPException(status_code=400, detail="Domain already registered.")

    user_res = await session.execute(
        select(User).where(User.email == payload.email)
    )
    if user_res.scalars().first():
        logger.warning(f"SECURITY: Admin registration failed. Email {payload.email} already exists.")
        raise HTTPException(status_code=400, detail="Email already registered.")

    # 2. Implicit Establishment and Admin Creation Transaction
    try:
        est = Establishment(
            name=payload.establishment_name.strip(),
            domain=payload.domain.lower().strip()
        )
        session.add(est)
        await session.flush()

        user = User(
            email=payload.email,
            full_name=payload.full_name,
            role=UserRole.ADMIN,
            establishment_id=est.id,
            hashed_password=security.get_password_hash(payload.password),
            is_verified=True, # Admins bypass email verification
            is_active=True    # Admins are active immediately
        )
        session.add(user)

        await session.commit()
        await session.refresh(user)

        logger.info(f"AUDIT: Admin {user.email} successfully registered and Establishment {est.name} created.")

        return {
            "message": "Admin account created successfully.",
            "establishment_id": est.id,
            "admin_id": user.id
        }

    except Exception as e:
        await session.rollback()
        logger.error(f"Transaction Error registering admin {payload.email}: {str(e)}")
        raise HTTPException(status_code=500, detail="A database error occurred during setup.")


@router.post("/login")
async def login_admin(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client)
) -> Any:
    """
    Exclusive login portal for Administrators.
    Validates credentials and enforces role isolation.
    """
    # 0. SOTA: Login Brute-force protection
    client_ip = request.client.host if request.client else "unknown"
    blocked_key = f"block:login:{form_data.username}"
    if await redis_client.exists(blocked_key):
        raise HTTPException(status_code=403, detail="Account temporarily locked due to suspicious activity. Try again later.")

    user = await auth_service.authenticate_user(session, form_data.username, form_data.password, redis_client)

    if not user:
        # Increment failure attempts
        fail_key = f"fail:login:{form_data.username}"
        fails = await redis_client.incr(fail_key)
        if fails == 1:
            await redis_client.expire(fail_key, 300) # 5m window
        if fails > 5:
            await redis_client.setex(blocked_key, 900, "blocked") # 15m block
            logger.warning(f"SECURITY: Active brute-force mitigation blocked {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect admin email or password"
        )

    # Reset fail attempts on success
    await redis_client.delete(f"fail:login:{form_data.username}")

    if user.role != UserRole.ADMIN:
        logger.warning(f"SECURITY: Unauthorized user {user.email} attempted to login via Admin portal.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin role required."
        )

    # Generate Multi-Tenant Token Pair
    # Role string resolution
    role_str = user.role.value if hasattr(user.role, 'value') else str(user.role)

    # Generate tokens natively via service
    access_token, refresh_token = auth_service.create_user_tokens(user.id, role_str)

    # Establish Secure HttpOnly Cookie
    # SOTA FIX: Upgraded Admin portal to strict CSRF protection `samesite="strict"`
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="strict",
        max_age=7 * 24 * 60 * 60
    )

    logger.info(f"AUDIT: Administrator {user.email} logged in successfully.")
    return {"access_token": access_token, "token_type": "bearer"}
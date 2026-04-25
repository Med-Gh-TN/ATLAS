from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.exceptions import atlas_error
from app.core.limits import limiter
from app.core.redis import get_redis_client
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.user import OTPPurpose, StudentLevel, User, UserCreate, UserRole


router = APIRouter(tags=["Auth"])


class AuthUserResponse(BaseModel):
    id: str
    email: str
    role: str
    full_name: str | None = None
    filiere: str | None = None
    level: str | None = None
    onboarding_completed: bool = False
    is_active: bool
    is_verified: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)


class LoginResponse(BaseModel):
    accessToken: str
    refreshToken: str
    user: AuthUserResponse


class RefreshResponse(BaseModel):
    accessToken: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str | None = None
    role: UserRole = UserRole.STUDENT
    filiere: str | None = None
    level: StudentLevel | None = None


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6)
    purpose: OTPPurpose = OTPPurpose.ACCOUNT_ACTIVATION


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6)
    password: str = Field(..., min_length=8)


class ResendOtpRequest(BaseModel):
    email: EmailStr


def _user_payload(user: User) -> AuthUserResponse:
    return AuthUserResponse(
        id=str(user.id),
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        full_name=getattr(user, "full_name", None),
        filiere=getattr(user, "filiere", None),
        level=user.level.value if getattr(user, "level", None) else None,
        onboarding_completed=getattr(user, "onboarding_completed", False),
        is_active=user.is_active,
        is_verified=user.is_verified,
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="strict",
        path="/v1/auth/refresh",
        max_age=7 * 24 * 60 * 60,
    )


@router.post("/register", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(3, 60))])
async def register(
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    from app.services.iam import otp_service

    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise atlas_error(
            "AUTH_001",
            "An account with this email already exists.",
            field="email",
            status_code=400,
        )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        filiere=payload.filiere,
        level=payload.level,
        hashed_password=security.get_password_hash(payload.password),
        is_active=False,
        is_verified=False,
    )
    db.add(user)
    await db.flush()

    created = await otp_service.create_email_otp(
        session=db,
        user=user,
        ttl_minutes=24 * 60,
        purpose=OTPPurpose.ACCOUNT_ACTIVATION,
    )
    if not created:
        await db.rollback()
        raise atlas_error(
            "GEN_002",
            "Failed to send activation OTP.",
            field="email",
            status_code=500,
        )

    await db.commit()
    await db.refresh(user)
    return {
        "user": _user_payload(user).model_dump(),
        "message": "Registration successful. Please verify your OTP.",
    }


@router.post("/verify-otp")
async def verify_otp(
    payload: VerifyOtpRequest,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    from app.services.iam import otp_service

    verification = await otp_service.verify_email_otp_result(
        session=db,
        email=payload.email,
        code=payload.otp_code,
        allowed_purposes=(payload.purpose,),
    )
    if not verification["ok"]:
        await db.rollback()
        error_code = verification["reason"]
        if error_code == "OTP_EXPIRED":
            raise atlas_error(
                "OTP_EXPIRED",
                "The OTP code has expired.",
                field="otp_code",
                status_code=400,
            )
        if error_code == "OTP_MAX_ATTEMPTS":
            raise atlas_error(
                "OTP_MAX_ATTEMPTS",
                "The maximum number of OTP attempts has been exceeded.",
                field="otp_code",
                status_code=429,
            )
        raise atlas_error(
            "INVALID_OTP",
            "The OTP code is invalid.",
            field="otp_code",
            status_code=400,
        )

    await db.commit()
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one()
    return {
        "message": "OTP verified successfully.",
        "user": _user_payload(user).model_dump(),
    }


@router.post("/login", response_model=LoginResponse, dependencies=[Depends(limiter(5, 60))])
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> LoginResponse:
    from app.services.iam import auth_service

    user = await auth_service.authenticate_user(db, payload.email, payload.password, redis_client)
    if user is None:
        raise atlas_error(
            "AUTH_001",
            "Incorrect email or password.",
            field="email",
            status_code=401,
        )
    if not user.is_verified:
        raise atlas_error("AUTH_002", "The account is not verified.", status_code=403)
    if not user.is_active:
        raise atlas_error("AUTH_003", "The account is suspended or inactive.", status_code=403)

    access_token, refresh_token = auth_service.create_user_tokens(
        user.id,
        user.role.value if hasattr(user.role, "value") else str(user.role),
    )
    _set_refresh_cookie(response, refresh_token)
    return LoginResponse(
        accessToken=access_token,
        refreshToken=refresh_token,
        user=_user_payload(user),
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    request: Request,
    response: Response,
    redis_client: Redis = Depends(get_redis_client),
) -> RefreshResponse:
    from app.services.iam import auth_service

    token = request.cookies.get("refresh_token")
    if not token:
        raise atlas_error("AUTH_007", "Refresh token is missing.", status_code=401)

    new_tokens = await auth_service.process_refresh_token(redis_client, token)
    if not new_tokens:
        response.delete_cookie("refresh_token", path="/v1/auth/refresh")
        raise atlas_error("AUTH_007", "Refresh token is invalid or expired.", status_code=401)

    access_token, refresh_token = new_tokens
    _set_refresh_cookie(response, refresh_token)
    return RefreshResponse(accessToken=access_token)


@router.get("/me", response_model=AuthUserResponse)
async def me(current_user: User = Depends(get_current_user)) -> AuthUserResponse:
    return _user_payload(current_user)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    redis_client: Redis = Depends(get_redis_client),
    _current_user: User = Depends(get_current_user),
) -> dict[str, bool]:
    from app.services.iam import auth_service

    token = request.cookies.get("refresh_token")
    if token:
        await auth_service.revoke_token(redis_client, token)
    response.delete_cookie("refresh_token", path="/v1/auth/refresh")
    return {"success": True}


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    from app.services.iam import otp_service

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is not None:
        created = await otp_service.create_email_otp(
            session=db,
            user=user,
            ttl_minutes=10,
            purpose=OTPPurpose.PASSWORD_RESET,
        )
        if created:
            await db.commit()
        else:
            await db.rollback()
            raise atlas_error(
                "GEN_002",
                "Failed to send password reset OTP.",
                field="email",
                status_code=500,
            )
    return {"message": "If the account exists, a password reset OTP has been sent."}


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict[str, str]:
    from app.services.iam import auth_service, otp_service

    verification = await otp_service.verify_email_otp_result(
        session=db,
        email=payload.email,
        code=payload.otp_code,
        allowed_purposes=(OTPPurpose.PASSWORD_RESET,),
    )
    if not verification["ok"]:
        await db.rollback()
        error_code = verification["reason"]
        if error_code == "OTP_EXPIRED":
            raise atlas_error(
                "OTP_EXPIRED",
                "The OTP code has expired.",
                field="otp_code",
                status_code=400,
            )
        if error_code == "OTP_MAX_ATTEMPTS":
            raise atlas_error(
                "OTP_MAX_ATTEMPTS",
                "The maximum number of OTP attempts has been exceeded.",
                field="otp_code",
                status_code=429,
            )
        raise atlas_error(
            "INVALID_OTP",
            "The OTP code is invalid.",
            field="otp_code",
            status_code=400,
        )

    changed = await auth_service.reset_user_password(
        session=db,
        email=payload.email,
        new_password=payload.password,
        redis_client=redis_client,
    )
    if not changed:
        await db.rollback()
        raise atlas_error(
            "GEN_002",
            "Failed to reset password.",
            field="password",
            status_code=500,
        )

    await db.commit()
    return {"message": "Password reset successfully."}


@router.post("/resend-otp", dependencies=[Depends(limiter(3, 3600))])
async def resend_otp(
    payload: ResendOtpRequest,
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict[str, str]:
    from app.services.iam import otp_service

    resend_key = f"otp:resend:{payload.email}"
    current = await redis_client.get(resend_key)
    count = int(current) if current is not None else 0
    if count >= 3:
        raise atlas_error(
            "AUTH_006",
            "OTP resend limit reached. Please try again later.",
            field="email",
            status_code=429,
        )

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is not None:
        created = await otp_service.create_email_otp(
            session=db,
            user=user,
            ttl_minutes=24 * 60,
            purpose=OTPPurpose.ACCOUNT_ACTIVATION,
        )
        if not created:
            await db.rollback()
            raise atlas_error(
                "GEN_002",
                "Failed to resend OTP.",
                field="email",
                status_code=500,
            )
        await db.commit()

    ttl = await redis_client.ttl(resend_key)
    if ttl <= 0:
        await redis_client.setex(resend_key, 3600, 1)
    else:
        await redis_client.incr(resend_key)

    return {"message": "If the account exists, a new OTP has been sent."}

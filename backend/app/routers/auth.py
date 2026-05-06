"""
 * @file backend/app/routers/auth.py
 * @description Handles authentication, JWT lifecycle, public registration options, and OTP orchestration.
 * @layer Core Logic / State Persistence
 * @dependencies app.models.user, app.services.iam, app.models.major
 """

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID   # <-- added missing import

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, EmailStr, Field, model_validator
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
from app.models.user import (
    AccountStatus,
    Department,
    Establishment,
    OTPPurpose,
    StudentLevel,
    TeacherProfile,
    User,
    UserCreate,
    UserRole,
)
from app.models.major import Major

router = APIRouter(tags=["Auth"])


class AuthUserResponse(BaseModel):
    id: str
    email: str
    role: str
    full_name: str | None = None
    filiere: str | None = None
    level: str | None = None
    niveau: str | None = None
    student_id: str | None = None
    program: str | None = None
    academic_year: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    phone_number: str | None = None
    address: str | None = None
    preferred_language: str | None = None
    profile_picture_url: str | None = None
    onboarding_completed: bool = False
    is_active: bool
    is_verified: bool
    status: AccountStatus
    trust_score: int
    profile_completeness: int
    push_notifications_enabled: bool = True
    email_digest_enabled: bool = False
    notification_types: list[str] = []
    is_rtl: bool = False
    establishment_id: str | None = None
    verified_at: datetime | None = None
    created_at: datetime
    username: str | None = None


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
    niveau: StudentLevel | None = None
    establishment_id: str | None = None

    @model_validator(mode="before")
    @classmethod
    def map_niveau_to_level(cls, data: Any) -> Any:
        if isinstance(data, dict):
            niveau_val = data.get("niveau")
            level_val = data.get("level")
            if niveau_val and not level_val:
                data["level"] = niveau_val
        return data


class RegistrationUniversityOption(BaseModel):
    id: str
    name: str
    domain: str
    is_authorized: bool
    created_at: datetime


class RegistrationDepartmentOption(BaseModel):
    id: str
    name: str
    establishment_id: str
    # levels field removed – levels are now derived from majors only


class RegistrationMajorOption(BaseModel):
    id: str
    name: str
    department_id: str
    level: str


class RegistrationOptionsResponse(BaseModel):
    universities: list[RegistrationUniversityOption]
    departments: list[RegistrationDepartmentOption]
    levels: list[str]                     # derived from majors, not departments
    majors: list[RegistrationMajorOption]


class TeacherRequestCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str | None = None
    department: str = Field(..., min_length=2, max_length=120)


class TeacherActivationRequest(BaseModel):
    token: str = Field(..., min_length=32)
    password: str = Field(..., min_length=8)


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
    purpose: OTPPurpose = OTPPurpose.ACCOUNT_ACTIVATION


def _user_payload(user: User) -> AuthUserResponse:
    level_val = user.level.value if getattr(user, "level", None) else None
    return AuthUserResponse(
        id=str(user.id),
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        full_name=getattr(user, "full_name", None),
        filiere=getattr(user, "filiere", None),
        level=level_val,
        niveau=level_val,
        student_id=getattr(user, "student_id", None),
        program=getattr(user, "program", None),
        academic_year=getattr(user, "academic_year", None),
        date_of_birth=getattr(user, "date_of_birth", None),
        gender=(user.gender.value if getattr(user, "gender", None) else None),
        phone_number=getattr(user, "phone_number", None),
        address=getattr(user, "address", None),
        preferred_language=getattr(user, "preferred_language", None),
        profile_picture_url=getattr(user, "profile_picture_url", None),
        onboarding_completed=getattr(user, "onboarding_completed", False),
        is_active=user.is_active,
        is_verified=user.is_verified,
        status=user.status,
        trust_score=user.trust_score,
        profile_completeness=user.profile_completeness,
        push_notifications_enabled=user.push_notifications_enabled,
        email_digest_enabled=user.email_digest_enabled,
        notification_types=user.notification_types,
        is_rtl=user.is_rtl,
        establishment_id=str(user.establishment_id) if getattr(user, "establishment_id", None) else None,
        verified_at=getattr(user, "verified_at", None),
        created_at=getattr(user, "created_at", datetime.utcnow()),
        username=getattr(user, "full_name", None) or user.email.split("@")[0],
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        path=f"{settings.API_V1_STR}/auth/refresh",
        max_age=7 * 24 * 60 * 60,
    )


@router.post("/register", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(3, 60))])
async def register(
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    from app.services.iam import otp_service

    if payload.role != UserRole.STUDENT:
        raise atlas_error(
            "AUTH_009",
            "Public registration is available for students only. Teachers must use the teacher verification request flow.",
            field="role",
            status_code=400,
        )

    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise atlas_error(
            "AUTH_001",
            "An account with this email already exists.",
            field="email",
            status_code=400,
        )

    if payload.establishment_id:
        est_result = await db.execute(select(Establishment).where(Establishment.id == payload.establishment_id))
        est = est_result.scalar_one_or_none()
        if not est:
            raise atlas_error(
                "EST_001",
                "Selected university was not found.",
                field="establishment_id",
                status_code=400,
            )

    if payload.filiere:
        department_result = await db.execute(
            select(Department).where(Department.name == payload.filiere)
        )
        department = department_result.scalar_one_or_none()
        if department is None:
            raise atlas_error(
                "DEPT_001",
                "Selected department was not found.",
                field="filiere",
                status_code=400,
            )
        
        if payload.establishment_id and str(department.establishment_id) != payload.establishment_id:
            raise atlas_error(
                "AUTH_012",
                "Selected department does not belong to the chosen university.",
                field="filiere",
                status_code=400,
            )
        # REMOVED allowed_levels check – levels are now only on majors

    status_val = AccountStatus.ACTIVE
    est_id = payload.establishment_id
    
    if payload.role == UserRole.TEACHER:
        status_val = AccountStatus.PENDING_VERIFICATION
        domain = payload.email.split("@")[-1]
        est_result = await db.execute(select(Establishment).where(Establishment.domain == domain))
        est = est_result.scalar_one_or_none()
        if est:
            est_id = str(est.id)

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        status=status_val,
        filiere=payload.filiere,
        level=payload.level,
        establishment_id=est_id,
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

@router.post("/teacher-request", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(3, 60))])
async def create_teacher_request(
    _payload: TeacherRequestCreate,
    _db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    raise atlas_error(
        "AUTH_010",
        "Teacher accounts are created by administrators only.",
        status_code=403,
    )


@router.get("/registration-options", response_model=RegistrationOptionsResponse)
async def registration_options(
    db: AsyncSession = Depends(get_session),
) -> RegistrationOptionsResponse:
    est_result = await db.execute(
        select(Establishment)
        .where(Establishment.is_authorized == True)
        .order_by(Establishment.name.asc())
    )
    universities = est_result.scalars().all()
    
    dept_result = await db.execute(select(Department).order_by(Department.name.asc()))
    departments = dept_result.scalars().all()

    majors_result = await db.execute(
        select(Major).order_by(Major.level, Major.name)
    )
    majors = majors_result.scalars().all()

    university_payload = [
        RegistrationUniversityOption(
            id=str(u.id),
            name=u.name,
            domain=u.domain,
            is_authorized=u.is_authorized,
            created_at=u.created_at,
        )
        for u in universities
    ]

    # Department payload no longer includes 'levels' – levels derived from majors
    department_payload = [
        RegistrationDepartmentOption(
            id=str(d.id),
            name=d.name,
            establishment_id=str(d.establishment_id),
        )
        for d in departments
    ]

    # Compute unique levels from all majors (string representation)
    all_levels = sorted({
        m.level.value if hasattr(m.level, "value") else str(m.level)
        for m in majors
    })

    major_payload = [
        RegistrationMajorOption(
            id=str(m.id),
            name=m.name,
            department_id=str(m.department_id),
            level=m.level.value if hasattr(m.level, "value") else str(m.level),
        )
        for m in majors
    ]

    return RegistrationOptionsResponse(
        universities=university_payload,
        departments=department_payload,
        levels=all_levels,
        majors=major_payload,
    )


@router.get("/majors/{department_id}", response_model=list[RegistrationMajorOption])
async def get_majors_for_registration(
    department_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Public endpoint: list majors for a department (used by registration/upload forms)."""
    try:
        dept_uuid = UUID(department_id)
    except ValueError:
        raise atlas_error("MAJOR_001", "Invalid department ID.", status_code=400)

    result = await db.execute(
        select(Major)
        .where(Major.department_id == dept_uuid)
        .order_by(Major.level, Major.name)
    )
    majors = result.scalars().all()
    return [
        RegistrationMajorOption(
            id=str(m.id),
            name=m.name,
            department_id=str(m.department_id),
            level=m.level.value if hasattr(m.level, "value") else str(m.level),
        )
        for m in majors
    ]


@router.post("/verify-otp")
async def verify_otp(
    payload: VerifyOtpRequest,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    from app.services.iam import otp_service

    purposes = (payload.purpose,)
    if payload.purpose == OTPPurpose.TEACHER_ONBOARDING:
        purposes = (payload.purpose, OTPPurpose.ACCOUNT_ACTIVATION)

    verification = await otp_service.verify_email_otp_result(
        session=db,
        email=payload.email,
        code=payload.otp_code,
        allowed_purposes=purposes,
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


@router.post("/activate-teacher")
async def activate_teacher(
    payload: TeacherActivationRequest,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    result = await db.execute(
        select(TeacherProfile).where(TeacherProfile.invite_token == payload.token)
    )
    profile = result.scalar_one_or_none()
    
    if not profile:
        raise atlas_error("AUTH_012", "Invalid or expired invitation token.", status_code=400)
        
    if profile.invite_expires_at and profile.invite_expires_at < datetime.utcnow():
        raise atlas_error("AUTH_012", "This invitation token has expired. Please contact your admin for a new link.", status_code=400)
        
    result = await db.execute(select(User).where(User.id == profile.user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise atlas_error("USER_001", "Associated teacher account not found.", status_code=404)
        
    user.hashed_password = security.get_password_hash(payload.password)
    user.is_active = True
    user.is_verified = True
    user.status = AccountStatus.ACTIVE
    
    profile.invite_token = None
    profile.invite_expires_at = None
    
    db.add(user)
    db.add(profile)
    await db.commit()
    await db.refresh(user)
    
    return {
        "message": "Teacher account activated successfully.",
        "user": _user_payload(user).model_dump()
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
    if not user.is_active:
        raise atlas_error("AUTH_003", "The account is inactive or email not verified.", status_code=403)
    if user.status == AccountStatus.SUSPENDED:
        raise atlas_error("AUTH_003", "The account is suspended.", status_code=403)

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
        response.delete_cookie("refresh_token", path=f"{settings.API_V1_STR}/auth/refresh")
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
    response.delete_cookie("refresh_token", path=f"{settings.API_V1_STR}/auth/refresh")
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
        if payload.purpose == OTPPurpose.TEACHER_ONBOARDING:
            profile_result = await db.execute(
                select(TeacherProfile, Department)
                .outerjoin(Department, Department.id == TeacherProfile.department_id)
                .where(TeacherProfile.user_id == user.id)
            )
            row = profile_result.first()
            department = row[1] if row else None
            created = await otp_service.create_teacher_onboarding_otp(
                session=db,
                user=user,
                teacher_name=user.full_name or user.email,
                department_name=department.name if department else "Assigned Department",
            )
        else:
            created = await otp_service.create_email_otp(
                session=db,
                user=user,
                ttl_minutes=24 * 60,
                purpose=payload.purpose,
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
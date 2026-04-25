import logging
from typing import Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr, Field

from app.db.session import get_session
from app.models.user import User, OTPPurpose, TeacherProfile
from app.core.limits import limiter
from app.core.security import hash_email
from app.services import auth_service, otp_service
from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Pydantic Schemas ---

class OTPRequest(BaseModel):
    """US-05: Schema for requesting an OTP behind a token gate."""
    email: EmailStr
    token: str = Field(..., description="The secure single-use invite token")

class TeacherActivationRequest(BaseModel):
    """US-05: Schema for activating a teacher account imported via CSV."""
    email: EmailStr
    token: str = Field(..., description="The secure single-use invite token")
    otp_code: str = Field(..., min_length=6, max_length=6)
    password: str = Field(..., min_length=8)
    specialization: str = Field(..., min_length=2)
    modules: str = Field(..., min_length=2)

# --- Endpoints ---

@router.get("/validate-invite", dependencies=[Depends(limiter(10, 3600))])
async def validate_invite_token(
    token: str = Query(..., description="The secure invite token from the URL"),
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    US-05 (Gate): Validates if the invitation token exists and has not expired.
    Called by the frontend middleware/render logic to restrict page access.
    """
    stmt = select(TeacherProfile).options(selectinload(TeacherProfile.user)).where(TeacherProfile.invite_token == token)
    result = await session.execute(stmt)
    profile = result.scalars().first()

    if not profile or not profile.user:
        logger.warning("SECURITY ALERT: Invalid teacher invite token validation attempt.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or consumed invitation token."
        )

    if profile.invite_expires_at and profile.invite_expires_at < datetime.utcnow():
        logger.warning(f"SECURITY ALERT: Expired token validation attempt for {hash_email(profile.user.email)}.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation token has expired. Please contact your administrator."
        )

    return {"valid": True, "email": profile.user.email}


# SOTA FIX: Renamed path to prevent Route Bleeding with registration.py
@router.post("/request-teacher-otp", dependencies=[Depends(limiter(5, 3600))])
async def request_teacher_otp(
    payload: OTPRequest,
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    US-05 (Dispatch): Generates and sends the OTP to the teacher's email,
    but ONLY if they provide the valid invite token matching their email.
    """
    stmt = select(TeacherProfile).options(selectinload(TeacherProfile.user)).where(TeacherProfile.invite_token == payload.token)
    result = await session.execute(stmt)
    profile = result.scalars().first()

    if not profile or not profile.user or profile.user.email != payload.email:
        logger.warning(f"SECURITY ALERT: Token/Email mismatch during OTP request for {hash_email(payload.email)}.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token or email mismatch."
        )

    if profile.invite_expires_at and profile.invite_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation token has expired."
        )

    # Re-use the standard OTP generation, but restrict the purpose to TEACHER_ONBOARDING
    code = await otp_service.create_email_otp(
        session=session,
        user=profile.user,
        purpose=OTPPurpose.TEACHER_ONBOARDING
    )

    if not code:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to dispatch OTP email. Please try again."
        )

    # SIDE-EFFECT: Persist the OTP hash to the database
    await session.commit()
    logger.info(f"AUDIT: Onboarding OTP successfully dispatched to {hash_email(payload.email)}")
    return {"message": "OTP dispatched successfully."}


@router.post("/activate-teacher", dependencies=[Depends(limiter(5, 3600))])
async def activate_teacher(
    payload: TeacherActivationRequest,
    session: AsyncSession = Depends(get_session),
    redis_client: Any = Depends(get_redis_client)
) -> Any:
    """
    US-05 (Activation): Atomically verifies the teacher's single-use OTP, updates their
    temporary password, populates their TeacherProfile data, and invalidates the invite token.
    """
    try:
        # 1. Token Validation Gate (Prevents bypassing the token check by directly hitting the API)
        stmt = select(TeacherProfile).options(selectinload(TeacherProfile.user)).where(TeacherProfile.invite_token == payload.token)
        result = await session.execute(stmt)
        profile = result.scalars().first()

        if not profile or not profile.user or profile.user.email != payload.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid invitation token or email mismatch."
            )

        if profile.invite_expires_at and profile.invite_expires_at < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation token has expired."
            )

        # 2. Verify the OTP strictly for TEACHER_ONBOARDING
        success = await otp_service.verify_email_otp(
            session=session,
            email=payload.email,
            code=payload.otp_code,
            allowed_purposes=(OTPPurpose.TEACHER_ONBOARDING,)
        )

        if not success:
            await session.rollback()
            logger.warning(f"SECURITY ALERT: Failed teacher activation OTP verification for {hash_email(payload.email)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid, expired, or already used activation code."
            )

        # 3. Update to the new secure password
        pw_reset_success = await auth_service.reset_user_password(
            session=session,
            email=payload.email,
            new_password=payload.password,
            redis_client=redis_client
        )

        if not pw_reset_success:
            await session.rollback()
            logger.error(f"Failed to set new secure password during teacher activation for {hash_email(payload.email)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to set new password."
            )

        # 4. State Modification: Update Profile & NULLIFY Token
        profile.specialization = payload.specialization
        profile.modules = payload.modules

        # CRITICAL SECURITY STEP: Destroy the single-use token to prevent replay attacks
        profile.invite_token = None
        profile.invite_expires_at = None

        session.add(profile)

        # 5. Commit the entire transaction atomically
        await session.commit()

        logger.info(f"AUDIT: Teacher account successfully activated and token destroyed. Email hash: {hash_email(payload.email)}")
        return {"message": "Teacher account successfully activated."}

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Teacher Activation Error for {hash_email(payload.email)}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal server error occurred during activation."
        )
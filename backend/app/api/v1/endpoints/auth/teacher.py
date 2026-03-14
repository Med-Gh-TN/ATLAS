import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr, Field

from app.db.session import get_session
from app.models.user import User, OTPPurpose
from app.core.limits import limiter
from app.services import auth_service

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Pydantic Schemas ---

class TeacherActivationRequest(BaseModel):
    """US-05: Schema for activating a teacher account imported via CSV."""
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6)
    password: str = Field(..., min_length=8)
    specialization: str = Field(..., min_length=2)
    modules: str = Field(..., min_length=2)

# --- Endpoints ---

# DEFENSIVE ARCHITECTURE: Strict rate limiting (5 req/hr) to prevent brute-forcing the activation code
@router.post("/activate-teacher", dependencies=[Depends(limiter(5, 3600))])
async def activate_teacher(
    payload: TeacherActivationRequest,
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    US-05: Atomically verifies the teacher's single-use OTP, updates their temporary 
    password to a secure one, and populates their TeacherProfile data.
    """
    try:
        # 1. Verify the OTP strictly for TEACHER_ONBOARDING
        # Note: auth_service.verify_email_otp handles flipping is_active and is_verified to True
        success = await auth_service.verify_email_otp(
            session=session,
            email=payload.email,
            code=payload.otp_code,
            allowed_purposes=(OTPPurpose.TEACHER_ONBOARDING,)
        )
        
        if not success:
            await session.rollback()
            # SIDE-EFFECT: Log failed activation attempt
            logger.warning(f"SECURITY ALERT: Failed teacher activation OTP verification for {payload.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid, expired, or already used activation code."
            )

        # 2. Update to the new secure password
        pw_reset_success = await auth_service.reset_user_password(
            session=session,
            email=payload.email,
            new_password=payload.password
        )
        
        if not pw_reset_success:
            await session.rollback()
            logger.error(f"Failed to set new secure password during teacher activation for {payload.email}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to set new password."
            )

        # 3. Retrieve the user and their associated profile to update it
        result = await session.execute(
            select(User)
            .options(selectinload(User.teacher_profile))
            .where(User.email == payload.email)
        )
        user = result.scalars().first()

        if user and user.teacher_profile:
            user.teacher_profile.specialization = payload.specialization
            user.teacher_profile.modules = payload.modules
            session.add(user.teacher_profile)
        else:
            await session.rollback()
            # SIDE-EFFECT: Critical alert. Database integrity issue.
            logger.critical(f"CRITICAL: Teacher profile not found for user {payload.email} during activation.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Critical Error: Teacher profile not found for this user."
            )

        # 4. Commit the entire transaction atomically
        await session.commit()
        
        # SIDE-EFFECT: Audit log successful high-privilege activation
        logger.info(f"AUDIT: Teacher account successfully activated. Email: {payload.email}, Specialization: {payload.specialization}")
        return {"message": "Teacher account successfully activated."}

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Teacher Activation Error for {payload.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="An internal server error occurred during activation."
        )
import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, EmailStr, Field

from app.db.session import get_session
from app.models.user import User, OTPPurpose
from app.core.limits import limiter
from app.core.redis import get_redis_client

# ARCHITECTURAL FIX: Re-routed to the new IAM Bounded Context
from app.services.iam import auth_service, otp_service

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Pydantic Schemas ---

class ForgotPasswordRequest(BaseModel):
    """Schema for requesting a password reset OTP."""
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    """Schema for submitting the OTP and the new password."""
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")
    new_password: str = Field(..., min_length=8, description="New strong password")

# --- Endpoints ---

@router.post("/forgot-password", dependencies=[Depends(limiter(3, 3600))])
async def forgot_password(
    payload: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    Generates a PASSWORD_RESET OTP with a 15-minute TTL.
    Rate limited strictly to 3 requests per hour to prevent email spam.
    """
    try:
        result = await session.execute(select(User).where(User.email == payload.email))
        user = result.scalars().first()

        if user:
            # SOTA FIX: Call create_email_otp from the iam bounded context
            otp_created = await otp_service.create_email_otp(
                session=session,
                user=user,
                purpose=OTPPurpose.PASSWORD_RESET
            )
            if otp_created:
                await session.commit()
                # SIDE-EFFECT: Audit log the successful request
                logger.info(f"AUDIT: Password reset OTP requested and generated for {payload.email}")
            else:
                await session.rollback()
                logger.error(f"Failed to generate reset OTP for {payload.email}")
        else:
            # SIDE-EFFECT: Log enumeration attempt
            logger.warning(f"SECURITY ALERT: Password reset requested for non-existent email: {payload.email}")

        # Always return success to prevent email enumeration attacks
        return {"message": "If the account exists, a password reset code has been sent."}
    except Exception as e:
        await session.rollback()
        logger.error(f"Forgot Password Error for {payload.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal server error occurred."
        )


# DEFENSIVE ARCHITECTURE: Added rate limiter to prevent brute-forcing the 6-digit OTP
@router.post("/reset-password", dependencies=[Depends(limiter(5, 3600))])
async def reset_password(
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
    redis_client: Any = Depends(get_redis_client)
) -> Any:
    """
    Verifies the PASSWORD_RESET OTP and updates the user's password.
    Rate limited to prevent OTP brute-force attacks.
    """
    try:
        # SOTA FIX: Call verify_email_otp from the iam bounded context
        success = await otp_service.verify_email_otp(
            session=session,
            email=payload.email,
            code=payload.code,
            allowed_purposes=(OTPPurpose.PASSWORD_RESET,)
        )

        if not success:
            await session.rollback()
            # SIDE-EFFECT: Log failed reset attempt
            logger.warning(f"SECURITY ALERT: Failed password reset OTP verification for {payload.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset code."
            )

        # ARCHITECTURAL FIX: Realigned positional arguments for auth_service.reset_user_password
        # Signature: reset_user_password(session, email, new_password, redis_client)
        pw_reset_success = await auth_service.reset_user_password(
            session=session,
            email=payload.email,
            new_password=payload.new_password,
            redis_client=redis_client
        )

        if not pw_reset_success:
            await session.rollback()
            logger.error(f"Failed to apply new password in database for {payload.email}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to reset password."
            )

        await session.commit()

        # SIDE-EFFECT: Audit log the successful password reset
        logger.info(f"AUDIT: Password reset successfully for {payload.email}")
        return {"message": "Password has been successfully reset. You can now log in."}

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Reset Password Error for {payload.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal server error occurred."
        )
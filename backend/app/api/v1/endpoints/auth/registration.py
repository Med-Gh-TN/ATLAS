import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, EmailStr, Field

from app.db.session import get_session
from app.models.user import User, UserCreate, UserRead, OTPPurpose
from app.core import security
from app.core.limits import limiter
# SOTA FIX: Import the dedicated otp_service
from app.services import otp_service

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Pydantic Schemas ---

class OTPRequest(BaseModel):
    """Schema for requesting a new OTP via email."""
    email: EmailStr

class OTPVerify(BaseModel):
    """Schema for verifying a submitted OTP code."""
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")

# --- Endpoints ---

@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(5, 60))])
async def register(
    user_in: UserCreate, 
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    Register a new user and trigger the initial OTP email verification.
    Guarded by rate limiting to prevent bulk registration spam.
    """
    result = await session.execute(select(User).where(User.email == user_in.email))
    existing_user = result.scalars().first()
    if existing_user:
        # SIDE-EFFECT: Log enumeration attempt
        logger.warning(f"SECURITY ALERT: Registration attempt for existing email: {user_in.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )
    
    try:
        user = User(
            email=user_in.email,
            full_name=user_in.full_name,
            role=user_in.role,
            filiere=user_in.filiere,
            level=user_in.level,
            hashed_password=security.get_password_hash(user_in.password),
            is_verified=False,
            is_active=False 
        )
        session.add(user)
        await session.flush() 
        
        # SOTA FIX: Call create_email_otp from otp_service
        otp_created = await otp_service.create_email_otp(
            session=session, 
            user=user, 
            purpose=OTPPurpose.ACCOUNT_ACTIVATION
        )
        
        if not otp_created:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send verification email. Please try again later."
            )
            
        await session.commit()
        await session.refresh(user)
        
        # SIDE-EFFECT: Audit log successful registration
        logger.info(f"AUDIT: New user registered successfully. ID: {user.id}, Email: {user.email}")
        return user

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Registration Error for {user_in.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="An internal server error occurred during registration."
        )


@router.post("/verify-otp")
async def verify_otp(
    payload: OTPVerify, 
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    Verify the OTP code sent to the user's email.
    Activates the account upon success.
    """
    try:
        # SOTA FIX: Call verify_email_otp from otp_service
        success = await otp_service.verify_email_otp(
            session=session, 
            email=payload.email, 
            code=payload.code,
            allowed_purposes=(OTPPurpose.ACCOUNT_ACTIVATION,)
        )
        
        if not success:
            await session.rollback()
            # SIDE-EFFECT: Log failed OTP verification
            logger.warning(f"SECURITY ALERT: Failed OTP verification attempt for {payload.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Invalid or expired verification code."
            )
            
        await session.commit()
        
        # SIDE-EFFECT: Audit log successful activation
        logger.info(f"AUDIT: User account activated via OTP. Email: {payload.email}")
        return {"message": "Email successfully verified. Account activated."}
        
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"OTP Verification Error for {payload.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="An internal server error occurred during verification."
        )


@router.post("/request-otp", dependencies=[Depends(limiter(3, 3600))])
async def request_otp(
    payload: OTPRequest, 
    session: AsyncSession = Depends(get_session)
) -> Any:
    """
    Resend a new OTP to the user's email.
    Rate limited strictly to prevent email bombing.
    """
    try:
        result = await session.execute(select(User).where(User.email == payload.email))
        user = result.scalars().first()
        
        if user:
            # SOTA FIX: Call create_email_otp from otp_service
            otp_created = await otp_service.create_email_otp(
                session=session, 
                user=user,
                purpose=OTPPurpose.ACCOUNT_ACTIVATION
            )
            if otp_created:
                await session.commit()
            else:
                await session.rollback()
                
        # Always return success to prevent email enumeration attacks
        logger.info(f"AUDIT: OTP request processed for {payload.email}")
        return {"message": "If the account exists, a new code has been sent."}
    except Exception as e:
        await session.rollback()
        logger.error(f"Request OTP Error for {payload.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="An internal server error occurred processing your request."
        )
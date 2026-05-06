
import logging
from datetime import datetime, timedelta
from typing import Optional

import pyotp
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core import security
from app.core.config import settings
from app.models.user import OTPToken, OTPPurpose, User

from app.services.communications.email_service import send_otp_email, send_teacher_invitation_email

logger = logging.getLogger("app.services.iam.otp_service")


def _generate_otp_code() -> str:
    """
    Generates a cryptographically secure 6-digit OTP code.
    Utilizes HMAC-SHA1 via PyOTP (HOTP) to meet US-03 strict specifications.
    """
    secret = pyotp.random_base32()
    hotp = pyotp.HOTP(secret, digits=6, digest='sha1')
    return hotp.at(0)


async def create_email_otp(
    session: AsyncSession, 
    user: User, 
    ttl_minutes: Optional[int] = None, 
    purpose: OTPPurpose = OTPPurpose.ACCOUNT_ACTIVATION
) -> Optional[str]:
    """
    Generates a standard OTP, stages its hash in the database, and dispatches the email.
    Note: This function only flushes the session. The caller MUST commit the transaction.
    """
    code = _generate_otp_code()
    
    if purpose == OTPPurpose.PASSWORD_RESET:
        resolved_ttl = ttl_minutes or settings.PASSWORD_RESET_OTP_EXPIRE_MINUTES
        max_attempts = settings.PASSWORD_RESET_MAX_ATTEMPTS
    else:
        resolved_ttl = ttl_minutes or settings.OTP_EXPIRE_MINUTES
        max_attempts = 5

    hashed_code = security.get_password_hash(code)
    
    token = OTPToken(
        user_id=user.id,
        purpose=purpose,
        otp_code_hash=hashed_code,
        expires_at=datetime.utcnow() + timedelta(minutes=resolved_ttl),
        attempts=0,
        max_attempts=max_attempts, 
        is_used=False
    )
    
    try:
        session.add(token)
        await session.flush()
        
        banner = (
            f"\n{'='*60}\n"
            f"🚀🚀🚀 ATLAS OTP GENERATED (STUDENT/USER) 🚀🚀🚀\n"
            f"📧 User:  {user.email}\n"
            f"🔑 CODE:  [ {code} ]\n"
            f"{'='*60}\n"
        )
        print(banner)
        logger.warning(banner)

        # FIX: Always attempt to send the email. The email_service.py has its own fallback
        # if credentials are missing. This allows local testing with real SMTP.
        email_sent = send_otp_email(user.email, code)
        
        if not email_sent:
            logger.error(f"Failed to send OTP email to {user.email}")
            return None
            
        return code
    except Exception as e:
        logger.error(f"Error creating OTP for user {user.id}: {str(e)}")
        return None


async def create_teacher_onboarding_otp(
    session: AsyncSession, 
    user: User, 
    teacher_name: str, 
    department_name: str
) -> Optional[str]:
    """
    Generates a strict, single-use onboarding OTP for a newly imported teacher.
    """
    code = _generate_otp_code()
    hashed_code = security.get_password_hash(code)
    
    token = OTPToken(
        user_id=user.id,
        purpose=OTPPurpose.TEACHER_ONBOARDING,
        otp_code_hash=hashed_code,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.TEACHER_OTP_EXPIRE_MINUTES),
        attempts=0,
        max_attempts=1, 
        is_used=False
    )
    
    try:
        session.add(token)
        await session.flush()
        
        banner = (
            f"\n{'='*60}\n"
            f"🚀🚀🚀 ATLAS OTP GENERATED (TEACHER) 🚀🚀🚀\n"
            f"📧 Teacher: {user.email}\n"
            f"🔑 CODE:  [ {code} ]\n"
            f"{'='*60}\n"
        )
        print(banner)
        logger.warning(banner)

        # FIX: Always attempt to send the email.
        email_sent = send_teacher_invitation_email(
            to_email=user.email,
            otp_code=code,
            teacher_name=teacher_name,
            department_name=department_name
        )
            
        if not email_sent:
            logger.error(f"Failed to send teacher onboarding OTP to {user.email}")
            return None
            
        return code
    except Exception as e:
        logger.error(f"Error creating teacher OTP for user {user.id}: {str(e)}")
        return None


async def verify_email_otp(
    session: AsyncSession, 
    email: str, 
    code: str, 
    allowed_purposes: tuple[OTPPurpose, ...] = (OTPPurpose.ACCOUNT_ACTIVATION,)
) -> bool:
    result = await verify_email_otp_result(
        session=session,
        email=email,
        code=code,
        allowed_purposes=allowed_purposes,
    )
    return result["ok"]


async def verify_email_otp_result(
    session: AsyncSession,
    email: str,
    code: str,
    allowed_purposes: tuple[OTPPurpose, ...] = (OTPPurpose.ACCOUNT_ACTIVATION,),
) -> dict[str, str | bool]:
    """
    Validates an OTP against the database records.
    """
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalars().first()
    if not user:
        return {"ok": False, "reason": "INVALID_OTP"}

    query = (
        select(OTPToken)
        .where(OTPToken.user_id == user.id)
        .where(OTPToken.purpose.in_(allowed_purposes))
        .where(OTPToken.is_used == False)
        .order_by(OTPToken.created_at.desc())
        .limit(1)
        .with_for_update()
    )
    
    tok_res = await session.execute(query)
    token = tok_res.scalars().first()
    
    if not token:
        logger.warning(f"Verification failed: No active token found for {email}")
        return {"ok": False, "reason": "INVALID_OTP"}

    if token.attempts >= token.max_attempts:
        logger.warning(f"Verification failed: Max attempts ({token.max_attempts}) exceeded for {email}")
        return {"ok": False, "reason": "OTP_MAX_ATTEMPTS"}
        
    if token.expires_at < datetime.utcnow():
        logger.warning(f"Verification failed: Token expired for {email}")
        return {"ok": False, "reason": "OTP_EXPIRED"}
        
    if not security.verify_password(code, token.otp_code_hash):
        token.attempts += 1
        session.add(token)
        await session.flush()
        logger.warning(f"Verification failed: Invalid code for {email}. Attempt {token.attempts}/{token.max_attempts}.")
        return {"ok": False, "reason": "INVALID_OTP"}

    try:
        token.is_used = True
        token.consumed_at = datetime.utcnow()
        session.add(token)
        
        if token.purpose in (OTPPurpose.ACCOUNT_ACTIVATION, OTPPurpose.TEACHER_ONBOARDING):
            user.is_active = True
            user.is_verified = True
            user.verified_at = datetime.utcnow()
            session.add(user)
        
        await session.flush() 
        
        logger.info(f"User {email} successfully verified via OTP for {token.purpose.name}.")
        return {"ok": True, "reason": "VERIFIED"}
    except Exception as e:
        logger.error(f"Error finalizing OTP verification for {email}: {str(e)}")
        return {"ok": False, "reason": "INVALID_OTP"}
import logging
from datetime import datetime, timedelta
from typing import Optional

import pyotp
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

# SOTA FIX: Using our robust security module configured with bcrypt cost=12
from app.core import security
from app.core.config import settings
from app.models.user import OTPToken, OTPPurpose, User
from app.services.email_service import send_otp_email, send_teacher_invitation_email

logger = logging.getLogger(__name__)


def _generate_otp_code() -> str:
    """
    Generates a cryptographically secure 6-digit OTP code.
    Utilizes HMAC-SHA1 via PyOTP (HOTP) to meet US-03 strict specifications.
    
    Architectural Note: To maintain schema compatibility without storing the 
    plaintext base32 secret, we generate the HOTP string here and persist its 
    bcrypt hash in the database.
    """
    secret = pyotp.random_base32()
    hotp = pyotp.HOTP(secret, digits=6, digest='sha1')
    # Use counter 0 as a secure generation seed per HOTP specification
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
    
    # Dynamically assign limits based on Purpose (US-04 Enforcement)
    if purpose == OTPPurpose.PASSWORD_RESET:
        resolved_ttl = ttl_minutes or settings.PASSWORD_RESET_OTP_EXPIRE_MINUTES
        max_attempts = settings.PASSWORD_RESET_MAX_ATTEMPTS
    else:
        resolved_ttl = ttl_minutes or settings.OTP_EXPIRE_MINUTES
        max_attempts = 5

    # SOTA FIX: Utilizing the injected bcrypt implementation
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
        # We flush instead of commit. This keeps the transaction open and 
        # prevents the `user` object from expiring.
        await session.flush()
        
        # Dispatch email.
        email_sent = send_otp_email(user.email, code)
        
        if not email_sent:
            logger.error(f"Failed to send OTP email to {user.email}")
            return None
            
        return code
    except Exception as e:
        # Do not rollback here; let the caller control the transaction boundary.
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
    Enforces US-05 constraints: Config-driven TTL and max_attempts=1.
    """
    code = _generate_otp_code()
    
    # SOTA FIX: Utilizing the injected bcrypt implementation
    hashed_code = security.get_password_hash(code)
    
    token = OTPToken(
        user_id=user.id,
        purpose=OTPPurpose.TEACHER_ONBOARDING,
        otp_code_hash=hashed_code,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.TEACHER_OTP_EXPIRE_MINUTES),
        attempts=0,
        max_attempts=1, # STRICT: Single-use, no multiple attempts per US-05
        is_used=False
    )
    
    try:
        session.add(token)
        await session.flush()
        
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
    """
    Validates an OTP against the database records.
    Enforces dynamic max_attempts limits based on schema, expiration, and state transitions.
    Includes row-level locking (with_for_update) to prevent race conditions.
    """
    # 1. Identify User
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalars().first()
    if not user:
        return False

    # 2. Retrieve the most recent, non-consumed token for the specified purposes
    # with_for_update() strictly prevents concurrent attempt-increment bypasses
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
        return False

    # 3. Security Validation Suite: Attempts & Expiration dynamically driven by schema
    if token.attempts >= token.max_attempts:
        logger.warning(f"Verification failed: Max attempts ({token.max_attempts}) exceeded for {email}")
        return False
        
    if token.expires_at < datetime.utcnow():
        logger.warning(f"Verification failed: Token expired for {email}")
        return False
        
    # 4. Cryptographic Verification
    # SOTA FIX: Utilizing bcrypt check via security.verify_password
    if not security.verify_password(code, token.otp_code_hash):
        token.attempts += 1
        session.add(token)
        await session.flush()
        logger.warning(f"Verification failed: Invalid code for {email}. Attempt {token.attempts}/{token.max_attempts}.")
        return False

    # 5. State Transition
    try:
        token.is_used = True
        token.consumed_at = datetime.utcnow()
        session.add(token)
        
        # Conditionally update user state based on the specific token purpose
        if token.purpose in (OTPPurpose.ACCOUNT_ACTIVATION, OTPPurpose.TEACHER_ONBOARDING):
            user.is_active = True
            user.is_verified = True
            user.verified_at = datetime.utcnow() # Cryptographic audit trail
            session.add(user)
        
        # Flush the updates to the transaction block.
        await session.flush() 
        
        logger.info(f"User {email} successfully verified via OTP for {token.purpose.name}.")
        return True
    except Exception as e:
        logger.error(f"Error finalizing OTP verification for {email}: {str(e)}")
        return False
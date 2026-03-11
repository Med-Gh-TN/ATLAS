import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core import security
from app.core.config import settings
from app.models.all_models import OTPToken, OTPPurpose, User
from app.services.email_service import send_otp_email

logger = logging.getLogger(__name__)

def _generate_otp_code() -> str:
    """
    Generates a cryptographically secure numeric OTP code.
    Uses the secrets module to ensure high entropy, preventing brute-force predictability.
    """
    # Using secrets.choice for a uniform distribution of digits
    return "".join(secrets.choice("0123456789") for _ in range(settings.OTP_LENGTH))


async def create_email_otp(
    session: AsyncSession, 
    user: User, 
    ttl_minutes: int = settings.OTP_EXPIRE_MINUTES, 
    purpose: OTPPurpose = OTPPurpose.VERIFY_EMAIL
) -> Optional[str]:
    """
    Generates an OTP, stages its hash in the database, and dispatches the email.
    Note: This function only flushes the session. The caller MUST commit the transaction.
    """
    code = _generate_otp_code()
    
    # We store the hash of the OTP to prevent 'database leak' vulnerabilities.
    token = OTPToken(
        user_id=user.id,
        purpose=purpose,
        otp_code_hash=security.get_password_hash(code),
        expires_at=datetime.utcnow() + timedelta(minutes=ttl_minutes),
    )
    
    try:
        session.add(token)
        # We flush instead of commit. This keeps the transaction open and 
        # prevents the `user` object from expiring, avoiding greenlet_spawn errors.
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


async def verify_email_otp(
    session: AsyncSession, 
    email: str, 
    code: str, 
    allowed_purposes: tuple[OTPPurpose, ...] = (OTPPurpose.VERIFY_EMAIL, OTPPurpose.TEACHER_INVITE)
) -> bool:
    """
    Validates an OTP against the database records.
    Enforces 'One-Time' use by marking the token as consumed.
    Note: This function only flushes the session. The caller MUST commit the transaction.
    """
    # 1. Identify User
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalars().first()
    if not user:
        return False

    # 2. Retrieve the most recent, non-consumed token for the specified purposes
    query = (
        select(OTPToken)
        .where(OTPToken.user_id == user.id)
        .where(OTPToken.purpose.in_(allowed_purposes))
        .where(OTPToken.consumed_at.is_(None))
        .order_by(OTPToken.created_at.desc())
        .limit(1)
    )
    
    tok_res = await session.execute(query)
    token = tok_res.scalars().first()
    
    if not token:
        logger.warning(f"Verification failed: No active token found for {email}")
        return False
        
    # 3. Security Validation Suite
    if token.expires_at < datetime.utcnow():
        logger.warning(f"Verification failed: Token expired for {email}")
        return False
        
    if not security.verify_password(code, token.otp_code_hash):
        logger.warning(f"Verification failed: Invalid code provided for {email}")
        return False

    # 4. State Transition
    try:
        token.consumed_at = datetime.utcnow()
        user.is_verified = True
        
        session.add(token)
        session.add(user)
        # Flush the updates to the transaction block.
        await session.flush() 
        
        logger.info(f"User {email} successfully verified via OTP.")
        return True
    except Exception as e:
        logger.error(f"Error finalizing OTP verification for {email}: {str(e)}")
        return False
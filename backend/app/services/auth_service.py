import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple, Any

import pyotp
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

# SOTA FIX: Using our robust security module instead of broken passlib
from app.core import security
from app.core.config import settings
from app.models.user import OTPToken, OTPPurpose, User
from app.services.email_service import send_otp_email, send_teacher_invitation_email

logger = logging.getLogger(__name__)


def _generate_otp_code() -> str:
    """
    Generates a cryptographically secure 6-digit OTP code.
    Utilizes HMAC-SHA1 via PyOTP to meet US-03 strict specifications.
    """
    # Generate a random base32 secret, then create a time-based OTP (HMAC-SHA1 default)
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret, digits=6, digest='sha1')
    return totp.now()


async def create_email_otp(
    session: AsyncSession, 
    user: User, 
    ttl_minutes: int = 1440, # 24 hours (1440 minutes) per US-03; 15 mins for PASSWORD_RESET via caller
    purpose: OTPPurpose = OTPPurpose.ACCOUNT_ACTIVATION
) -> Optional[str]:
    """
    Generates a standard OTP, stages its hash in the database, and dispatches the email.
    Note: This function only flushes the session. The caller MUST commit the transaction.
    """
    code = _generate_otp_code()
    
    # SOTA FIX: Replaced broken passlib.bcrypt with our robust Argon2 implementation
    hashed_code = security.get_password_hash(code)
    
    token = OTPToken(
        user_id=user.id,
        purpose=purpose,
        otp_code_hash=hashed_code,
        expires_at=datetime.utcnow() + timedelta(minutes=ttl_minutes),
        attempts=0,
        max_attempts=5, # Standard max attempts for student/general OTPs
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
    Enforces US-05 constraints: 48h TTL and max_attempts=1.
    """
    code = _generate_otp_code()
    
    # SOTA FIX: Replaced broken passlib.bcrypt with our robust Argon2 implementation
    hashed_code = security.get_password_hash(code)
    
    token = OTPToken(
        user_id=user.id,
        purpose=OTPPurpose.TEACHER_ONBOARDING,
        otp_code_hash=hashed_code,
        expires_at=datetime.utcnow() + timedelta(hours=48),
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
    # SOTA FIX: Changed to security.verify_password to utilize Argon2
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


async def authenticate_user(session: AsyncSession, email: str, password: str) -> Optional[User]:
    """
    Verifies user credentials securely.
    Returns the User object if successful, None otherwise.
    """
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalars().first()
    
    if not user:
        return None
        
    if not security.verify_password(password, user.hashed_password):
        return None
        
    return user


def create_user_tokens(user_id: Any, role: str) -> Tuple[str, str]:
    """
    Generates a new pair of Access (15m) and Refresh (7d) tokens.
    """
    payload = {"sub": str(user_id), "role": role}
    
    access_token = security.create_access_token(data=payload)
    refresh_token = security.create_refresh_token(data=payload)
    
    return access_token, refresh_token


async def revoke_token(redis_client: Any, token: str) -> bool:
    """
    Extracts the 'jti' (JWT ID) from a token and adds it to the Redis blacklist
    until its natural expiration.
    """
    payload = security.decode_token(token)
    if not payload:
        return False
        
    jti = payload.get("jti")
    exp = payload.get("exp")
    
    if not jti or not exp:
        return False
        
    # Calculate remaining time to live
    ttl = exp - int(datetime.utcnow().timestamp())
    if ttl > 0:
        # Use setex to automatically remove the key from Redis once the token expires naturally
        await redis_client.setex(f"blacklist:{jti}", ttl, "revoked")
        
    return True


async def process_refresh_token(redis_client: Any, refresh_token: str) -> Optional[Tuple[str, str]]:
    """
    Validates a refresh token, checks the Redis blacklist for one-time-use enforcement,
    blacklists the old token, and returns a fresh pair.
    """
    payload = security.decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        return None
        
    jti = payload.get("jti")
    user_id = payload.get("sub")
    role = payload.get("role")
    
    if not jti or not user_id:
        return None
        
    # Check if the token was already used (blacklisted)
    is_blacklisted = await redis_client.exists(f"blacklist:{jti}")
    if is_blacklisted:
        logger.warning(f"SECURITY ALERT: Attempted reuse of blacklisted refresh token. JTI: {jti}")
        # Note: In a stricter implementation, we might revoke ALL tokens for this user here.
        return None
        
    # Token is valid and not reused. Revoke it immediately (One-Time-Use)
    await revoke_token(redis_client, refresh_token)
    
    # Issue a new pair
    return create_user_tokens(user_id=user_id, role=role)


async def reset_user_password(session: AsyncSession, email: str, new_password: str) -> bool:
    """
    Updates the user's password securely after a successful OTP verification.
    Includes row-level locking to ensure atomic updates.
    """
    # Defensive row-locking for password updates
    res = await session.execute(select(User).where(User.email == email).with_for_update())
    user = res.scalars().first()
    
    if not user:
        return False
        
    user.hashed_password = security.get_password_hash(new_password)
    session.add(user)
    
    # Note: US-04 requires revocation of all active sessions. 
    # This will be enforced at the endpoint level by incrementing a global cache invalidation
    # or relying on the user re-authenticating.
    
    await session.flush()
    return True
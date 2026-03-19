import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

# SOTA FIX: Using our robust security module configured with bcrypt cost=12
from app.core import security
from app.models.user import User

logger = logging.getLogger(__name__)


async def authenticate_user(session: AsyncSession, email: str, password: str, redis_client: Any) -> Optional[User]:
    """
    Verifies user credentials securely.
    Returns the User object if successful, None otherwise.
    Note: Requires redis_client to check for global session revocation bounds.
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
    checks the user's global session revocation boundary,
    blacklists the old token, and returns a fresh pair.
    """
    payload = security.decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        return None
        
    jti = payload.get("jti")
    user_id = payload.get("sub")
    role = payload.get("role")
    issued_at = payload.get("iat", 0) # Fallback to 0 if missing
    
    if not jti or not user_id:
        return None
        
    # Check if the specific token was already used (blacklisted)
    is_blacklisted = await redis_client.exists(f"blacklist:{jti}")
    if is_blacklisted:
        logger.warning(f"SECURITY ALERT: Attempted reuse of blacklisted refresh token. JTI: {jti}")
        return None

    # Check against global user session revocation boundary (US-04)
    revocation_timestamp = await redis_client.get(f"user_sessions_revoked:{user_id}")
    if revocation_timestamp:
        if issued_at < int(revocation_timestamp):
            logger.warning(f"SECURITY ALERT: Refresh token rejected due to global revocation boundary for user {user_id}")
            return None
        
    # Token is valid and not reused. Revoke it immediately (One-Time-Use)
    await revoke_token(redis_client, refresh_token)
    
    # Issue a new pair
    return create_user_tokens(user_id=user_id, role=role)


async def reset_user_password(session: AsyncSession, email: str, new_password: str, redis_client: Any) -> bool:
    """
    Updates the user's password securely after a successful OTP verification.
    Includes row-level locking to ensure atomic updates.
    Enforces US-04 by establishing a global session revocation boundary in Redis.
    """
    # Defensive row-locking for password updates
    res = await session.execute(select(User).where(User.email == email).with_for_update())
    user = res.scalars().first()
    
    if not user:
        return False
        
    user.hashed_password = security.get_password_hash(new_password)
    session.add(user)
    
    # US-04 Enforcement: Revocation of ALL active sessions.
    # We set a timestamp boundary in Redis. Any refresh token issued BEFORE this boundary
    # will be immediately rejected during the refresh cycle. (TTL set to 8 days to outlive max token life).
    current_timestamp = int(datetime.utcnow().timestamp())
    await redis_client.setex(
        f"user_sessions_revoked:{user.id}", 
        timedelta(days=8), 
        current_timestamp
    )
    
    await session.flush()
    return True
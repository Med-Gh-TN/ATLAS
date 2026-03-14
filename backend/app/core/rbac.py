import logging
from typing import Callable, Any
from fastapi import Depends, HTTPException, status, Request

# Maintaining the architectural import path defined in the domain split
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User, UserRole

# DEFENSIVE ARCHITECTURE: Initialize dedicated security logger for RBAC events
logger = logging.getLogger(__name__)

def require_roles(*roles: UserRole) -> Callable[..., Any]:
    """
    DEFENSIVE ARCHITECTURE: US-24 Strict RBAC Enforcement.
    Validates that the authenticated user possesses one of the required roles.
    Includes active security monitoring for privilege escalation attempts.
    """
    async def _dep(request: Request, user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            # SIDE-EFFECT: Audit Logging for potential Privilege Escalation attacks
            client_ip = request.client.host if request.client else "Unknown IP"
            target_endpoint = request.url.path
            
            logger.warning(
                f"SECURITY ALERT [RBAC]: Privilege escalation attempt blocked. "
                f"User ID: {user.id}, "
                f"Current Role: {user.role}, "
                f"Attempted Access: {target_endpoint}, "
                f"Required Roles: {[r.value if hasattr(r, 'value') else str(r) for r in roles]}, "
                f"IP: {client_ip}"
            )
            
            # Fail securely with a generic 403 to prevent role enumeration
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="You do not have the required permissions to access this resource."
            )
            
        # Optional: Log successful access to highly sensitive admin routes
        if UserRole.ADMIN in roles:
            logger.info(f"AUDIT [RBAC]: Admin access granted to User {user.id} for {request.url.path}")
            
        return user
        
    return _dep
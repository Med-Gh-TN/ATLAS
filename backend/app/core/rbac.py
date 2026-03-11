from fastapi import Depends, HTTPException, status
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User, UserRole

def require_roles(*roles: UserRole):
    async def _dep(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user
    return _dep

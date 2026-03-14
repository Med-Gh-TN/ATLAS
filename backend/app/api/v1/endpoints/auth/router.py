import logging
from fastapi import APIRouter

# Import sub-routers from the auth domain
from app.api.v1.endpoints.auth import login
from app.api.v1.endpoints.auth import registration
from app.api.v1.endpoints.auth import password
from app.api.v1.endpoints.auth import teacher
from app.api.v1.endpoints.auth import me

logger = logging.getLogger(__name__)

# Main Auth Router Aggregator
router = APIRouter()

# Include sub-routers. Tags are unified under "auth" for Swagger UI grouping.
router.include_router(login.router)
router.include_router(registration.router)
router.include_router(password.router)
router.include_router(teacher.router)
router.include_router(me.router)

logger.info("Auth domain sub-routers successfully aggregated.")
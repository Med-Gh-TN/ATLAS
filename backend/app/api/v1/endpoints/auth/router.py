import logging
from fastapi import APIRouter

# SOTA REFINE: Using relative imports for local encapsulation
from . import login, registration, password, teacher, me, admin

# ARCHITECTURAL ENFORCEMENT: Explicit boundary logging for IAM Aggregator telemetry
logger = logging.getLogger("app.api.v1.endpoints.auth.router")

# Main Auth Router Aggregator
router = APIRouter()

# Aggregate sub-routers into the unified IAM tree
try:
    router.include_router(login.router)
    router.include_router(registration.router)
    router.include_router(password.router)
    router.include_router(teacher.router)
    router.include_router(me.router)
    router.include_router(admin.router)
    logger.info("IAM API: Auth sub-routers successfully aggregated.")
except Exception as e:
    logger.error(f"IAM API: Critical failure during Auth router aggregation: {e}")
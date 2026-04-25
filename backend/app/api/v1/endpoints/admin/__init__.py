from fastapi import APIRouter

from . import analytics, departments, teachers

# Initialize the aggregator router for the 'admin' domain
router = APIRouter()

# Aggregate all sub-domain routers.
# Note: The prefix "/api/v1/admin" and tags=["admin"] are already securely applied
# centrally in app/main.py via app.include_router(admin.router, ...).
# Therefore, we include these sub-routers directly to maintain the OpenAPI 3.1 contract.

router.include_router(analytics.router)
router.include_router(departments.router)
router.include_router(teachers.router)
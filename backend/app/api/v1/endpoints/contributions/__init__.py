from fastapi import APIRouter

from . import courses, students

# Initialize the aggregator router for the 'contributions' domain
router = APIRouter()

# Aggregate all sub-domain routers.
# Note: The global prefix "/api/v1/contributions" and tags=["contributions"]
# are securely applied centrally in app/main.py.

# The official course endpoints originally lived at /courses/upload and /courses/{id}/versions.
# We apply the /courses prefix here to maintain the exact OpenAPI contract.
router.include_router(courses.router, prefix="/courses")

# The student contribution endpoints originally lived at the root of the router.
router.include_router(students.router)
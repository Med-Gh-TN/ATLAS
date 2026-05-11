"""
ATLAS v1 router registry.
Legacy collaboration and forum routers have been retired.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import FastAPI

from app.core.config import settings

from app.routers.admin import router as admin_router
from app.routers.annotations import router as annotations_router
from app.routers.auth import router as auth_router
from app.routers.collaboration import router as collaboration_router
from app.routers.contributions import router as contributions_router
from app.routers.courses import router as courses_router
from app.routers.files import router as files_router
from app.routers.dashboard import router as dashboard_router
from app.routers.student_dashboard import router as student_dashboard_router
from app.routers.health import router as health_router
from app.routers.learning import router as learning_router
from app.routers.notifications import router as notifications_router
from app.routers.notifications import ws_router as notifications_ws_router
from app.routers.rag import router as rag_router
from app.routers.search import router as search_router
from app.routers.study import router as study_router
from app.routers.users import router as users_router
from app.routers.superadmin import router as superadmin_router


@dataclass(frozen=True)
class RouterRegistration:
    router: object
    prefix: str


CORE_PLATFORM_ROUTERS = (
    RouterRegistration(auth_router, "/auth"),
    RouterRegistration(health_router, ""),
)

ACADEMIC_EXPERIENCE_ROUTERS = (
    RouterRegistration(courses_router, ""),
    RouterRegistration(files_router, ""),
    RouterRegistration(search_router, ""),
    RouterRegistration(rag_router, ""),
    RouterRegistration(study_router, ""),
    RouterRegistration(learning_router, ""),
    RouterRegistration(annotations_router, ""),
)

# Community & Engagement — forums removed, collaboration kept for learning paths only
COMMUNITY_AND_ENGAGEMENT_ROUTERS = (
    RouterRegistration(contributions_router, ""),
    RouterRegistration(collaboration_router, ""),
    RouterRegistration(notifications_router, ""),
)

OPERATIONS_AND_GOVERNANCE_ROUTERS = (
    RouterRegistration(student_dashboard_router, ""),
    RouterRegistration(dashboard_router, ""),   # teacher, admin, export
    RouterRegistration(admin_router, ""),
    RouterRegistration(superadmin_router, ""),
    RouterRegistration(users_router, ""),
)

# WebSocket routers: only notifications remain
WEBSOCKET_ROUTERS = (
    notifications_ws_router,
)


def _register_group(
    app: FastAPI,
    api_prefix: str,
    registrations: tuple[RouterRegistration, ...],
) -> None:
    for registration in registrations:
        app.include_router(
            registration.router,
            prefix=f"{api_prefix}{registration.prefix}",
        )


def register_v1_routers(app: FastAPI) -> None:
    api_prefix = settings.API_V1_STR.rstrip("/")

    _register_group(app, api_prefix, CORE_PLATFORM_ROUTERS)
    _register_group(app, api_prefix, ACADEMIC_EXPERIENCE_ROUTERS)
    _register_group(app, api_prefix, COMMUNITY_AND_ENGAGEMENT_ROUTERS)
    _register_group(app, api_prefix, OPERATIONS_AND_GOVERNANCE_ROUTERS)

    for router in WEBSOCKET_ROUTERS:
        app.include_router(router)
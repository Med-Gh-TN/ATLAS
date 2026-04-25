from __future__ import annotations

from fastapi import FastAPI

from app.routers.admin import router as admin_router
from app.routers.annotations import router as annotations_router
from app.routers.auth import router as auth_router
from app.routers.collaboration import router as collaboration_router
from app.routers.collaboration import ws_router as collaboration_ws_router
from app.routers.contributions import router as contributions_router
from app.routers.courses import router as courses_router
from app.routers.dashboard import router as dashboard_router
from app.routers.forums import router as forums_router
from app.routers.forums import ws_router as forums_ws_router
from app.routers.gamification import router as gamification_router
from app.routers.health import router as health_router
from app.routers.notifications import router as notifications_router
from app.routers.notifications import ws_router as notifications_ws_router
from app.routers.rag import router as rag_router
from app.routers.search import router as search_router
from app.routers.study import router as study_router
from app.routers.users import router as users_router
from app.routers.superadmin import router as superadmin_router


def register_v1_routers(app: FastAPI) -> None:
    app.include_router(auth_router, prefix="/v1/auth")
    app.include_router(courses_router, prefix="/v1")
    app.include_router(study_router, prefix="/v1")
    app.include_router(contributions_router, prefix="/v1")
    app.include_router(forums_router, prefix="/v1")
    app.include_router(collaboration_router, prefix="/v1")
    app.include_router(gamification_router, prefix="/v1")
    app.include_router(dashboard_router, prefix="/v1")
    app.include_router(admin_router, prefix="/v1")
    app.include_router(annotations_router, prefix="/v1")
    app.include_router(users_router, prefix="/v1")
    app.include_router(notifications_router, prefix="/v1")
    app.include_router(rag_router, prefix="/v1")
    app.include_router(search_router, prefix="/v1")
    app.include_router(health_router, prefix="/v1")
    app.include_router(superadmin_router, prefix="/v1")

    app.include_router(notifications_ws_router)
    app.include_router(forums_ws_router)
    app.include_router(collaboration_ws_router)

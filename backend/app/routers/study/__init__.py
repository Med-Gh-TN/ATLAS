"""
@file backend/app/routers/study/__init__.py
@description Aggregator for the decoupled Study Engine routers.
@layer Core Logic
@dependencies FastAPI
"""

from fastapi import APIRouter

from app.routers.study.assets import router as assets_router
from app.routers.study.flashcards import router as flashcards_router
from app.routers.study.quizzes import router as quizzes_router

# The main study router that will be imported by registry.py
router = APIRouter(tags=["Study"])

# Include domain-driven sub-routers
router.include_router(flashcards_router)
router.include_router(quizzes_router)
router.include_router(assets_router)
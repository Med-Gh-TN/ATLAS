from fastapi import APIRouter

from . import flashcards, quizzes, summaries, mindmaps, progress, streaks

router = APIRouter()

router.include_router(flashcards.router)
router.include_router(quizzes.router)
router.include_router(summaries.router)
router.include_router(mindmaps.router)
router.include_router(progress.router)
router.include_router(streaks.router)

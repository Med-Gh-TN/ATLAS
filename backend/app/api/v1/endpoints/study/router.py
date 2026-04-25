# Comprehensive, production-ready code with clear JSDoc/Docstring comments.
# ENTIRE FILE CONTENTS HERE. NO PLACEHOLDERS.
import logging
from fastapi import APIRouter

# US-XX: Added 'progress' to the imports for Active Learning Panel telemetry
from . import flashcards, quizzes, summaries, mindmaps, progress, streaks

# ARCHITECTURAL ENFORCEMENT: Explicit boundary logging for API Aggregator telemetry
logger = logging.getLogger("app.api.v1.endpoints.study.router")

# Initialize the aggregator router for the 'study' domain
router = APIRouter()

# Aggregate all sub-domain routers.
# Note: The prefix "/study" and tags=["study"] are already securely applied
# centrally in app/main.py via app.include_router().
# Therefore, we include these sub-routers identically to maintain the strict OpenAPI 3.1 contract.

try:
    router.include_router(flashcards.router)
    router.include_router(quizzes.router)
    router.include_router(summaries.router)
    router.include_router(mindmaps.router)

    # Active Learning Panel: High-frequency scroll telemetry and document resume state
    router.include_router(progress.router)

    # US-XX: Learning streaks for gamification
    router.include_router(streaks.router)

    logger.info("Study Engine API: Sub-domain routers successfully aggregated.")
except Exception as e:
    logger.error(f"Study Engine API: Critical failure during router aggregation: {e}")

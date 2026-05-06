"""
@file backend/app/routers/rag/__init__.py
@description Aggregator for the decoupled RAG Chat and Swarm Orchestrator routers.
@layer Core Logic
@dependencies FastAPI
"""

from fastapi import APIRouter

from app.routers.rag.live import router as live_router
from app.routers.rag.sessions import router as sessions_router

# The main RAG router that will be imported by registry.py
router = APIRouter(tags=["RAG"])

# Include domain-driven sub-routers
router.include_router(live_router)
router.include_router(sessions_router)
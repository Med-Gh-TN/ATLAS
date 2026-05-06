"""
@file backend/app/routers/rag/live.py
@description SOTA WebSocket & HTTP tutor endpoints with real student identity.
JWT extracted and user details injected into context_data for full personalization.
@layer Core Logic / State Persistence
@dependencies FastAPI, SQLAlchemy async, tiktoken, SwarmOrchestrator
"""

from __future__ import annotations

import json
import sys
import asyncio
import logging
from datetime import datetime
from uuid import UUID
from pathlib import Path

from fastapi import APIRouter, Depends, status, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, text
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)
router = APIRouter()

from app.core.exceptions import atlas_error
from app.core import security
from app.db.session import get_session, engine
from app.dependencies import get_current_user
from app.models.user import User

try:
    from app.services.intelligence.swarm_router import SwarmOrchestrator
except ImportError as e:
    SwarmOrchestrator = None
    logger.warning(f"SwarmOrchestrator not loaded: {e}")

from app.models.contribution import DocumentVersion, DocumentPipelineStatus, Contribution
from app.models.course import Course

class TutorStreamRequest(BaseModel):
    course_id: str
    message: str

class ContextResponse(BaseModel):
    course_id: str
    context: str

# ============================================================================
# NODE A: SERVER‑SIDE COURSE CONTEXT BUILDER (v2 — parent_chunks direct)
# ============================================================================

_MAX_CONTEXT_TOKENS = 4000
_ENCODING_NAME = "cl100k_base"

async def _build_rag_context(course_id: str, db: AsyncSession) -> str:
    try:
        course_uuid = UUID(course_id)
    except ValueError:
        logger.warning(f"Invalid course UUID: {course_id}")
        return ""

    stmt = text("""
        SELECT pc.content
        FROM parent_chunks pc
        JOIN documents d ON pc.document_uuid = d.uuid
        JOIN documentversion dv ON dv.id = d.uuid
        JOIN contribution c ON c.id = dv.contribution_id
        WHERE c.course_id = :course_id
        ORDER BY pc.created_at
    """)
    result = await db.execute(stmt, {"course_id": course_uuid})
    rows = result.scalars().all()

    if not rows:
        logger.info(f"No parent_chunks for course {course_id}. Context empty.")
        return ""

    full_text = "\n\n".join(rows)

    try:
        import tiktoken
        enc = tiktoken.get_encoding(_ENCODING_NAME)
        tokens = enc.encode(full_text)
        if len(tokens) > _MAX_CONTEXT_TOKENS:
            tokens = tokens[:_MAX_CONTEXT_TOKENS]
            full_text = enc.decode(tokens)
            logger.info(f"Truncated context to {_MAX_CONTEXT_TOKENS} tokens.")
    except ImportError:
        max_chars = _MAX_CONTEXT_TOKENS * 4
        if len(full_text) > max_chars:
            full_text = full_text[:max_chars]
    except Exception as e:
        logger.error(f"Token truncation error: {e}")

    return full_text.strip()


# ============================================================================
# ENDPOINT: PREWARMED CONTEXT (STATIC DIRECTIVE)
# ============================================================================
@router.get("/rag/context/{course_id}", response_model=ContextResponse)
async def get_prewarmed_context(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    directive = (
        "SYSTEM DIRECTIVE: You are an autonomous, ultra-fast AI tutor. Prioritize immediate, "
        "low-latency responses and natural conversational flow. Rely entirely on your foundational "
        "knowledge to answer the student. Do NOT attempt to search external databases or use tools."
    )
    return ContextResponse(course_id=course_id, context=directive)


# ============================================================================
# HELPER: load user from JWT token (works without HTTP Depends)
# ============================================================================
async def _get_user_from_token(token: str) -> User | None:
    """Decode token and fetch user from DB. Returns None if invalid."""
    payload = security.decode_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    try:
        uid = UUID(user_id)
    except (ValueError, TypeError):
        return None

    from app.db.session import engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.ext.asyncio import AsyncSession

    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.id == uid).options(selectinload(User.teacher_profile))
        )
        user = result.scalar_one_or_none()
        if user and user.is_active and user.status.value != "SUSPENDED":
            return user
    return None


# ============================================================================
# WEBSOCKET TUTOR ENDPOINT (MULTIMODAL LIVE)
# ============================================================================
@router.websocket("/rag/tutor-socket/{course_id}")
async def websocket_live_tutor(
    websocket: WebSocket,
    course_id: str,
    db: AsyncSession = Depends(get_session)
):
    await websocket.accept()

    if SwarmOrchestrator is None:
        await websocket.send_json({"event_type": "error", "payload": "Swarm Orchestrator unavailable.", "timestamp_ms": 0})
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return

    try:
        auth_frame = await websocket.receive_json()
        if auth_frame.get("type") != "auth" or not auth_frame.get("token"):
            logger.warning("[SwarmSocket] Connection rejected: Missing or invalid auth frame.")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        token = auth_frame["token"]
        user = await _get_user_from_token(token)
        if user is None:
            logger.warning("[SwarmSocket] Invalid token; closing.")
            await websocket.send_json({"event_type": "error", "payload": "Invalid authentication token.", "timestamp_ms": 0})
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # Build rich student info from actual user record
        student_info = {
            "name": user.full_name or "Student",
            "level": user.level.value if user.level else user.filiere or "Unknown",
            "class": user.filiere or "",
            "program": user.program or "",
        }
        # Use the real UUID as the stable student identifier
        student_id = str(user.id)

        voice_name = auth_frame.get("voice_name", "Zephyr")

        logger.info(f"[SwarmSocket] Building RAG context for course {course_id}…")
        rag_context = await _build_rag_context(course_id, db)
        logger.info(f"[SwarmSocket] Context built: {len(rag_context)} chars. Voice: {voice_name}. Student: {student_info['name']} ({student_id})")

        context_data = {
            "course_id": course_id,
            "document_ids": [],
            "student_id": student_id,
            "rag_context": rag_context,
            "voice_name": voice_name,
            "student_info": student_info,
        }

        orchestrator = SwarmOrchestrator()
        session_id = f"swarm_ws_{int(datetime.utcnow().timestamp())}"
        in_queue: asyncio.Queue = asyncio.Queue()

        async def pump_downstream():
            try:
                async for event in orchestrator.stream_interaction(
                    session_id, "WS_START", context_data, in_queue=in_queue
                ):
                    if event:
                        await websocket.send_text(event)
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"[SwarmSocket] Downstream Error: {e}", exc_info=True)

        async def pump_upstream():
            try:
                while True:
                    data = await websocket.receive_json()
                    await in_queue.put(data)
            except WebSocketDisconnect:
                logger.info(f"[SwarmSocket] Client disconnected cleanly.")
                await in_queue.put({"type": "close"})
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"[SwarmSocket] Upstream Error: {e}")

        down_task = asyncio.create_task(pump_downstream())
        up_task = asyncio.create_task(pump_upstream())

        done, pending = await asyncio.wait(
            [down_task, up_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        logger.info("[SwarmSocket] Connection closed by client.")
    except Exception as e:
        logger.error(f"CRITICAL: WebSocket Tutor Pipeline failed: {e}", exc_info=True)
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        except Exception:
            pass


# ============================================================================
# HTTP SSE TUTOR STREAM ENDPOINT
# ============================================================================
@router.post("/rag/tutor-stream")
async def stream_live_tutor(
    payload: TutorStreamRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    if SwarmOrchestrator is None:
        raise atlas_error("SWARM_001", "Swarm Orchestrator module not loaded.", status_code=500)
    
    try:
        course_uuid = UUID(payload.course_id.strip())
    except Exception:
        course_uuid = None
        
    # Enrich student info from the authenticated current_user
    student_info = {
        "name": current_user.full_name or "Student",
        "level": current_user.level.value if current_user.level else current_user.filiere or "Unknown",
        "class": current_user.filiere or "",
        "program": current_user.program or "",
    }
    student_id = str(current_user.id)
    
    context_data = {
        "course_id": str(course_uuid),
        "document_ids": [],
        "student_id": student_id,
        "voice_name": "Zephyr",
        "student_info": student_info,
    }
    orchestrator = SwarmOrchestrator()
    session_id = f"swarm_{current_user.id}_{int(datetime.utcnow().timestamp())}"
    
    return StreamingResponse(
        orchestrator.stream_interaction(session_id, payload.message, context_data),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
"""
@file backend/app/routers/rag/sessions.py
@description Domain-driven router for RAG Session management and message history.
@layer State Persistence / Core Logic
@dependencies HybridRAGPipeline, SQLAlchemy, FastAPI
"""

import json
import sys
import logging
from datetime import datetime
from typing import AsyncGenerator, Dict, Any
from uuid import UUID
from pathlib import Path

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.contribution import Contribution, DocumentVersion
from app.models.rag import Message, RAGSession
from app.models.user import User
from app.schemas.pagination import PageMeta
from app.services.ai_core.guardrails import sanitize_rag_query

logger = logging.getLogger(__name__)
router = APIRouter()

# ============================================================================
# OMNI-ARCHITECT PIPELINE INJECTION
# ============================================================================
OMNI_SRC_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "src"
if str(OMNI_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(OMNI_SRC_DIR))

try:
    from orchestrator import HybridRAGPipeline
except ImportError as e:
    logger.error(f"CRITICAL: Failed to load Omni-Architect Orchestrator: {e}")
    HybridRAGPipeline = None

_global_omni_pipeline = None

async def get_omni_pipeline() -> 'HybridRAGPipeline':
    global _global_omni_pipeline
    if _global_omni_pipeline is None:
        if HybridRAGPipeline is None:
            raise RuntimeError("Omni-Architect orchestrator is not accessible in the system path.")
        _global_omni_pipeline = HybridRAGPipeline()
        await _global_omni_pipeline.initialize()
    return _global_omni_pipeline


# ============================================================================
# SCHEMAS
# ============================================================================
class CreateSessionRequest(BaseModel):
    course_id: str
    document_version_ids: list[str] = Field(default_factory=list)

class CreateMessageRequest(BaseModel):
    content: str

class SessionResponse(BaseModel):
    id: str
    course_id: str
    message_count: int
    created_at: datetime
    document_count: int

class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime
    sources: list[dict[str, object]] = []

class MessageListResponse(BaseModel):
    items: list[MessageResponse]
    meta: PageMeta

class CanvasStateResponse(BaseModel):
    component: str | None = None
    props: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# CORE LOGIC HELPERS
# ============================================================================
async def _course_id_for_document_versions(db: AsyncSession, document_version_ids: list[UUID]) -> UUID:
    if not document_version_ids:
        raise atlas_error("RAG_003", "RAG session has no linked documents.", status_code=500)
    result = await db.execute(
        select(Contribution.course_id)
        .join(DocumentVersion, DocumentVersion.contribution_id == Contribution.id)
        .where(DocumentVersion.id == document_version_ids[0])
    )
    cid = result.scalar_one_or_none()
    if cid is None:
        raise atlas_error("RAG_003", "RAG session linked to a deleted document.", status_code=500)
    return cid

async def _event_stream(db: AsyncSession, session_row: RAGSession, payload: CreateMessageRequest) -> AsyncGenerator[str, None]:
    # 🚨 SOTA FIX: Force an immediate SSE event to kick the browser's ReadableStream
    # into streaming mode before we even touch the Omni pipeline. This eliminates
    # the "buffered until end" behaviour when retrieval latency > 1 second.
    yield f'data: {json.dumps({"type": "start"})}\n\n'

    user_message = Message(session_id=session_row.id, role="user", content=payload.content, timestamp=datetime.utcnow())
    db.add(user_message)
    await db.flush()

    full_content = ""
    try:
        pipeline = await get_omni_pipeline()
        doc_uuids = [str(uuid) for uuid in session_row.document_version_ids]
        
        async for chunk_data in pipeline.query_stream(question=payload.content, namespace="global", document_uuids=doc_uuids):
            if isinstance(chunk_data, str):
                full_content += chunk_data
                yield f'data: {json.dumps({"type": "token", "content": chunk_data})}\n\n'
            elif isinstance(chunk_data, dict):
                course_id = await _course_id_for_document_versions(db, session_row.document_version_ids)
                trace_id = chunk_data.get("trace_id", "unknown")
                sources = [{"course_id": str(course_id), "title": f"Omni-Architect Trace: {trace_id}", "page": 1, "documents_queried": len(doc_uuids)}]
                yield f'data: {json.dumps({"type": "sources", "sources": sources})}\n\n'

        yield f'data: {json.dumps({"type": "done"})}\n\n'

        assistant_message = Message(session_id=session_row.id, role="assistant", content=full_content.strip(), timestamp=datetime.utcnow())
        db.add(assistant_message)
        session_row.message_count += 2
        db.add(session_row)
        await db.commit()

    except Exception as e:
        logger.error(f"CRITICAL: Omni-Architect pipeline failed: {e}")
        yield f'data: {json.dumps({"type": "error", "error": "The cognitive core is temporarily offline."})}\n\n'


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/rag/sessions", status_code=status.HTTP_201_CREATED, response_model=SessionResponse)
async def create_session(
    payload: CreateSessionRequest, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_session)
) -> SessionResponse:
    try:
        course_uuid = UUID(payload.course_id.strip())
        doc_uuids = [UUID(doc_id.strip()) for doc_id in payload.document_version_ids]
    except ValueError as exc:
        raise atlas_error("RAG_004", "Invalid UUID format in payload.", status_code=422) from exc
    
    if not doc_uuids:
        from app.routers.courses import _get_latest_accessible_course_version
        version, _ = await _get_latest_accessible_course_version(db, course_uuid, current_user)
        if version is None:
            raise atlas_error("RAG_005", "No accessible document version found for this course.", status_code=404)
        doc_uuids = [version.id]
        
    session_row = RAGSession(
        student_id=current_user.id, 
        document_version_ids=doc_uuids, 
        message_count=0, 
        is_active=True, 
        created_at=datetime.utcnow()
    )
    db.add(session_row)
    await db.commit()
    await db.refresh(session_row)
    
    return SessionResponse(
        id=str(session_row.id), 
        course_id=str(course_uuid), 
        message_count=session_row.message_count, 
        created_at=session_row.created_at, 
        document_count=len(session_row.document_version_ids)
    )

@router.get("/rag/sessions/{session_id}", response_model=SessionResponse)
async def get_rag_session(
    session_id: UUID, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_session)
) -> SessionResponse:
    result = await db.execute(select(RAGSession).where(RAGSession.id == session_id, RAGSession.student_id == current_user.id))
    session_row = result.scalar_one_or_none()
    if session_row is None: 
        raise atlas_error("RAG_001", "RAG session not found.", status_code=404)
    
    course_id = await _course_id_for_document_versions(db, session_row.document_version_ids)
    return SessionResponse(
        id=str(session_row.id), 
        course_id=str(course_id), 
        message_count=session_row.message_count, 
        created_at=session_row.created_at, 
        document_count=len(session_row.document_version_ids)
    )

@router.get("/rag/sessions/{session_id}/messages", response_model=MessageListResponse)
async def list_messages(
    session_id: UUID, 
    limit: int = 50, 
    offset: int = 0, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_session)
) -> MessageListResponse:
    session_result = await db.execute(select(RAGSession).where(RAGSession.id == session_id, RAGSession.student_id == current_user.id))
    session_row = session_result.scalar_one_or_none()
    if session_row is None: 
        raise atlas_error("RAG_001", "RAG session not found.", status_code=404)
    
    course_id = await _course_id_for_document_versions(db, session_row.document_version_ids)
    
    # Exclude "canvas" system messages from the standard chat view
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id, Message.role != "canvas")
        .order_by(Message.timestamp.asc())
    )
    rows = result.scalars().all()
    
    total = len(rows)
    page_rows = rows[offset : offset + limit]
    items = [
        MessageResponse(
            id=str(row.id), 
            role=row.role, 
            content=row.content, 
            created_at=row.timestamp, 
            sources=([{"course_id": str(course_id), "title": f"Course {course_id}", "page": row.source_page}] if row.source_page is not None else [])
        ) for row in page_rows
    ]
    
    return MessageListResponse(
        items=items, 
        meta=PageMeta(total=total, limit=limit, offset=offset, has_more=offset + len(items) < total)
    )

@router.post("/rag/sessions/{session_id}/messages")
async def create_message(
    session_id: UUID, 
    payload: CreateMessageRequest, 
    response: Response, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_session)
) -> StreamingResponse:
    payload = CreateMessageRequest(content=sanitize_rag_query(payload.content))
    result = await db.execute(select(RAGSession).where(RAGSession.id == session_id, RAGSession.student_id == current_user.id))
    session_row = result.scalar_one_or_none()
    
    if session_row is None: 
        raise atlas_error("RAG_001", "RAG session not found.", status_code=404)
    
    response.headers["Cache-Control"] = "no-cache"
    return StreamingResponse(
        _event_stream(db, session_row, payload), 
        media_type="text/event-stream", 
        headers={"Cache-Control": "no-cache"}
    )

@router.delete("/rag/sessions/{session_id}")
async def delete_session(
    session_id: UUID, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_session)
) -> dict[str, bool]:
    result = await db.execute(select(RAGSession).where(RAGSession.id == session_id, RAGSession.student_id == current_user.id))
    session_row = result.scalar_one_or_none()
    
    if session_row is None: 
        raise atlas_error("RAG_001", "RAG session not found.", status_code=404)
        
    await db.execute(delete(Message).where(Message.session_id == session_id))
    await db.delete(session_row)
    await db.commit()
    
    return {"success": True}

# ============================================================================
# GENERATIVE UI (CANVAS) STATE ENDPOINTS
# ============================================================================

@router.get("/rag/sessions/{session_id}/canvas", response_model=CanvasStateResponse)
async def get_canvas_state(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
) -> CanvasStateResponse:
    """Fetches the latest Generative UI state for the session."""
    session_result = await db.execute(select(RAGSession).where(RAGSession.id == session_id, RAGSession.student_id == current_user.id))
    if session_result.scalar_one_or_none() is None:
        raise atlas_error("RAG_001", "RAG session not found.", status_code=404)

    msg_result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id, Message.role == "canvas")
        .order_by(Message.timestamp.desc())
        .limit(1)
    )
    msg_row = msg_result.scalar_one_or_none()
    
    if not msg_row:
        return CanvasStateResponse() # Return empty schema if no board generated yet
        
    try:
        data = json.loads(msg_row.content)
        return CanvasStateResponse(component=data.get("component"), props=data.get("props", {}))
    except json.JSONDecodeError:
        return CanvasStateResponse()


@router.put("/rag/sessions/{session_id}/canvas")
async def update_canvas_state(
    session_id: UUID,
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
) -> dict[str, bool]:
    """Saves the current UI Generative Board state. Replaces existing state to prevent DB bloat."""
    session_result = await db.execute(select(RAGSession).where(RAGSession.id == session_id, RAGSession.student_id == current_user.id))
    if session_result.scalar_one_or_none() is None:
        raise atlas_error("RAG_001", "RAG session not found.", status_code=404)

    # Aggressively delete any old canvas state for this session
    await db.execute(delete(Message).where(Message.session_id == session_id, Message.role == "canvas"))

    # Insert the fresh UI state
    canvas_msg = Message(
        session_id=session_id,
        role="canvas",
        content=json.dumps(payload),
        timestamp=datetime.utcnow()
    )
    db.add(canvas_msg)
    await db.commit()
    
    return {"success": True}
import uuid
import logging
import re
import json
from typing import AsyncGenerator
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, field_validator

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User, RAGSession, Message, DocumentVersion
# Assuming a standard Redis dependency injection setup
from app.core.redis import get_redis_client 
from app.services.rag_service import get_or_create_rag_collection, retrieve_rag_context, stream_llm_response
from app.services.storage import minio_client
from app.core.limits import RAGRateLimits

router = APIRouter()
logger = logging.getLogger(__name__)

class SessionCreate(BaseModel):
    document_version_id: uuid.UUID

class MessageCreate(BaseModel):
    content: str

    @field_validator('content')
    @classmethod
    def validate_prompt_injection(cls, v: str) -> str:
        """
        DEFENSIVE ARCHITECTURE: US-24 Anti-Prompt Injection & Sanitization.
        Strips null bytes and evaluates the input against known LLM jailbreak patterns.
        """
        # 1. Sanitize: Strip null bytes and excessive whitespace
        sanitized = re.sub(r'[\x00]', '', v).strip()
        
        # 2. Pattern Detection: Guardrails for Prompt Injection
        injection_patterns = [
            r"(?i)ignore\s+(all\s+)?previous",
            r"(?i)jailbreak",
            r"(?i)forget\s+(all\s+)?instructions",
            r"(?i)system\s+prompt",
            r"(?i)you\s+are\s+now",
            r"(?i)disregard",
            r"(?i)bypass\s+(the\s+)?rules"
        ]
        
        for pattern in injection_patterns:
            if re.search(pattern, sanitized):
                # SIDE-EFFECT: Audit Logging for security monitoring
                logger.warning(f"SECURITY ALERT: Prompt injection attempt detected and blocked. Pattern matched: {pattern}")
                raise ValueError("Blocked by Anti-Prompt Injection Firewall: Restricted instruction-override patterns detected.")
        
        return sanitized


async def _stream_and_persist(
    llm_stream: AsyncGenerator[str, None], 
    db_session: AsyncSession, 
    session_id: uuid.UUID, 
    top_page: int, 
    max_similarity: float
) -> AsyncGenerator[str, None]:
    """
    Architectural Wrapper: Yields tokens to the client in real-time, 
    accumulates the full response, and strictly enforces the database persistence side-effect.
    """
    full_response = ""
    
    # 1. Yield tokens to client
    async for chunk in llm_stream:
        yield chunk
        try:
            data = json.loads(chunk)
            full_response += data.get("delta", "")
        except Exception:
            pass
            
    # 2. Side-Effect: Persist conversation history
    if full_response:
        assistant_message = Message(
            session_id=session_id,
            role="assistant",
            content=full_response.strip(),
            source_page=top_page,
            cosine_similarity=max_similarity
        )
        db_session.add(assistant_message)
        await db_session.commit()


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_rag_session(
    payload: SessionCreate,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session),
    redis_client = Depends(get_redis_client)
):
    """
    Initializes a new RAG session and lazily provisions the ChromaDB vector collection.
    Enforces a maximum of 3 active sessions per student via Redis.
    """
    # 1. Verify Document Version exists and is ready
    # (Checking document first prevents hitting Redis if the request is invalid)
    doc_query = await db_session.execute(
        select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id)
    )
    doc = doc_query.scalars().first()
    
    if not doc or doc.pipeline_status != "READY":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document not found or OCR pipeline not yet complete."
        )

    # 2. Generate new session ID explicitly to pre-register in Redis
    session_id = uuid.uuid4()

    # 3. Enforce US-13 Active Session Limits (Redis)
    await RAGRateLimits.check_and_register_active_session(redis_client, current_user.id, session_id)

    # 4. Lazily provision ChromaDB collection
    try:
        await get_or_create_rag_collection(db_session, str(payload.document_version_id))
    except Exception as e:
        # Rollback Redis registration if provisioning fails
        await RAGRateLimits.unregister_active_session(redis_client, current_user.id, session_id)
        logger.error(f"Failed to provision RAG collection: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to initialize RAG context.")

    # 5. Generate Signed URL for PDF Viewer
    try:
        signed_pdf_url = minio_client.get_file_url(doc.storage_path)
    except Exception as e:
        logger.error(f"Failed to generate signed URL: {e}")
        signed_pdf_url = None

    # 6. Create Session in DB
    rag_session = RAGSession(
        id=session_id,
        student_id=current_user.id,
        document_version_id=payload.document_version_id,
        message_count=0,
        is_active=True
    )
    db_session.add(rag_session)
    await db_session.commit()
    await db_session.refresh(rag_session)

    return {
        "session_id": rag_session.id,
        "signed_pdf_url": signed_pdf_url,
        "chat_history": [],
        "message_limit": RAGRateLimits.MAX_MESSAGES_PER_SESSION
    }


@router.post("/sessions/{session_id}/messages")
async def send_rag_message(
    session_id: uuid.UUID,
    payload: MessageCreate,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session),
    redis_client = Depends(get_redis_client)
):
    """
    Handles a student's question, applies anti-hallucination guards, 
    and streams the LLM response via Server-Sent Events (SSE).
    """
    # 1. Verify Session & Ownership
    session_query = await db_session.execute(
        select(RAGSession).where(
            RAGSession.id == session_id,
            RAGSession.student_id == current_user.id
        )
    )
    rag_session = session_query.scalars().first()

    if not rag_session or not rag_session.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired session.")

    # 2. Enforce Message Cap (50 msgs) via Redis INCR
    current_count = await RAGRateLimits.increment_and_check_message_limit(redis_client, session_id)
    
    # 3. Save User Message immediately
    user_message = Message(
        session_id=rag_session.id,
        role="user",
        content=payload.content
    )
    db_session.add(user_message)
    
    # Sync DB state with Redis state
    rag_session.message_count = current_count
    db_session.add(rag_session)
    await db_session.commit()
    
    # 4. Retrieve Document context
    doc_query = await db_session.execute(
        select(DocumentVersion).where(DocumentVersion.id == rag_session.document_version_id)
    )
    doc = doc_query.scalars().first()
    language = getattr(doc, "language", "fr") # Fallback to French if undefined

    # 5. Query ChromaDB context
    try:
        from app.services.rag_service import chroma_client
        collection_name = f"doc_{str(rag_session.document_version_id).replace('-', '')}"
        collection = chroma_client.get_collection(name=collection_name)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="RAG context not provisioned.")

    # Apply strict document filtering as implemented in Step 3
    context, max_similarity, top_page = retrieve_rag_context(
        collection=collection, 
        query=payload.content, 
        document_version_id=str(rag_session.document_version_id)
    )

    # 6. Orchestrate LLM Stream
    llm_generator = stream_llm_response(language=language, context=context, question=payload.content)
    
    # 7. Wrap with Persistence Generator and return SSE
    return StreamingResponse(
        _stream_and_persist(
            llm_stream=llm_generator,
            db_session=db_session,
            session_id=rag_session.id,
            top_page=top_page if top_page else 0,
            max_similarity=max_similarity
        ),
        media_type="text/event-stream"
    )


@router.delete("/sessions/{session_id}")
async def close_rag_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session),
    redis_client = Depends(get_redis_client)
):
    """
    Closes an active RAG session to free up the 3-session limit.
    """
    session_query = await db_session.execute(
        select(RAGSession).where(
            RAGSession.id == session_id,
            RAGSession.student_id == current_user.id
        )
    )
    rag_session = session_query.scalars().first()
    
    if rag_session:
        rag_session.is_active = False
        db_session.add(rag_session)
        await db_session.commit()
        
        # Free up the slot in Redis
        await RAGRateLimits.unregister_active_session(redis_client, current_user.id, session_id)
        
    return {"message": "Session closed successfully."}
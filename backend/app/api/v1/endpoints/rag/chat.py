import uuid
import logging
import re
import json
import os
from datetime import datetime
from typing import AsyncGenerator
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, field_validator

from app.db.session import get_session
# ARCHITECTURAL FIX: Explicitly import from the specific IAM dependency provider
from app.api.v1.endpoints.auth.me import get_current_user
from app.models.all_models import User, RAGSession, Message, DocumentVersion
from app.core.redis import get_redis_client

# ARCHITECTURAL FIX: Re-routed to the AI Core and Doc Processing Bounded Contexts
from app.services.ai_core import rag_storage, rag_inference
from app.services.doc_processing.storage import minio_client

from app.core.limits import RAGRateLimits
from app.core.config import settings

# ARCHITECTURAL ENFORCEMENT: Explicit boundary logging for RAG telemetry
logger = logging.getLogger("app.api.v1.endpoints.rag.chat")
router = APIRouter()

# Load security patterns once at module level
SECURITY_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "../../../../core/security_config.json")
try:
    with open(SECURITY_CONFIG_PATH, 'r') as f:
        config = json.load(f)
        INJECTION_PATTERNS = config.get("prompt_injection_patterns", [])
except FileNotFoundError:
    logger.warning("security_config.json not found. Falling back to default injection patterns.")
    INJECTION_PATTERNS = [r"(?i)ignore\s+(all\s+)?previous", r"(?i)jailbreak"]

class SessionCreate(BaseModel):
    document_version_id: uuid.UUID

class MessageCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def validate_prompt_injection(cls, v: str) -> str:
        """
        DEFENSIVE ARCHITECTURE: US-24 Anti-Prompt Injection & Sanitization.
        Loads dynamic patterns from external config to block instruction-override attempts.
        """
        sanitized = re.sub(r"[\x00]", "", v).strip()

        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, sanitized):
                logger.warning(
                    f"SECURITY ALERT: Prompt injection attempt detected for user. Pattern matched: {pattern}"
                )
                raise ValueError(
                    "Blocked by Anti-Prompt Injection Firewall: Restricted patterns detected."
                )
        return sanitized


async def _stream_and_persist(
    llm_stream: AsyncGenerator[str, None],
    db_session: AsyncSession,
    session_id: uuid.UUID,
    top_page: int,
    max_similarity: float,
    top_chunk_text: str | None = None
) -> AsyncGenerator[str, None]:
    """
    Side-Effect Handler: Streams chunks to the frontend while aggregating the full
    response to persist it in the PostgreSQL audit trail for history retrieval.
    """
    full_response = ""

    if top_chunk_text:
        # Send source metadata first so UI can highlight the PDF page immediately
        yield json.dumps({
            "type": "xray_metadata",
            "source_page": top_page,
            "chunk_text": top_chunk_text
        }) + "\n"

    async for chunk in llm_stream:
        yield chunk
        try:
            data = json.loads(chunk)
            full_response += data.get("delta", "")
        except Exception:
            pass

    if full_response:
        assistant_message = Message(
            session_id=session_id,
            role="assistant",
            content=full_response.strip(),
            source_page=top_page,
            cosine_similarity=max_similarity,
            chunk_text=top_chunk_text,
            timestamp=datetime.utcnow(),
        )
        db_session.add(assistant_message)
        await db_session.commit()


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_rag_session(
    payload: SessionCreate,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session),
    redis_client=Depends(get_redis_client),
):
    """
    Initializes a new RAG chat session.
    1. Verifies document readiness.
    2. Provisions a dedicated vector collection (Lego: AI Core).
    3. Generates a signed PDF URL (Lego: Doc Processing).
    """
    doc_query = await db_session.execute(
        select(DocumentVersion).where(
            DocumentVersion.id == payload.document_version_id
        )
    )
    doc = doc_query.scalars().first()

    if not doc or doc.pipeline_status != "READY":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document not found or processing pipeline not complete.",
        )

    session_id = uuid.uuid4()
    await RAGRateLimits.check_and_register_active_session(
        redis_client, current_user.id, session_id
    )

    try:
        # Provision/Link to vector storage in AI Core domain
        await rag_storage.get_or_create_rag_collection(
            db_session, str(payload.document_version_id)
        )
    except Exception as e:
        await RAGRateLimits.unregister_active_session(
            redis_client, current_user.id, session_id
        )
        logger.error(f"Failed to provision RAG collection: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize AI context."
        )

    try:
        # Fetch file access via Doc Processing domain
        signed_pdf_url = minio_client.get_file_url(doc.storage_path)
    except Exception as e:
        logger.error(f"Failed to generate signed URL: {e}")
        signed_pdf_url = None

    rag_session = RAGSession(
        id=session_id,
        student_id=current_user.id,
        document_version_id=payload.document_version_id,
        message_count=0,
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db_session.add(rag_session)
    await db_session.commit()
    await db_session.refresh(rag_session)

    return {
        "session_id": rag_session.id,
        "signed_pdf_url": signed_pdf_url,
        "chat_history": [],
        "message_limit": RAGRateLimits.MAX_MESSAGES_PER_SESSION,
    }


@router.post("/sessions/{session_id}/messages")
async def send_rag_message(
    session_id: uuid.UUID,
    payload: MessageCreate,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session),
    redis_client=Depends(get_redis_client),
):
    """
    Processes a user query through the RAG pipeline:
    Retrieval (AI Core Storage) -> Inference (AI Core LLM) -> Persistence.
    """
    session_query = await db_session.execute(
        select(RAGSession).where(
            RAGSession.id == session_id,
            RAGSession.student_id == current_user.id,
        )
    )
    rag_session = session_query.scalars().first()

    if not rag_session or not rag_session.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired session.",
        )

    current_count = await RAGRateLimits.increment_and_check_message_limit(
        redis_client, session_id
    )

    user_message = Message(
        session_id=rag_session.id,
        role="user",
        content=payload.content,
        timestamp=datetime.utcnow(),
    )
    db_session.add(user_message)

    rag_session.message_count = current_count
    db_session.add(rag_session)
    await db_session.commit()

    doc_query = await db_session.execute(
        select(DocumentVersion).where(
            DocumentVersion.id == rag_session.document_version_id
        )
    )
    doc = doc_query.scalars().first()
    language = getattr(doc, "language", "fr")

    # Domain 3: Vector Retrieval
    context, max_similarity, top_page, top_chunk_text = await rag_storage.retrieve_rag_context(
        session=db_session,
        query=payload.content,
        document_version_id=str(rag_session.document_version_id),
    )

    # Domain 3: LLM Stream Generation
    llm_generator = rag_inference.stream_llm_response(
        language=language,
        context=context,
        question=payload.content,
    )

    return StreamingResponse(
        _stream_and_persist(
            llm_stream=llm_generator,
            db_session=db_session,
            session_id=rag_session.id,
            top_page=top_page if top_page else 0,
            max_similarity=max_similarity,
            top_chunk_text=top_chunk_text
        ),
        media_type="text/event-stream",
    )


@router.delete("/sessions/{session_id}")
async def close_rag_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session),
    redis_client=Depends(get_redis_client),
):
    """Terminates an active RAG session and unregisters it from Redis rate limits."""
    session_query = await db_session.execute(
        select(RAGSession).where(
            RAGSession.id == session_id,
            RAGSession.student_id == current_user.id,
        )
    )
    rag_session = session_query.scalars().first()

    if rag_session:
        rag_session.is_active = False
        db_session.add(rag_session)
        await db_session.commit()

        await RAGRateLimits.unregister_active_session(
            redis_client, current_user.id, session_id
        )

    return {"message": "Session closed successfully."}
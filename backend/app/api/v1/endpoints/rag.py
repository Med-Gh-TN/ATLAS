import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import User, RAGSession, Message, DocumentVersion, DocumentPipelineStatus
from app.services.rag_service import get_or_create_rag_collection, retrieve_rag_context, stream_llm_response
from app.services.storage import minio_client
from app.core.limits import limiter

router = APIRouter()
logger = logging.getLogger(__name__)

class SessionCreate(BaseModel):
    document_version_id: uuid.UUID

class MessageCreate(BaseModel):
    content: str

@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_rag_session(
    payload: SessionCreate,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """
    Initializes a new RAG session and lazily provisions the ChromaDB vector collection.
    Enforces a maximum of 3 active sessions per student.
    """
    # 1. Check active session limit
    active_sessions_query = await db_session.execute(
        select(RAGSession).where(
            RAGSession.student_id == current_user.id,
            RAGSession.is_active == True
        )
    )
    active_sessions = active_sessions_query.scalars().all()
    
    if len(active_sessions) >= 3:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Max 3 active RAG sessions allowed. Close an existing session before opening a new one."
        )

    # 2. Verify Document Version exists and is ready
    doc_query = await db_session.execute(
        select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id)
    )
    doc = doc_query.scalars().first()
    
    if not doc or doc.pipeline_status != DocumentPipelineStatus.READY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document not found or OCR pipeline not yet complete."
        )

    # 3. Lazily provision ChromaDB collection
    try:
        await get_or_create_rag_collection(db_session, payload.document_version_id)
    except Exception as e:
        logger.error(f"Failed to provision RAG collection: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize RAG context.")

    # 4. Generate Signed URL for PDF Viewer
    try:
        signed_pdf_url = minio_client.get_file_url(doc.storage_path)
    except Exception as e:
        logger.error(f"Failed to generate signed URL: {e}")
        signed_pdf_url = None

    # 5. Create Session in DB
    rag_session = RAGSession(
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
        "message_limit": 50
    }


@router.post("/sessions/{session_id}/messages", dependencies=[Depends(limiter(20, 3600))])
async def send_rag_message(
    session_id: uuid.UUID,
    payload: MessageCreate,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """
    Handles a student's question, applies anti-hallucination guards, 
    and streams the LLM response via Server-Sent Events (SSE).
    Rate limited to 20 messages per hour.
    """
    # 1. Verify Session
    session_query = await db_session.execute(
        select(RAGSession).where(
            RAGSession.id == session_id,
            RAGSession.student_id == current_user.id
        )
    )
    rag_session = session_query.scalars().first()

    if not rag_session or not rag_session.is_active:
        raise HTTPException(status_code=403, detail="Invalid or expired session.")

    if rag_session.message_count >= 50:
        rag_session.is_active = False
        db_session.add(rag_session)
        await db_session.commit()
        raise HTTPException(status_code=422, detail="Session limit of 50 messages reached.")

    # 2. Save User Message
    user_message = Message(
        session_id=rag_session.id,
        role="user",
        content=payload.content
    )
    db_session.add(user_message)
    
    # 3. Retrieve Document metadata
    doc_query = await db_session.execute(
        select(DocumentVersion).where(DocumentVersion.id == rag_session.document_version_id)
    )
    doc = doc_query.scalars().first()

    # 4. Query ChromaDB context
    try:
        from app.services.rag_service import chroma_client
        collection_name = f"doc_{str(rag_session.document_version_id).replace('-', '')}"
        collection = chroma_client.get_collection(name=collection_name)
    except ValueError:
        raise HTTPException(status_code=500, detail="RAG context not provisioned.")

    context, max_similarity, top_page = retrieve_rag_context(collection, payload.content)

    # 5. Anti-Hallucination Guard (Similarity < 0.70)
    if not context or max_similarity < 0.70:
        fallback_content = "Information not found in this course."
        assistant_message = Message(
            session_id=rag_session.id,
            role="assistant",
            content=fallback_content,
            cosine_similarity=max_similarity
        )
        rag_session.message_count += 1
        db_session.add(assistant_message)
        db_session.add(rag_session)
        await db_session.commit()
        
        return {
            "role": "assistant",
            "content": fallback_content,
            "source_page": None,
            "cosine_similarity": max_similarity
        }

    # 6. Increment message count immediately before streaming
    rag_session.message_count += 1
    db_session.add(rag_session)
    await db_session.commit()

    # 7. Stream LLM Response
    return StreamingResponse(
        stream_llm_response(language=doc.language, context=context, question=payload.content),
        media_type="text/event-stream"
    )


@router.delete("/sessions/{session_id}")
async def close_rag_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
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
        
    return {"message": "Session closed."}
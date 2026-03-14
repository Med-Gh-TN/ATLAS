import torch
from celery import shared_task
from sqlmodel import Session, create_engine, select
from sqlalchemy import delete
import structlog

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except Exception:
    from langchain.text_splitters import RecursiveCharacterTextSplitter

from app.core.config import settings
from app.models.all_models import (
    DocumentVersion, 
    DocumentPipelineStatus, 
    DocumentEmbedding,
    Contribution,
    Course
)

# ML Dependencies (US-08)
from sentence_transformers import SentenceTransformer
from keybert import KeyBERT

sync_engine = create_engine(settings.SQLALCHEMY_DATABASE_URI.replace("postgresql+asyncpg", "postgresql"))

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"

# Defensive Architecture: Lazy initialization to prevent memory leaks in Celery forks
_device = None
_embedding_model = None
_kw_model = None

def get_models():
    """
    Initializes ML models once per worker process.
    Implements a zero-cost optimization by sharing the MPNet model weights 
    between SentenceTransformer and KeyBERT.
    """
    global _device, _embedding_model, _kw_model
    if _embedding_model is None:
        _device = "cuda" if torch.cuda.is_available() else "cpu"
        structlog.get_logger().info("loading_ml_models", device=_device, model=MODEL_NAME)
        
        _embedding_model = SentenceTransformer(MODEL_NAME, device=_device)
        # Re-use the embedding model for KeyBERT to save VRAM/RAM
        _kw_model = KeyBERT(model=_embedding_model)
        
    return _embedding_model, _kw_model, _device

def _embed_chunks(text: str, model: SentenceTransformer, device: str):
    """
    Splits text into 512-token chunks with 50-token overlap, 
    then embeds using hardware-aware batching.
    """
    try:
        text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name="cl100k_base",
            chunk_size=512,
            chunk_overlap=50,
        )
        chunks = text_splitter.split_text(text)
    except Exception:
        # Fallback to character length if tiktoken fails
        chunks = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=300,
            length_function=len,
        ).split_text(text)

    if not chunks:
        return []

    # Batch process for performance benchmark (<90s for 100 pages)
    vectors = model.encode(
        chunks, 
        batch_size=32, 
        device=device, 
        normalize_embeddings=True,
        show_progress_bar=False
    )
    
    return list(zip(chunks, vectors.tolist()))

@shared_task(name="embed_document", bind=True)
def embed_document(self, document_version_id: str):
    log = structlog.get_logger().bind(task="embed_document", document_version_id=document_version_id)
    
    with Session(sync_engine) as session:
        dv = session.get(DocumentVersion, document_version_id)
        if not dv:
            log.warning("missing_document_version")
            return
        
        if not dv.ocr_text:
            log.warning("missing_ocr_text")
            dv.pipeline_status = DocumentPipelineStatus.READY
            session.add(dv)
            session.commit()
            return

        try:
            # 1. Load optimized ML models
            embedding_model, kw_model, device = get_models()
            
            # 2. Extract Keywords (Auto-tagging US-08)
            # Truncate text to first 15,000 chars to avoid memory explosion on large books
            text_for_keywords = dv.ocr_text[:15000]
            keywords_scored = kw_model.extract_keywords(
                text_for_keywords, 
                keyphrase_ngram_range=(1, 2), 
                top_n=5
            )
            extracted_tags = [kw[0] for kw in keywords_scored] if keywords_scored else []
            
            # 3. Update Course Tags
            if dv.contribution_id:
                contribution = session.get(Contribution, dv.contribution_id)
                if contribution and contribution.course_id:
                    course = session.get(Course, contribution.course_id)
                    if course:
                        # Append new tags while keeping existing ones, ensuring uniqueness
                        existing_tags = set(course.tags or [])
                        existing_tags.update(extracted_tags)
                        course.tags = list(existing_tags)
                        session.add(course)

            # 4. Clear old embeddings and generate new ones
            session.exec(delete(DocumentEmbedding).where(DocumentEmbedding.document_version_id == dv.id))
            chunked_embeddings = _embed_chunks(dv.ocr_text, embedding_model, device)
            
            # 5. Insert pgvector records
            for idx, (chunk_text, vector) in enumerate(chunked_embeddings):
                emb = DocumentEmbedding(
                    document_version_id=dv.id,
                    vector=vector,
                    chunk_index=idx,
                    chunk_text=chunk_text
                )
                session.add(emb)

            # 6. Finalize Pipeline
            dv.pipeline_status = DocumentPipelineStatus.READY
            session.add(dv)
            session.commit()
            
            log.info(
                "embedded_and_tagged_stored", 
                chunks_count=len(chunked_embeddings),
                tags=extracted_tags,
                hardware=device
            )
            
        except Exception as e:
            log.error("embedding_pipeline_failed", error=str(e), exc_info=True)
            dv.pipeline_status = DocumentPipelineStatus.FAILED
            session.add(dv)
            session.commit()
            raise self.retry(exc=e, countdown=60, max_retries=3)
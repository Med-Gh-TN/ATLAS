from celery import shared_task
from sqlmodel import Session, create_engine
from app.core.config import settings
from app.models.new.contribution import DocumentVersion, DocumentPipelineStatus
from app.models.new.embedding import DocumentEmbedding
import structlog
from langchain.text_splitter import RecursiveCharacterTextSplitter

# Use a synchronous engine for Celery tasks
sync_engine = create_engine(settings.SQLALCHEMY_DATABASE_URI.replace("postgresql+asyncpg", "postgresql"))

# SOTA Multilingual Model (loaded once per worker process ideally, but here for simplicity)
MODEL_NAME = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"

def _embed_chunks(text: str):
    """
    Split text into chunks using LangChain and embed each chunk.
    Returns a list of (chunk_text, vector) tuples.
    """
    from sentence_transformers import SentenceTransformer
    
    # 1. Chunking with LangChain (SOTA: 512 tokens window, 50 overlap)
    # Using RecursiveCharacterTextSplitter as a robust default
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,  # Characters approx 250-300 tokens
        chunk_overlap=200,
        length_function=len,
    )
    chunks = text_splitter.split_text(text)
    
    if not chunks:
        return []

    # 2. Embedding
    model = SentenceTransformer(MODEL_NAME)
    # encode returns a list of numpy arrays
    vectors = model.encode(chunks, normalize_embeddings=True)
    
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
            # Should we mark as failed or just READY with no embeddings?
            # Let's mark READY but with 0 embeddings
            dv.pipeline_status = DocumentPipelineStatus.READY
            session.add(dv)
            session.commit()
            return

        try:
            # 1. Generate Embeddings (Chunked)
            chunked_embeddings = _embed_chunks(dv.ocr_text)
            
            # 2. Store Embeddings
            for idx, (chunk_text, vector) in enumerate(chunked_embeddings):
                emb = DocumentEmbedding(
                    document_version_id=dv.id,
                    vector=vector,
                    chunk_index=idx,
                    chunk_text=chunk_text
                )
                session.add(emb)
            
            # 3. Update Status
            dv.pipeline_status = DocumentPipelineStatus.READY
            session.add(dv)
            session.commit()
            
            log.info("embedded_stored", chunks_count=len(chunked_embeddings))
            
        except Exception as e:
            log.error("embedding_failed", error=str(e))
            dv.pipeline_status = DocumentPipelineStatus.FAILED
            session.add(dv)
            session.commit()
            raise self.retry(exc=e, countdown=60, max_retries=3)

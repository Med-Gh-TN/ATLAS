from celery import shared_task
from sqlmodel import Session, create_engine
from app.core.config import settings
import structlog
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except Exception:
    from langchain.text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy import delete

from app.models.all_models import DocumentVersion, DocumentPipelineStatus, DocumentEmbedding

sync_engine = create_engine(settings.SQLALCHEMY_DATABASE_URI.replace("postgresql+asyncpg", "postgresql"))

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"

def _embed_chunks(text: str):
    from sentence_transformers import SentenceTransformer

    try:
        text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name="cl100k_base",
            chunk_size=512,
            chunk_overlap=50,
        )
        chunks = text_splitter.split_text(text)
    except Exception:
        chunks = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=300,
            length_function=len,
        ).split_text(text)

    if not chunks:
        return []

    model = SentenceTransformer(MODEL_NAME)
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
            dv.pipeline_status = DocumentPipelineStatus.READY
            session.add(dv)
            session.commit()
            return

        try:
            session.exec(delete(DocumentEmbedding).where(DocumentEmbedding.document_version_id == dv.id))
            chunked_embeddings = _embed_chunks(dv.ocr_text)
            for idx, (chunk_text, vector) in enumerate(chunked_embeddings):
                emb = DocumentEmbedding(
                    document_version_id=dv.id,
                    vector=vector,
                    chunk_index=idx,
                    chunk_text=chunk_text
                )
                session.add(emb)

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

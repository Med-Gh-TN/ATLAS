from celery import shared_task
from sqlmodel import Session, select, create_engine
from app.core.config import settings
from app.models.all_models import DocumentVersion, DocumentEmbedding, DocumentPipelineStatus
import structlog

sync_engine = create_engine(settings.SQLALCHEMY_DATABASE_URI.replace("postgresql+asyncpg", "postgresql"))

def _embed(text: str):
    from sentence_transformers import SentenceTransformer
    m = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    v = m.encode([text], normalize_embeddings=True)[0].tolist()
    return v

@shared_task(name="embed_document")
def embed_document(document_version_id: str):
    log = structlog.get_logger().bind(task="embed_document", document_version_id=document_version_id)
    with Session(sync_engine) as session:
        dv = session.get(DocumentVersion, document_version_id)
        if not dv:
            log.warning("missing_document_version")
            return
        if not dv.ocr_text:
            log.warning("missing_ocr_text")
            return
        vec = _embed(dv.ocr_text)
        emb = DocumentEmbedding(document_version_id=dv.id, vector=vec)
        dv.pipeline_status = DocumentPipelineStatus.READY
        session.add(emb)
        session.add(dv)
        session.commit()
        log.info("embedded_stored")

import os
import logging
import asyncio
from typing import Optional, Tuple

# ─────────────────────────────────────────────────────────────────────────────
# OFFLINE MODE ENFORCEMENT
# ─────────────────────────────────────────────────────────────────────────────
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from sentence_transformers import SentenceTransformer

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    from langchain.text_splitters import RecursiveCharacterTextSplitter

from app.models.all_models import DocumentVersion
from app.models.embedding import DocumentEmbedding
from app.core.config import settings

logger = logging.getLogger(__name__)

# ==========================================
# CONFIGURATION
# ==========================================
# Architect Note: Model is decoupled. Default is set to SOTA Multilingual MPNet.
EMBEDDER_MODEL = getattr(settings, "EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-mpnet-base-v2")
SIMILARITY_THRESHOLD = 0.15

def _initialize_embedder() -> Optional[SentenceTransformer]:
    """
    Initializes the local SentenceTransformer on the CPU to prevent VRAM collisions.
    """
    try:
        logger.info(f"Loading SentenceTransformer for RAG Storage: {EMBEDDER_MODEL}")
        return SentenceTransformer(EMBEDDER_MODEL, device="cpu")
    except Exception as e:
        logger.error(f"FATAL: Could not load SentenceTransformer locally: {e}")
        return None

# Singleton initialization
embedder = _initialize_embedder()

async def get_or_create_rag_collection(session: AsyncSession, document_version_id: str):
    """
    Verifies pgvector embeddings exist. Falls back to inline embedding if missing.
    """
    result = await session.execute(
        select(DocumentEmbedding.id)
        .where(DocumentEmbedding.document_version_id == document_version_id)
        .limit(1)
    )
    has_embeddings = result.scalar_one_or_none() is not None

    if not has_embeddings:
        dv_result = await session.execute(
            select(DocumentVersion).where(DocumentVersion.id == document_version_id)
        )
        doc = dv_result.scalars().first()

        if doc and doc.ocr_text:
            logger.info(f"Generating missing pgvector embeddings for {document_version_id} inline.")
            await _embed_document_inline(session, doc)

    return document_version_id

async def _embed_document_inline(session: AsyncSession, doc: DocumentVersion):
    """
    Synchronous fallback for embedding generation if Celery pipeline was bypassed.
    """
    if not embedder:
        logger.error("Embedder offline. Inline embedding aborted.")
        return

    try:
        splitter = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=50)
        chunks = splitter.split_text(doc.ocr_text)
        if not chunks: return

        vectors = await asyncio.to_thread(embedder.encode, chunks, normalize_embeddings=True)

        for i, (chunk, vec) in enumerate(zip(chunks, vectors.tolist())):
            emb = DocumentEmbedding(
                document_version_id=doc.id,
                vector=vec,
                chunk_index=i,
                chunk_text=chunk,
            )
            session.add(emb)

        await session.commit()
    except Exception as e:
        logger.error(f"Inline embedding failed for doc {doc.id}: {e}")
        await session.rollback()

async def retrieve_rag_context(
    session: AsyncSession,
    query: str,
    document_version_id: str,
) -> Tuple[Optional[str], float, Optional[int], Optional[str]]:
    """
    Executes a K-Nearest Neighbor (KNN) search in PostgreSQL using the <=> cosine operator.
    Returns: (context_text, max_similarity, source_page, top_chunk_text)
    """
    if not embedder:
        return None, 0.0, None, None

    # Vectorize query on CPU
    query_vector_batch = await asyncio.to_thread(
        embedder.encode, [query], normalize_embeddings=True
    )
    query_vector = query_vector_batch[0].tolist()
    vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"

    # Cosine distance to similarity conversion: (1.0 - distance)
    sql = text("""
        SELECT chunk_text, chunk_index,
               (1.0 - (vector <=> CAST(:query_vec AS vector))) AS similarity
        FROM documentembedding
        WHERE document_version_id = CAST(:doc_version_id AS uuid)
        ORDER BY vector <=> CAST(:query_vec AS vector)
        LIMIT 5
    """)

    try:
        result = await session.execute(
            sql,
            {"query_vec": vector_str, "doc_version_id": str(document_version_id)}
        )
        rows = result.fetchall()
    except Exception as e:
        logger.error(f"pgvector query failed: {e}")
        return None, 0.0, None, None

    if not rows: return None, 0.0, None, None

    top_similarity = float(rows[0].similarity)

    if top_similarity < SIMILARITY_THRESHOLD:
        logger.info(f"Anti-hallucination guard: {top_similarity:.3f} < {SIMILARITY_THRESHOLD}")
        return None, top_similarity, None, None

    # Structural Layout Preservation for LLM Context
    context_parts = [f"[Snippet {row.chunk_index}] {row.chunk_text}" for row in rows if row.chunk_text]
    context = "\n\n".join(context_parts)

    return context, top_similarity, 1, rows[0].chunk_text
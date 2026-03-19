import os
import json
import logging
import asyncio
from typing import AsyncGenerator, Dict, Any, List, Optional, Tuple
import httpx

import chromadb
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from sentence_transformers import SentenceTransformer

# Defensive import for LangChain versioning drift
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    from langchain.text_splitters import RecursiveCharacterTextSplitter

from app.models.all_models import DocumentVersion
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize ChromaDB client. 
# US-08: Scoped exclusively to individual document sessions (Ephemeral memory for RAG isolation).
chroma_client = chromadb.Client()

# SOTA Multilingual embedder as defined in Sprint 2/3 specs
EMBEDDER_MODEL = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
try:
    logger.info(f"Loading local SentenceTransformer for RAG: {EMBEDDER_MODEL}")
    embedder = SentenceTransformer(EMBEDDER_MODEL)
except Exception as e:
    logger.warning(f"Could not load SentenceTransformer locally, fallback required: {e}")
    embedder = None

def _chunk_and_embed(text: str) -> Tuple[List[str], List[List[float]]]:
    """CPU-bound task isolated for threading."""
    if not embedder:
        raise RuntimeError("Embedder model is not initialized.")
        
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=50)
    chunks = text_splitter.split_text(text)
    
    if not chunks:
        return [], []
        
    vectors = embedder.encode(chunks, normalize_embeddings=True).tolist()
    return chunks, vectors

async def get_or_create_rag_collection(session: AsyncSession, document_version_id: str):
    """
    Lazily provisions a ChromaDB collection for a specific document version.
    Isolates RAG context per document to prevent cross-contamination.
    """
    # STRICT BOUNDARY: Exact 1:1 mapping with Document Version UUID. 
    # Hyphens are preserved to maintain standard UUID format compliance across microservices.
    collection_name = f"doc_{document_version_id}"
    
    try:
        # Fast Path: If it exists, return it immediately
        return chroma_client.get_collection(name=collection_name)
    except Exception:
        # Slow Path: Provisioning the collection on first open
        logger.info(f"Provisioning lazy ChromaDB collection for {document_version_id}")
        
        # Defensive Architecture: Force Cosine Space to match MPNet training objective
        collection = chroma_client.create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
        
        # Fetch OCR Text from PostgreSQL
        result = await session.execute(select(DocumentVersion).where(DocumentVersion.id == document_version_id))
        doc = result.scalars().first()
        
        if not doc or not doc.ocr_text:
            raise ValueError("Document not found or OCR text is missing.")
            
        # Offload CPU-bound chunking and embedding to a separate thread to protect FastAPI event loop
        chunks, vectors = await asyncio.to_thread(_chunk_and_embed, doc.ocr_text)
        
        if not chunks:
            return collection
        
        # Generate IDs and metadata (mocking page=1 for MVP)
        ids = [f"chunk_{i}" for i in range(len(chunks))]
        metadatas = [{"source_page": 1, "doc_version_id": str(document_version_id)} for _ in chunks] 
        
        collection.add(
            documents=chunks,
            embeddings=vectors,
            metadatas=metadatas,
            ids=ids
        )
        return collection

def retrieve_rag_context(collection, query: str, document_version_id: str) -> Tuple[Optional[str], float, Optional[int]]:
    """
    Queries ChromaDB, returns context, max similarity, and the best source page.
    Enforces the strict < 0.70 Anti-Hallucination Guard from US-13.
    """
    if not embedder:
        return None, 0.0, None

    query_vector = embedder.encode([query], normalize_embeddings=True).tolist()
    
    # HNSW ANN search -> rank top-5 chunks, strictly filtered by doc_version_id (Defense-in-depth)
    results = collection.query(
        query_embeddings=query_vector,
        n_results=5,
        where={"doc_version_id": str(document_version_id)},
        include=["documents", "metadatas", "distances"]
    )
    
    if not results["documents"] or not results["documents"][0]:
        return None, 0.0, None

    # With hnsw:space = cosine, Chroma returns cosine distance. Similarity = 1 - distance.
    top_distance = results["distances"][0][0]
    max_similarity = 1.0 - top_distance
    
    # ANTI-HALLUCINATION GUARD: If best chunk is < 0.70 similarity, short-circuit.
    if max_similarity < 0.70:
        logger.info(f"Anti-hallucination guard triggered. Max similarity: {max_similarity:.3f} < 0.70")
        return None, max_similarity, None
    
    chunks = results["documents"][0]
    metadatas = results["metadatas"][0]
    
    # Assemble context string from top-5 chunks
    context = "\n\n".join([f"[Page {meta.get('source_page', 1)}] {chunk}" for chunk, meta in zip(chunks, metadatas)])
    top_page = metadatas[0].get("source_page", 1)
    
    return context, max_similarity, top_page

async def stream_llm_response(language: str, context: Optional[str], question: str) -> AsyncGenerator[str, None]:
    """
    Streams response token-by-token. 
    Handles the < 0.70 similarity short-circuit mandated by US-13.
    Primary: Local Ollama (Mistral). Fallback: Groq API (Mixtral).
    """
    # If context is None, the anti-hallucination guard was triggered.
    if context is None:
        # Yield the exact mandated fallback string token by token (simulated stream)
        fallback_msg = "Information non trouvée dans ce cours."
        words = fallback_msg.split(" ")
        for i, word in enumerate(words):
            yield json.dumps({"delta": word + (" " if i < len(words) - 1 else "")}) + "\n"
            await asyncio.sleep(0.05)
        return

    system_prompt = (
        f"Tu es un assistant académique ATLAS. "
        f"Réponds dans la langue du cours: {language}. "
        f"Cite toujours la page source entre [Page X]. "
        f"Réponds uniquement en utilisant le contexte fourni."
    )
    user_prompt = f"Context:\n{context}\n\nQuestion: {question}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    ollama_url = "http://localhost:11434/api/chat"
    payload = {
        "model": "mistral",
        "messages": messages,
        "stream": True
    }
    
    try:
        # Try Local Ollama first
        async with httpx.AsyncClient(timeout=5.0) as client:
            async with client.stream("POST", ollama_url, json=payload) as response:
                response.raise_for_status()
                async for chunk in response.aiter_lines():
                    if chunk:
                        data = json.loads(chunk)
                        token = data.get("message", {}).get("content", "")
                        if token:
                            yield json.dumps({"delta": token}) + "\n"
                        if data.get("done"):
                            break
    except Exception as e:
        logger.warning(f"Ollama unavailable, routing to Groq fallback: {e}")
        
        # Groq Fallback to ensure < 2s SLA
        groq_api_key = os.getenv("GROQ_API_KEY", "")
        if not groq_api_key:
            yield json.dumps({"error": "LLM endpoints unavailable."}) + "\n"
            return
            
        groq_url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {groq_api_key}"}
        groq_payload = {
            "model": "mixtral-8x7b-32768",
            "messages": messages,
            "stream": True
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            async with client.stream("POST", groq_url, json=groq_payload, headers=headers) as response:
                response.raise_for_status()
                async for chunk in response.aiter_lines():
                    if chunk.startswith("data: ") and chunk != "data: [DONE]":
                        try:
                            data = json.loads(chunk[6:])
                            delta = data["choices"][0].get("delta", {}).get("content", "")
                            if delta:
                                yield json.dumps({"delta": delta}) + "\n"
                        except json.JSONDecodeError:
                            continue
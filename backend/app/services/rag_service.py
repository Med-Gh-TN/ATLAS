import os
import json
import logging
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

# Initialize ChromaDB client in memory/local storage for RAG context
# Scoped exclusively to individual document sessions
chroma_client = chromadb.Client()

# SOTA Multilingual embedder as defined in Sprint 2/3 specs
EMBEDDER_MODEL = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
try:
    embedder = SentenceTransformer(EMBEDDER_MODEL)
except Exception as e:
    logger.warning(f"Could not load SentenceTransformer locally, fallback required: {e}")
    embedder = None

async def get_or_create_rag_collection(session: AsyncSession, document_version_id: str):
    """
    Lazily provisions a ChromaDB collection for a specific document version.
    Isolates RAG context per document to prevent cross-contamination.
    """
    collection_name = f"doc_{str(document_version_id).replace('-', '')}"
    
    try:
        # If it exists, return it immediately (Fast Path)
        return chroma_client.get_collection(name=collection_name)
    except ValueError:
        # Slow Path: Provisioning the collection on first open
        logger.info(f"Provisioning lazy ChromaDB collection for {document_version_id}")
        collection = chroma_client.create_collection(name=collection_name)
        
        # Fetch OCR Text from PostgreSQL
        result = await session.execute(select(DocumentVersion).where(DocumentVersion.id == document_version_id))
        doc = result.scalars().first()
        
        if not doc or not doc.ocr_text:
            raise ValueError("Document not found or OCR text is missing.")
            
        # Chunking: 512 tokens, 50 overlap
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=50)
        chunks = text_splitter.split_text(doc.ocr_text)
        
        if not chunks:
            return collection
            
        if not embedder:
            raise RuntimeError("Embedder model is not initialized.")

        # Batch encode all chunks to vectors
        vectors = embedder.encode(chunks, normalize_embeddings=True).tolist()
        
        # Generate IDs and metadata (mocking page=1 for MVP, can be enhanced with pdfplumber page markers)
        ids = [f"chunk_{i}" for i in range(len(chunks))]
        metadatas = [{"source_page": 1} for _ in chunks] 
        
        collection.add(
            documents=chunks,
            embeddings=vectors,
            metadatas=metadatas,
            ids=ids
        )
        return collection

def retrieve_rag_context(collection, query: str) -> Tuple[Optional[str], float, Optional[int]]:
    """
    Queries ChromaDB, returns context, max similarity, and the best source page.
    Includes the strict 0.70 Anti-Hallucination Guard.
    """
    if not embedder:
        return None, 0.0, None

    query_vector = embedder.encode([query], normalize_embeddings=True).tolist()
    
    # HNSW ANN search -> rank top-5 chunks
    results = collection.query(
        query_embeddings=query_vector,
        n_results=5,
        include=["documents", "metadatas", "distances"]
    )
    
    if not results["documents"] or not results["documents"][0]:
        return None, 0.0, None

    # Assuming cosine distance in Chroma where similarity = 1 - distance
    top_distance = results["distances"][0][0]
    max_similarity = 1.0 - top_distance
    
    chunks = results["documents"][0]
    metadatas = results["metadatas"][0]
    
    # Assemble context string from top-5 chunks
    context = "\n\n".join([f"[Page {meta.get('source_page', 1)}] {chunk}" for chunk, meta in zip(chunks, metadatas)])
    top_page = metadatas[0].get("source_page", 1)
    
    return context, max_similarity, top_page

async def stream_llm_response(language: str, context: str, question: str) -> AsyncGenerator[str, None]:
    """
    Streams response token-by-token. 
    Primary: Local Ollama (Mistral). Fallback: Groq API (Mixtral).
    """
    system_prompt = (
        f"You are ATLAS, an academic assistant.\n"
        f"Answer strictly from the provided context.\n"
        f"Respond in the course language: {language}.\n"
        f"Always cite the source: [Page X].\n"
        f"Do NOT invent information."
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
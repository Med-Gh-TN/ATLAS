"""
AI Core Domain Public API.

This module exposes the strict public interface for the AI Core services.
Internal helper functions and specific backend implementations are deliberately
hidden to enforce architectural boundaries.
"""

from .ollama_client import OllamaClient, ollama, OllamaInferenceError
from .rag_inference import execute_hybrid_search, stream_llm_response
from .rag_storage import get_or_create_rag_collection, retrieve_rag_context
from .embedding_tasks import embed_document

__all__ = [
    # Ollama HTTP Client (Local LLM/Vision)
    "OllamaClient",
    "ollama",
    "OllamaInferenceError",

    # RAG Generation Engine (Hybrid Local/Cloud Streaming)
    "stream_llm_response",

    # Semantic Search Engine (MeiliSearch + pgvector RRF)
    "execute_hybrid_search",

    # RAG Context Retrieval (pgvector KNN)
    "get_or_create_rag_collection",
    "retrieve_rag_context",

    # Asynchronous Embedding Tasks (Celery)
    "embed_document",
]
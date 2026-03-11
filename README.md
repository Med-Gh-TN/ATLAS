
# 🧠 ATLAS Backend - Sprint 3: The AI Suite

Welcome to the Sprint 3 release of the ATLAS (Aggregated Tunisian Learning & Academic System) backend. This sprint transforms ATLAS from a static document repository into a personalized, intelligent academic assistant. 

We strictly adhered to atomic, modular "Lego" architecture principles, completely isolating our LLM logic from our REST endpoints to ensure maximum stability and zero spaghetti code.

## 🎯 Sprint 3 Goal
[cite_start]To provide students with a complete AI assistant capable of chatting with courses (RAG with source page citations), generating spaced-repetition flashcards (SM-2), creating auto-graded quizzes, and producing multilingual summaries and mind maps[cite: 3].

## ✨ Features Delivered

* [cite_start]**US-13 & US-14: Retrieval-Augmented Generation (RAG) Chat** [cite: 3, 6]
    * **Lazy Provisioning:** ChromaDB collections are spun up on-demand per document to isolate vector context and save memory.
    * [cite_start]**Anti-Hallucination Guard:** If cosine similarity falls below `0.70`, the AI automatically rejects the query instead of hallucinating[cite: 6].
    * [cite_start]**LLM Routing:** Primary local inference via Ollama (Mistral 7B) with a high-speed fallback to Groq (Mixtral 8x7b)[cite: 3, 6].
    * **SSE Streaming:** Token-by-token Server-Sent Events streaming for real-time UI feedback.
    * **Rate Limiting:** Hard limits of 3 active sessions per student and 50 messages per session.

* [cite_start]**US-15 & US-16: AI Flashcards & SM-2 Spaced Repetition** [cite: 3]
    * LLM-driven extraction of key concepts into deterministic JSON Q/A pairs.
    * [cite_start]Full implementation of the SuperMemo-2 (SM-2) algorithm (`next_review_at`, `interval`, `ease_factor`)[cite: 3, 5].
    * Public sharing links to distribute decks across the same major.

* [cite_start]**US-17: Exam Simulation & Quiz Generation** [cite: 3]
    * [cite_start]Automatic generation of JSON-structured Multiple Choice Questions (MCQs)[cite: 3].
    * Secure submission endpoint that calculates scores and returns AI-driven feedback with source citations.

* [cite_start]**US-18: Summaries & Mind Maps** [cite: 3]
    * [cite_start]Multi-format summary generation (Executive bullet points vs. Structured outlines)[cite: 3].
    * [cite_start]Multilingual translation support (e.g., Arabic summaries from French texts)[cite: 3].
    * [cite_start]React Flow-compatible JSON generation (Nodes/Edges) for interactive concept maps[cite: 3].

---

## 🛠️ Tech Stack & Prerequisites

To run the AI Suite, your environment needs a few specific services active:

1.  **FastAPI / Python:** Core backend framework.
2.  [cite_start]**PostgreSQL + pgvector:** For relational data and metadata storage[cite: 4].
3.  [cite_start]**Redis:** For FastAPI rate limiting (crucial for protecting LLM endpoints)[cite: 4].
4.  [cite_start]**ChromaDB:** Runs in-memory for ephemeral RAG document contexts[cite: 4].
5.  **Ollama (Optional but Recommended):** Running locally on port `11434` with the `mistral` model pulled.
6.  **Groq API:** Required for fast structured JSON extraction (Flashcards, Quizzes, Mind Maps).

### Environment Variables Required
Ensure these are added to your `.env` file:
```env
GROQ_API_KEY="gsk_your_groq_api_key_here"
# Redis is required for the @limiter dependencies
CELERY_BROKER_URL="redis://localhost:6379/0" 
```

## 🚀 How to Run

### Start the Infrastructure (DB & Redis):
Ensure PostgreSQL and Redis are running locally or via Docker.

### Run Database Migrations:
Apply the new AI Suite models (RAGSession, Flashcard, QuizSession, etc.):
```bash
alembic upgrade head
```

### Install New Dependencies:
Sprint 3 introduced LangChain text splitters and ChromaDB:
```bash
pip install chromadb langchain-text-splitters httpx
```

### Start the FastAPI Server:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 📡 API Endpoints Quick Reference
All endpoints are prefixed with /api/v1. Note that generation endpoints are heavily rate-limited to protect API quotas.

### RAG Chat (/rag)
- POST /rag/sessions - Init a new chat session (provisions ChromaDB).
- POST /rag/sessions/{id}/messages - Send a question (Returns text/event-stream).
- DELETE /rag/sessions/{id} - Close a session to free up limits.

### Study Tools (/study)
- POST /study/flashcards/generate - Extract cards from a document.
- GET /study/flashcards/decks - List user's decks.
- GET /study/flashcards/decks/{deck_id}/review - Get cards due today via SM-2.
- POST /study/flashcards/{card_id}/review - Submit a review score (0-5) to update SM-2 math.
- GET /study/flashcards/shared/{share_token} - Fetch a peer's shared deck.
- POST /study/quizzes/generate - Generate MCQs.
- POST /study/quizzes/{session_id}/submit - Auto-grade quiz and get explanations.
- POST /study/summaries/generate - Get Executive/Structured text summaries.
- POST /study/mindmaps/generate - Get JSON Nodes/Edges for React Flow.

## 🛡️ Architecture Notes (No-Spaghetti)
- **Separation of Concerns:** No LLM logic lives inside the FastAPI routers. All prompts and API calls to Groq/Ollama are quarantined inside `app/services/generation_service.py` and `app/services/flashcard_service.py`.
- **Defensive Parsing:** LLM endpoints enforce `{"type": "json_object"}` and include robust try/except blocks to prevent the API from crashing if the LLM hallucinates malformed JSON.

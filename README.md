<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/atlas-logo-dark.svg">
  <img alt="ATLAS" src="docs/assets/atlas-logo-light.svg" width="120">
</picture>

# ATLAS

**AI-Native Academic Intelligence Platform**

*Transforming how North African universities create, distribute, and interact with course knowledge.*

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11+-3b82f6?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Qdrant](https://img.shields.io/badge/Qdrant-Vector_DB-dc2626?style=flat-square&logo=qdrant&logoColor=white)](https://qdrant.tech)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-f59e0b?style=flat-square)](CONTRIBUTING.md)

<br/>

[**Live Demo**](https://atlas.tn) · [**Documentation**](docs/) · [**Report a Bug**](https://github.com/your-org/atlas/issues) · [**Request a Feature**](https://github.com/your-org/atlas/discussions)

</div>

---

## What is ATLAS?

ATLAS is an **open-source, multi-tenant educational intelligence platform** built for universities. It turns static course PDFs into living, queryable knowledge — giving every student a personalized AI tutor grounded in their actual syllabus, in their language, right now.

It is not a chatbot wrapper. It is a full-stack academic operating system: document ingestion with multi-modal OCR, a trust-aware contribution system, a live voice tutor powered by real-time streaming, and AI-generated study tools (flashcards, quizzes, mind maps, summaries) — all tied to a verified, institution-scoped content graph.

```
A student uploads a PDF → OCR + vector + graph ingestion → AI tutor answers questions
from that exact document → auto-generates flashcards → tracks what the student struggles with
→ suggests what to review next.
```

**Built for:** MENA universities · francophone curricula · Arabic RTL support · offline-first edge inference

---

## ✦ Capabilities

<table>
<tr>
<td width="50%">

**🔍 Hybrid RAG Search**
ColBERT dense retrieval + BM25 + cross-encoder reranking. Answers cite the exact page and chunk from the course document, not the internet.

**🎙️ Live Voice Tutor**
Bidirectional WebSocket session with Gemini Live API. Real speech, real-time, personalized to the student's level, department, and language preference.

**📄 Multi-Modal OCR Pipeline**
Docling + MinerU + VLM vision pass handle scanned PDFs, handwritten diagrams, equations, and Arabic-script documents that break conventional parsers.

**🃏 Spaced Repetition Flashcards**
SM-2 algorithm. Flashcards are auto-generated from course chunks and scheduled by the student's actual review history, not fixed intervals.

</td>
<td width="50%">

**📝 AI Quiz Engine**
Generates MCQ and open-ended questions from document content. Evaluates answers, provides AI feedback per question, and tracks weak topics over time.

**🗺️ Mind Map Generation**
Extracts the concept graph from a document and renders it as an interactive, zoomable mind map — shareable with a single link.

**📊 Adaptive Summaries**
Three summary formats (Executive, Structured, Comparative) generated in the student's preferred language (FR / EN / AR).

**🏛️ Institution Graph**
Every piece of content is scoped to an `Establishment → Department → Major → Course` hierarchy. Students only see content approved for their program.

</td>
</tr>
</table>

---

## 🏗 Architecture

ATLAS is organized into **four strictly isolated execution zones:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Zone 1 · Presentation                                                  │
│  Next.js 16 · React 19 · Tailwind · Zustand                            │
│  Multi-role PWA: Student | Teacher | Admin | Superadmin                 │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │ HTTPS / WebSocket / SSE
┌───────────────────────────▼─────────────────────────────────────────────┐
│  Zone 2 · API & Orchestration                                           │
│  FastAPI · SQLModel · Alembic · JWT HS256 · bcrypt-12 · Redis           │
│  RBAC · OTP Auth · Rate Limiting · Contribution Workflow                │
└──────────────┬────────────────────────────────────┬─────────────────────┘
               │ async background tasks             │ direct queries
┌──────────────▼──────────────────┐  ┌─────────────▼─────────────────────┐
│  Zone 3 · Intelligence Core     │  │  Zone 4 · Persistence             │
│                                 │  │                                   │
│  HybridRAGPipeline              │  │  PostgreSQL 16    (relational)     │
│  ├─ Docling OCR                 │  │  Qdrant           (dense vectors)  │
│  ├─ MinerU PDF parse            │  │  Neo4j 5          (entity graph)   │
│  ├─ ColBERT jina-v2 embed       │  │  Meilisearch v1.5 (full-text)      │
│  ├─ LightRAG graph extract      │  │  Redis 7          (cache · locks)  │
│  └─ Sovereign Edge Node ──────────────► Kaggle T4 GPU (Qwen3-VL-8B)   │
│                                 │  │                                   │
└─────────────────────────────────┘  └───────────────────────────────────┘
```

### Sovereign Edge Bifurcation

Heavy Vision-Language Model inference (Qwen3-VL-8B, bge-reranker-v2-m3) runs on **free Kaggle T4 GPUs** via a Cloudflare tunnel. The API backend automatically routes VLM tasks to the edge node when available and falls back to Gemini API otherwise — giving you state-of-the-art multi-modal OCR without cloud GPU bills.

---

## 🧩 Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Frontend | Next.js + React | 16.2 / 19 | SSR/SPA hybrid, RTL support |
| Backend | FastAPI + Uvicorn | 0.135 / latest | Async API, WebSocket, SSE |
| ORM | SQLModel + SQLAlchemy | latest | Async DB sessions, migrations |
| Relational DB | PostgreSQL | 16 | Primary ACID store |
| Vector Store | Qdrant | latest | Semantic retrieval |
| Graph DB | Neo4j | 5 Community | Knowledge entity graph |
| Search | Meilisearch | 1.5 | Full-text + autocomplete |
| Cache | Redis | 7 | Rate limits, token blacklist, query cache |
| OCR | Docling + MinerU | latest | PDF / DOCX / image ingestion |
| Embeddings | jina-colbert-v2 | latest | Dense retrieval |
| Reranking | bge-reranker-v2-m3 | latest | Cross-encoder ranking |
| Edge VLM | Qwen3-VL-8B-Instruct-FP8 | latest | Vision-language analysis |
| LLM API | Gemini Flash / Live / Gemma | 3.1 / 4 | Tutor, asset gen, fallback |
| Auth | JWT HS256 + bcrypt | cost=12 | Stateless auth + OTP |
| Containerization | Docker Compose | — | Full local stack |

---

## 🚀 Quick Start

### Prerequisites

- Docker Desktop (v24+)
- Node.js 20+
- A [Google AI Studio](https://aistudio.google.com) API key

### 1 — Clone and Configure

```bash
git clone https://github.com/your-org/atlas.git
cd atlas

# Copy all three environment templates
cp .env.example .env
cp backend/.env.example backend/.env
cp ATLAS-OCR/.env.example ATLAS-OCR/.env
```

Open `ATLAS-OCR/.env` and set your keys:

```ini
# Multi-role API keys for isolated pipeline stages
API_KEY_INGEST_VISION="your_key"    # VLM OCR during document ingestion
API_KEY_INGEST_GRAPH="your_key"     # KG entity/relation extraction
API_KEY_QUERY_ROUTER="your_key"     # Query classification + expansion
API_KEY_QUERY_SYNTHESIS="your_key"  # Final answer synthesis
GEMINI_API_KEY="your_key"           # Docker Compose primary key
```

### 2 — Boot the Stack

```bash
# Build the API image and start all infrastructure
docker compose up --build -d

# Watch the logs until you see "Application startup complete"
docker compose logs -f api
```

> The first build downloads model weights. This can take 5–10 minutes on a cold start. Subsequent boots use the `atlas_model_cache` volume and are fast.

### 3 — Seed Test Accounts

```bash
docker compose exec api python seed_fresh_test_state.py
```

```
✅ SUCCESS: Fresh test state created safely (No Race Conditions).
✅ BYPASS: All activation requirements bypassed (Fully Active).
✅ DEPARTMENTS: 'Computer Science' created with levels: L1 → DOCTORAT.
✅ COURSES: 'cloud' (Level L1) added to Computer Science department.
✅ ASSIGNMENTS: Teacher & Student attached to 'Computer Science' at L1.
```

| Role | Email | Password |
|---|---|---|
| 👨‍🎓 Student | `student@atlas.tn` | `Student123!` |
| 👨‍🏫 Teacher | `teacher@atlas.tn` | `Teacher123!` |
| 🛡️ Admin | `admin@atlas.tn` | `Admin123!` |
| 👑 Superadmin | `superadmin@atlas.tn` | `SuperAdmin123!` |

### 4 — Start the Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## 🧠 Enabling the Sovereign Edge Node (Optional · Free)

The Edge Node offloads Qwen3-VL-8B and ColBERT inference to Kaggle's free T4 GPUs, dramatically improving OCR quality on complex documents. Without it, ATLAS falls back to Gemini API for all inference — fully functional, just lighter.

**Setup takes ~5 minutes:**

1. Create a free [Kaggle](https://kaggle.com) account and verify your phone number (required for GPU access).
2. Open **Create → New Notebook** and set the accelerator to **GPU T4 x2** in Session Options.
3. Import the notebook: **File → Import Notebook** → upload `ATLAS-OCR/Atlas Sota.ipynb`.
4. Click **Run All**. When the server boots, copy the Cloudflare tunnel URL from the output.
5. In `ATLAS-OCR/.env`, set:
   ```ini
   USE_EXTERNAL_GPU=true
   COLAB_GPU_URL=https://your-tunnel-url.trycloudflare.com
   ```
6. Restart the API container: `docker compose restart api`

> The tunnel URL changes each Kaggle session. Re-run step 4–6 whenever you restart the notebook.

---

## 📁 Project Structure

```
atlas/
├── backend/                    # FastAPI application
│   ├── app/
│   │   ├── routers/            # Domain HTTP + WebSocket routers
│   │   │   ├── auth.py         # Registration, login, OTP, JWT refresh
│   │   │   ├── courses.py      # Course CRUD + upload trigger
│   │   │   ├── rag/            # Live tutor (WebSocket + SSE) + RAG sessions
│   │   │   ├── study/          # Flashcards, quizzes, assets
│   │   │   ├── admin.py        # Institution management
│   │   │   └── superadmin.py   # Cross-tenant platform management
│   │   ├── services/
│   │   │   ├── iam/            # Auth, OTP, teacher verification
│   │   │   ├── intelligence/   # Swarm orchestrator, memory, asset cache
│   │   │   └── doc_processing/ # Upload, OCR sync, storage, export
│   │   ├── models/             # SQLModel ORM entities
│   │   ├── core/               # Config, security, RBAC, Redis, limits
│   │   └── db/session.py       # Async engine, session factory, bootstrap
│   ├── alembic/                # Database migrations
│   └── docker/api.Dockerfile
│
├── ATLAS-OCR/                  # Cognitive core (ingestion pipeline)
│   ├── src/orchestrator.py     # HybridRAGPipeline entry point
│   ├── RAG-Anything/           # Fork of RAG-Anything (multi-modal RAG)
│   └── Atlas Sota.ipynb        # Kaggle Edge Node bootloader
│
├── frontend/                   # Next.js 16 application
│   ├── src/
│   │   ├── app/                # App Router pages (student, teacher, admin)
│   │   ├── components/         # Shared UI component library
│   │   └── lib/                # API client, auth store, hooks
│   └── tests/e2e/              # Playwright end-to-end tests
│
└── docker-compose.yml          # Full infrastructure definition
```

---

## 🔌 API Reference

The full interactive API reference is available at `http://localhost:8000/docs` (Swagger UI) when the backend is running. Core surface:

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | Student registration + OTP email |
| `POST` | `/api/v1/auth/login` | Public | Returns access + refresh tokens |
| `POST` | `/api/v1/auth/verify-otp` | Public | Account activation |
| `POST` | `/api/v1/courses/upload` | Teacher / Admin | Upload a PDF course document → triggers OCR pipeline |
| `GET` | `/api/v1/search` | Bearer | Full-text + semantic course search |
| `POST` | `/api/v1/rag/sessions` | Bearer | Create a RAG chat session |
| `POST` | `/api/v1/rag/sessions/{id}/messages` | Bearer | Send a message; returns SSE stream |
| `WS` | `/api/v1/rag/tutor-socket/{course_id}` | Token frame | Gemini Live bidirectional voice tutor |
| `POST` | `/api/v1/flashcards/generate` | Bearer | Generate spaced-repetition deck from document |
| `POST` | `/api/v1/quiz/generate` | Bearer | Generate adaptive quiz |
| `POST` | `/api/v1/summaries/generate` | Bearer | Generate executive / structured / comparative summary |
| `POST` | `/api/v1/mindmaps/generate` | Bearer | Generate interactive concept mind map |
| `GET` | `/api/v1/students/me/dashboard` | Student | Personalized dashboard with streak, goals, weak topics |

---

## 🗺 Roadmap

| Status | Milestone |
|---|---|
| ✅ Done | Multi-tenant institution hierarchy (Establishment → Department → Major → Course) |
| ✅ Done | Hybrid RAG pipeline (ColBERT + Qdrant + Neo4j) |
| ✅ Done | Gemini Live WebSocket voice tutor |
| ✅ Done | SM-2 spaced repetition flashcard engine |
| ✅ Done | Multi-modal OCR (Docling + MinerU + VLM vision pass) |
| ✅ Done | AI quiz, summary, and mind map generation |
| ✅ Done | Sovereign Edge Node (Kaggle T4 tunnel) |
| 🔄 In Progress | Arabic OCR fine-tuning (full Maghrebi handwriting support) |
| 🔄 In Progress | Mobile PWA (React Native shell) |
| 📋 Planned | Collaborative annotation layer (shared highlights, comments) |
| 📋 Planned | Teacher analytics dashboard (per-course engagement + weak-topic heatmaps) |
| 📋 Planned | LMS integrations (Moodle, Google Classroom) |
| 📋 Planned | Federated multi-institution deployment (university consortia) |

---

## 🤝 Contributing

Contributions are welcome and appreciated. ATLAS is built in public and we want to grow the community around it.

**Before you open a PR:**

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Read the [Architecture Overview](#-architecture) to understand the zone boundaries.
3. Backend changes: run `ruff check backend/` and `mypy backend/app/` before pushing.
4. Frontend changes: run `npm run lint && npm run typecheck` in `frontend/`.
5. Open your PR against `main` with a clear description of what changed and why.

For larger changes (new services, schema migrations, new AI pipeline stages), please open a [Discussion](https://github.com/your-org/atlas/discussions) first so we can align on approach before you invest the time.

**Good first issues are labeled** [`good first issue`](https://github.com/your-org/atlas/issues?q=label%3A%22good+first+issue%22) in the issue tracker.

---

## 📄 License

ATLAS is released under the [MIT License](LICENSE). You are free to use, modify, and distribute it — including for commercial purposes — with attribution.

---

<div align="center">

Built with care for students who deserve better than photocopied PDFs.

**[atlas.tn](https://atlas.tn)** · [Discussions](https://github.com/your-org/atlas/discussions) · [Issues](https://github.com/your-org/atlas/issues)

</div>****

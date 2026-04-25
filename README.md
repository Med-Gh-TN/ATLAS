<div align="center">

<!-- PROJECT LOGO / BANNER -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Med-Gh-TN/ATLAS/ocr/public/banner-dark.png">
  <img alt="ATLAS Banner" src="https://raw.githubusercontent.com/Med-Gh-TN/ATLAS/ocr/public/banner-light.png" width="100%">
</picture>

# ⚡ ATLAS — Adaptive Tri-Layer Augmented Search

**A production-grade, CPU-optimized, multi-modal RAG system with task-routed LLM failover, ColBERT late-interaction retrieval, and knowledge graph extraction — powered entirely by free-tier APIs.**

<br/>

[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776ab?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Qdrant](https://img.shields.io/badge/Qdrant-Vector_DB-dc244c?style=for-the-badge&logo=qdrant&logoColor=white)](https://qdrant.tech)
[![Neo4j](https://img.shields.io/badge/Neo4j-5.x_Community-008cc1?style=for-the-badge&logo=neo4j&logoColor=white)](https://neo4j.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7.x-dc382d?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge)](CONTRIBUTING.md)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-22.04%2B-e95420?style=for-the-badge&logo=ubuntu&logoColor=white)](https://ubuntu.com)

<br/>

[**Quick Start**](#-quick-start-5-minutes) · [**Architecture**](#-architecture) · [**Configuration**](#️-configuration-reference) · [**API**](#-api-reference) · [**Contributing**](#-contributing)

</div>

---

## 📖 Background

Most open-source RAG systems make a hard assumption: you have GPU hardware or a paid cloud LLM API budget. **ATLAS breaks that assumption.**

ATLAS is a battle-tested, multi-modal Retrieval-Augmented Generation engine built for developers who need **enterprise-grade document intelligence on consumer hardware**. It was engineered around three non-negotiable constraints:

1. **Zero GPU dependency** — All embeddings run on CPU via FastEmbed, thread-pinned to the Intel i5-12500H's P-core cluster (and generalizable to any modern multi-core CPU).
2. **Zero LLM spend** — The entire inference stack runs on Google AI Studio's free tier, with Groq as the emergency text-only backstop. Four dedicated API keys are task-routed to prevent quota collisions between ingestion and querying.
3. **Zero single point of failure** — A Redis-backed Circuit Breaker implements the full Open/Closed/Half-Open state machine across every model in the fallback chain. A daily quota exhaustion on one key cannot block another pipeline stage.

The system is built on two mature open-source engines — [RAG-Anything (HKUDS)](https://github.com/HKUDS/RAG-Anything) and [Docling (docling-project)](https://github.com/docling-project/docling) — extended with a custom orchestration layer (`src/`) that replaces their default LLM and embedding backends with a cost-free, fault-tolerant alternative stack.

### What ATLAS Does

Given a corpus of documents (PDFs, images, mixed content), ATLAS:

- **Ingests** them through a VLM-powered OCR pipeline (Vision stage) and extracts a typed Knowledge Graph of entities and relationships (Graph stage).
- **Embeds** chunks using ColBERT late-interaction (`jina-colbert-v2` at 128 dimensions) for high-precision, asymmetric retrieval and `BAAI/bge-m3` for dense semantic cache matching.
- **Answers** queries through a SOTA RAG pipeline: Query Decomposition → HyDE → Semantic Cache lookup → ColBERT retrieval from Qdrant → Cross-Encoder Reranking → Fusion → LLM Synthesis.
- **Generates** structured educational and analytical assets: flashcard decks, mind maps, summaries, and exam sets from the ingested knowledge base.

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ATLAS — System Overview                         │
├─────────────────────┬───────────────────────────────────────────────────┤
│  INGESTION PIPELINE │  QUERY PIPELINE                                    │
│                     │                                                    │
│  PDF / Image Input  │  User Query                                        │
│        │            │       │                                            │
│  ┌─────▼──────┐     │  ┌────▼─────────┐                                 │
│  │ Docling    │     │  │ Query Router │ ◄── API_KEY_QUERY_ROUTER         │
│  │ VLM OCR   │     │  │ + Decomposer │                                  │
│  │ (VISION)  │     │  └────┬─────────┘                                  │
│  └─────┬──────┘     │       │                                            │
│        │            │  ┌────▼──────┐    ┌───────────────┐               │
│  ┌─────▼──────┐     │  │ HyDE      │    │ Semantic Cache│ (bge-m3)      │
│  │ KG Extract │     │  │ (per type)│    │ (Redis)       │               │
│  │ (GRAPH)   │     │  └────┬──────┘    └───────┬───────┘               │
│  └─────┬──────┘     │       │ miss              │ hit                   │
│        │            │  ┌────▼──────────────┐   │                        │
│  Chunking           │  │ ColBERT Retrieval  │◄──┘                       │
│  (1500 tok)         │  │ (Qdrant / jina)   │                            │
│        │            │  └────┬──────────────┘                            │
│  ┌─────▼──────┐     │       │                                            │
│  │ FastEmbed  │     │  ┌────▼──────────┐                                │
│  │ jina-      │     │  │ Cross-Encoder │ (ms-marco-MiniLM)              │
│  │ colbert-v2 │     │  │ Reranker (k=5)│                                │
│  └─────┬──────┘     │  └────┬──────────┘                                │
│        │            │       │                                            │
│  ┌─────▼──────┐     │  ┌────▼──────────┐                                │
│  │  Qdrant    │     │  │ Fusion Engine │                                │
│  │  Postgres  │     │  └────┬──────────┘                                │
│  │  Neo4j     │     │       │                                            │
│  └────────────┘     │  ┌────▼──────────┐                                │
│                     │  │  LLM Synth    │ ◄── API_KEY_QUERY_SYNTHESIS    │
│                     │  └───────────────┘                                │
└─────────────────────┴───────────────────────────────────────────────────┘

LLM FALLBACK CHAIN (per task, Redis Circuit Breaker enforced):
  gemini-2.5-flash-lite → gemma-3-27b-it → gemma-3-12b-it → [Groq llama-3.3-70b]
  
DATABASE LAYER:
  Qdrant (6333)  — ColBERT vectors + dense cache embeddings
  Neo4j  (7687)  — Knowledge graph (entities, relations, document links)
  Postgres(5432) — Relational source of truth (doc registry, workspace state)
  Redis  (6379)  — Semantic cache + Circuit Breaker state machine
```

### Design Patterns

| Pattern | Location | Purpose |
|---|---|---|
| **Circuit Breaker** | `src/infrastructure/circuit_breaker.py` | Prevents cascade failures across LLM quota exhaustion events |
| **Task-Routed Multi-Key** | `src/infrastructure/llm/router.py` | 4 API keys × 4 pipeline stages = quota isolation |
| **Repository Pattern** | `src/infrastructure/database/repositories/` | Abstracts tri-database reads/writes behind a clean interface |
| **Strategy / Fallback** | `src/infrastructure/fallback.py` | Pluggable model chain with per-error-type routing logic |
| **Domain-Driven Design** | `src/domain/` | Business models and prompt templates are infrastructure-agnostic |

---

## ✅ Prerequisites

Before installing ATLAS, verify your system meets these requirements.

**Hardware (minimum):**
- CPU: 4+ cores (6 P-cores recommended for i5-12500H-class CPUs)
- RAM: 16 GB system RAM (32 GB recommended for full Neo4j + Qdrant workload)
- Disk: 20 GB free (models + Docker volumes)
- GPU: **Not required**

**Software:**
- Ubuntu 22.04 LTS or 24.04 LTS (64-bit)
- Python 3.11 or 3.12
- Docker Engine 24.x + Docker Compose v2
- Git 2.x

---

## 🚀 Quick Start (5 minutes)

> **New to the project?** Follow this section to get a running instance as fast as possible. For production hardening, read [Full Installation](#-full-installation-ubuntu) after this.

```bash
# 1. Clone the repository
git clone https://github.com/Med-Gh-TN/ATLAS.git
cd ATLAS

# 2. Copy and fill in the environment file (minimum required keys shown below)
cp .env.example .env
# Edit .env — at minimum, set the 4 Google AI Studio keys and your passwords
nano .env

# 3. Boot the Docker infrastructure stack
docker compose up -d

# 4. Create a Python virtual environment and install dependencies
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 5. Run the server
python src/server.py
```

The API will be available at `http://localhost:8000`. The database admin UI is at `http://localhost:8080` (Adminer).

---

## 📦 Full Installation (Ubuntu)

This section covers every step from a fresh Ubuntu 22.04/24.04 system to a fully operational ATLAS instance.

### Step 1 — System Dependencies

```bash
sudo apt-get update && sudo apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    git \
    curl \
    wget \
    build-essential \
    libssl-dev \
    libffi-dev \
    poppler-utils \
    tesseract-ocr \
    libmagic1
```

Verify Python version:

```bash
python3.11 --version
# Expected: Python 3.11.x
```

### Step 2 — Docker Engine

If Docker is not already installed, use the official convenience script:

```bash
# Install Docker Engine
curl -fsSL https://get.docker.com | sudo sh

# Add your user to the docker group (avoids needing sudo for every command)
sudo usermod -aG docker $USER

# Apply the group change without logging out
newgrp docker

# Verify installation
docker --version        # Expected: Docker version 24.x.x or later
docker compose version  # Expected: Docker Compose version v2.x.x or later
```

> ⚠️ **Important:** If you skip the `usermod` step, all `docker` commands in subsequent steps require `sudo`.

### Step 3 — Clone the Repository

```bash
git clone https://github.com/Med-Gh-TN/ATLAS.git
cd ATLAS
```

### Step 4 — Python Virtual Environment

ATLAS uses `onnxruntime` (CPU) rather than `onnxruntime-gpu`. Installing into an isolated virtual environment prevents system-level package conflicts.

```bash
# Create the environment
python3.11 -m venv .venv

# Activate it (you must do this every time you open a new terminal)
source .venv/bin/activate

# Upgrade pip inside the environment
pip install --upgrade pip

# Install all dependencies
pip install -r requirements.txt
```

> **Why `onnxruntime` and not `onnxruntime-gpu`?** The GPU wheel omits the full CPU kernel library. On machines without a CUDA runtime, it either crashes at import time or silently degrades — missing the `Slice` kernel required by Jina-ColBERT-v2's attention head. See `requirements.txt` for the full explanation.

### Step 5 — Configure the Environment

```bash
cp .env.example .env
```

Open `.env` in your editor and fill in the values. The table below shows every variable grouped by subsystem.

#### 5a — Google AI Studio API Keys

ATLAS requires **four separate Google AI Studio API keys**, one per pipeline stage. This isolates RPM/TPD quotas so an ingestion burst cannot starve query synthesis.

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create four projects (e.g., `atlas-vision`, `atlas-graph`, `atlas-router`, `atlas-synth`)
3. Generate one API key per project

```dotenv
API_KEY_INGEST_VISION=AIza...   # VLM OCR — document image analysis
API_KEY_INGEST_GRAPH=AIza...    # KG extraction — entity/relation mining
API_KEY_QUERY_ROUTER=AIza...    # Query classification + expansion
API_KEY_QUERY_SYNTHESIS=AIza... # Final answer generation
GEMINI_MODEL_NAME=gemini-2.5-flash-lite-preview
```

#### 5b — Groq Emergency Fallback

ATLAS falls back to Groq's `llama-3.3-70b-versatile` when all Gemini/Gemma models in a task chain are tripped open. Note: Groq is **text-only** — vision data is stripped before forwarding.

1. Go to [console.groq.com/keys](https://console.groq.com/keys) and create a free key.

```dotenv
GROQ_API_KEY=gsk_...
GROQ_MODEL_NAME=llama-3.3-70b-versatile
```

#### 5c — Database Passwords

```dotenv
POSTGRES_URI=postgresql://omni:YOUR_STRONG_PASSWORD@localhost:5432/omni_architect
POSTGRES_PASSWORD=YOUR_STRONG_PASSWORD
NEO4J_PASSWORD=YOUR_STRONG_NEO4J_PASSWORD
```

> 🔒 **Security note:** Never commit `.env` to source control. The repository's `.gitignore` already excludes it. In production, use Docker Secrets, HashiCorp Vault, or AWS Secrets Manager to inject credentials.

#### 5d — Embedding Cache Path

FastEmbed downloads and caches model weights locally. Set this to a path with sufficient disk space (≥5 GB):

```dotenv
FASTEMBED_CACHE_PATH="/home/YOUR_USERNAME/atlas_models"
```

#### 5e — CPU Thread Alignment

The defaults are tuned for Intel 12th-gen hybrid CPUs (6 P-cores + 8 E-cores). For other CPUs, set these to your **physical core count** (not logical/HT):

```dotenv
OMP_NUM_THREADS=6       # Set to your physical P-core count
MKL_NUM_THREADS=6
OPENBLAS_NUM_THREADS=6
FASTEMBED_THREADS=6
```

To find your physical core count:
```bash
lscpu | grep "Core(s) per socket"
```

### Step 6 — Boot the Infrastructure Stack

```bash
docker compose up -d
```

This starts four services: Qdrant, PostgreSQL, Redis, and Neo4j (plus Adminer for DB inspection). All data is persisted in named Docker volumes that survive container restarts.

Verify all services are healthy before proceeding:

```bash
docker compose ps
```

Expected output — all four core services should show `healthy`:

```
NAME                  STATUS                   PORTS
qdrant_master_db      Up X minutes (healthy)   0.0.0.0:6333->6333/tcp
omni_postgres         Up X minutes (healthy)   0.0.0.0:5432->5432/tcp
omni_redis            Up X minutes (healthy)   0.0.0.0:6379->6379/tcp
omni_neo4j            Up X minutes (healthy)   0.0.0.0:7474->7474/tcp, 7687/tcp
omni_adminer          Up X minutes             0.0.0.0:8080->8080/tcp
```

> ⏱️ **Note:** Neo4j takes up to 60 seconds on first boot (JVM startup). If it shows `starting` — wait and re-run `docker compose ps`.

Individual service health checks:
```bash
# Qdrant
curl -s http://localhost:6333/healthz

# PostgreSQL
docker exec omni_postgres pg_isready -U omni -d omni_architect

# Redis
docker exec omni_redis redis-cli ping

# Neo4j Browser UI
curl -s -o /dev/null -w "%{http_code}" http://localhost:7474
# Expected: 200
```

### Step 7 — First Run

```bash
# Activate the virtual environment if not already active
source .venv/bin/activate

# Start the ATLAS server
python src/server.py
```

On first run, FastEmbed will download two embedding models to `FASTEMBED_CACHE_PATH`:
- `jinaai/jina-colbert-v2` (~1.2 GB) — Late-interaction retrieval
- `BAAI/bge-m3` (~570 MB) — Dense semantic cache

This one-time download requires an internet connection. Subsequent starts are instant.

The API is now available at `http://localhost:8000/docs` (Swagger UI).

---

## 🗂️ Project Structure

```
ATLAS/
├── RAG-Anything/               # Upstream submodule — parsing, chunking, OCR batching
│   └── raganything/
│       ├── processor.py        # Core document processor
│       ├── parser.py           # Multi-modal parser dispatcher
│       ├── batch.py            # Async batch ingestion manager
│       ├── resilience.py       # Retry/backoff primitives
│       └── ...
│
├── src/                        # ATLAS orchestration layer (primary entry point)
│   ├── server.py               # FastAPI application — API server entry point
│   ├── orchestrator.py         # Pipeline coordinator (ingestion ↔ query)
│   ├── pdf_worker.py           # CPU-thread-pool PDF ingestion worker
│   ├── model_bridge.py         # Patches RAG-Anything to use ATLAS LLM router
│   ├── colbert_qdrant.py       # ColBERT MaxSim retrieval over Qdrant
│   ├── clean.py                # Text normalization utilities
│   │
│   ├── domain/                 # Core business models — infrastructure-agnostic
│   │   ├── models.py           # Document, Chunk, Asset, GraphEntity dataclasses
│   │   └── prompts/            # Diátaxis-categorized prompt templates (Markdown)
│   │       ├── mindmap_gen.md
│   │       ├── query_router.md
│   │       ├── summary_gen.md
│   │       ├── synthesis.md
│   │       ├── flashcard_gen.md
│   │       ├── hyde_biology.md
│   │       ├── hyde_code.md
│   │       ├── hyde_math.md
│   │       ├── hyde_text.md
│   │       ├── vision_extract.md
│   │       ├── entity_extract.md
│   │       └── exam_gen.md
│   │
│   ├── infrastructure/         # External system adapters
│   │   ├── config_manager.py   # Typed .env loader with validation
│   │   ├── circuit_breaker.py  # Redis-backed Open/Closed/Half-Open CB
│   │   ├── model_registry.py   # Fallback chain definitions per task
│   │   ├── fallback.py         # Multi-model failover executor
│   │   ├── llm/
│   │   │   ├── router.py       # Task → key → model routing
│   │   │   ├── bridge.py       # Unified LLM call interface
│   │   │   └── prompts.py      # Infrastructure-level prompt assembly
│   │   ├── patches/            # Monkey-patches for RAG-Anything backends
│   │   │   ├── parsers.py      # Swap Docling parser into RAG-Anything
│   │   │   ├── prompts.py      # Redirect prompt calls to domain/ templates
│   │   │   └── storage.py      # Redirect storage calls to ATLAS repositories
│   │   └── database/
│   │       ├── connection.py   # Async connection pool manager
│   │       └── repositories/
│   │           ├── documents.py # Postgres + Qdrant + Neo4j document ops
│   │           └── assets.py    # Generated asset persistence
│   │
│   └── services/               # Application-layer RAG components
│       ├── hyde.py             # Hypothetical Document Embeddings (per domain)
│       ├── semantic_cache.py   # bge-m3 similarity cache over Redis
│       ├── query_decomposer.py # Multi-hop query breakdown
│       ├── reranker.py         # Cross-encoder reranking (ms-marco-MiniLM)
│       ├── fusion_engine.py    # Context merging before synthesis
│       ├── graph_extractor.py  # Neo4j KG population from ingestion
│       ├── asset_generator.py  # Flashcard, mindmap, exam generation
│       └── content_tagger.py  # Domain/type classification tagging
│
├── .env.example                # Fully documented environment template
├── docker-compose.yml          # Infrastructure stack (Qdrant, PG, Redis, Neo4j)
├── requirements.txt            # Python dependencies
└── boot.sh                     # Optional convenience start script
```

---

## ⚙️ Configuration Reference

All runtime behavior is controlled through `.env`. No values are hardcoded in source.

### LLM & Inference

| Variable | Default | Description |
|---|---|---|
| `API_KEY_INGEST_VISION` | *(required)* | Google AI Studio key for VLM OCR stage |
| `API_KEY_INGEST_GRAPH` | *(required)* | Google AI Studio key for KG extraction stage |
| `API_KEY_QUERY_ROUTER` | *(required)* | Google AI Studio key for query classification |
| `API_KEY_QUERY_SYNTHESIS` | *(required)* | Google AI Studio key for answer generation |
| `GEMINI_MODEL_NAME` | `gemini-2.5-flash-lite-preview` | Primary model for all tasks |
| `GROQ_API_KEY` | *(required)* | Groq key for text-only emergency fallback |
| `GROQ_MODEL_NAME` | `llama-3.3-70b-versatile` | Groq fallback model |

### Circuit Breaker

| Variable | Default | Description |
|---|---|---|
| `CB_RPM_COOLDOWN_SECONDS` | `35` | Wait after RPM/TPM 429 before same-model retry |
| `CB_RPD_COOLDOWN_SECONDS` | `86400` | Cooldown after daily quota exhaustion (24h) |
| `CB_SERVICE_COOLDOWN_SECONDS` | `300` | Cooldown after 503 Service Unavailable |
| `CB_FAILURE_THRESHOLD` | `2` | Consecutive failures before CB trips OPEN |
| `GEMINI_RPM_SAFETY_FACTOR` | `0.70` | Safety margin applied on top of model RPM limits |

### Embedding & Retrieval

| Variable | Default | Description |
|---|---|---|
| `EMBEDDER_MODEL_NAME` | `jinaai/jina-colbert-v2` | Late-interaction retrieval embedder |
| `EMBEDDING_DIMENSION` | `128` | ColBERT output dimension |
| `EMBEDDING_MAX_TOKENS` | `8192` | Hard token limit for jina-colbert-v2 |
| `CACHE_EMBEDDER_MODEL` | `BAAI/bge-m3` | Dense embedder for semantic cache |
| `CACHE_SIMILARITY_THRESHOLD` | `0.85` | Cosine similarity threshold for cache hits |
| `RERANKER_MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Cross-encoder reranker |
| `RERANKER_TOP_K` | `5` | Number of candidates returned after reranking |

### Chunking

| Variable | Default | Description |
|---|---|---|
| `CHUNK_TOKEN_SIZE` | `1500` | Chunk size in tokens (safe for all models in chain) |
| `CHUNK_OVERLAP` | `200` | Overlap in tokens between adjacent chunks |
| `MAX_PAGES_PER_SLICE` | `5` | Max PDF pages per VLM OCR batch call |

### Feature Flags

| Variable | Default | Description |
|---|---|---|
| `HYDE_ENABLED` | `true` | Hypothetical Document Embeddings |
| `SEMANTIC_CACHE_ENABLED` | `true` | Redis-backed query result caching |
| `QUERY_DECOMP_ENABLED` | `true` | Multi-hop query decomposition |
| `RERANKER_ENABLED` | `true` | Cross-encoder reranking pass |
| `MATH_LATEX_NORMALIZE` | `true` | LaTeX normalization for math documents |

---

## 📡 API Reference

The server exposes a REST API documented interactively at `http://localhost:8000/docs` when running.

### Ingestion

#### `POST /ingest`

Ingest a document into the ATLAS pipeline.

```bash
curl -X POST http://localhost:8000/ingest \
  -F "file=@/path/to/document.pdf" \
  -F "workspace=my_project"
```

**Response:**
```json
{
  "document_id": "doc_a1b2c3",
  "status": "processing",
  "chunks_extracted": 47,
  "entities_found": 124
}
```

### Querying

#### `POST /query`

Run a RAG query against the ingested knowledge base.

```bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the main limitations discussed in section 3?",
    "workspace": "my_project",
    "top_k": 10
  }'
```

**Response:**
```json
{
  "answer": "...",
  "sources": [...],
  "cache_hit": false,
  "model_used": "gemini-2.5-flash-lite-preview",
  "reranked_chunks": 5
}
```

### Asset Generation

#### `POST /assets/generate`

Generate a structured educational asset from the knowledge base.

```bash
curl -X POST http://localhost:8000/assets/generate \
  -H "Content-Type: application/json" \
  -d '{
    "workspace": "my_project",
    "asset_type": "flashcards",
    "topic": "Key concepts from Chapter 2",
    "count": 20
  }'
```

Supported `asset_type` values: `flashcards`, `mindmap`, `summary`, `exam`.

### Infrastructure Health

#### `GET /health`

Returns the operational status of all infrastructure services and the circuit breaker state for each model/task combination.

```bash
curl http://localhost:8000/health
```

---

## 🔧 How-To Guides

### How to reset a single Docker volume without losing others

```bash
# Stop only the affected service
docker compose stop postgres

# Remove its named volume
docker volume rm omni_architect_postgres_data

# Restart — the service will reinitialize from scratch
docker compose up -d postgres
```

### How to monitor Circuit Breaker state in real time

The Circuit Breaker state is stored in Redis. Inspect it directly:

```bash
docker exec omni_redis redis-cli --scan --pattern "cb:*"
# Example output:
# cb:INGEST_VISION:gemini-2.5-flash-lite-preview
# cb:QUERY_SYNTHESIS:gemma-3-27b-it

# Inspect a specific key
docker exec omni_redis redis-cli GET "cb:INGEST_VISION:gemini-2.5-flash-lite-preview"
```

### How to add a new model to the fallback chain

Open `src/infrastructure/model_registry.py` and locate the `FALLBACK_CHAINS` dictionary. Add your model to the appropriate task chain:

```python
FALLBACK_CHAINS = {
    "INGEST_VISION": [
        "gemini-2.5-flash-lite-preview",
        "your-new-model-here",     # ← insert here
        "gemma-3-27b-it",
        "GROQ:llama-3.3-70b-versatile",
    ],
    ...
}
```

The circuit breaker and rate-limit configurations are read from `.env` automatically. No other changes required.

### How to tune for your CPU

Find your physical P-core count:
```bash
lscpu | grep "Core(s) per socket"
```

Update `.env` to match:
```dotenv
OMP_NUM_THREADS=<your_p_core_count>
MKL_NUM_THREADS=<your_p_core_count>
OPENBLAS_NUM_THREADS=<your_p_core_count>
FASTEMBED_THREADS=<your_p_core_count>
```

These environment variables are read by `src/orchestrator.py` **before** any NumPy or BLAS import, ensuring the OS thread scheduler is correctly overridden.

### How to disable a SOTA feature to reduce API calls

All advanced RAG features are individually toggleable in `.env`:

```dotenv
HYDE_ENABLED=false            # Disable HyDE (reduces 1 LLM call per query)
SEMANTIC_CACHE_ENABLED=false  # Disable cache (always hits retrieval)
QUERY_DECOMP_ENABLED=false    # Disable decomposition (single-shot queries only)
RERANKER_ENABLED=false        # Disable reranker (faster but less precise)
```

---

## 🧠 Explanation: Key Technical Decisions

### Why four separate API keys instead of one?

Google AI Studio enforces quotas **per key**, not per model. A single key shared across all pipeline stages means that a burst of document ingestion (which fires the VLM OCR and KG extraction models repeatedly) consumes the RPM/RPD budget available to query synthesis. Under load, this makes queries fail while ingestion is running — even if query traffic is light. Four keys from four separate projects give each pipeline stage an independent quota envelope.

### Why ColBERT instead of dense retrieval?

Dense embedders (like OpenAI `text-embedding-3-large` or `bge-m3` alone) compress a passage into a single vector. At retrieval time, the query vector is dot-producted against passage vectors — all passage-level information is irretrievably lost at embedding time. ColBERT's late-interaction model instead stores one vector **per token** and computes a MaxSim score across all query-token / passage-token pairs at retrieval time. This retains fine-grained token-level signal, which is especially important for scientific text, code, and math where individual terms carry disproportionate meaning. `jina-colbert-v2` achieves this at only 128 dimensions per token — small enough to store in Qdrant without a GPU.

### Why `onnxruntime` (CPU) and not `onnxruntime-gpu`?

The GPU wheel of `onnxruntime` ships without the full `CPUExecutionProvider` C++ kernel library. When `FASTEMBED_PROVIDER=CPUExecutionProvider` is set (which is mandatory on machines without CUDA), the GPU build either crashes on `libcuda.so` import or silently degrades to a fallback provider that is missing the `Slice` kernel required by Jina-ColBERT-v2's attention head. The CPU wheel contains the complete kernel set. Do not replace this unless you configure `CUDAExecutionProvider` and have the matching CUDA toolkit + cuDNN installed.

### Why `CHUNK_TOKEN_SIZE=1500`?

The Gemma 3 models in the fallback chain have `TPM=15,000`. At 1 RPM safe throughput that maps to ≈1,500 tokens per call with the `GEMINI_RPM_SAFETY_FACTOR=0.70` margin applied. Setting chunk size above this risks a single chunk exceeding the per-call token budget for the weakest model in the chain, causing silent truncation mid-extraction. 1,500 tokens is the safe universal ceiling across all models.

---

## 🐛 Troubleshooting

### `ONNX Runtime: No such operator Slice`

You have `onnxruntime-gpu` installed. Uninstall it and install the CPU version:
```bash
pip uninstall onnxruntime-gpu -y
pip install onnxruntime
```

### Neo4j container keeps restarting

Neo4j JVM startup takes up to 60 seconds on first boot. Wait and re-check:
```bash
docker compose logs neo4j --follow
# Wait until you see: "Started."
```

If it continues crashing, your Docker memory limit may be too low. Neo4j requires at least 4 GB allocated. Check `docker info | grep "Total Memory"`.

### All queries return `circuit_open` errors

All models in a task's fallback chain have tripped their circuit breakers. Check the daily quota state:
```bash
docker exec omni_redis redis-cli --scan --pattern "cb:*" | xargs -I{} docker exec omni_redis redis-cli TTL {}
```

Keys with a TTL near 86400 are exhausted for the day. Wait for the TTL to expire, or add a new Google AI Studio key to the fallback chain.

### Embeddings are slow / server blocks during ingestion

The embedding loop is running on the event loop thread. Verify that `src/orchestrator.py` dispatches embedding calls to a `ThreadPoolExecutor` and is not `await`-ing them on the main async loop. See [Issue Tracker](https://github.com/Med-Gh-TN/ATLAS/issues) for the current status of the async embedding fix.

### `psycopg2.OperationalError: could not connect to server`

The PostgreSQL container may not be healthy yet. Check:
```bash
docker compose ps postgres
# Must show: (healthy)
```

If healthy, verify `POSTGRES_URI` in `.env` matches the docker-compose credentials.

---

## 🗺️ Roadmap

- [ ] **Async embedding threadpool** — Decouple FastEmbed from the event loop to unblock concurrent HTTP requests during ingestion
- [ ] **Distributed transaction rollback** — Atomic tri-database rollback (Postgres + Qdrant + Neo4j) on partial ingestion failure
- [ ] **Web UI** — Replace the prototype HTML interface with a production React frontend
- [ ] **GPU execution provider** — Optional CUDA path via `FASTEMBED_PROVIDER=CUDAExecutionProvider`
- [ ] **Multi-workspace isolation** — Per-workspace Qdrant collection + Neo4j database routing
- [ ] **Streaming responses** — Server-Sent Events for real-time synthesis output
- [ ] **OpenTelemetry tracing** — Distributed tracing across all pipeline stages

---

## 🤝 Contributing

Contributions are warmly welcomed. ATLAS is a lean project and every improvement matters.

**Before opening a PR**, please read [CONTRIBUTING.md](CONTRIBUTING.md) for the full process. The short version:

1. **Search existing issues** before filing a new one — your bug or feature may already be tracked.
2. **For bug fixes:** Open an issue first, describe the behavior, and link to relevant logs/stack traces.
3. **For new features:** Open a Discussion first to align on design before investing in implementation.
4. **For documentation:** PRs welcome without prior issue — typos, clarity, examples, translations.

### Development Setup

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/ATLAS.git
cd ATLAS
git remote add upstream https://github.com/Med-Gh-TN/ATLAS.git

# Create a feature branch
git checkout -b feat/your-feature-name

# Set up the dev environment
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Make your changes, then open a PR against the `ocr` branch
```

### Code Style

- Python: follow [PEP 8](https://peps.python.org/pep-0008/). Use `black` for formatting.
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`).
- Environment variables: `UPPER_SNAKE_CASE`. All new variables must be documented in `.env.example` with an inline comment.
- No values hardcoded in source. Everything configurable goes in `.env`.

### Good First Issues

Look for issues labeled [`good first issue`](https://github.com/Med-Gh-TN/ATLAS/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — these are well-scoped tasks with clear acceptance criteria, ideal for getting familiar with the codebase.

### Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold a respectful and constructive environment for all contributors.

---

## 🔐 Security

If you discover a security vulnerability in ATLAS, **please do not open a public issue.** Instead, report it privately via [GitHub Security Advisories](https://github.com/Med-Gh-TN/ATLAS/security/advisories/new) or email the maintainer directly.

We aim to respond to security reports within 48 hours and to issue a patch within 7 days for critical vulnerabilities.

---

## 📚 Acknowledgements

ATLAS is built on the shoulders of several outstanding open-source projects:

- **[RAG-Anything](https://github.com/HKUDS/RAG-Anything)** (HKUDS) — Multi-modal RAG foundation and document processing primitives
- **[Docling](https://github.com/docling-project/docling)** (IBM / docling-project) — High-fidelity PDF and document parsing
- **[Qdrant](https://github.com/qdrant/qdrant)** — Production-grade vector database with ColBERT support
- **[FastEmbed](https://github.com/qdrant/fastembed)** (Qdrant) — Lightweight, CPU-optimized embedding execution
- **[Jina ColBERT v2](https://huggingface.co/jinaai/jina-colbert-v2)** (Jina AI) — State-of-the-art late-interaction multilingual embedder
- **[BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)** (BAAI) — Multilingual dense embedder for semantic caching
- **[ms-marco-MiniLM-L-6-v2](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L-6-v2)** — Efficient cross-encoder for reranking

---

## 📄 License

MIT © 2025 [Med-Gh-TN](https://github.com/Med-Gh-TN)

See [LICENSE](LICENSE) for the full text.

---

<div align="center">

**If ATLAS saves you GPU costs or API spend, consider giving it a ⭐**

*Built in Tunisia. Runs anywhere.*

</div>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Med-Gh-TN/ATLAS/ocr/public/banner-dark.png">
  <img alt="ATLAS Banner" src="https://raw.githubusercontent.com/Med-Gh-TN/ATLAS/ocr/public/banner-light.png" width="100%">
</picture>
# ⚡ ATLAS — Adaptive Tri-Layer Augmented Search
 
### A production-grade, multi-modal RAG system with sovereign GPU offload, task-routed LLM failover, ColBERT late-interaction retrieval, and knowledge graph extraction — powered entirely by free-tier APIs and consumer hardware.
 
<br/>
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776ab?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Qdrant](https://img.shields.io/badge/Qdrant-Vector_DB-dc244c?style=for-the-badge&logo=qdrant&logoColor=white)](https://qdrant.tech)
[![Neo4j](https://img.shields.io/badge/Neo4j-5.x_Community-008cc1?style=for-the-badge&logo=neo4j&logoColor=white)](https://neo4j.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7.x-dc382d?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-22.04%2B-e95420?style=for-the-badge&logo=ubuntu&logoColor=white)](https://ubuntu.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge)](CONTRIBUTING.md)
 
<br/>
[**Quick Start**](#-quick-start-5-minutes) · [**Architecture**](#-architecture) · [**Sovereign Node**](#-sovereign-gpu-node-setup-kaggle--cloudflare) · [**Configuration**](#️-configuration-reference) · [**API**](#-api-reference) · [**Contributing**](#-contributing)
 
</div>
---
 
## 📖 The Problem ATLAS Solves
 
Most open-source RAG stacks rest on one of three assumptions that break for real developers:
 
1. **You have a GPU** — embeddings are fast, OCR is free.
2. **You have an API budget** — OpenAI, Anthropic, or Cohere handles inference.
3. **You can accept single points of failure** — if the model is down, the pipeline is down.
**ATLAS breaks all three assumptions.**
 
ATLAS is a battle-tested, multi-modal Retrieval-Augmented Generation engine built for the constraint-driven developer. It was engineered around four non-negotiable axioms:
 
| Axiom | Solution |
|---|---|
| **Zero GPU dependency locally** | CPU-only FastEmbed (ColBERT + dense), thread-pinned to P-cores |
| **Zero LLM spend** | 4 dedicated Google AI Studio free-tier keys, one per pipeline stage |
| **Zero single point of failure** | Redis-backed Circuit Breaker across every model in every fallback chain |
| **Sovereign GPU on demand** | Kaggle 2×T4 vLLM node via Cloudflare tunnel — free, fast, multimodal |
 
The system is built as an orchestration layer (`src/`) on top of two mature open-source engines — **[RAG-Anything (HKUDS)](https://github.com/HKUDS/RAG-Anything)** and **[Docling (docling-project)](https://github.com/docling-project/docling)** — treated as a **black box**. ATLAS monkey-patches their LLM, embedding, storage, and prompt backends at startup, replacing them with a cost-free, fault-tolerant, and fully configurable alternative stack. You get the parsing quality of Docling and the graph-RAG primitives of RAG-Anything, without paying for either's default inference stack.
 
---
 
## 🏛️ Architecture
 
### System Overview
 
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ATLAS — Dual-Pipeline Overview                        │
├──────────────────────────────┬───────────────────────────────────────────────┤
│      INGESTION PIPELINE       │           QUERY PIPELINE                      │
│                               │                                               │
│  PDF / Image / Mixed Input    │   User Query                                  │
│           │                   │        │                                       │
│  ┌────────▼────────┐          │   ┌────▼─────────────────┐                   │
│  │  Docling VLM    │          │   │  Query Router         │ ← KEY_ROUTER      │
│  │  OCR / Parser   │          │   │  + Decomposer (SOTA)  │                   │
│  │  (Vision stage) │          │   └────┬─────────────────┘                   │
│  └────────┬────────┘          │        │                                       │
│           │                   │   ┌────▼──────────┐  ┌──────────────────┐    │
│  ┌────────▼────────┐          │   │  HyDE (domain │  │ Semantic Cache   │    │
│  │  KG Extractor   │          │   │  -aware)      │  │ bge-m3 / Redis   │    │
│  │  Entity + Rels  │          │   └────┬──────────┘  └────────┬─────────┘    │
│  │  (Graph stage)  │          │        │ miss                  │ hit          │
│  └────────┬────────┘          │   ┌────▼──────────────────────┘              │
│           │                   │   │  ColBERT MaxSim Retrieval                 │
│   Chunking 512 tok            │   │  jina-colbert-v2 @ 128-dim               │
│   Overlap  50 tok             │   │  (Qdrant multivector index)              │
│           │                   │   └────┬──────────────────────────────────   │
│  ┌────────▼────────┐          │        │                                       │
│  │  FastEmbed      │          │   ┌────▼─────────────────┐                   │
│  │  jina-colbert   │          │   │ Cross-Encoder Rerank  │ bge-reranker-v2   │
│  │  CPU-only       │          │   │ top-k=5               │                   │
│  └────────┬────────┘          │   └────┬─────────────────┘                   │
│           │                   │        │                                       │
│  ┌────────▼────────────────┐  │   ┌────▼─────────────────┐                   │
│  │  Qdrant  │  Postgres    │  │   │  Fusion + LLM Synth  │ ← KEY_SYNTHESIS   │
│  │  Neo4j   │  Redis       │  │   └──────────────────────┘                   │
│  └─────────────────────────┘  │                                               │
└──────────────────────────────┴───────────────────────────────────────────────┘
 
SOVEREIGN GPU NODE (Primary — Kaggle 2×T4):
  Qwen3-VL-72B via vLLM → Cloudflare Tunnel → COLAB_GPU_URL
  ↳ Circuit Breaker: TUNNEL_DEAD → instantly reroutes to Gemma cascade
 
FALLBACK CHAIN (per task, Redis Circuit Breaker enforced):
  [Sovereign vLLM] → gemma-4-31b-it → gemma-4-26b-a4b-it → gemma-3-27b-it
 
DATABASE LAYER (all via Docker, all free):
  Qdrant  (6333) — ColBERT multivector + dense cache embeddings
  Neo4j   (7687) — Knowledge graph: entities, relations, document links
  Postgres (5432) — Source of truth: document registry, workspace state
  Redis   (6379)  — Semantic cache LRU + Circuit Breaker state machine
```
 
---
 
### 🧠 The Sovereign GPU Node
 
ATLAS introduces a unique **edge-cloud compute model**. The primary LLM backend is not a paid API — it's a **Kaggle notebook running vLLM with 2×T4 GPUs**, exposed via a **Cloudflare tunnel** to your local machine. This gives you:
 
- **Qwen3-VL-72B** for VLM OCR and graph extraction (free, multimodal)
- **~0 RPM limit** (bounded only by GPU throughput)
- **128K context window** for deep document extraction
- **Automatic failover** — when the tunnel is offline (notebooks restart every ~12h), the Circuit Breaker detects `TUNNEL_DEAD` in a single request and instantly reroutes to the Gemma free-tier cascade, with zero manual intervention
The Kaggle notebook setup takes under 10 minutes. See [Sovereign Node Setup](#-sovereign-gpu-node-setup-kaggle--cloudflare) below.
 
---
 
### Design Patterns
 
| Pattern | Location | Purpose |
|---|---|---|
| **Circuit Breaker (Open/Closed/Half-Open)** | `src/infrastructure/circuit_breaker.py` | Prevents cascade failures across quota exhaustion and tunnel downtime |
| **Task-Routed Multi-Key** | `src/infrastructure/llm/router.py` | 4 API keys × 5 pipeline stages = isolated quota envelopes |
| **Monkey-Patching / Adapter** | `src/infrastructure/patches/` | Swaps RAG-Anything's LLM, storage, and prompt backends at import time |
| **Repository Pattern** | `src/infrastructure/database/repositories/` | Abstracts tri-database reads/writes (Postgres + Qdrant + Neo4j) behind a clean interface |
| **Strategy / Fallback Chain** | `src/infrastructure/model_registry.py` | Immutable `ModelSpec` + `TASK_MODEL_CHAINS` dict — add a new model in one line |
| **Domain-Driven Design** | `src/domain/` | Business models and prompt templates are completely infrastructure-agnostic |
| **CPU Affinity Masking** | `.env` `CACHE_CORES`, `COLBERT_CORES`, `RERANKER_CORES` | Pins each embedding workload to specific logical cores to prevent thread contention |
 
---
 
## ✅ Prerequisites
 
### Hardware
 
| Resource | Minimum | Recommended |
|---|---|---|
| **CPU** | 4 cores | 6+ P-cores (Intel 12th gen+, AMD Zen 3+) |
| **RAM** | 16 GB | 32 GB (full Neo4j + Qdrant ColBERT load) |
| **Disk** | 15 GB | 30 GB (Docker volumes + embedding model cache) |
| **GPU** | **Not required** | — (handled by Sovereign Node) |
| **Internet** | Required for first model download and Kaggle tunnel | |
 
### Software
 
- **Ubuntu 22.04 LTS** or 24.04 LTS (64-bit) — other Linux distros untested
- **Python 3.11** or 3.12
- **Docker Engine 24.x** + Docker Compose v2
- **Git 2.x**
> **Windows / macOS:** Not officially supported. WSL2 on Windows may work but is untested.
 
---
 
## 🚀 Quick Start (5 minutes)
 
```bash
# 1. Clone the repository
git clone https://github.com/Med-Gh-TN/ATLAS.git
cd ATLAS
 
# 2. Copy the environment template and fill in your API keys
cp .env.example .env
nano .env   # See "Configuration Reference" below for what to fill in
 
# 3. Boot the infrastructure stack (Qdrant, Postgres, Redis, Neo4j)
docker compose up -d
 
# 4. Create and activate a Python virtual environment
python3.11 -m venv .venv && source .venv/bin/activate
 
# 5. Install dependencies
pip install -r requirements.txt
 
# 6. Start the server
python src/server.py
```
 
The API is live at **`http://localhost:8000`**. The browser UI launches automatically. The Swagger docs are at **`http://localhost:8000/docs`**.
 
> **First run:** FastEmbed will download `jinaai/jina-colbert-v2` (~1.2 GB) and `BAAI/bge-m3` (~570 MB) to `FASTEMBED_CACHE_PATH`. This is a one-time download. Subsequent starts are instant.
 
---
 
## 📦 Full Installation (Ubuntu)
 
### Step 1 — System Dependencies
 
```bash
sudo apt-get update && sudo apt-get install -y \
    python3.11 python3.11-venv python3.11-dev python3-pip \
    git curl wget build-essential \
    libssl-dev libffi-dev \
    poppler-utils tesseract-ocr libmagic1
```
 
### Step 2 — Docker Engine
 
```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo sh
 
# Add your user to the docker group (no sudo required for docker commands)
sudo usermod -aG docker $USER && newgrp docker
 
# Verify
docker --version && docker compose version
```
 
### Step 3 — Clone & Set Up Python Environment
 
```bash
git clone https://github.com/Med-Gh-TN/ATLAS.git
cd ATLAS
 
python3.11 -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```
 
> **Why `onnxruntime` (CPU) and not `onnxruntime-gpu`?** The GPU wheel omits the full `CPUExecutionProvider` C++ kernel library. On machines without CUDA, it either crashes at import or silently degrades — missing the `Slice` kernel required by Jina-ColBERT-v2's attention head. The CPU wheel contains the complete kernel set. Do not replace it unless you have a full CUDA + cuDNN installation.
 
### Step 4 — Configure the Environment
 
```bash
cp .env.example .env
```
 
See the full [Configuration Reference](#️-configuration-reference) below.
 
### Step 5 — Boot Infrastructure
 
```bash
docker compose up -d
 
# Verify all services are healthy
docker compose ps
```
 
Expected (all four core services `healthy`):
 
```
NAME                  STATUS                   PORTS
qdrant_master_db      Up X minutes (healthy)   0.0.0.0:6333->6333/tcp
omni_postgres         Up X minutes (healthy)   0.0.0.0:5432->5432/tcp
omni_redis            Up X minutes (healthy)   0.0.0.0:6379->6379/tcp
omni_neo4j            Up X minutes (healthy)   0.0.0.0:7474->7474/tcp, 7687/tcp
omni_adminer          Up X minutes             0.0.0.0:8080->8080/tcp
omni_redisinsight     Up X minutes             0.0.0.0:8001->5540/tcp
```
 
> **Neo4j** takes up to 60 seconds on first boot (JVM startup + APOC plugin load). If it shows `starting`, wait and re-run `docker compose ps`.
 
### Step 6 — First Run
 
```bash
source .venv/bin/activate
python src/server.py
```
 
---
 
## 🛰️ Sovereign GPU Node Setup (Kaggle + Cloudflare)
 
This is ATLAS's killer feature: **free GPU inference** for VLM OCR and KG extraction with no GPU required on your local machine.
 
### Why This Works
 
Kaggle provides 30 free GPU hours/week (2×T4, ~30GB VRAM total). ATLAS runs a **vLLM server** in a Kaggle notebook, then uses [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) to expose it as a public HTTPS endpoint. Your local ATLAS instance calls this endpoint as its primary LLM backend. When the Kaggle session ends (~12h), the Circuit Breaker auto-reroutes to the Gemma free-tier cascade within one failed request.
 
### Setup Steps
 
**1. Kaggle Notebook (run once, re-run when session expires)**
 
Create a Kaggle notebook with GPU accelerator (2×T4) and paste the ATLAS master bootloader. The bootloader:
- Installs vLLM + Cloudflare tunnel binary
- Pulls `Qwen/Qwen3-VL-72B-Instruct-AWQ` (quantized, fits in 2×T4)
- Launches vLLM with multimodal support and structured output
- Starts the Cloudflare tunnel and prints the public URL
**2. Copy the Tunnel URL**
 
After the bootloader runs (~5 minutes), the notebook prints a URL like:
```
https://your-unique-id.trycloudflare.com
```
 
**3. Update `.env`**
 
```dotenv
USE_EXTERNAL_GPU=true
COLAB_GPU_URL=https://your-unique-id.trycloudflare.com
TUNNEL_API_KEY=your_secure_tunnel_secret_here   # set in bootloader + here
CLOUDFLARE_TUNNEL_TIMEOUT=95.0  # stays under Cloudflare's 100s 524 limit
```
 
**4. Restart ATLAS**
 
```bash
python src/server.py
```
 
ATLAS will now route all primary LLM calls to the Sovereign Node. You can confirm by watching the startup logs — it will print `[SOVEREIGN] vLLM online ✓`.
 
### What If the Tunnel Is Down?
 
Nothing breaks. The Circuit Breaker detects `TUNNEL_DEAD` (502/503/timeout) on the first failed request and opens the breaker for that task. All subsequent calls in that session route directly through the Gemma cascade on Google AI Studio free tier. There is no manual intervention required. The breaker resets automatically and retries the tunnel on the next server restart.
 
---
 
## ⚙️ Configuration Reference
 
All runtime behavior is controlled through `.env`. **Nothing is hardcoded in source.** Every hyperparameter — from chunk sizes to circuit breaker thresholds to CPU core affinity — is a live environment variable.
 
### Sovereign GPU Node
 
```dotenv
USE_EXTERNAL_GPU=true
COLAB_GPU_URL=https://your-tunnel-url.trycloudflare.com
TUNNEL_API_KEY=your_secure_tunnel_secret_here
CLOUDFLARE_TUNNEL_TIMEOUT=95.0        # Hard limit to gracefully preempt Cloudflare's 524
STRICT_SEQUENTIAL_PROCESSING=false    # true = wait for vLLM before embedding (prevents CUDA contention)
```
 
### AI Inference & Task Routing
 
ATLAS requires **four separate Google AI Studio API keys**, one per pipeline stage. This isolates RPM/RPD quotas so an ingestion burst cannot starve query synthesis. A daily quota hit on one key cannot block another stage.
 
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create four Google Cloud projects (e.g., `atlas-vision`, `atlas-graph`, `atlas-router`, `atlas-synth`)
3. Generate one free API key per project
```dotenv
API_KEY_INGEST_VISION=AIza...      # VLM OCR — document image analysis
API_KEY_INGEST_GRAPH=AIza...       # KG extraction — entity/relation mining
API_KEY_QUERY_ROUTER=AIza...       # Query classification + decomposition
API_KEY_QUERY_SYNTHESIS=AIza...    # Final answer synthesis
API_KEY_ASSET_GENERATION=AIza...   # Optional: defaults to QUERY_SYNTHESIS key
 
GEMINI_MODEL_NAME=gemma-4-31b-it   # First cloud fallback after Sovereign Node
```
 
### Fallback Chain (defined in `src/infrastructure/model_registry.py`)
 
```
Per-task strict cascade:
  [Sovereign vLLM (Qwen3-VL)] → gemma-4-31b-it → gemma-4-26b-a4b-it → gemma-3-27b-it
 
Exception: INGEST_VISION omits gemma-3-27b-it (no vision capability)
```
 
### Circuit Breaker
 
```dotenv
CB_FAILURE_THRESHOLD=1              # Zero-tolerance: 1 failure trips breaker OPEN
CB_RPM_COOLDOWN_SECONDS=35          # Wait time after RPM/TPM 429
CB_RPD_COOLDOWN_SECONDS=86400       # 24h cooldown after daily quota exhaustion
CB_SERVICE_COOLDOWN_SECONDS=600     # 10 min cooldown after 503
GEMINI_RPM_SAFETY_FACTOR=0.70       # Conservative margin on top of model RPM limits
GEMINI_RPD_SOFT_LIMIT_PCT=80        # Warn (but don't halt) at 80% daily quota
```
 
### Embedding & Retrieval
 
```dotenv
# ColBERT Late-Interaction (local CPU, no GPU required)
EMBEDDER_MODEL_NAME=jinaai/jina-colbert-v2
EMBEDDING_DIMENSION=128
EMBEDDING_MAX_TOKENS=512
FASTEMBED_PROVIDER=CPUExecutionProvider
FASTEMBED_CACHE_PATH="/path/to/your/atlas_models"
FASTEMBED_BATCH_SIZE=4
FASTEMBED_PARALLEL=0
 
# Dense Semantic Cache Embedder (asymmetric architecture)
CACHE_EMBEDDER_MODEL=BAAI/bge-m3
CACHE_EMBEDDING_DIM=1024
CACHE_SIMILARITY_THRESHOLD=0.85
 
# Cross-Encoder Reranker
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
RERANKER_TOP_K=5
RETRIEVAL_TOP_K=50                  # Flood the context window before reranking
```
 
### CPU Core Affinity (Intel 12th-gen defaults, adjust to your CPU)
 
```dotenv
# Comma-separated logical core IDs for each workload
CACHE_CORES=0,1        # bge-m3 (semantic cache)
COLBERT_CORES=2,3      # jina-colbert-v2 (retrieval)
RERANKER_CORES=4,5     # bge-reranker-v2-m3
 
# Thread environment variables (set to your physical P-core count)
OMP_NUM_THREADS=2
MKL_NUM_THREADS=2
OPENBLAS_NUM_THREADS=2
DOCLING_NUM_THREADS=4
FASTEMBED_THREADS=4
TOKENIZERS_PARALLELISM=false
```
 
To find your physical P-core count:
```bash
lscpu | grep "Core(s) per socket"
```
 
### Chunking
 
```dotenv
CHUNK_TOKEN_SIZE=512     # Auto-clamped to EMBEDDING_MAX_TOKENS (math guardrail)
CHUNK_OVERLAP=50
MAX_PAGES_PER_SLICE=5    # VLM OCR batch pages per API call
```
 
### Feature Flags
 
```dotenv
HYDE_ENABLED=true                  # Hypothetical Document Embeddings (1 extra LLM call/query)
SEMANTIC_CACHE_ENABLED=true        # Redis bge-m3 similarity cache
QUERY_DECOMP_ENABLED=true          # Multi-hop query decomposition
RERANKER_ENABLED=true              # Cross-encoder reranking pass
MATH_LATEX_NORMALIZE=true          # LaTeX normalization for STEM documents
ENTERPRISE_STORAGE_ENABLED=true    # Postgres + Neo4j + Qdrant full mode
QDRANT_STRICT_ISOLATION=true       # Per-workspace Qdrant collection isolation
```
 
### VLM OCR Control
 
```dotenv
FORCE_VLM_OCR=false        # true = always use vision model, even for text PDFs
VLM_OCR_DPI=300
VLM_OCR_BATCH_PAGES=1      # Pages per VLM call (increase for faster ingestion if quota allows)
```
 
### Database & Infrastructure
 
```dotenv
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                                    # Leave blank for local Docker instance
QDRANT_UPSERT_BATCH_SIZE=4
 
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_neo4j_password_here
 
POSTGRES_URI=postgresql://omni:YOUR_PASSWORD@localhost:5432/omni_architect
POSTGRES_PASSWORD=YOUR_PASSWORD
POSTGRES_POOL_MIN_SIZE=2
POSTGRES_POOL_MAX_SIZE=10
 
REDIS_URI=redis://localhost:6379/0
```
 
> 🔒 **Security:** Never commit `.env` with real credentials. Use Docker Secrets, HashiCorp Vault, or AWS Secrets Manager in production. The `.gitignore` already excludes `.env`.
 
---
 
## 🗂️ Project Structure
 
```
ATLAS/
│
├── RAG-Anything/               ← Upstream submodule (HKUDS) — used as black box
│   └── raganything/
│       ├── processor.py        # Core document processor
│       ├── parser.py           # Multi-modal parser dispatcher
│       ├── batch.py            # Async batch ingestion manager
│       └── resilience.py       # Upstream retry/backoff primitives
│
├── src/                        ← ATLAS orchestration layer (PRIMARY ENTRY POINT)
│   ├── server.py               # FastAPI app — HTTP transport + lifespan manager
│   ├── orchestrator.py         # HybridRAGPipeline: ingestion ↔ query coordinator
│   ├── colbert_qdrant.py       # ColBERT MaxSim retrieval over Qdrant multivector index
│   ├── model_bridge.py         # Patches RAG-Anything to use the ATLAS LLM router
│   ├── clean.py                # Text normalization (LaTeX, Unicode, whitespace)
│   │
│   ├── domain/                 # Business logic — zero infrastructure dependencies
│   │   ├── models.py           # Document, Chunk, Asset, GraphEntity dataclasses
│   │   └── prompts/            # Markdown prompt templates (one file per task)
│   │       ├── synthesis.md
│   │       ├── entity_extract.md
│   │       ├── hyde_text.md / hyde_math.md / hyde_code.md / hyde_biology.md
│   │       ├── query_router.md
│   │       ├── vision_extract.md
│   │       ├── flashcard_gen.md / exam_gen.md / mindmap_gen.md / summary_gen.md
│   │       └── ...
│   │
│   ├── infrastructure/         # External system adapters (databases, LLMs, patches)
│   │   ├── config_manager.py   # Typed .env loader with validation + math guardrails
│   │   ├── circuit_breaker.py  # Redis-backed Open/Closed/Half-Open state machine
│   │   ├── model_registry.py   # Immutable ModelSpec + TASK_MODEL_CHAINS (single source of truth)
│   │   ├── llm/
│   │   │   ├── router.py       # Task → key → model routing + rate limiting
│   │   │   ├── bridge.py       # Unified LLM call interface (Sovereign + Gemma + fallback)
│   │   │   ├── vllm_client.py  # Async HTTP client for Sovereign Edge Node
│   │   │   ├── vision.py       # Base64 image encoding for VLM calls
│   │   │   ├── embedder.py     # FastEmbed CPU embedding pool with core affinity
│   │   │   └── prompts.py      # Infrastructure-level prompt assembly
│   │   ├── patches/            # Monkey-patches applied at import time
│   │   │   ├── framework_patch.py  # Master patch orchestrator
│   │   │   ├── parsers.py          # Swap Docling into RAG-Anything parser slot
│   │   │   ├── prompts.py          # Redirect prompt calls to domain/ templates
│   │   │   ├── storage.py          # Redirect storage calls to ATLAS repositories
│   │   │   ├── qdrant_patch.py     # ColBERT multivector Qdrant adapter
│   │   │   └── graph_redis_patch.py # Neo4j + Redis graph backend adapter
│   │   └── database/
│   │       ├── connection.py         # Async connection pool (Postgres + Neo4j + Redis)
│   │       └── repositories/
│   │           ├── documents.py      # Tri-DB document ops (Postgres + Qdrant + Neo4j)
│   │           └── assets.py         # Generated asset persistence
│   │
│   └── services/               # Application-layer RAG components
│       ├── hyde.py             # Hypothetical Document Embeddings (domain-aware)
│       ├── semantic_cache.py   # bge-m3 similarity cache over Redis
│       ├── query_decomposer.py # Multi-hop query breakdown
│       ├── reranker.py         # Cross-encoder reranking (bge-reranker-v2-m3)
│       ├── graph_extractor.py  # Neo4j KG population from ingestion output
│       ├── asset_generator.py  # Flashcard, mindmap, exam, summary generation
│       ├── content_tagger.py   # Domain/type classification tagging
│       ├── document_slicer.py  # PDF page-range slicing for VLM batching
│       ├── vision_renderer.py  # Page-to-image DPI-controlled rendering
│       └── fusion/             # Context merging before synthesis
│           ├── engine.py
│           ├── ranking_math.py
│           ├── query_normalizer.py
│           └── prompt_assembler.py
│
├── public/                     # Web UI (HTML + JS served by FastAPI)
│   └── index.html              # Single-page interface for upload, query, and assets
│
├── OCR/
│   ├── inputs/                 # Drop PDFs here for ingestion
│   └── output/                 # Processed output artifacts
│
├── .env.example                # Fully documented environment template (start here)
├── docker-compose.yml          # Infrastructure stack — all 6 services
├── requirements.txt            # Python dependencies
└── boot.sh                     # Convenience launcher (handles LD_LIBRARY_PATH)
```
 
---
 
## 📡 API Reference
 
Interactive docs: **`http://localhost:8000/docs`** (Swagger UI)
 
### Core Endpoints
 
#### `POST /upload`
Upload a document for ingestion.
```bash
curl -X POST http://localhost:8000/upload \
  -F "file=@/path/to/document.pdf"
```
```json
{ "filename": "document.pdf", "path": "/abs/path/to/OCR/inputs/document.pdf" }
```
 
#### `GET /documents`
List all ingested documents grouped by parent file (slices are merged).
```bash
curl http://localhost:8000/documents
```
 
#### `WebSocket /ws`
Real-time query and ingestion via WebSocket (used by the HTML UI).
```javascript
const ws = new WebSocket("ws://localhost:8000/ws");
ws.send(JSON.stringify({ type: "query", query: "What is X?", workspace: "my_project" }));
```
 
#### `POST /assets/generate`
Generate structured educational content from the ingested knowledge base.
```bash
curl -X POST http://localhost:8000/assets/generate \
  -H "Content-Type: application/json" \
  -d '{ "workspace": "my_project", "asset_type": "flashcards", "topic": "Chapter 2 concepts", "count": 20 }'
```
 
Supported `asset_type` values: `flashcards`, `mindmap`, `summary`, `exam`
 
#### `POST /cache/invalidate`
Flush the Redis semantic cache (useful after re-ingesting documents).
```bash
curl -X POST http://localhost:8000/cache/invalidate
```
 
#### `GET /health`
```bash
curl http://localhost:8000/health
```
```json
{ "status": "ok", "initialized": true }
```
 
---
 
## 🔧 How-To Guides
 
### How to add a new model to the fallback chain
 
Open `src/infrastructure/model_registry.py`. Add a `ModelSpec` to `MODELS` and insert the model ID into the relevant `TASK_MODEL_CHAINS` list:
 
```python
MODELS["my-new-model"] = ModelSpec(
    model_id              = "my-new-model",
    rpm_limit             = 20,
    tpm_limit             = 0,
    rpd_limit             = 2000,
    capabilities          = frozenset({Cap.VISION, Cap.JSON_NATIVE}),
    max_output_tokens     = 4096,
    max_extraction_tokens = 4096,
)
 
TASK_MODEL_CHAINS[TaskType.QUERY_SYNTHESIS] = [
    VLLM_SENTINEL,
    "gemma-4-31b-it",
    "my-new-model",       # ← inserted here
    "gemma-4-26b-a4b-it",
    "gemma-3-27b-it",
]
```
 
The Circuit Breaker, rate limiter, and capability checks pick it up automatically. No other changes needed.
 
### How to monitor Circuit Breaker state in real time
 
All state is stored in Redis. Inspect directly:
 
```bash
# List all open breakers
docker exec omni_redis redis-cli --scan --pattern "cb:*"
 
# Check TTL (seconds until a breaker resets)
docker exec omni_redis redis-cli --scan --pattern "cb:*" | \
  xargs -I{} docker exec omni_redis redis-cli TTL {}
 
# Inspect a specific breaker
docker exec omni_redis redis-cli GET "cb:INGEST_VISION:gemma-4-31b-it"
```
 
Keys with TTL near 86400 are daily-quota exhausted. Wait for expiry or add a new API key.
 
### How to tune for your CPU
 
```bash
lscpu | grep "Core(s) per socket"
```
 
Update `.env`:
```dotenv
OMP_NUM_THREADS=<physical_core_count>
MKL_NUM_THREADS=<physical_core_count>
OPENBLAS_NUM_THREADS=<physical_core_count>
FASTEMBED_THREADS=<physical_core_count>
CACHE_CORES=0,1
COLBERT_CORES=2,3
RERANKER_CORES=4,5
```
 
### How to disable SOTA features (reduce API calls)
 
```dotenv
HYDE_ENABLED=false             # Removes 1 LLM call per query
SEMANTIC_CACHE_ENABLED=false   # Always hits retrieval (useful for debugging freshness)
QUERY_DECOMP_ENABLED=false     # Single-shot queries only
RERANKER_ENABLED=false         # Faster, less precise
```
 
### How to reset one Docker volume without losing others
 
```bash
docker compose stop postgres
docker volume rm omni_architect_postgres_data
docker compose up -d postgres
```
 
### How to use ATLAS without the Sovereign Node (pure free-tier)
 
```dotenv
USE_EXTERNAL_GPU=false
```
 
Set this and ATLAS routes all tasks directly to the Gemma cascade on Google AI Studio. The Sovereign Node is bypassed entirely. This is the correct setting while your Kaggle notebook is offline.
 
---
 
## 🧠 Key Technical Decisions
 
### Why four separate API keys instead of one?
 
Google AI Studio enforces quotas **per key**, not per model. A single key shared across all pipeline stages means an ingestion burst (which fires VLM OCR and KG extraction repeatedly) burns the RPM/RPD budget available to query synthesis. Four keys from four separate projects give each pipeline stage an independent quota envelope.
 
### Why ColBERT instead of dense retrieval?
 
Dense embedders compress a full passage into one vector — all token-level signal is lost at embedding time. ColBERT's late-interaction model stores one vector **per token** and computes a MaxSim score across all query-token × passage-token pairs at retrieval time. This retains fine-grained lexical signal critical for scientific text, math, and code. `jina-colbert-v2` achieves this at only 128 dimensions per token — small enough for Qdrant without a GPU.
 
### Why the monkey-patching architecture?
 
RAG-Anything and Docling are excellent at parsing and chunking. Their default backends (OpenAI, LightRAG's storage layer) are not cost-free. Rather than forking them — which would make upstream updates painful — ATLAS applies targeted monkey-patches at `import` time via `src/infrastructure/patches/framework_patch.py`. This means you get upstream bug fixes and improvements from HKUDS and docling-project by simply pulling their latest commit. The patch layer is thin and explicit.
 
### Why `CHUNK_TOKEN_SIZE` is clamped to `EMBEDDING_MAX_TOKENS`?
 
`config_manager.py` applies the guardrail `clamped_chunk_size = min(requested_chunk, embed_max)` before constructing the config object. Without this, a chunk exceeding the embedder's token limit would be silently truncated mid-chunk, producing a malformed embedding vector that poisons retrieval results. The clamp makes the contract explicit and prevents silent data loss.
 
### Why `onnxruntime` (CPU) and not `onnxruntime-gpu`?
 
The GPU wheel of `onnxruntime` ships without the full `CPUExecutionProvider` C++ kernel library. On machines without a CUDA runtime, it either crashes on `libcuda.so` import or silently falls back to a reduced provider missing the `Slice` kernel required by Jina-ColBERT-v2's attention head. The CPU wheel contains the complete kernel set. Replace this only if you configure `CUDAExecutionProvider` with the matching CUDA toolkit + cuDNN.
 
---
 
## 🐛 Troubleshooting
 
### `ONNX Runtime: No such operator Slice`
```bash
pip uninstall onnxruntime-gpu -y && pip install onnxruntime
```
 
### Neo4j container keeps restarting
Neo4j JVM startup takes up to 60 seconds on first boot (APOC plugin load adds extra time).
```bash
docker compose logs neo4j --follow
# Wait for: "Started."
```
If it continues crashing, Docker memory may be too low. Neo4j needs ≥4 GB. Check:
```bash
docker info | grep "Total Memory"
```
 
### All queries return `circuit_open` errors
All models in the task's fallback chain are tripped. Check daily quota TTLs:
```bash
docker exec omni_redis redis-cli --scan --pattern "cb:*" | \
  xargs -I{} sh -c 'echo -n "{}: "; docker exec omni_redis redis-cli TTL {}'
```
Keys with TTL ~86400 are day-quota exhausted. Wait for expiry or rotate in a new API key.
 
### Sovereign Node tunnel returns 524 (Cloudflare timeout)
The vLLM generation exceeded 100 seconds. Solutions:
- Reduce `GEMINI_MAX_OUTPUT_TOKENS` for the vision/graph tasks
- Set `CLOUDFLARE_TUNNEL_TIMEOUT=90.0` (gives 5s margin before Cloudflare drops)
- The Circuit Breaker will reroute to Gemma on the first 524 automatically
### Embeddings slow / server blocks during ingestion
The embedding loop may be blocking the async event loop. Verify `src/orchestrator.py` dispatches embedding calls via `asyncio.to_thread()` or a `ThreadPoolExecutor`. See [open issues](https://github.com/Med-Gh-TN/ATLAS/issues) for the current async embedding fix status.
 
### `psycopg2.OperationalError: could not connect to server`
```bash
docker compose ps postgres   # Must show: (healthy)
```
If healthy, verify `POSTGRES_URI` in `.env` matches the docker-compose `POSTGRES_PASSWORD`.
 
### Server auto-launches browser but UI shows blank page
The `public/index.html` file may be missing. Check:
```bash
ls public/index.html
```
If absent, the server returns a 404. Pull the latest commit or restore from `git checkout public/`.
 
---
 
## 🗺️ Roadmap
 
- [ ] **Async embedding threadpool** — Fully decouple FastEmbed from the event loop for concurrent HTTP requests during ingestion
- [ ] **Distributed transaction rollback** — Atomic tri-database rollback (Postgres + Qdrant + Neo4j) on partial ingestion failure
- [ ] **React Web UI** — Replace the prototype HTML interface with a production React frontend
- [ ] **Streaming responses** — Server-Sent Events for real-time synthesis token streaming
- [ ] **Multi-workspace isolation** — Per-workspace Qdrant collection + Neo4j database routing
- [ ] **GPU execution provider** — Optional CUDA path via `FASTEMBED_PROVIDER=CUDAExecutionProvider`
- [ ] **OpenTelemetry tracing** — Distributed tracing across all pipeline stages
- [ ] **Kaggle bootloader public release** — Open-source the Sovereign Node vLLM notebook
---
 
## 🤝 Contributing
 
Contributions are warmly welcomed. ATLAS is a lean, high-ambition project and every improvement matters.
 
**Before opening a PR**, please read [CONTRIBUTING.md](CONTRIBUTING.md). The short version:
 
1. **Search existing issues** before filing a new one.
2. **Bug fixes:** Open an issue first with logs/stack traces.
3. **New features:** Open a Discussion first to align on design.
4. **Documentation:** PRs welcome without prior issue.
### Development Setup
 
```bash
git clone https://github.com/Med-Gh-TN/ATLAS.git
cd ATLAS
git checkout -b feat/your-feature-name
 
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```
 
### Code Style
 
- **Python:** PEP 8. Use `black` for formatting.
- **Commit messages:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`).
- **Environment variables:** `UPPER_SNAKE_CASE`. Every new variable must be documented in `.env.example` with an inline comment.
- **No hardcoded values.** Everything configurable belongs in `.env`.
---
 
## 🔐 Security
 
If you discover a security vulnerability, **do not open a public issue.** Report it privately via [GitHub Security Advisories](https://github.com/Med-Gh-TN/ATLAS/security/advisories/new). We aim to respond within 48 hours and patch within 7 days for critical vulnerabilities.
 
---
 
## 📚 Acknowledgements
 
ATLAS stands on the shoulders of these outstanding open-source projects:
 
| Project | Role |
|---|---|
| **[RAG-Anything](https://github.com/HKUDS/RAG-Anything)** (HKUDS) | Multi-modal RAG foundation, document processing, graph primitives |
| **[Docling](https://github.com/docling-project/docling)** (IBM) | High-fidelity PDF and document parsing |
| **[Qdrant](https://github.com/qdrant/qdrant)** | Production-grade vector database with ColBERT multivector support |
| **[FastEmbed](https://github.com/qdrant/fastembed)** (Qdrant) | Lightweight, CPU-optimized ONNX embedding execution |
| **[Jina ColBERT v2](https://huggingface.co/jinaai/jina-colbert-v2)** (Jina AI) | SOTA late-interaction multilingual embedder at 128 dimensions |
| **[BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)** | Multilingual dense embedder for semantic cache matching |
| **[BAAI/bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3)** | Cross-encoder reranker for precision retrieval |
| **[vLLM](https://github.com/vllm-project/vllm)** | High-throughput LLM serving for the Sovereign GPU Node |
| **[Qwen3-VL](https://huggingface.co/Qwen/Qwen3-VL-72B-Instruct-AWQ)** (Alibaba/Qwen) | Primary multimodal VLM for OCR and KG extraction |
 
---
 
## 📄 License
 
MIT © 2025 [Med-Gh-TN](https://github.com/Med-Gh-TN)
 
See [LICENSE](LICENSE) for the full text.
 
---
 
<div align="center">
**If ATLAS cuts your GPU costs or API spend — give it a ⭐**
 
*Engineered in Tunisia. Runs anywhere.*
 
</div>

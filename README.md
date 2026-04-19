<div align="center">

[![Contributors](https://img.shields.io/github/contributors/Med-Gh-TN/ATLAS.svg?style=for-the-badge)](https://github.com/Med-Gh-TN/ATLAS/graphs/contributors)
[![Forks](https://img.shields.io/github/forks/Med-Gh-TN/ATLAS.svg?style=for-the-badge)](https://github.com/Med-Gh-TN/ATLAS/network/members)
[![Stargazers](https://img.shields.io/github/stars/Med-Gh-TN/ATLAS.svg?style=for-the-badge)](https://github.com/Med-Gh-TN/ATLAS/stargazers)
[![Issues](https://img.shields.io/github/issues/Med-Gh-TN/ATLAS.svg?style=for-the-badge)](https://github.com/Med-Gh-TN/ATLAS/issues)
[![MIT License](https://img.shields.io/github/license/Med-Gh-TN/ATLAS.svg?style=for-the-badge)](https://github.com/Med-Gh-TN/ATLAS/blob/master/LICENSE.txt)

</div>

<br />
<div align="center">
  <a href="https://github.com/Med-Gh-TN/ATLAS">
    <img src="https://raw.githubusercontent.com/othneildrew/Best-README-Template/master/images/logo.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">ATLAS: Cost-Optimized OCR & RAG Pipeline</h3>

  <p align="center">
    A highly modular, free-tier-engineered Retrieval-Augmented Generation system. Built on RAG-Anything, patched for zero-cost embeddings and rigorous rate-limit management.
    <br />
    <a href="https://github.com/Med-Gh-TN/ATLAS/tree/OCR-UPDATED"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="#usage--integration">View Demo</a>
    ·
    <a href="https://github.com/Med-Gh-TN/ATLAS/issues">Report Bug</a>
    ·
    <a href="https://github.com/Med-Gh-TN/ATLAS/issues">Request Feature</a>
  </p>
</div>

---

## 📖 About The Project

ATLAS is a production-grade OCR and Retrieval-Augmented Generation (RAG) pipeline designed for environments with aggressive API rate limits and strict infrastructure cost boundaries. 

Forked from the foundational [RAG-Anything](https://github.com/HKUDS/RAG-Anything) framework, ATLAS operates via a "black-box" abstraction layer (`src/`). It heavily overrides the upstream repository's logic via runtime monkey-patching, decoupling expensive external vectorization and parsing services in favor of localized, free-tier-optimized alternatives (Docling, Jina-ColBERT, Qdrant via Docker, and strict Gemini AI Studio integration).

### The Engineering Philosophy: Rate Limit Optimization

Running multi-modal LLMs on free tiers typically results in `429 Too Many Requests`. ATLAS circumvents this through mathematical rate-limit engineering based on the Google AI Studio free tier:
* **Zero-Cost Embeddings:** Offloads vectorization entirely to a local `jinaai/jina-colbert-v2` instance via FastEmbed.
* **Vector Storage:** Persisted locally via a decoupled Qdrant Docker container.
* **Deterministic Chunking:** Documents are tokenized into 1,500-token chunks (with 200-token overlaps) to ensure a standard 20-page document requires ≤ 16 extraction calls, remaining well under the 500 RPD (Requests Per Day) hard limit.
* **Adaptive Multi-Modal OCR:** Uses `Docling` for structured text. Implements an automatic failover (`FORCE_VLM_OCR`) that rasterizes unparseable or handwritten pages to 150 DPI JPEGs for semantic extraction via Gemini Vision.

---

## ⚙️ Core Architecture & Codebase Reference (`src/`)

The core of ATLAS is isolated in the `src/` directory, acting as the primary orchestrator wrapping the underlying RAG-Anything processes. Every module serves a specific micro-task in the data pipeline.

### Root Orchestration
* **`src/orchestrator.py`**
  The central nervous system. Manages the Directed Acyclic Graph (DAG) of the RAG lifecycle. It coordinates asynchronous document ingestion, routes files to the appropriate OCR or VLM worker based on metadata constraints, triggers the embedding phase, and exposes the execution interface for query resolution.
* **`src/server.py`**
  The entry point for external integration. Implements an asynchronous FastAPI/Uvicorn HTTP server exposing the internal state machine. Mounts static files for the generic HTML testing interface and handles multipart data ingestion.
* **`src/test.py`**
  CLI-driven integration and unit tests. Executes dry-runs of the chunking and embedding pipelines to validate token counts and verify Qdrant connectivity before burning LLM rate-limit quotas.

### Data & Model Layers
* **`src/model_bridge.py`**
  The interface adapter for LLM inference. Specifically engineered for the `gemini-3.1-flash-lite-preview` API. It enforces hard concurrency locks (`MAX_ASYNC_CALLS=1`), exponential backoff, and tracks the `RPD` (Requests Per Day) state to prevent 429 timeouts. Includes the failover bridge for OpenRouter usage.
* **`src/colbert_qdrant.py`**
  The vectorization and persistence engine. Initializes local `jina-colbert-v2` embeddings (128d). Manages payload indices and batch upserts into the local Qdrant instance. Optimizes transmission by grouping chunk vectors into size `32` batches, maximizing throughput while preventing container memory overloads.
* **`src/pdf_worker.py`**
  The multi-modal ingestion gateway. Invokes `docling` for standard text extraction and layout bounding boxes. Implements the image rendering logic (calculating byte-size/token ratios at 150 DPI) for the Gemini Vision fallback pipeline (`FORCE_VLM_OCR` mode).

### Services Subsystem (`src/services/`)
* **`src/services/content_tagger.py`**
  Responsible for metadata extraction. Executes lightweight NLP heuristic passes and single-shot LLM queries against incoming chunks to generate relational tags, identifying entities (people, tools, concepts) necessary for the semantic relation graphs.
* **`src/services/fusion_engine.py`**
  The final stage of the RAG pipeline. Handles semantic search aggregation. Fuses top-k chunks retrieved via ColBERT dense-vector queries with BM25 sparse queries, injects them into standard context windows, and manages the LLM context to prevent prompt overflow during answer synthesis.

### Infrastructure & Domain (`src/infrastructure/` & `src/domain/`)
* **`src/infrastructure/patches.py`**
  The core of the "monkey-patching" philosophy. This module dynamically rewrites the behavior of the upstream `raganything` package at runtime. It intercepts internal embedding calls to redirect them to `src/colbert_qdrant.py` and overwrites the upstream framework's native rate-limiter with ATLAS's strictly synchronous Google AI Studio handler.
* **`src/domain/models.py`**
  The strict schema definitions. Uses `Pydantic` dataclasses to define the typing interfaces for HTTP payloads, internal chunk states, Qdrant vectors, and extraction metrics. Ensures data consistency across all pipeline modules.



## 🚀 Getting Started

### Prerequisites

* **Docker & Docker Compose** (Required for Qdrant)
* **Python 3.10+** * **Google AI Studio API Key** (Free Tier is sufficient)

### Installation

1. **Clone the repository**
   ```sh
   git clone [https://github.com/Med-Gh-TN/ATLAS.git](https://github.com/Med-Gh-TN/ATLAS.git)
   cd ATLAS
   git checkout OCR-UPDATED
````

2.  **Initialize Vector Storage**

    ```sh
    docker-compose up -d
    ```

3.  **Install Dependencies**

    ```sh
    pip install -r OCR/requirements.txt
    ```

4.  **Environment Configuration**
    Create a `.env` file in the project root. (Refer to `.env.example` for tuning chunk limits and overlap parameters).

    ```env
    # LLM Configuration
    GEMINI_API_KEY="your_api_key_here"
    GEMINI_MODEL_NAME="gemini-3.1-flash-lite-preview"

    # Storage Configuration
    QDRANT_URL="http://localhost:6333"

    # Local Embedder
    EMBEDDER_MODEL_NAME="jinaai/jina-colbert-v2"
    EMBEDDING_DIMENSION=128
    ```



## 💻 Usage & Integration

The ATLAS system is designed to run asynchronously alongside your primary application stack.

### Interface Testing

To validate your setup, ATLAS provides a built-in sandbox UI:

1.  Boot the server: `python src/server.py`
2.  Navigate to `http://localhost:8000/index.html` (served from `public/`).
3.  Upload target PDFs into the `OCR/inputs/` directory via the UI and execute a test query.

### Backend Integration

Integrate ATLAS directly into your existing Python microservices using the `SystemOrchestrator`:

```python
from src.orchestrator import SystemOrchestrator

# Initialize the pipeline (automatically applies patches & connects to Qdrant)
rag_pipeline = SystemOrchestrator()

# Ingest and vector-map a document asynchronously
await rag_pipeline.ingest_document("OCR/inputs/architecture_spec.pdf")

# Execute a multi-vector query against the fused context
response = await rag_pipeline.query(
    question="Analyze the latency bottlenecks mentioned in the spec.",
    top_k=5
)

print(response.content)
```



## 🛣️ Roadmap

  - [x] Integrate Docling for robust PDF chunking and layout parsing.
  - [x] Runtime monkey-patching of RAG-Anything for local Jina-ColBERT embeddings.
  - [x] Strict concurrency lock (`MAX_ASYNC_CALLS=1`) for 15 RPM AI Studio constraints.
  - [ ] Implement Redis-based job queues for handling large directory batch ingestion.
  - [ ] Add explicit semantic graph visualization output to the frontend UI.
  - [ ] Expand `model_bridge.py` load balancing to support rotating multiple free-tier keys.

See the [open issues](https://www.google.com/url?sa=E&source=gmail&q=https://github.com/Med-Gh-TN/ATLAS/issues) for a full list of proposed features and known constraints.

-----

## 🤝 Contributing

Contributions are actively welcomed. The primary focus is currently on decreasing ingestion token-overhead and optimizing the chunk overlap logic.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/Optimization`)
3.  Commit your Changes (`git commit -m 'feat: optimize Qdrant upsert batch sizes'`)
4.  Push to the Branch (`git push origin feature/Optimization`)
5.  Open a Pull Request

-----

## 📜 Acknowledgments

  * **Mouhamed Gharsallah** ([@Med-Gh-TN](https://www.google.com/search?q=https://github.com/Med-Gh-TN)) & **Tony Charmant Egerimana** ([@etonyCh](https://www.google.com/search?q=https://github.com/etonyCh)) - Core Maintainers.
  * [HKUDS/RAG-Anything](https://github.com/HKUDS/RAG-Anything) for the foundational architecture.
  * [Docling](https://github.com/docling-project/docling) for robust PDF serialization.
  * [Othneil Drew's Best-README-Template](https://github.com/othneildrew/Best-README-Template) & [Richard Littauer's Standard Readme](https://github.com/RichardLitt/standard-readme) for the documentation structural models.



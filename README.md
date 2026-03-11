# ATLAS - Implementation & Deployment Guide

## SOTA Technical Documentation for Academic Knowledge-Sharing Systems

This document provides a comprehensive, reproducible workflow for deploying and validating the **ATLAS** platform. ATLAS is a high-performance academic knowledge-sharing system designed to enable students and teachers to securely upload, moderate, and search educational resources using hybrid AI-powered retrieval.

---

### 1. System Architecture

The system utilizes a decoupled, event-driven architecture designed for high-concurrency academic workloads.

* 
**Core API:** FastAPI (Asynchronous Python) serving as the orchestration layer.


* 
**Asynchronous Pipeline:** Celery with Redis broker for heavy OCR and vector embedding tasks.


* 
**Persistence Layer:** PostgreSQL with `pgvector` for relational data and 768-dimensional semantic embeddings.


* 
**Object Storage:** MinIO (S3-compatible) for distributed document persistence.


* 
**Client Interface:** Next.js (React) utilizing TanStack Query for state synchronization.



---

### 2. Prerequisites

Ensure the following are installed on your host machine:

* **Docker Desktop:** v4.x+ (including Docker Compose).
* **Python:** v3.11 (strictly required for `paddleocr` and `paddlepaddle` compatibility).
* **Node.js:** v18.x or v20.x (LTS).

---

### 3. Infrastructure Deployment

ATLAS relies on a containerized service layer managed via Docker.

1. Navigate to the project root containing `docker-compose.yml`.
2. Execute the orchestration command:
```bash
docker compose up -d

```


*This initializes PostgreSQL (Port 5433), MinIO (Ports 9000/9001), and Redis (Port 6379).*

---

### 4. Backend Service Initialization

1. **Environment Setup:**
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
pip install -r requirements.txt

```


2. **Database Genesis:**
ATLAS uses `SQLModel` to automatically generate the schema upon startup. Start the API:


```bash
uvicorn app.main:app --reload

```


Wait for "Application startup complete". This automatically triggers `init_db` and creates the vector-enabled tables.


3. **Migration Synchronization:**
Sync the Alembic state to the current head:
```bash
alembic stamp head

```



---

### 5. Asynchronous AI Pipeline (Celery)

The background worker handles OCR extraction and vectorization. Open a new terminal:

```bash
cd backend
.\venv\Scripts\activate
celery -A app.core.celery_app worker --loglevel=info --pool=solo

```

*Note: The `--pool=solo` flag is mandatory for stable execution on Windows environments.*

---

### 6. Frontend Deployment

1. Navigate to the client directory:
```bash
cd frontend
npm install

```


2. Launch the development server:
```bash
npm run dev

```


*The interface is now accessible at: http://localhost:3000*.

---

### 7. Validation & Testing Flow

Follow this sequence to verify the "SOTA" system integrity:

* 
**Step 1: User Registration:** Navigate to `/auth/register` and create a student account.


* 
**Step 2: Verification Bypass (Dev Mode):** By default, the system requires email verification via Resend. For local testing, comment out the `is_verified` check in `backend/app/api/v1/endpoints/auth.py` to allow immediate login.


* 
**Step 3: Document Contribution:** Upload a PDF through the `/upload` dashboard.


* **Step 4: Pipeline Monitoring:** Check the Celery terminal. You should see `process_document_ocr` and `embed_document` tasks executing as the system extracts text and generates embeddings.


* **Step 5: Hybrid Search:** Once the document status is `READY`, perform a query in the search bar. The system will use Reciprocal Rank Fusion (RRF) to combine semantic and lexical results.



---

### Architect's Notes

* **Database Reset:** If you encounter schema conflicts, run `docker compose down -v` to wipe the volumes and start fresh.
* 
**MinIO:** Access the MinIO dashboard at `http://localhost:9001` (User: `minio_admin`, Pass: `minio_password`) to view stored files.

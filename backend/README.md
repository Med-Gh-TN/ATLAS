
# ATLAS Backend API (Sprints 1–2, Strict)

This is the backend for the ATLAS platform, built with **FastAPI**, **SQLModel**, **PostgreSQL + pgvector**, **Redis**, **Celery**, and **MinIO**.

## Features Implemented (Strict Roadmap)
- **Auth (JWT + OTP)**:
  - Register creates an unverified account and sends an OTP email.
  - Login is blocked until email verification is completed.
  - Rate limiting (register/login/OTP).
- **Teacher onboarding (CSV import)**:
  - Admin imports teachers from CSV and sends an OTP invite.
- **Upload + Versioning**:
  - Upload to MinIO (S3-compatible).
  - SHA-256 duplicate detection.
  - DocumentVersion history endpoints.
- **OCR + Embeddings (Async pipeline)**:
  - PaddleOCR task extracts text.
  - Chunked multilingual embeddings with LangChain splitter.
  - Storage in pgvector (768 dims) per chunk.
- **Hybrid Search (RRF)**:
  - Reciprocal Rank Fusion between pgvector semantic search and Postgres full-text.
- **Moderation + XP**:
  - Approve/reject endpoints.
  - Approval credits +50 XP to the uploader.
- **Migrations-first**:
  - Alembic is the source of truth for schema changes (no create_all at startup).

## Prerequisites
- Docker & Docker Compose
- Python 3.10+ (recommended: 3.12)
- Node.js only for the frontend (not required here)

## Getting Started

### 1. Start Infrastructure
Run the following command in the root directory to start Postgres, MinIO, and Redis:
```bash
docker-compose up -d
```

### 2. Install Dependencies (Windows PowerShell)
```bash
cd backend
python -m venv $env:TEMP\artlas_venv
& "$env:TEMP\artlas_venv\Scripts\python.exe" -m pip install -r requirements.txt
```

### 3. Apply Database Migrations (Alembic)
```bash
cd backend
& "$env:TEMP\artlas_venv\Scripts\python.exe" -m alembic upgrade head
```

### 4. Run the API
```bash
& "$env:TEMP\artlas_venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 5. Run Celery Worker
Open a new terminal and run:
```bash
cd backend
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK="True"; & "$env:TEMP\artlas_venv\Scripts\python.exe" run_celery.py -A app.core.celery_app worker --loglevel=info
```
The API will be available at [http://localhost:8000](http://localhost:8000).
Interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs).

## Configuration (Strict Mode)
Environment variables are managed in [config.py](file:///c:/Users/egeri/OneDrive/Desktop/ARTLAS_PROJECT/backend/app/core/config.py).

Default credentials:
- **DB**: `atlas_user` / `atlas_password`
- **MinIO**: `minio_admin` / `minio_password`

Recommended env vars:
- `SECRET_KEY` (do not keep the default in production)
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (OTP emails)
- `POSTGRES_SERVER`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (if not using defaults)

## Key Endpoints (Sprints 1–2)
- **Auth**
  - POST `/api/v1/auth/register`
  - POST `/api/v1/auth/request-otp`
  - POST `/api/v1/auth/verify-otp`
  - POST `/api/v1/auth/login` (blocked until verified)
  - GET `/api/v1/auth/me`
- **Admin**
  - POST `/api/v1/admin/import-teachers` (CSV)
- **Upload + Versioning**
  - POST `/api/v1/contributions/contributions` (upload)
  - GET `/api/v1/contributions/contributions?skip=0&limit=100` (simple list)
  - GET `/api/v1/contributions/query?limit=20&offset=0&status=APPROVED&sort_by=created_at&order=desc` (meta pagination)
  - GET `/api/v1/contributions/{id}`
  - GET `/api/v1/contributions/{id}/versions`
  - GET `/api/v1/contributions/version/{version_id}`
- **Moderation**
  - POST `/api/v1/contributions/{id}/approve` (+50 XP)
  - POST `/api/v1/contributions/{id}/reject`
- **Search**
  - GET `/api/v1/search?query=...&top_k=10` (hybrid RRF)
  - GET `/api/v1/search/text?q=...&limit=20&offset=0` (fallback)

## Rate Limiting
- Register: 5 req/min
- Login: 10 req/min
- Upload: 20 req/min
- OTP request: 3 req/hour

## Pipeline Status (OCR → Embedding)
Document versions progress through:
- QUEUED
- OCR_PROCESSING
- EMBEDDING
- READY / FAILED

## Project Structure
```
backend/
├── alembic/                  # Alembic migrations (schema source of truth)
├── app/
│   ├── api/v1/endpoints/   # Route handlers (Auth, Upload)
│   ├── core/               # Config & Security
│   ├── db/                 # Database session & Init
│   ├── models/             # SQLModel Database Tables
│   ├── services/           # External services (MinIO)
│   └── main.py             # App entrypoint
├── Dockerfile
└── requirements.txt
```

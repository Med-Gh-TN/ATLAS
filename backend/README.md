
# ATLAS Backend API (Sprint 1)

This is the backend for the ATLAS platform, built with **FastAPI**, **SQLModel**, and **PostgreSQL**.

## Features Implemented (Sprint 1)
- **Authentication**: JWT-based login, registration (Student/Teacher/Admin roles).
- **Upload Pipeline**:
  - Secure file upload to MinIO (S3-compatible).
  - SHA-256 duplicate detection (US-05).
  - Metadata extraction.
- **Database**: Async PostgreSQL with SQLModel/SQLAlchemy.

## Prerequisites
- Docker & Docker Compose
- Python 3.10+

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

### 3. Run the API
```bash
& "$env:TEMP\artlas_venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 4. Run Celery Worker
Open a new terminal and run:
```bash
cd backend
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK="True"; & "$env:TEMP\artlas_venv\Scripts\python.exe" run_celery.py -A app.core.celery_app worker --loglevel=info
```
The API will be available at [http://localhost:8000](http://localhost:8000).
Interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs).

## Alembic Migrations
```bash
cd backend
& "$env:TEMP\artlas_venv\Scripts\python.exe" -m alembic upgrade head
```

## Key Endpoints (Sprint 2)
- Search:
  - GET `/api/v1/search?query=...&top_k=10` (sémantique)
  - GET `/api/v1/search/text?q=...&limit=20&offset=0` (fallback plein‑texte)
- Moderation:
  - POST `/api/v1/contributions/{id}/approve`
  - POST `/api/v1/contributions/{id}/reject`
- Versions & Listing:
  - GET `/api/v1/contributions/{id}`
  - GET `/api/v1/contributions/{id}/versions`
  - GET `/api/v1/version/{version_id}`
  - GET `/api/v1/contributions/query?limit=20&offset=0&status=APPROVED&sort_by=created_at&order=desc`

## Rate Limiting
- Register: 5 req/min
- Login: 10 req/min
- Upload: 20 req/min

## Configuration
Environment variables are managed in `app/core/config.py`.
Default credentials:
- **DB**: `atlas_user` / `atlas_password`
- **MinIO**: `minio_admin` / `minio_password`

## Project Structure
```
backend/
├── app/
│   ├── api/v1/endpoints/   # Route handlers (Auth, Upload)
│   ├── core/               # Config & Security
│   ├── db/                 # Database session & Init
│   ├── models/             # SQLModel Database Tables
│   ├── services/           # External services (MinIO)
│   └── main.py             # App entrypoint
└── requirements.txt
```


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

### 2. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 3. Run the API
```bash
uvicorn app.main:app --reload
```

### 4. Run Celery Worker
Open a new terminal and run:
```bash
cd backend
celery -A app.core.celery_app worker --loglevel=info
```
The API will be available at [http://localhost:8000](http://localhost:8000).
Interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs).

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

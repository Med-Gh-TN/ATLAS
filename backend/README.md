# ATLAS Platform - Backend Microservice

> **⚠️ ARCHITECTURAL DIRECTIVE:** > Do not document Docker infrastructure, Redis, MinIO, or global environment variables here. 
> The absolute source of truth for the project setup is located at the root level: `../README.md`.

This directory contains the FastAPI application, Alembic migrations, and Celery worker definitions.

## 🛠️ Quick Reference Commands

Assuming your virtual environment (`venv`) is activated and your Docker stack is running (see root README):

### 1. API Server
Start the local FastAPI development server with hot-reloading:
```bash
uvicorn app.main:app --reload --port 8000

```

* Interactive API Documentation (Swagger): `http://localhost:8000/docs`
* ReDoc: `http://localhost:8000/redoc`

### 2. Database Migrations (Alembic)

Generate a new migration script after altering `models/`:

```bash
alembic revision --autogenerate -m "description_of_change"

```

Apply pending migrations to the database:

```bash
alembic upgrade head

```

### 3. Background Workers (Celery)

Start the worker pool (Windows requires the `solo` pool execution):

```bash
python run_celery.py worker --loglevel=info -P solo -b redis://localhost:6379/0

```

### 4. Testing

Run the pytest suite (ensure test database is configured):

```bash
pytest tests/ -v

```

---

*For environment variables (`.env`), role-based access control (RBAC), and deployment sequences, refer exclusively to the root documentation.*


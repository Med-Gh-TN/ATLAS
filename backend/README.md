# ⚙️ ATLAS Backend Core

![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)
![Celery](https://img.shields.io/badge/Celery-Distributed_Task_Queue-37814A?logo=celery)

> The high-performance neural engine powering the ATLAS Academic Knowledge Base. Built with FastAPI and Python 3.10+, this service orchestrates semantic search, secure document storage, background processing, and role-based access control.

---

## 🏛️ System Architecture & Stack

The backend is designed for high concurrency, utilizing asynchronous Python (`asyncio`) and a decoupled worker architecture for heavy computational tasks.

* **API Framework:** FastAPI (RESTful, OpenAPI 3.1 compliant).
* **ORM & Database:** SQLAlchemy 2.0 mapping to PostgreSQL 16. Utilizes the `pgvector` extension for storing and querying AI embeddings.
* **Task Broker & Cache:** Redis 7 handles both standard API caching (e.g., dashboard telemetry) and Celery message brokering.
* **Background Workers:** Celery orchestrates heavy workloads: OCR processing, LLM/RAG embedding generation, and dispatching transactional emails.
* **Object Storage:** MinIO (S3-compatible) with SSE-KMS encryption for immutable document storage.
* **Security:** Asynchronous ClamAV integration scans all incoming multipart uploads before they are persisted.

---

## 🚀 Local Development Setup

Ensure your Docker infrastructure is running (`docker-compose up -d`) before initializing the backend environment.

### 1. Environment Initialization
Navigate to the backend directory and establish an isolated Python virtual environment.

```bash
cd backend

# Create the virtual environment
python -m venv venv

# Activate the environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate
````

### 2\. Install Dependencies

Install the required Python packages. *(Note: Ensure your C++ build tools are up to date if you encounter issues compiling scientific libraries like `numpy` or `psycopg2`).*

```bash
pip install -r requirements.txt
```

### 3\. Configuration & Secrets

Copy the environment template. The default values are pre-configured to bind seamlessly to your local Docker compose stack.

```bash
cp .env.example .env
```

### 4\. Database Migrations (Alembic)

Ensure the PostgreSQL schema is completely up to date with the latest SQLAlchemy models.

```bash
alembic upgrade head
```

### 5\. Boot the API Server

Start the FastAPI application with `uvicorn`. The `--reload` flag enables hot-reloading for local development.

```bash
uvicorn app.main:app --reload --port 8000
```

*The API is now strictly listening on `http://localhost:8000`. You can view the interactive Swagger/OpenAPI documentation at `http://localhost:8000/docs`.*

-----

## ⚙️ Background Workers (Celery)

Features like PDF extraction, RAG generation, and virus scanning will fail silently if the Celery worker is not active.

Open a **new terminal window**, navigate to the `backend/` directory, activate your `venv`, and boot the worker:

**Windows Command:**
*(Windows requires the `-P solo` execution pool to prevent OS-level process fork crashing).*

```bash
python run_celery.py -A app.core.celery_app -b redis://localhost:6379/0 worker --loglevel=info -P solo
```

**macOS/Linux Command:**

```bash
celery -A app.core.celery_app worker --loglevel=info
```

-----

## 🛡️ Admin Account Escalation (God Mode)

For security reasons, `ADMIN` roles cannot be provisioned via the REST API. To test admin-only endpoints, you must manually elevate a standard account directly in the database.

1.  Register a standard user via the Frontend UI.
2.  Inject into the running PostgreSQL Docker container:
    ```bash
    docker-compose exec db psql -U atlas_user -d atlas_db
    ```
3.  Execute the role elevation mutation:
    ```sql
    UPDATE "user" SET role = 'ADMIN' WHERE email = 'your_email@example.com';
    ```
    *(Wait for the `UPDATE 1` confirmation).*
4.  Disconnect (`\q`), then log out and back into the frontend to secure your elevated JWT payload.

-----

## 📂 Backend Directory Structure

```text
backend/
├── alembic/               # Database migration scripts and environment
├── app/
│   ├── api/               # FastAPI routing and endpoint definitions (v1)
│   ├── core/              # Global configs, security, and Celery app instantiation
│   ├── db/                # SQLAlchemy session makers and engine configurations
│   ├── models/            # SQLModel/SQLAlchemy database schemas
│   ├── services/          # Business logic (AI inference, OCR, Auth, Analytics)
│   └── main.py            # FastAPI application entry point
├── tests/                 # PyTest suite (Unit and Integration tests)
├── alembic.ini            # Alembic configuration
├── requirements.txt       # Strict dependency lockfile
└── run_celery.py          # Custom Celery bootstrapper
```


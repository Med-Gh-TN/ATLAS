# ATLAS Academic Knowledge Base

> **Peer-Reviewed & Faculty Verified**
> The ultimate source of truth for your academic journey. ATLAS is a premium, moderated knowledge engine. Bypass the noise and instantly access high-quality, verified course materials powered by state-of-the-art neural search.

## 📌 Platform Overview

Traditional learning platforms are dumping grounds for unverified, duplicate files. ATLAS actively moderates, ranks, and structures academic documents using advanced neural networks so you only study what matters.

### Core Features
* **Peer-Reviewed Precision:** Stringent moderation pipeline. Teachers and top-tier students verify accuracy.
* **Neural Semantic Search:** Hybrid search engine (Meilisearch + pgvector) understands context, locating exact paragraphs within hundreds of PDFs.
* **Version Control for Knowledge:** Strict version history of every document.
* **Zero-Latency Delivery:** High-performance architecture serving documents in milliseconds.
* **Enterprise Security:** Industry-standard encryption, ClamAV antivirus scanning on upload, and strict access controls.

---

## 🏗️ System Architecture

ATLAS operates on a modern, decoupled microservices architecture:

* **Frontend:** Next.js 14 (React), TailwindCSS, TypeScript.
* **Backend:** FastAPI (Python 3.10+), SQLAlchemy 2.0.
* **Database:** PostgreSQL 16 with `pgvector` extension (Port: 5433).
* **Caching & Broker:** Redis 7 (Port: 6379).
* **Object Storage:** MinIO (S3-Compatible, Port: 9000/9001) with SSE-KMS encryption.
* **Search Engine:** Meilisearch v1.6 (Port: 7700).
* **Security:** ClamAV for asynchronous document virus scanning (Port: 3310).
* **Asynchronous Workers:** Celery.

---

## 🚀 Local Development Setup (Windows / Cross-Platform)

Follow this exact sequence to achieve a stable local environment. 

### Phase 1: Infrastructure Deployment
You must have Docker and Docker Compose installed.

1.  Spin up the infrastructure stack:
    ```bash
    docker-compose up -d
    ```
    *(Note: If you receive a warning that the `version` attribute in `docker-compose.yml` is obsolete, it is safe to ignore, or you may remove `version: "3.9"` from the top of the file).*

2.  Verify all containers are healthy (`db`, `minio`, `clamav`, `redis`, `meilisearch`):
    ```bash
    docker-compose ps
    ```

### Phase 2: Backend Configuration
1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create and activate a virtual environment:
    ```bash
    python -m venv venv
    venv\Scripts\activate  # Windows
    # source venv/bin/activate  # macOS/Linux
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Environment Variables:
    Copy the sample environment file and adjust if necessary (defaults work with the Docker stack).
    ```bash
    cp .env.example .env
    ```
5.  Run Database Migrations:
    ```bash
    alembic upgrade head
    ```
6.  Start the FastAPI server:
    ```bash
    uvicorn app.main:app --reload --port 8000
    ```

### Phase 3: Background Workers (Celery)
ATLAS relies on background workers for tasks like OCR, embedding generation, and email dispatch. 
Open a **new terminal window**, activate your virtual environment, and run:

**Windows Command:** *(Uses the `solo` pool to prevent Windows-specific fork errors)*
```bash
cd backend
venv\Scripts\activate
python run_celery.py -A app.core.celery_app -b redis://localhost:6379/0 worker --loglevel=info -P solo
```

### Phase 4: Frontend Configuration

Open a **new terminal window**.

1. Navigate to the frontend directory:
```bash
cd frontend

```


2. Install dependencies:
```bash
npm install

```


3. Start the Next.js development server:
```bash
npm run dev

```


The application will be available at `http://localhost:3000`.

---

## 🛡️ Role-Based Access Control (RBAC) & Admin Escalation

ATLAS utilizes a strict 3-tier authorization matrix.

### Roles & User Stories

1. **STUDENT (Default):**
* *Access:* Can search, read verified documents, interact with the RAG chat, take quizzes, and submit documents for review.
* *Restriction:* Uploads are hidden from global search until moderated.


2. **TEACHER / MODERATOR:**
* *Access:* Inherits Student permissions. Can access the Moderation Dashboard to approve, reject, or flag pending document uploads.


3. **ADMIN:**
* *Access:* God-mode. Can assign roles to other users, access system configuration, manage all users, and force-delete content.



### How to Create an Admin Account (Windows / Local)

Because Admin creation via the API is disabled for security reasons, the first Admin must be promoted directly in the database.

1. Register a standard user account via the Frontend UI (`http://localhost:3000/auth/register`).
2. Open your terminal and execute a `psql` session inside the running Postgres container:
```bash
docker-compose exec db psql -U atlas_user -d atlas_db

```


3. Execute the following SQL command to elevate your user (replace with your registered email):
```sql
UPDATE "user" SET role = 'ADMIN' WHERE email = 'your_email@example.com';

```


*You should see `UPDATE 1` confirming the change.*
4. Exit the database:
```sql
\q

```


5. Log out and log back in on the frontend to receive your new Admin JWT token.

---

## 📜 License & Integrity

© 2026 ATLAS Academic Knowledge Base. Built for CS Students. All rights reserved. Strict moderation policies ensure all materials are legitimate and officially approved.



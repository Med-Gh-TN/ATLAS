# ATLAS Platform - Complete Documentation

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [User Types & Permissions](#4-user-types--permissions)
5. [API Endpoints Reference](#5-api-endpoints-reference)
6. [Installation Guide](#6-installation-guide)
7. [Usage Instructions](#7-usage-instructions)
8. [Security Considerations](#8-security-considerations)
9. [Maintenance Procedures](#9-maintenance-procedures)

---

## 1. Introduction

ATLAS is an educational platform designed to facilitate document sharing, study tools, AI-powered learning assistance, and gamification for students and educators. The platform implements a modular monolith architecture with domain-driven design principles, providing a robust foundation for scalable educational technology.

### 1.1 Platform Overview

ATLAS serves as a comprehensive educational ecosystem supporting:

- **Document Management**: Upload, process, and share educational materials
- **Study Tools**: Flashcards, quizzes, mind maps, and AI-generated summaries
- **AI Assistance**: RAG-based AI chat, content generation, and learning recommendations
- **Gamification**: XP system, badges, leaderboards, and streaks
- **Collaboration**: Real-time annotations, forum discussions, and study groups

---

## 2. System Architecture

### 2.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js 14)                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Student │  │ Teacher │  │  Admin  │  │SuperAdmin│  │  Guest  │         │
│  │   UI    │  │   UI    │  │   UI    │  │   UI    │  │   UI    │         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS/WSS
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FASTAPI BACKEND (Python 3.14)                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        API ROUTERS (v1)                               │  │
│  │  auth | contributions | search | moderation | admin | rag | study     │  │
│  │  notifications | gamification | dashboard | annotations | files | ai │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      BUSINESS LOGIC LAYER                            │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │     IAM     │ │Communications│ │Study Engine │ │Intelligence │     │  │
│  │  │ (Auth/OTP)  │ │(Email/Notif) │ │(Flashcards) │ │(Recommendations)│   │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         DATA ACCESS LAYER                            │  │
│  │                   SQLModel + Async PostgreSQL                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────┬───────────────┼───────────────┬─────────────┐
        ▼             ▼               ▼               ▼             ▼
   ┌─────────┐  ┌─────────┐   ┌─────────┐    ┌─────────┐    ┌─────────┐
   │PostgreSQL│  │  Redis  │   │ MinIO   │    │MeiliSearch│   │  ClamAV │
   │(pgvector)│  │         │   │(S3)     │    │           │    │(Antivirus)│
   └─────────┘  └─────────┘   └─────────┘    └─────────┘    └─────────┘
```

### 2.2 Component Interactions

#### Authentication Flow

```
User → Login Request → Auth Service → Validate Credentials
                                      ↓
                              JWT Token Generation (Access + Refresh)
                                      ↓
                              Store Session in Redis
                                      ↓
                              Return Tokens to Client
```

#### Document Upload Flow

```
User → Upload File → File Service → Virus Scan (ClamAV)
                                   ↓
                            Store in MinIO (S3)
                                   ↓
                            Create Database Record
                                   ↓
                            Index in MeiliSearch
                                   ↓
                            Return Document ID
```

#### Study Session Flow

```
User → Start Study Session → Flashcard Service → SM-2 Algorithm
                                ↓
                        Generate Next Review Date
                                ↓
                        Update User Progress
                                ↓
                        Award XP (Gamification)
```

### 2.3 Data Flow Patterns

1. **Synchronous API Calls**: REST endpoints for immediate responses
2. **Async Processing**: Celery tasks for heavy operations (OCR, embedding generation)
3. **Real-time Updates**: WebSocket connections for live notifications and collaboration
4. **Caching Strategy**: Redis for session management, rate limiting, and frequently accessed data

---

## 3. Technology Stack

### 3.1 Backend Technologies

| Component    | Technology            | Version  | Purpose                      |
| ------------ | --------------------- | -------- | ---------------------------- |
| Framework    | FastAPI               | latest   | REST API framework           |
| Server       | Uvicorn               | standard | ASGI server                  |
| ORM          | SQLModel              | latest   | Database models              |
| Database     | PostgreSQL (pgvector) | 16       | Primary data store           |
| Cache/Broker | Redis                 | 7        | Caching & Celery broker      |
| Search       | MeiliSearch           | 1.6      | Full-text search engine      |
| Storage      | MinIO                 | latest   | S3-compatible object storage |
| Antivirus    | ClamAV                | latest   | File virus scanning          |
| Task Queue   | Celery                | latest   | Async task processing        |
| AI/ML        | LangChain             | latest   | RAG pipeline & AI tools      |

### 3.2 Frontend Technologies

| Component        | Technology            | Version   | Purpose            |
| ---------------- | --------------------- | --------- | ------------------ |
| Framework        | Next.js               | 14.2.1    | React framework    |
| Language         | TypeScript            | 5.x       | Type safety        |
| UI Components    | Custom + Radix        | -         | UI library         |
| Styling          | Tailwind CSS          | 3.4       | CSS framework      |
| State Management | Zustand               | 4.5       | Client state       |
| Data Fetching    | TanStack Query        | 5.90      | Server state       |
| Forms            | React Hook Form + Zod | 7.71/3.25 | Form handling      |
| Charts           | Recharts              | 3.8       | Data visualization |

### 3.3 Infrastructure

| Service       | Port | Purpose                |
| ------------- | ---- | ---------------------- |
| PostgreSQL    | 5433 | Primary database       |
| Redis         | 6379 | Cache & message broker |
| MinIO API     | 9000 | S3 storage API         |
| MinIO Console | 9001 | Storage management UI  |
| MeiliSearch   | 7700 | Search engine          |
| ClamAV        | 3310 | Antivirus daemon       |
| Next.js (Dev) | 3000 | Frontend development   |
| FastAPI (Dev) | 8000 | Backend development    |

---

## 4. User Types & Permissions

### 4.1 User Roles

ATLAS implements a Role-Based Access Control (RBAC) system with the following roles:

| Role         | Description                                               | Typical Users           |
| ------------ | --------------------------------------------------------- | ----------------------- |
| `STUDENT`    | Regular platform users who consume and contribute content | University students     |
| `TEACHER`    | Educators who create courses and manage contributions     | Professors, instructors |
| `ADMIN`      | Department-level administrators                           | Department heads        |
| `SUPERADMIN` | System-wide administrators                                | Platform administrators |

### 4.2 Role Permissions Matrix

| Feature                   | Guest | Student | Teacher | Admin | SuperAdmin |
| ------------------------- | ----- | ------- | ------- | ----- | ---------- |
| **Authentication**        |       |         |         |       |            |
| Register                  | ✓     | -       | -       | -     | -          |
| Login                     | ✓     | ✓       | ✓       | ✓     | ✓          |
| View Public Content       | ✓     | ✓       | ✓       | ✓     | ✓          |
| **Documents**             |       |         |         |       |            |
| Upload Documents          | -     | ✓       | ✓       | -     | -          |
| Manage Own Documents      | -     | ✓       | ✓       | -     | -          |
| Moderate Documents        | -     | -       | ✓       | ✓     | ✓          |
| Delete Any Document       | -     | -       | -       | ✓     | ✓          |
| **Courses**               |       |         |         |       |            |
| View Courses              | ✓     | ✓       | ✓       | ✓     | ✓          |
| Create Courses            | -     | -       | ✓       | ✓     | ✓          |
| Manage Own Courses        | -     | -       | ✓       | ✓     | ✓          |
| Manage Department Courses | -     | -       | -       | ✓     | ✓          |
| **Study Tools**           |       |         |         |       |            |
| Use Flashcards            | -     | ✓       | ✓       | ✓     | ✓          |
| Create Flashcards         | -     | ✓       | ✓       | ✓     | ✓          |
| Take Quizzes              | -     | ✓       | ✓       | ✓     | ✓          |
| View Mind Maps            | -     | ✓       | ✓       | ✓     | ✓          |
| **AI Features**           |       |         |         |       |            |
| AI Chat (RAG)             | -     | ✓       | ✓       | ✓     | ✓          |
| Content Generation        | -     | ✓       | ✓       | ✓     | ✓          |
| **Gamification**          |       |         |         |       |            |
| Earn XP                   | -     | ✓       | ✓       | ✓     | ✓          |
| View Leaderboard          | ✓     | ✓       | ✓       | ✓     | ✓          |
| **Administration**        |       |         |         |       |            |
| Manage Users              | -     | -       | -       | ✓     | ✓          |
| Manage Departments        | -     | -       | -       | -     | ✓          |
| Manage Establishments     | -     | -       | -       | -     | ✓          |
| View Analytics            | -     | -       | ✓       | ✓     | ✓          |
| System Settings           | -     | -       | -       | -     | ✓          |

### 4.3 Student Level System

Students are categorized by academic level:

| Level | Description             |
| ----- | ----------------------- |
| `L1`  | First Year (Licence 1)  |
| `L2`  | Second Year (Licence 2) |
| `L3`  | Third Year (Licence 3)  |
| `M1`  | First Year Master's     |
| `M2`  | Second Year Master's    |

### 4.4 RBAC Implementation

The system enforces RBAC through dependency injection in FastAPI:

```python
# Example: Require admin role for an endpoint
from app.core.rbac import require_roles
from app.models.user import UserRole

@app.get("/admin/users")
async def list_users(
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.SUPERADMIN))
):
    # Only admins can access this endpoint
    return {"users": [...]}
```

---

## 5. API Endpoints Reference

### 5.1 Authentication Endpoints

| Method | Endpoint                        | Description            | Auth Required |
| ------ | ------------------------------- | ---------------------- | ------------- |
| POST   | `/api/v1/auth/register`         | Register new student   | No            |
| POST   | `/api/v1/auth/login`            | User login             | No            |
| POST   | `/api/v1/auth/refresh`          | Refresh access token   | Yes           |
| POST   | `/api/v1/auth/logout`           | Logout (revoke tokens) | Yes           |
| POST   | `/api/v1/auth/password/reset`   | Request password reset | No            |
| POST   | `/api/v1/auth/password/confirm` | Confirm password reset | No            |
| POST   | `/api/v1/auth/teacher/onboard`  | Teacher onboarding     | No (invite)   |
| GET    | `/api/v1/auth/me`               | Get current user       | Yes           |

### 5.2 Contribution Endpoints

| Method | Endpoint                       | Description         | Auth Required  |
| ------ | ------------------------------ | ------------------- | -------------- |
| GET    | `/api/v1/contributions`        | List contributions  | No             |
| POST   | `/api/v1/contributions/upload` | Upload document     | Yes (Student+) |
| GET    | `/api/v1/contributions/{id}`   | Get contribution    | No             |
| PUT    | `/api/v1/contributions/{id}`   | Update contribution | Yes (Owner+)   |
| DELETE | `/api/v1/contributions/{id}`   | Delete contribution | Yes (Owner+)   |

### 5.3 Course Endpoints

| Method | Endpoint               | Description        | Auth Required  |
| ------ | ---------------------- | ------------------ | -------------- |
| GET    | `/api/v1/courses`      | List courses       | No             |
| POST   | `/api/v1/courses`      | Create course      | Yes (Teacher+) |
| GET    | `/api/v1/courses/{id}` | Get course details | No             |
| PUT    | `/api/v1/courses/{id}` | Update course      | Yes (Owner+)   |
| DELETE | `/api/v1/courses/{id}` | Delete course      | Yes (Teacher+) |

### 5.4 Study Tools Endpoints

| Method | Endpoint                               | Description           | Auth Required |
| ------ | -------------------------------------- | --------------------- | ------------- |
| GET    | `/api/v1/study/flashcards`             | List flashcards       | Yes           |
| POST   | `/api/v1/study/flashcards`             | Create flashcard deck | Yes           |
| GET    | `/api/v1/study/flashcards/{id}/review` | Get review cards      | Yes           |
| POST   | `/api/v1/study/flashcards/{id}/review` | Submit review         | Yes           |
| GET    | `/api/v1/study/quizzes`                | List quizzes          | Yes           |
| POST   | `/api/v1/study/quizzes`                | Generate quiz         | Yes           |
| GET    | `/api/v1/study/summaries`              | Get AI summaries      | Yes           |
| POST   | `/api/v1/study/summaries/generate`     | Generate summary      | Yes           |
| GET    | `/api/v1/study/mindmaps`               | List mind maps        | Yes           |
| POST   | `/api/v1/study/mindmaps/generate`      | Generate mind map     | Yes           |

### 5.5 AI/RAG Endpoints

| Method | Endpoint                      | Description          | Auth Required |
| ------ | ----------------------------- | -------------------- | ------------- |
| POST   | `/api/v1/rag/chat`            | AI chat with context | Yes           |
| GET    | `/api/v1/rag/history`         | Chat history         | Yes           |
| POST   | `/api/v1/ai/generate/content` | Generate content     | Yes           |
| POST   | `/api/v1/ai/analyze/document` | Analyze document     | Yes           |

### 5.6 Search Endpoints

| Method | Endpoint                 | Description        | Auth Required |
| ------ | ------------------------ | ------------------ | ------------- |
| GET    | `/api/v1/search`         | Full-text search   | No            |
| GET    | `/api/v1/search/filters` | Get filter options | No            |
| GET    | `/api/v1/search/suggest` | Search suggestions | No            |

### 5.7 Gamification Endpoints

| Method | Endpoint                           | Description       | Auth Required |
| ------ | ---------------------------------- | ----------------- | ------------- |
| GET    | `/api/v1/gamification/xp`          | Get XP balance    | Yes           |
| GET    | `/api/v1/gamification/level`       | Get current level | Yes           |
| GET    | `/api/v1/gamification/badges`      | List badges       | Yes           |
| GET    | `/api/v1/gamification/leaderboard` | Get leaderboard   | No            |
| GET    | `/api/v1/gamification/streaks`     | Get study streaks | Yes           |

### 5.8 Admin Endpoints

| Method | Endpoint                        | Description        | Auth Required    |
| ------ | ------------------------------- | ------------------ | ---------------- |
| GET    | `/api/v1/admin/users`           | List all users     | Yes (Admin+)     |
| PUT    | `/api/v1/admin/users/{id}/role` | Update user role   | Yes (Admin+)     |
| GET    | `/api/v1/admin/departments`     | List departments   | Yes (Admin+)     |
| POST   | `/api/v1/admin/departments`     | Create department  | Yes (SuperAdmin) |
| GET    | `/api/v1/admin/analytics`       | Platform analytics | Yes (Admin+)     |
| POST   | `/api/v1/admin/teachers/invite` | Invite teacher     | Yes (Admin+)     |

### 5.9 Moderation Endpoints

| Method | Endpoint                          | Description          | Auth Required  |
| ------ | --------------------------------- | -------------------- | -------------- |
| GET    | `/api/v1/moderation/queue`        | Get moderation queue | Yes (Teacher+) |
| POST   | `/api/v1/moderation/{id}/approve` | Approve document     | Yes (Teacher+) |
| POST   | `/api/v1/moderation/{id}/reject`  | Reject document      | Yes (Teacher+) |
| POST   | `/api/v1/moderation/{id}/flag`    | Flag content         | Yes (Student+) |

### 5.10 Notification Endpoints

| Method | Endpoint                          | Description          | Auth Required |
| ------ | --------------------------------- | -------------------- | ------------- |
| GET    | `/api/v1/notifications`           | List notifications   | Yes           |
| PUT    | `/api/v1/notifications/{id}/read` | Mark as read         | Yes           |
| DELETE | `/api/v1/notifications/{id}`      | Delete notification  | Yes           |
| GET    | `/api/v1/notifications/ws`        | WebSocket connection | Yes           |

---

## 6. Installation Guide

### 6.1 Prerequisites

Before installing ATLAS, ensure you have the following installed:

- **Python**: 3.14 or higher
- **Node.js**: 18.x or higher
- **Docker**: 24.x or higher
- **Docker Compose**: 2.x or higher
- **Git**: Latest version
- **PostgreSQL Client** (optional): For direct DB access

### 6.2 Environment Setup

#### Clone the Repository

```bash
git clone https://github.com/atlas-platform/atlas.git
cd atlas-project
```

#### Backend Environment Configuration

1. Navigate to the backend directory:

```bash
cd backend
```

2. Copy the example environment file:

```bash
cp .env.example .env
```

3. Edit the `.env` file with your configuration:

```env
# SECURITY - Generate using: openssl rand -hex 32
SECRET_KEY=your_secure_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
ENVIRONMENT=development

# DATABASE
POSTGRES_SERVER=localhost:5433
POSTGRES_USER=atlas_user
POSTGRES_PASSWORD=atlas_password
POSTGRES_DB=atlas_db

# REDIS & CELERY
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
REDIS_URL=redis://localhost:6379/0
REDIS_CACHE_URL=redis://localhost:6379/1

# MINIO (S3 Storage)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minio_admin
MINIO_SECRET_KEY=minio_password
MINIO_BUCKET_NAME=atlas-documents
MINIO_SECURE=False

# FRONTEND ORIGINS
FRONTEND_ORIGIN=http://localhost:3000

# EMAIL / SMTP
SMTP_TLS=True
SMTP_PORT=587
SMTP_HOST=smtp.gmail.com
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
EMAILS_FROM_EMAIL=your_email@gmail.com
EMAILS_FROM_NAME="ATLAS Platform"

# AI SERVICES (Optional)
GROQ_API_KEY=
OPENAI_API_KEY=
```

#### Frontend Environment Configuration

1. Navigate to the frontend directory:

```bash
cd ../frontend
```

2. Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_APP_NAME=ATLAS
```

### 6.3 Docker Infrastructure Setup

ATLAS uses Docker Compose to manage its infrastructure services (PostgreSQL, Redis, MinIO, MeiliSearch, ClamAV).

#### Start Infrastructure Services

```bash
# From the project root
docker-compose up -d
```

#### Verify Services are Running

```bash
docker-compose ps
```

Expected output:

```
NAME                IMAGE                    STATUS
atlas_db            pgvector/pgvector:pg16   Up
atlas_redis         redis:7-alpine           Up
atlas_minio         minio/minio:latest       Up
atlas_meilisearch   getmeili/meilisearch     Up
atlas_clamav        clamav/clamav:latest     Up
```

#### Health Checks

```bash
# PostgreSQL
docker-compose exec db pg_isready -U atlas_user -d atlas_db

# Redis
docker-compose exec redis redis-cli ping

# MinIO
curl http://localhost:9000/minio/health/live

# MeiliSearch
curl http://localhost:7700/health
```

### 6.4 Backend Installation

#### Create Virtual Environment (Optional but Recommended)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

#### Install Dependencies

```bash
pip install -r requirements.txt
```

#### Database Initialization

ATLAS uses Alembic for database migrations. Initialize the database:

```bash
# Run migrations
alembic upgrade head
```

Or create the database from models:

```bash
python -c "from app.database import Base, engine; Base.metadata.create_all(engine)"
```

#### Initialize Default Data

```bash
# Set up default departments
python setup_departments.py
```

### 6.5 Frontend Installation

```bash
cd frontend
npm install
```

### 6.6 Running the Application

#### Development Mode - Backend

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`
API documentation (Swagger): `http://localhost:8000/docs`

#### Development Mode - Frontend

```bash
cd frontend
npm run dev
```

The application will be available at `http://localhost:3000`

#### Production Build - Frontend

```bash
cd frontend
npm run build
npm run start
```

### 6.7 Docker Deployment (Full Stack)

For a complete Docker-based deployment:

```bash
# Build and start all services
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

---

## 7. Usage Instructions

### 7.1 Guest Users

Guests can access public content without authentication.

**Accessing Public Content**:

1. Navigate to the homepage
2. Browse public courses and documents
3. Use the search feature to find content

**Limitations**:

- Cannot upload documents
- Cannot use study tools
- Cannot participate in discussions
- Cannot earn XP or badges

### 7.2 Student Users

#### Registration

1. Navigate to `/auth/register`
2. Fill in the registration form:
   - Email (will be your username)
   - Password (min. 8 characters)
   - Full Name
   - Select your establishment (optional)
   - Choose your field of study
   - Select your academic level (L1-L3, M1-M2)
3. Click "Register"
4. Check your email for the OTP code
5. Enter the OTP to activate your account

#### Accessing Dashboard

1. Login at `/auth/login`
2. Navigate to `/dashboard`
3. View your:
   - Current XP and level
   - Study streak
   - Recent activity
   - Recommended content

#### Using Study Tools

**Flashcards**:

1. Navigate to `/my/flashcards`
2. Click "Create New Deck" or use AI to generate from content
3. Start a study session
4. Rate your recall (Again/Hard/Good/Easy)
5. The SM-2 algorithm schedules optimal review times

**Quizzes**:

1. Navigate to a course
2. Click "Quiz" tab
3. Select quiz type and number of questions
4. Answer questions and submit
5. View results and XP earned

**Mind Maps**:

1. Navigate to a course
2. Click "Mind Map" tab
3. Generate AI-powered mind map from course content
4. View and interact with the visual structure

#### AI Chat (RAG)

1. Navigate to `/ai/workspace`
2. Ask questions about your uploaded documents
3. The AI uses document context to provide accurate answers

#### Contributing Content

1. Navigate to `/contribute`
2. Upload a document (PDF, DOCX, etc.)
3. Add metadata (title, description, tags, course)
4. Submit for moderation
5. Earn XP upon approval

### 7.3 Teacher Users

#### Onboarding

Teachers must be invited by an admin. Upon receiving an invitation:

1. Check your email for the invitation link
2. Click the link to set your password
3. Enter the OTP from your email
4. Complete your profile (department, specialization)
5. Start creating courses

#### Creating Courses

1. Navigate to `/teacher/courses`
2. Click "Create New Course"
3. Fill in course details:
   - Title
   - Description
   - Department
   - Academic level
   - Course type (TD, CM, Exam, etc.)
4. Upload course materials
5. Publish or save as draft

#### Managing Contributions

1. Navigate to `/teacher/contributions` or `/teacher/manage-contributions`
2. View pending submissions
3. Approve, reject, or request changes
4. Provide feedback to contributors

#### Viewing Analytics

1. Navigate to `/teacher/analytics`
2. View:
   - Course engagement metrics
   - Download statistics
   - Student activity
   - Popular content

### 7.4 Admin Users

#### Managing Department

1. Navigate to `/admin`
2. View department overview
3. Manage users within the department
4. Approve teacher accounts

#### Moderation Queue

1. Navigate to `/admin/moderation`
2. Review pending documents
3. Check for plagiarism (integrated)
4. Approve or reject with feedback

#### Analytics

1. Navigate to `/admin/analytics`
2. View comprehensive platform statistics

### 7.5 SuperAdmin Users

#### Managing Establishments

1. Navigate to `/superadmin`
2. Create/edit establishments (universities, schools)
3. Add departments to establishments
4. Invite administrators

#### System Configuration

1. Access system settings
2. Configure platform-wide parameters
3. Manage integrations

### 7.6 Troubleshooting Common Issues

#### Login Issues

**Problem**: Cannot log in
**Solutions**:

1. Verify email/password is correct
2. Check if account is activated (OTP verified)
3. Clear browser cache and try again
4. Use "Forgot Password" to reset

#### Upload Issues

**Problem**: File upload fails
**Solutions**:

1. Check file size (max 50MB)
2. Verify file format (PDF, DOCX, PPTX supported)
3. Check MinIO is running
4. Clear browser cache

**Problem**: OCR quality is low
**Solutions**:

1. Upload higher resolution documents
2. Use clear, scanned documents
3. Contact admin if issues persist

#### Study Tool Issues

**Problem**: Flashcards not generating
**Solutions**:

1. Ensure content has sufficient text
2. Check GROQ_API_KEY is configured
3. Try with smaller content chunks

**Problem**: AI chat not responding
**Solutions**:

1. Check AI service API keys
2. Verify RAG pipeline is indexed
3. Try refreshing the page

#### Performance Issues

**Problem**: Slow page loads
**Solutions**:

1. Check Redis is running and connected
2. Verify database queries are optimized
3. Check network latency to services

---

## 8. Security Considerations

### 8.1 Authentication Security

- **Password Hashing**: Bcrypt with cost factor 12
- **JWT Tokens**: Short-lived access tokens (15 min), longer refresh tokens (7 days)
- **Token Revocation**: Redis blacklist for invalidated tokens
- **Session Invalidation**: Global revocation on password change (US-04)

### 8.2 OTP Security

- **Account Activation**: 6-digit OTP with 24-hour expiry, 5 attempts
- **Password Reset**: 6-digit OTP with 15-minute expiry, 3 attempts (US-04)
- **Teacher Onboarding**: 6-digit OTP with 48-hour expiry, 1 attempt (US-05)

### 8.3 RBAC Implementation

- Role-based endpoint protection via `require_roles` dependency
- Privilege escalation detection and logging
- Generic 403 responses to prevent role enumeration

### 8.4 Data Protection

- **Storage Encryption**: MinIO SSE-KMS encryption enabled
- **File Scanning**: ClamAV integration for virus detection
- **Input Validation**: Pydantic models for strict request validation
- **SQL Injection Prevention**: SQLModel with parameterized queries

### 8.5 Network Security

- **CORS**: Strict origin validation
- **HTTPS**: HSTS headers enforced
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, etc.

### 8.6 Rate Limiting

- Redis-based rate limiting with configurable thresholds
- Different limits per endpoint type

---

## 9. Maintenance Procedures

### 9.1 Database Maintenance

#### Backup

```bash
# Create a database backup
docker-compose exec db pg_dump -U atlas_user atlas_db > backup.sql
```

#### Restore

```bash
# Restore from backup
docker-compose exec -T db psql -U atlas_user atlas_db < backup.sql
```

#### Migration

```bash
# Create new migration
alembic revision -m "description"

# Run migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

### 9.2 Log Management

#### View Logs

```bash
# Backend logs
docker-compose logs -f backend

# All logs
docker-compose logs -f
```

#### Log Levels

Configure in `app/core/logging_config.py`:

- DEBUG: Development only
- INFO: Production normal
- WARNING: Potential issues
- ERROR: Application errors
- CRITICAL: System failures

### 9.3 Cache Management

#### Clear Redis Cache

```bash
docker-compose exec redis redis-cli FLUSHDB
```

#### View Cache Keys

```bash
docker-compose exec redis redis-cli KEYS "*atlas*"
```

### 9.4 Monitoring

#### Health Check

```bash
curl http://localhost:8000/health
```

Response:

```json
{
  "status": "active",
  "version": "1.2.0-modular"
}
```

#### Service Status

```bash
docker-compose ps
```

### 9.5 Updates and Upgrades

#### Update Dependencies

**Backend**:

```bash
cd backend
pip install -r requirements.txt
```

**Frontend**:

```bash
cd frontend
npm update
```

#### Rebuild Containers

```bash
docker-compose build --no-cache
docker-compose up -d
```

### 9.6 Performance Optimization

1. **Database Indexes**: Ensure indexes on frequently queried columns
2. **Redis Caching**: Cache frequently accessed data
3. **CDN**: Use CDN for static assets in production
4. **Connection Pooling**: Configure appropriate pool sizes

### 9.7 Emergency Procedures

#### Service Failure

1. Check service logs: `docker-compose logs <service>`
2. Restart service: `docker-compose restart <service>`
3. Check dependencies are running

#### Data Recovery

1. Stop affected services
2. Restore from latest backup
3. Verify data integrity
4. Restart services

#### Security Incident

1. Identify affected systems
2. Isolate compromised components
3. Rotate credentials
4. Review access logs
5. Apply security patches

---

## Appendix A: Environment Variables Reference

| Variable          | Required | Description             | Default        |
| ----------------- | -------- | ----------------------- | -------------- |
| `SECRET_KEY`      | Yes      | JWT signing key         | -              |
| `POSTGRES_SERVER` | No       | Database host           | localhost:5433 |
| `REDIS_URL`       | No       | Redis connection        | localhost:6379 |
| `MINIO_ENDPOINT`  | No       | MinIO host              | localhost:9000 |
| `MEILI_URL`       | No       | MeiliSearch host        | localhost:7700 |
| `SMTP_HOST`       | No       | Email server            | smtp.gmail.com |
| `GROQ_API_KEY`    | No       | AI flashcard generation | -              |

## Appendix B: File Structure

```
atlas-project/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/    # API route handlers
│   │   ├── core/                # Security, config, utilities
│   │   ├── models/              # Database models
│   │   ├── routers/             # Additional routers
│   │   ├── services/            # Business logic
│   │   │   ├── iam/             # Authentication & authorization
│   │   │   ├── communications/ # Email & notifications
│   │   │   ├── study_engine/    # Flashcards, quizzes, gamification
│   │   │   └── intelligence/     # Recommendations
│   │   └── db/                  # Database sessions
│   ├── tests/                   # Test suite
│   ├── docker/                  # Container configs
│   ├── requirements.txt         # Python dependencies
│   └── .env.example             # Environment template
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js pages
│   │   │   ├── (student)/       # Student routes
│   │   │   ├── (teacher)/       # Teacher routes
│   │   │   ├── (admin)/         # Admin routes
│   │   │   ├── (superadmin)/    # SuperAdmin routes
│   │   │   └── (public)/        # Public routes
│   │   ├── components/          # React components
│   │   ├── lib/                 # Utilities
│   │   └── stores/              # Zustand stores
│   ├── package.json
│   └── tsconfig.json
└── docker-compose.yml           # Infrastructure services
```

## Appendix C: API Response Format

All API responses follow a consistent format:

**Success Response**:

```json
{
  "data": { ... },
  "message": "Operation successful"
}
```

**Error Response**:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

**Pagination Response**:

```json
{
  "data": [...],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}
```

---

_Document Version: 1.0.0_
_Last Updated: 2026-03-31_
_ATLAS Platform Documentation_

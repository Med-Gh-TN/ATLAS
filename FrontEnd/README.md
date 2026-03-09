# ATLAS - Frontend to Backend Integration Guide (Sprint 1)

Hey Tony, 

Here is the complete integration guide for the ATLAS Frontend (Sprint 1 deliverables). This document outlines the architecture, the authentication handshake, and the exact API contracts the frontend is expecting. 

Our goal is a zero-friction integration. All forms are strictly validated on the client side using Zod, meaning your endpoints should only receive clean, pre-validated payloads.

---

## 1. Project Setup (Local Development)

To run the Next.js frontend locally alongside your FastAPI backend:

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
# Create a .env.local file in the root directory and add your local backend URL:
NEXT_PUBLIC_API_URL=http://localhost:8000

# 3. Start the development server
npm run dev

```

The frontend will be available at `http://localhost:3000`.

---

## 2. Frontend Architecture & State

* **Framework:** Next.js 14 (App Router) + TypeScript.
* **API Client:** Axios (configured globally with `withCredentials: true`).
* **Server State & Caching:** TanStack Query (`useMutation` for POST requests). It handles loading states and error catching automatically.
* **Global Auth State:** Zustand. **Note:** Zustand *only* stores user metadata (Role, ID, Email, Name). It does NOT store the JWT.

---

## 3. The Authentication Handshake (CRITICAL)

To maximize security against XSS attacks, the frontend **does not** handle JWTs directly in memory or `localStorage`.

### The `httpOnly` Cookie Strategy

1. Upon successful `POST /auth/login` or token refresh, your backend **must** set the Access Token and Refresh Token as `httpOnly` cookies.
2. Because Axios is configured with `withCredentials: true`, the browser will automatically attach these cookies to every subsequent request.
3. **CORS Requirement:** You must configure FastAPI CORS middleware with `allow_credentials=True` and explicitly specify the frontend origin (`http://localhost:3000`).

### The Axios Interceptor (Auto-Refresh Logic)

I have built a robust Axios response interceptor that acts as a middleware:

* If your API returns a `401 Unauthorized`, the interceptor catches it *before* the UI crashes.
* It pauses all pending requests and fires a `POST /auth/refresh` request.
* **Your backend's job:** Read the `httpOnly` refresh cookie, generate new tokens, set the new cookies, and return a `200 OK`.
* If successful, the frontend automatically retries the original failed requests. If it fails, the user is hard-redirected to `/login`.

---

## 4. Sprint 1 API Integration Contracts

Below are the exact endpoints the frontend is calling, including the expected request payloads and the responses I need to update the UI state.

### A. Student Registration

**`POST /auth/register`**

* **Trigger:** User submits the `/register` form.
* **Expected Payload:**

```json
{
  "firstName": "Ali",
  "lastName": "Ben Salah",
  "email": "ali.bensalah@fss.rnu.tn",
  "password": "StrongPassword123"
}

```

* **Expected Response:** `201 Created` (No body strictly required. Frontend redirects to `/activate?email=...`).

### B. OTP Verification

**`POST /auth/verify-otp`**

* **Trigger:** User submits the 6-digit pin on the `/activate` page.
* **Expected Payload:**

```json
{
  "email": "ali.bensalah@fss.rnu.tn",
  "otp": "123456"
}

```

* **Expected Response:** `200 OK`. (Frontend will redirect user to `/login`).

**`POST /auth/resend-otp`**

* **Trigger:** User clicks "Renvoyer le code".
* **Expected Payload:** `{ "email": "ali.bensalah@fss.rnu.tn" }`
* **Expected Response:** `200 OK`.

### C. Login

**`POST /auth/login`**

* **Trigger:** User submits the `/login` form.
* **Expected Payload:**

```json
{
  "email": "ali.bensalah@fss.rnu.tn",
  "password": "StrongPassword123"
}

```

* **Expected Response:** `200 OK` + `httpOnly` Cookies set.

```json
{
  "user": {
    "id": "uuid-1234",
    "email": "ali.bensalah@fss.rnu.tn",
    "role": "STUDENT", 
    "isActive": true,
    "firstName": "Ali",
    "lastName": "Ben Salah"
  }
}

```

*(Note: The frontend relies on the `role` field to route the user to `/dashboard` or `/teacher`).*

### D. Password Reset Flow

**`POST /auth/forgot-password`**

* **Trigger:** User submits their email on the `/forgot-password` page to request a reset OTP.
* **Expected Payload:**

```json
{
  "email": "etudiant@fss.rnu.tn"
}

```

* **Expected Response:** `200 OK`.

**`POST /auth/reset-password`**

* **Trigger:** User submits the 6-digit OTP and their new password on the `/reset-password` page.
* **Expected Payload:**

```json
{
  "email": "etudiant@fss.rnu.tn",
  "otp": "123456",
  "newPassword": "NewStrongPassword123!"
}

```

* **Expected Response:** `200 OK`. (Frontend will redirect user to `/login`).

### E. Teacher Batch Import (Admin)

**`POST /admin/teachers/import`**

* **Trigger:** Admin uploads a CSV file.
* **Content-Type:** `multipart/form-data`
* **Payload:** Form data containing the `file` (CSV).
* **Expected Response:** `200 OK`. I need the exact counts to display the UI report.

```json
{
  "successCount": 15,
  "failureCount": 2,
  "duplicateCount": 3,
  "errors": ["Ligne 4: Email invalide", "Ligne 7: Département manquant"]
}

```

### F. Teacher Activation

**`POST /auth/activate/teacher`**

* **Trigger:** Teacher sets up their account via the email link.
* **Expected Payload:**

```json
{
  "email": "professeur@fss.rnu.tn",
  "otp": "654321",
  "password": "NewSecurePassword123!",
  "specialization": "Génie Logiciel",
  "modules": ["Algorithmique", "Bases de données"]
}

```

* **Expected Response:** `200 OK`.

### G. Course Upload Pipeline

**`POST /courses/upload`**

* **Trigger:** Teacher uploads a PDF/DOCX/PPTX (max 50MB).
* **Content-Type:** `multipart/form-data`
* **Payload Structure:**
* `file`: (Binary File)
* `filiere`: "Informatique"
* `niveau`: "M2"
* `resourceType`: "COURS" | "TD" | "TP" | "EXAMEN"
* `academicYear`: "2025-2026"
* `language`: "FR" | "AR" | "EN"


* **Upload Progress:** Axios is tracking the upload progress on the frontend. Please ensure your endpoint accepts the stream efficiently.
* **Expected Response:** `200 OK` (or `409 Conflict` with a specific `message` if duplicate SimHash is detected).

### H. Teacher "Mes Cours" Dashboard

**`GET /teacher/courses`**

* **Trigger:** Teacher accesses the "Mes Cours" dashboard to view their historical uploads and the current AI pipeline status.
* **Expected Payload:** None (Relies entirely on the `httpOnly` JWT cookies for authorization).
* **Expected Response:** `200 OK` with an array of courses.

```json
[
  {
    "id": "course-uuid-1",
    "originalFileName": "Architecture_SI_Chap1.pdf",
    "filiere": "Informatique",
    "niveau": "M2",
    "versionNumber": 1,
    "status": "INDEXED", 
    "createdAt": "2026-03-09T10:00:00Z"
  },
  {
    "id": "course-uuid-2",
    "originalFileName": "TD_Algorithmique.docx",
    "filiere": "Informatique",
    "niveau": "L1",
    "versionNumber": 1,
    "status": "PROCESSING",
    "createdAt": "2026-03-09T11:30:00Z"
  }
]

```

*(Note: Valid statuses the UI expects are `PENDING`, `PROCESSING`, `INDEXED`, and `FAILED`)*.

---

*Document generated for Sprint 1 Integration.*

```
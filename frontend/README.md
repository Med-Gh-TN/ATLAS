# ATLAS Platform - Frontend Microservice

> **⚠️ ARCHITECTURAL DIRECTIVE:**
> Do not document the broader ATLAS infrastructure, API startup, or database seeding here. 
> The absolute source of truth for the project setup is located at the root level: `../README.md`.

This directory contains the Next.js 14 (App Router) frontend, utilizing React, TailwindCSS, and TypeScript. 

## 🛠️ Quick Reference Commands

Ensure you have Node.js installed and your API backend is running (`http://localhost:8000`) before developing the frontend.

### 1. Installation
Install the required Node dependencies:
```bash
npm install

```

### 2. Development Server

Start the Next.js development server with hot-module reloading:

```bash
npm run dev

```

* The application will be accessible at: `http://localhost:3000`

### 3. Production Build

Compile the application for production deployment. This will catch static typing errors and optimize the build:

```bash
npm run build
npm run start

```

### 4. Code Quality & Linting

Run ESLint to check for code quality and strict typing compliance:

```bash
npm run lint

```

*(Note: Husky pre-commit hooks are configured to run linting automatically prior to any git commit).*

---

## 🔗 Environment Integration

The frontend expects the backend API to be available. Ensure your local `.env.local` file (if applicable) correctly points to the local backend port:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

```

*For user stories, RBAC definitions, and the complete Docker startup sequence, refer exclusively to the root documentation.*


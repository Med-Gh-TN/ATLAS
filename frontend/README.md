# 🖥️ ATLAS Frontend Client

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?logo=typescript)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4+-38B2AC?logo=tailwind-css)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)

> The user-facing web application for the ATLAS Academic Knowledge Base. This client delivers a zero-latency, highly responsive experience for students, teachers, and administrators, interacting seamlessly with the core neural search and RAG backend.

---

## 📌 Architecture Overview

The ATLAS frontend is built for performance and maintainability, utilizing the latest web standards:
* **Framework:** Next.js 14 leveraging the App Router for server-side rendering (SSR) and optimized routing.
* **Language:** Strictly typed with TypeScript to ensure contract safety with our FastAPI backend.
* **Styling:** Utility-first CSS via TailwindCSS for rapid, consistent, and responsive UI development.
* **State Management:** (Standard React Hooks + Context API / Zustand/Redux if implemented) ensuring clean data flow for features like the active RAG chat and PDF telemetry.

---

## 🚀 Local Development Setup

Ensure you have completed **Phase 1 (Infrastructure Deployment)** and **Phase 2 (Backend Configuration)** from the [Main Project README](../README.md) before starting the frontend, as the UI requires the API to function.

### Prerequisites
* **Node.js:** v18.x or v20.x (LTS recommended)
* **Package Manager:** `npm` (v9+)

### Installation & Bootstrapping

1. **Navigate to the frontend workspace:**
   ```bash
   cd frontend
````

2.  **Install dependencies:**
    Ensure you have a clean installation of all required packages.

    ```bash
    npm install
    ```

3.  **Environment Configuration:**
    Copy the example environment file to configure your local API connections.

    ```bash
    cp .env.example .env.local
    ```

    *(Ensure `NEXT_PUBLIC_API_URL` is pointing to your local FastAPI instance, typically `http://localhost:8000/api/v1`).*

4.  **Start the Development Server:**
    Launch Next.js with Fast Refresh enabled.

    ```bash
    npm run dev
    ```

5.  **Verify the Application:**
    Open your browser and navigate to [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000). You should see the ATLAS landing page.

-----

## 📜 Available Scripts

Within the `frontend` directory, you can run several built-in commands:

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the local development server on port 3000. |
| `npm run build` | Compiles the application for production deployment. |
| `npm run start` | Starts a Node.js server to serve the production build. |
| `npm run lint` | Runs ESLint to statically analyze the codebase for issues. |

-----

## 📂 Standard Project Structure

ATLAS follows a standard Next.js 14 App Router paradigm. Familiarize yourself with these core directories:

```text
frontend/
├── app/               # Next.js 14 App Router pages, layouts, and API routes
├── components/        # Reusable React components (UI elements, layout wrappers)
├── lib/               # Utility functions, Axios/Fetch API clients, and state stores
├── types/             # Global TypeScript interfaces matching backend Pydantic schemas
├── public/            # Static assets (images, icons, pdf.worker.js)
├── tailwind.config.ts # TailwindCSS theme and utility configuration
└── package.json       # Project dependencies and script definitions
```

-----

## 🛠️ Developer Guidelines

### Strictly Typed API Contracts

All API responses must be strongly typed. When building new features, ensure that the interfaces in `types/api.ts` perfectly match the Pydantic schemas defined in the FastAPI backend to prevent runtime mapping errors.

### Role-Based UI Rendering

The UI dynamically renders components based on the user's RBAC profile (Student, Teacher, Admin). Always wrap protected features (like the Moderation Dashboard or Admin Settings) with the appropriate role-check hooks from the auth store.

-----

*For backend API integration details, please refer to the [Backend Documentation](https://www.google.com/search?q=../backend/README.md).*


# ATLAS Frontend (Sprint 1)

This is the frontend for the ATLAS platform, built with **Next.js 14 (App Router)**, **Tailwind CSS**, and **TypeScript**.

## Features Implemented (Sprint 1)
- **Authentication Pages**:
  - Login (`/auth/login`)
  - Registration (`/auth/register` - *Placeholder structure created*)
- **Upload UI**:
  - Drag & Drop interface for PDF files (`/upload`).
  - File validation (PDF only).
- **Architecture**:
  - App Router structure.
  - Tailwind CSS configuration.
  - Component-based architecture.

## Prerequisites
- Node.js 18+
- npm / yarn / pnpm

## Getting Started

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure
```
frontend/
├── app/
│   ├── auth/
│   │   ├── login/      # Login Page
│   │   └── register/   # Register Page
│   ├── upload/         # File Upload Page
│   └── page.tsx        # Home Page
├── components/
│   └── ui/             # Reusable UI components
└── public/             # Static assets
```

## Key Technologies
- **Next.js 14**: Framework (App Router).
- **Tailwind CSS**: Styling.
- **React Dropzone**: File handling.
- **Axios**: API communication (configured in `lib/api.ts`).

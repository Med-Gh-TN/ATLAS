// frontend/types/api.ts

// ==========================================
// ENUMS (Mapped from Python Enum)
// ==========================================

export type UserRole = "STUDENT" | "TEACHER" | "ADMIN";

export type StudentLevel = "L1" | "L2" | "L3" | "M1" | "M2";

export type ContributionStatus = "PENDING" | "APPROVED" | "REJECTED";

export type DocumentPipelineStatus = "QUEUED" | "OCR_PROCESSING" | "EMBEDDING" | "READY" | "FAILED";

// ==========================================
// CORE ENTITIES (Mapped from SQLModel)
// ==========================================

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  filiere: string | null;
  level: StudentLevel | null;
  created_at: string; // ISO 8601 Date string
}

export interface Contribution {
  id: string;
  title: string;
  description: string | null;
  status: ContributionStatus;
  uploader_id: string;
}

export interface DocumentVersion {
  id: string;
  version_number: number;
  storage_path: string;
  file_size_bytes: number;
  sha256_hash: string;
  ocr_text: string | null;
  language: string;
  pipeline_status: DocumentPipelineStatus;
  uploaded_at: string; // ISO 8601 Date string
  contribution_id: string;
}

// ==========================================
// API RESPONSES (Mapped from Endpoints)
// ==========================================

export interface PaginatedMeta {
  total: number;
  limit: number;
  offset: number;
}

// Response from GET /api/v1/search (Semantic Search - pgvector)
export interface SemanticSearchResult {
  document_version_id: string;
  title: string;
  score: number; // 1 - Cosine Distance
}

// Response from GET /api/v1/search/text (Full-Text Search)
export interface TextSearchResultItem {
  contribution_id: string;
  title: string;
  version_id: string;
}

export interface TextSearchResponse {
  items: TextSearchResultItem[];
  meta: PaginatedMeta;
}

// Response from GET /api/v1/contributions/query
export interface ContributionQueryResponse {
  items: Contribution[];
  meta: PaginatedMeta;
}
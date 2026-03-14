// frontend/types/api.ts

// ==========================================
// ENUMS & LITERALS
// ==========================================

export type UserRole = "STUDENT" | "TEACHER" | "ADMIN";

export type StudentLevel = "L1" | "L2" | "L3" | "M1" | "M2";

export type ContributionStatus = "PENDING" | "APPROVED" | "REJECTED";

export type DocumentPipelineStatus = "QUEUED" | "OCR_PROCESSING" | "EMBEDDING" | "READY" | "FAILED";

// US-17: Strict literal types for the frontend rendering engine
export type QuestionType = "QCM" | "Vrai/Faux" | "Texte à trous" | "Correspondance";

// US-18: Summary generation formats
export type SummaryFormat = "EXECUTIVE" | "STRUCTURED" | "COMPARATIVE";

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

// US-12: Specific payload for Course Version History Endpoint
export interface CourseVersion {
  version_id: string;
  version_number: number;
  uploaded_at: string;
  file_size_bytes: number;
  mime_type: string;
  pipeline_status: DocumentPipelineStatus;
  quality_score: number | null;
  uploader: {
    id: string;
    name: string;
  };
}

// ==========================================
// API REQUESTS (Payloads)
// ==========================================

// US-17: Quiz Requests
export interface QuizGenerateRequest {
  document_id: string;
  timer_minutes: number; // Strictly 30, 60, or 90
}

export interface AnswerSubmission {
  question_id: string;
  student_answer: string;
}

export interface SubmitAnswersRequest {
  answers: AnswerSubmission[];
  time_spent_seconds: number;
}

// US-18: Summary & Mind Map Requests
export interface GenerateSummaryRequest {
  document_version_id: string;
  document_version_id_v2?: string;
  format_type: SummaryFormat;
  target_lang: string;
}

export interface GenerateMindMapRequest {
  document_version_id: string;
  target_lang: string;
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

// US-17: Quiz Responses
export interface SanitizedQuestionResponse {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[]; // Always an array, even if empty for some types
}

export interface QuizGenerateResponse {
  session_id: string;
  timer_minutes: number;
  questions: SanitizedQuestionResponse[];
}

export interface QuestionFeedback {
  question_id: string;
  is_correct: boolean;
  correct_answer: string;
  student_answer: string;
  ai_feedback: string | null;
  source_page: string | null;
}

export interface QuizEvaluationResult {
  attempt_id: string;
  score: number;
  total_questions: number;
  percentage: number;
  feedbacks: QuestionFeedback[];
}

export interface HistoryDataPoint {
  date: string; // MM/DD format
  score: number; // 0.0 to 100.0
}

// US-18: Summary & Mind Map Responses

// Strictly mapped to React Flow Node Schema
export interface MindMapNodeData {
  label: string;
  source_extract?: string;
}

export interface MindMapNode {
  id: string;
  position: { x: number; y: number };
  data: MindMapNodeData;
}

// Strictly mapped to React Flow Edge Schema
export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: string;
}

export interface GenerateMindMapResponse {
  mindmap_id: string;
  title: string;
  target_lang: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

export interface SummaryResponse {
  summary_id: string;
  format: SummaryFormat;
  // content is defined as 'any' or flexible Record due to the 3 different JSON structures (bullets vs structured vs comparative)
  content: Record<string, any>; 
}
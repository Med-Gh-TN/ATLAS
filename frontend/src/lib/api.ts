/**
 * @file frontend/src/lib/api.ts
 * @description API wrapper and centralized endpoints for Next.js.
 * SOTA FIX: Hardened `ragApi.streamMessage` to correctly parse Server-Sent Events (SSE)
 * ensuring True Real-Time Token Streaming to the UI without freezing.
 * @layer Core Logic
 */

import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  TeacherRequestCreate,
  TeacherVerificationRequest,
  TeacherImportResult,
  RegistrationOptionsResponse,
  User,
  ContributorRequest,
  ContributorStatusResponse,
  VerifyOTPRequest,
  RequestOTPRequest,
  ResetPasswordRequest,
  SearchParams,
  SearchResultItem,
  AutocompleteResult,
  Contribution,
  Department,
  Establishment,
  FlashcardDeck,
  Flashcard,
  FlashcardDeckDetail,
  StudyGenerationResponse,
  ReviewCardResponse,
  QuizSession,
  QuizDetail,
  QuizSubmitRequest,
  QuizSubmitResponse,
  QuizHistoryItem,
  Notification,
  SmartOverviewResponse,
  RAGSession,
  RAGMessage,
  RAGStreamEvent,
  Course,
  CourseVersion,
  CourseWithVersion,
  CourseStats,
  ApiError,
  ApiErrorResponse,
  UploadResponse,
  Summary,
  Mindmap,
  ForumPost,
  ForumReply,
  Report,
  Annotation,
  TeacherAnalytics,
  CourseAnalytics,
  AdminDashboard,
  UserProfile,
  ActivityLogItem,
  PaginatedResponse,
  ReviewRating,
  StudentLevel,
  DocumentAssetCache,
  DocumentAssetManifestItem,
} from "@/types/api.types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://api.atlas.tn/api/v1";

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://api.atlas.tn/ws";

export class AtlasApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public field?: string,
    public data?: ApiErrorResponse,
  ) {
    super(message);
    this.name = "AtlasApiError";
  }
}

function normalizeUser(user: Partial<User>): User {
  return {
    id: user.id || "",
    email: user.email || "",
    full_name: user.full_name ?? null,
    username: user.username,
    role: (user.role as User["role"]) || "STUDENT",
    status: user.status || "ACTIVE",
    trust_score: user.trust_score ?? 0,
    profile_completeness: user.profile_completeness ?? 0,
    establishment_id: user.establishment_id ?? null,
    is_active: user.is_active ?? true,
    is_verified: user.is_verified ?? false,
    is_contributor: user.is_contributor ?? false,
    onboarding_completed: user.onboarding_completed ?? false,
    verified_at: user.verified_at ?? null,
    contributor_badge_awarded_at: user.contributor_badge_awarded_at ?? null,
    filiere: user.filiere ?? null,
    niveau: user.niveau ?? user.level ?? null,
    level: user.level ?? user.niveau ?? null,
    student_id: user.student_id ?? null,
    program: user.program ?? null,
    academic_year: user.academic_year ?? null,
    date_of_birth: user.date_of_birth ?? null,
    gender: user.gender ?? null,
    phone_number: user.phone_number ?? null,
    address: user.address ?? null,
    preferred_language: user.preferred_language ?? null,
    profile_picture_url: user.profile_picture_url ?? null,
    push_notifications_enabled: user.push_notifications_enabled ?? true,
    email_digest_enabled: user.email_digest_enabled ?? false,
    notification_types: user.notification_types ?? ["contributions", "achievements", "reminders", "leaderboard"],
    is_rtl: user.is_rtl ?? false,
    created_at: user.created_at || new Date(0).toISOString(),
    last_login_at: user.last_login_at,
  };
}

function normalizeCourse(course: Partial<Course>): Course {
  return {
    id: course.id || "",
    title: course.title || "Untitled course",
    description: course.description ?? null,
    contribution_id: course.contribution_id,
    department_id: course.department_id,
    department_name: course.department_name ?? null,
    major_id: course.major_id ?? null,
    filiere: course.filiere ?? null,
    niveau: course.niveau ?? course.level ?? null,
    level: course.level ?? course.niveau ?? null,
    type: course.type,
    course_type: course.course_type,
    language: course.language ?? null,
    annee: course.annee,
    academic_year: course.academic_year ?? null,
    current_version_id: course.current_version_id,
    uploader_id: course.uploader_id,
    university_id: course.university_id,
    is_deleted: course.is_deleted,
    is_official: course.is_official,
    tags: course.tags || [],
    created_at: course.created_at || new Date(0).toISOString(),
  };
}

function emptyMeta(itemCount: number): PaginatedResponse<unknown>["meta"] {
  return {
    total: itemCount,
    limit: itemCount,
    offset: 0,
    has_more: false,
  };
}

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

let accessToken: string | null = null;

if (typeof window !== "undefined") {
  const stored = localStorage.getItem("atlas_access_token");
  if (stored) accessToken = stored;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("atlas_access_token", token);
    } else {
      localStorage.removeItem("atlas_access_token");
    }
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const requestUrl = originalRequest?.url || "";
    const isAuthRequest = ["/auth/login", "/auth/refresh", "/auth/logout"].some(
      (path) => requestUrl.includes(path),
    );

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      originalRequest._retry = true;

      try {
        const response = await axios.post<{ accessToken: string }>(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );

        const newToken = response.data.accessToken;
        setAccessToken(newToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }

        return axiosInstance(originalRequest);
      } catch {
        setAccessToken(null);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("auth:logout"));
        }
      }
    }

    return Promise.reject(error);
  },
);

function parseApiError(error: unknown): AtlasApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiError>;
    const status = axiosError.response?.status ?? 0;

    const data = axiosError.response?.data;
    if (data && typeof data === "object" && "error" in data) {
      const errorData = data as ApiErrorResponse;
      return new AtlasApiError(
        status,
        errorData.error.message,
        errorData.error.code,
        errorData.error.field,
        errorData,
      );
    }

    const detail =
      typeof data?.detail === "string" ? data.detail : axiosError.message;
    return new AtlasApiError(status, detail);
  }
  if (error instanceof AtlasApiError) {
    return error;
  }
  return new AtlasApiError(500, "An unexpected error occurred");
}

export const api = {
  get: async <T>(endpoint: string): Promise<T> => {
    try {
      const response = await axiosInstance.get<T>(endpoint);
      return response.data;
    } catch (error) {
      throw parseApiError(error);
    }
  },

  post: async <T>(endpoint: string, data?: unknown): Promise<T> => {
    try {
      const response = await axiosInstance.post<T>(endpoint, data);
      return response.data;
    } catch (error) {
      throw parseApiError(error);
    }
  },

  patch: async <T>(endpoint: string, data?: unknown): Promise<T> => {
    try {
      const response = await axiosInstance.patch<T>(endpoint, data);
      return response.data;
    } catch (error) {
      throw parseApiError(error);
    }
  },

  put: async <T>(endpoint: string, data?: unknown): Promise<T> => {
    try {
      const response = await axiosInstance.put<T>(endpoint, data);
      return response.data;
    } catch (error) {
      throw parseApiError(error);
    }
  },

  delete: async <T>(endpoint: string): Promise<T> => {
    try {
      const response = await axiosInstance.delete<T>(endpoint);
      return response.data;
    } catch (error) {
      throw parseApiError(error);
    }
  },

  postFormData: async <T>(endpoint: string, formData: FormData): Promise<T> => {
    try {
      const response = await axiosInstance.post<T>(endpoint, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return response.data;
    } catch (error) {
      throw parseApiError(error);
    }
  },

  getBlob: async (endpoint: string): Promise<Blob> => {
    try {
      const response = await axiosInstance.get(endpoint, {
        responseType: "blob",
      });
      return response.data;
    } catch (error) {
      throw parseApiError(error);
    }
  },
};

export const authApi = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    try {
      const response = await axios.post<LoginResponse>(
        `${API_BASE_URL}/auth/login`,
        {
          email: credentials.email,
          password: credentials.password,
        },
        { withCredentials: true },
      );

      setAccessToken(response.data.accessToken);
      return response.data;
    } catch (e) {
      throw parseApiError(e);
    }
  },

  register: (data: RegisterRequest): Promise<User> =>
    api.post<{ user?: User }>("/auth/register", data).then((response) =>
      normalizeUser(response.user || {}),
    ),

  getRegistrationOptions: (): Promise<RegistrationOptionsResponse> =>
    api.get<RegistrationOptionsResponse>("/auth/registration-options"),

  createTeacherRequest: (data: TeacherRequestCreate): Promise<User> =>
    api.post<{ user?: User }>("/auth/teacher-request", data).then((response) =>
      normalizeUser(response.user || {}),
    ),

  verifyOtp: (data: VerifyOTPRequest): Promise<{ message: string }> =>
    api.post<{ message: string }>("/auth/verify-otp", {
      email: data.email,
      otp_code: data.otp_code || data.code,
      purpose: data.purpose,
    }),

  requestOtp: (data: RequestOTPRequest): Promise<{ message: string }> => {
    if (data.purpose === "PASSWORD_RESET") {
      return api.post<{ message: string }>("/auth/forgot-password", {
        email: data.email,
      });
    }

    return api.post<{ message: string }>("/auth/resend-otp", {
      email: data.email,
      purpose: data.purpose,
    });
  },

  resendOtp: (data: { email: string; purpose?: string }): Promise<{ message: string }> =>
    api.post<{ message: string }>("/auth/resend-otp", data),

  activateTeacher: (data: { token: string; password: string }): Promise<{ message: string; user: User }> =>
    api.post<{ message: string; user: User }>("/auth/activate-teacher", data),

  logout: async (): Promise<void> => {
    try {
      await api.post<{ message: string }>("/auth/logout");
    } finally {
      setAccessToken(null);
    }
  },

  refresh: async (): Promise<{ accessToken: string }> => {
    const response = await axios.post<{ accessToken: string }>(
      `${API_BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    setAccessToken(response.data.accessToken);
    return response.data;
  },

  me: (): Promise<User> => api.get<User>("/auth/me").then(normalizeUser),

  updateProfile: (data: Partial<User>): Promise<User> =>
    api.patch<User>("/users/me", data).then(normalizeUser),

  deleteAccount: (): Promise<{ message: string }> =>
    api.delete<{ message: string }>("/users/me"),

  forgotPassword: (email: string): Promise<{ message: string }> =>
    api.post<{ message: string }>("/auth/forgot-password", { email }),

  resetPassword: (data: ResetPasswordRequest): Promise<{ message: string }> =>
    api.post<{ message: string }>("/auth/reset-password", {
      email: data.email,
      otp_code: data.otp_code || data.code,
      password: data.password || data.new_password,
    }),
};

export const filesApi = {
  getPreviewUrl: (contributionId: string): Promise<{
    url: string;
    expires_at: string;
    filename: string;
    mime_type: string;
    file_size: number;
  }> => api.get(`/files/pdf-view-url/${contributionId}`),

  getPreviewUrlByPath: (storagePath: string): Promise<{
    url: string;
    expires_at: string;
    filename: string;
    mime_type: string;
    file_size: number;
  }> => api.get(`/files/pdf-view-url-by-path?path=${encodeURIComponent(storagePath)}`),

  getPdfViewUrl: (contributionId: string): Promise<{
    url: string;
    expires_at: string;
    filename: string;
    mime_type: string;
    file_size: number;
  }> => filesApi.getPreviewUrl(contributionId),

  getPdfViewUrlByPath: (storagePath: string): Promise<{
    url: string;
    expires_at: string;
    filename: string;
    mime_type: string;
    file_size: number;
  }> => filesApi.getPreviewUrlByPath(storagePath),
};

export const coursesApi = {
  list: (params?: {
    filiere?: string;
    niveau?: string;
    type?: string;
  }): Promise<Course[]> => {
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value) searchParams.append(key, value);
    });
    const query = searchParams.toString();
    return api
      .get<Partial<Course>[]>(`/courses${query ? `?${query}` : ""}`)
      .then((courses) => courses.map((course) => normalizeCourse(course)));
  },

  getById: (courseId: string): Promise<CourseWithVersion> =>
    api
      .get<Partial<Course> & { latestVersion?: CourseVersion }>(`/courses/${courseId}`)
      .then((course) => ({
        ...normalizeCourse(course),
        current_version: course.latestVersion,
      })),

  getVersions: (courseId: string): Promise<CourseVersion[]> =>
    api.get<CourseVersion[]>(`/courses/${courseId}/versions`),

  getVersion: (versionId: string): Promise<CourseVersion & { title?: string }> =>
    api.get<CourseVersion & { title?: string }>(`/courses/versions/${versionId}`),

  getStats: (courseId: string): Promise<CourseStats> =>
    api.get<CourseStats>(`/courses/${courseId}/stats`),

  getMyAssets: (
    courseId: string,
    documentVersionId: string
  ): Promise<{
    flashcards: { exists: boolean; id: string | null };
    quiz: { exists: boolean; id: string | null };
    summary: { exists: boolean; id: string | null };
    mindmap: { exists: boolean; id: string | null };
  }> => 
  api.get(`/courses/${courseId}/my-assets?document_version_id=${documentVersionId}`),



  getCatalog: (): Promise<Course[]> =>
    api.get<Partial<Course>[]>(`/courses/catalog`).then((courses) =>
      courses.map((course) => normalizeCourse(course)),
    ),

  getDownloadUrl: (
    courseId: string,
  ): Promise<{ url: string; expires_at: string }> =>
    api.get<{ url: string; expiresAt: string }>(`/courses/${courseId}/download-url`).then(
      (response) => ({
        url: response.url,
        expires_at: response.expiresAt,
      }),
    ),

  getPreview: (courseId: string): Promise<{ url: string; pages: number }> =>
    api
      .get<{ preview: { url: string } }>(`/courses/${courseId}/preview`)
      .then((response) => ({
        url: response.preview.url.replace("/api/v1/files/proxy/", "/api/files/proxy/"),
        pages: 0,
      })),

  update: (courseId: string, data: Partial<Course>): Promise<Course> =>
    api.patch<Course>(`/courses/${courseId}`, data),

  delete: (courseId: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(`/courses/${courseId}`),

  upload: (data: {
    major_id: string;
    course_id: string;               // changed from course_title
    course_type: string;
    language: string;
    academic_year: string;
    file: File;
  }): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append("major_id", data.major_id);
    formData.append("course_id", data.course_id);         // changed
    formData.append("course_type", data.course_type);
    formData.append("language", data.language);
    formData.append("academic_year", data.academic_year);
    formData.append("file", data.file);
    return api.postFormData<UploadResponse>("/courses/upload", formData);
  },

  getMyUploads: (): Promise<Course[]> =>
    api
      .get<Partial<Course>[]>(`/courses/my-uploads`)
      .then((courses) => courses.map((course) => normalizeCourse(course))),
};

export const superadminApi = {
  getEstablishments: (): Promise<Establishment[]> =>
    api.get<Establishment[]>("/superadmin/establishments"),

  createEstablishment: (data: { name: string; domain: string }): Promise<Establishment> =>
    api.post<Establishment>("/superadmin/establishments", data),

  toggleEstablishmentAuthorization: (establishmentId: string): Promise<Establishment> =>
    api.patch<Establishment>(`/superadmin/establishments/${establishmentId}/toggle-authorization`),

  createAdmin: (data: { full_name: string; email: string; password: string; establishment_id: string }): Promise<User> =>
    api.post<User>("/superadmin/admins", data),

  getDashboardStats: (): Promise<{
    total_establishments: number;
    total_users: number;
    total_admins: number;
    total_teachers: number;
    active_sessions_estimated: number;
    system_health: number;
  }> => api.get<{
    total_establishments: number;
    total_users: number;
    total_admins: number;
    total_teachers: number;
    active_sessions_estimated: number;
    system_health: number;
  }>("/superadmin/dashboard/stats"),

  listUsers: (params?: {
    role?: string;
    establishment_id?: string;
    is_active?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<User>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    const query = searchParams.toString();
    return api.get<PaginatedResponse<User>>(`/superadmin/users${query ? `?${query}` : ""}`);
  },

  getEstablishment: (establishmentId: string): Promise<Establishment & { users: number, students: number, teachers: number, admins: number }> =>
    api.get<Establishment & { users: number, students: number, teachers: number, admins: number }>(`/superadmin/establishments/${establishmentId}`),

  updateEstablishment: (establishmentId: string, data: { name?: string; domain?: string }): Promise<Establishment> =>
    api.patch<Establishment>(`/superadmin/establishments/${establishmentId}`, data),

  deleteEstablishment: (establishmentId: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(`/superadmin/establishments/${establishmentId}`),

  updateUser: (
    userId: string,
    data: {
      is_active?: boolean;
      role?: string;
      full_name?: string;
    },
  ): Promise<User> => api.patch<User>(`/superadmin/users/${userId}`, data),

  deleteUser: (userId: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(`/superadmin/users/${userId}`),

  listReports: (params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Report>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    const query = searchParams.toString();
    return api.get<PaginatedResponse<Report>>(`/superadmin/reports${query ? `?${query}` : ""}`);
  },

  resolveReport: (
    reportId: string,
    data: { action: "warn" | "remove" | "dismiss"; note?: string },
  ): Promise<{ message: string }> =>
    api.patch<{ message: string }>(`/superadmin/reports/${reportId}`, data),
};

export const searchApi = {
  hybrid: (
    params: SearchParams,
  ): Promise<PaginatedResponse<SearchResultItem>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    return api
      .get<{ items: SearchResultItem[]; page: number; limit: number; total: number }>(
        `/search?${searchParams.toString()}`,
      )
      .then((response) => ({
        items: response.items,
        meta: {
          total: response.total,
          limit: response.limit,
          offset: Math.max(0, (response.page - 1) * response.limit),
          has_more: response.page * response.limit < response.total,
        },
      }));
  },

  autocomplete: (q: string): Promise<AutocompleteResult[]> => {
    const params = new URLSearchParams({ q });
    return api.get<AutocompleteResult[]>(
      `/search/autocomplete?${params.toString()}`,
    );
  },
};

export const ragApi = {
  createSession: (courseId: string): Promise<RAGSession> =>
    api.post<RAGSession>("/rag/sessions", {
      course_id: courseId,
    }),

  getSession: (sessionId: string): Promise<RAGSession> =>
    api.get<RAGSession>(`/rag/sessions/${sessionId}`),

  getMessages: (
    sessionId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<PaginatedResponse<RAGMessage>> => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append("limit", String(params.limit));
    if (params?.offset !== undefined) {
      searchParams.append("offset", String(params.offset));
    }
    const query = searchParams.toString();
    return api.get<PaginatedResponse<RAGMessage>>(
      `/rag/sessions/${sessionId}/messages${query ? `?${query}` : ""}`,
    );
  },

  deleteSession: (sessionId: string): Promise<{ success: boolean }> =>
    api.delete<{ success: boolean }>(`/rag/sessions/${sessionId}`),

  streamMessage: (
    sessionId: string,
    content: string,
    onEvent: (event: RAGStreamEvent) => void,
  ): { abort: () => void } => {
    const controller = new AbortController();

    const sendMessage = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/rag/sessions/${sessionId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({ content }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // 🚨 SOTA FIX: Split strictly by SSE standard double newline delimiter
          // This prevents internal \n characters in LLM responses (like markdown) from breaking JSON.parse
          const chunks = buffer.split("\n\n");
          
          // The last chunk might be incomplete (stream cut mid-transmission), keep it in buffer
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            // Strip the standard SSE "data: " prefix
            const dataPrefix = "data: ";
            if (chunk.startsWith(dataPrefix)) {
              const jsonStr = chunk.slice(dataPrefix.length);
              try {
                const event = JSON.parse(jsonStr) as RAGStreamEvent;
                onEvent(event);
                if (event.type === "done" || event.type === "error") {
                  return;
                }
              } catch {
                // Silently skip malformed chunks to maintain stream resilience
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          const message = (error as Error).message;
          console.error(`[RAG_STREAM_ERROR] session=${sessionId}`, error);

          let userFriendlyMessage = message;
          if (message === "Failed to fetch") {
            userFriendlyMessage =
              "Connection to ATLAS failed. Please check if the backend is running or if HSTS/CORS is blocking the request.";
          }

          onEvent({ type: "error", error: userFriendlyMessage });
        }
      }
    };

    sendMessage();

    return {
      abort: () => controller.abort(),
    };
  },
};

export const flashcardsApi = {
  generate: (courseId: string, numCards = 20): Promise<StudyGenerationResponse> =>
    api.post<StudyGenerationResponse>("/flashcards/generate", {
      course_id: courseId,
      num_cards: numCards,
    }),

  listDecks: (): Promise<FlashcardDeck[]> =>
    api.get<FlashcardDeck[]>("/flashcards/decks"),

  getDeck: (deckId: string): Promise<FlashcardDeckDetail> =>
    api.get<FlashcardDeckDetail>(`/flashcards/decks/${deckId}`),

  getDue: (): Promise<{ items: Flashcard[]; total: number }> =>
    api.get<{ items: Flashcard[]; total: number }>("/flashcards/due"),

  review: (cardId: string, rating: ReviewRating): Promise<ReviewCardResponse> =>
    api.patch<ReviewCardResponse>(`/flashcards/${cardId}/review`, { rating }),

  shareDeck: (
    deckId: string,
  ): Promise<{ share_url: string; share_token: string }> =>
    api
      .get<{ token: string; url: string }>(`/flashcards/decks/${deckId}/share`)
      .then((response) => ({
        share_url: response.url,
        share_token: response.token,
      })),
};

export const quizApi = {
  generate: (
    courseId: string,
    numQuestions = 10,
  ): Promise<StudyGenerationResponse> =>
    api.post<StudyGenerationResponse>("/quiz/generate", {
      course_id: courseId,
      num_questions: numQuestions,
    }),

  listSessions: (): Promise<QuizSession[]> =>
    api.get<QuizSession[]>("/quiz/sessions"),

  getQuiz: (quizId: string): Promise<QuizDetail> =>
    api.get<QuizDetail>(`/quiz/${quizId}`),

  submit: (
    quizId: string,
    data: QuizSubmitRequest,
  ): Promise<QuizSubmitResponse> =>
    api.post<QuizSubmitResponse>(`/quiz/${quizId}/submit`, data),

  getHistory: (): Promise<QuizHistoryItem[]> =>
    api.get<QuizHistoryItem[]>("/quiz/history"),
};

export const summariesApi = {
  generate: (
    courseId: string,
    formatType = "EXECUTIVE",
    targetLang = "fr",
  ): Promise<StudyGenerationResponse> =>
    api.post<StudyGenerationResponse>("/summaries/generate", {
      course_id: courseId,
      format_type: formatType,
      target_lang: targetLang,
    }),

  get: (summaryId: string): Promise<Summary> =>
    api.get<Summary>(`/summaries/${summaryId}`),
};

export const mindmapsApi = {
  generate: (
    courseId: string,
    targetLang = "fr",
  ): Promise<StudyGenerationResponse> =>
    api.post<StudyGenerationResponse>("/mindmaps/generate", {
      course_id: courseId,
      target_lang: targetLang,
    }),

  get: (mindmapId: string): Promise<Mindmap> =>
    api.get<Mindmap>(`/mindmaps/${mindmapId}`),
};

export const documentAssetsApi = {
  getManifest: (
    documentVersionId: string,
  ): Promise<{ items: DocumentAssetManifestItem[]; total: number }> =>
    api.get<{ items: DocumentAssetManifestItem[]; total: number }>(
      `/documents/${documentVersionId}/assets/manifest`,
    ),

  get: (
    documentVersionId: string,
    assetType: "FLASHCARDS" | "QUIZ" | "SUMMARY" | "MINDMAP",
    params?: { target_lang?: string; profile?: string },
  ): Promise<DocumentAssetCache> => {
    const searchParams = new URLSearchParams();
    if (params?.target_lang) searchParams.append("target_lang", params.target_lang);
    if (params?.profile) searchParams.append("profile", params.profile);
    const query = searchParams.toString();
    return api.get<DocumentAssetCache>(
      `/documents/${documentVersionId}/assets/${assetType}${query ? `?${query}` : ""}`,
    );
  },

  generate: (
    documentVersionId: string,
    data: {
      asset_type: "FLASHCARDS" | "QUIZ" | "SUMMARY" | "MINDMAP";
      target_lang?: string;
      profile?: string;
      force_regenerate?: boolean;
    },
  ): Promise<DocumentAssetCache> =>
    api.post<DocumentAssetCache>(
      `/documents/${documentVersionId}/assets/generate`,
      data,
    ),
};

export const contributionsApi = {
  submit: (formData: FormData): Promise<Contribution> =>
    api.postFormData<Contribution>("/contributions", formData),

  submitContributorRequest: (
    formData: FormData,
  ): Promise<{ message: string; request: ContributorRequest }> =>
    api.postFormData<{ message: string; request: ContributorRequest }>(
      "/contributor-requests",
      formData,
    ),

  getContributorStatus: (): Promise<ContributorStatusResponse> =>
    api.get<ContributorStatusResponse>("/contributor-requests/me"),

  listMine: (params?: {
    status?: string;
  }): Promise<PaginatedResponse<Contribution>> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append("status", params.status);
    const query = searchParams.toString();
    return api.get<PaginatedResponse<Contribution>>(
      `/contributions/me${query ? `?${query}` : ""}`,
    );
  },

  delete: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(`/contributions/${id}`),

  admin: {
    list: (params?: {
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<PaginatedResponse<Contribution>> => {
      const searchParams = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value));
      });
      const query = searchParams.toString();
      return api.get<PaginatedResponse<Contribution>>(
        `/admin/contributions${query ? `?${query}` : ""}`,
      );
    },

    approve: (
      contributionId: string,
      data?: { review_note?: string },
    ): Promise<{ message: string; course_id: string }> =>
      api.patch<{ message: string; course_id: string }>(
        `/admin/contributions/${contributionId}`,
        { action: "approve", ...data },
      ),

    reject: (
      contributionId: string,
      reviewNote: string,
    ): Promise<{ message: string }> =>
      api.patch<{ message: string }>(`/admin/contributions/${contributionId}`, {
        action: "reject",
        review_note: reviewNote,
      }),

    listContributorRequests: (params?: {
      status?: ContributorRequest["status"];
      limit?: number;
      offset?: number;
    }): Promise<PaginatedResponse<ContributorRequest>> => {
      const searchParams = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value));
      });
      const query = searchParams.toString();
      return api.get<PaginatedResponse<ContributorRequest>>(
        `/admin/contributor-requests${query ? `?${query}` : ""}`,
      );
    },

    approveContributorRequest: (
      requestId: string,
      data?: { review_note?: string },
    ): Promise<{ message: string; id: string; status: string }> =>
      api.post<{ message: string; id: string; status: string }>(
        `/admin/contributor-requests/${requestId}/approve`,
        data || {},
      ),

    rejectContributorRequest: (
      requestId: string,
      reviewNote: string,
    ): Promise<{ message: string; id: string; status: string }> =>
      api.post<{ message: string; id: string; status: string }>(
        `/admin/contributor-requests/${requestId}/reject`,
        { review_note: reviewNote },
      ),
  },
};

export const feedbackApi = {
  submit: (data: {
    type: string;
    title: string;
    description: string;
    severity?: string;
    screenshot_url?: string;
  }): Promise<{ message: string; id: string }> =>
    api.post<{ message: string; id: string }>("/reports", data),
};

export const flashcardApi = {
  exportCalendar: (): Promise<Blob> =>
    api.getBlob("/study/calendar/ics"),
};

export const dashboardApi = {
  student: {
    getOverview: async (): Promise<SmartOverviewResponse> => {
      const response = await api.get<SmartOverviewResponse>("/students/me/dashboard");
      return response;
    },

    getHistory: (): Promise<PaginatedResponse<ActivityLogItem>> =>
      api.get<ActivityLogItem[]>("/students/me/history").then((items) => ({
        items,
        meta: emptyMeta(items.length),
      })),
  },

  teacher: {
    getAnalytics: async (): Promise<TeacherAnalytics> => {
      const response = await api.get<{
        summary?: {
          total_courses?: number;
          total_uploads?: number;
          approved_uploads?: number;
          pending_uploads?: number;
          rejected_uploads?: number;
        };
        activity?: {
          recent_uploads_7d?: number;
          weekly_trend?: Array<{
            week: string;
            uploads: number;
            approved: number;
          }>;
        };
        top_courses?: Array<{
          course_id: string;
          title: string;
          uploads: number;
          approved_uploads: number;
          last_submission_at: string | null;
        }>;
      }>("/teacher/analytics");

      return {
        total_courses: response.summary?.total_courses ?? 0,
        total_uploads: response.summary?.total_uploads ?? 0,
        approved_uploads: response.summary?.approved_uploads ?? 0,
        pending_uploads: response.summary?.pending_uploads ?? 0,
        rejected_uploads: response.summary?.rejected_uploads ?? 0,
        recent_uploads_7d: response.activity?.recent_uploads_7d ?? 0,
        top_courses: response.top_courses ?? [],
        weekly_trend: response.activity?.weekly_trend ?? [],
      };
    },

    getCourseAnalytics: (courseId: string): Promise<CourseAnalytics> =>
      api.get<CourseAnalytics>(`/teacher/courses/${courseId}/analytics`),
  },

  admin: {
    getDashboard: async (): Promise<AdminDashboard> => {
      const response = await api.get<{
        totals: {
          users: number;
          courses: number;
          contributions: { total: number; approved: number; pending: number; rejected: number };
          reports: { total: number; pending: number };
        };
        breakdown: {
          users_by_role: Record<string, number>;
          contributions_by_status: Record<string, number>;
        };
        weekly_activity?: Array<{
          day: string;
          users: number;
          contributions: number;
        }>;
      }>("/admin/dashboard");

      return {
        total_users: response.totals?.users ?? 0,
        total_courses: response.totals?.courses ?? 0,
        total_contributions: response.totals?.contributions?.total ?? 0,
        pending_contributions: response.totals?.contributions?.pending ?? 0,
        users_by_role: response.breakdown?.users_by_role ?? {},
        contributions_by_status: response.breakdown?.contributions_by_status ?? {},
        weekly_activity: response.weekly_activity ?? [],
      };
    },

    exportAnalytics: (): Promise<Blob> =>
      api.getBlob("/admin/analytics/export"),
  },
};

export const analyticsApi = {
  dailyActivity: (days: number = 365): Promise<{ date: string; value: number }[]> =>
    api.get<{ date: string; value: number }[]>(`/analytics/daily-activity?days=${days}`),
};

export const notificationsApi = {
  list: (params?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Notification>> =>
    api.get<PaginatedResponse<Notification>>(
      `/notifications?limit=${params?.limit || 20}&offset=${params?.offset || 0}`,
    ),

  markAsRead: (notificationId: string): Promise<{ status: string }> =>
    api.patch(`/notifications/${notificationId}`),

  markAllAsRead: async (notificationIds: string[]): Promise<{ success: boolean }> => {
    await Promise.all(notificationIds.map((id) => notificationsApi.markAsRead(id)));
    return { success: true };
  },
};

export const adminApi = {
  listUsers: (params?: {
    role?: string;
    filiere?: string;
    is_active?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<User>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    const query = searchParams.toString();
    return api.get<PaginatedResponse<User>>(`/admin/users${query ? `?${query}` : ""}`);
  },

  importTeachers: (
    formData: FormData,
  ): Promise<TeacherImportResult> =>
    api.postFormData("/admin/teachers/import", formData),

  
  listDepartments: (includeArchived?: boolean) => {
    const url = includeArchived ? "/admin/departments?include_archived=true" : "/admin/departments";
    return api.get<Department[]>(url);
  },

  createDepartment: (data: { name: string; allowed_levels: string[] }): Promise<Department> =>
    api.post<Department>("/admin/departments", data),

  updateDepartment: (
    departmentId: string,
    data: { name?: string; allowed_levels?: string[] },
  ): Promise<Department> => api.patch<Department>(`/admin/departments/${departmentId}`, data),

  deleteDepartment: (departmentId: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(`/admin/departments/${departmentId}`),

  listCatalogCourses: (includeArchived?: boolean) => {
    const url = includeArchived ? "/admin/catalog/courses?include_archived=true" : "/admin/catalog/courses";
    return api.get(url);
  },

  createCatalogCourse: (data: {
    title: string;
    description?: string | null;
    department_id: string;
    level: string;
    course_type: string;
    language: string;
    academic_year?: string;
    major_id?: string;
    filiere?: string | null;
  }): Promise<Course> =>
    api.post<Partial<Course>>("/admin/catalog/courses", data).then(normalizeCourse),

  updateCatalogCourse: (
    courseId: string,
    data: {
      title?: string;
      description?: string | null;
      department_id?: string;
      level?: string;
      course_type?: string;
      academic_year?: string;
      language?: string;
      is_deleted?: boolean;
      major_id?: string;
      filiere?: string | null;
    },
  ): Promise<Course> =>
    api.patch<Partial<Course>>(`/admin/catalog/courses/${courseId}`, data).then(normalizeCourse),

  deleteCatalogCourse: (courseId: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(`/admin/catalog/courses/${courseId}`),

  downloadTeacherImportTemplate: (): Promise<Blob> =>
    api.getBlob("/admin/teachers/import-template"),

  getEstablishments: (): Promise<Establishment[]> =>
    api.get<Establishment[]>("/admin/establishments"),

  updateUser: (
    userId: string,
    data: {
      is_active?: boolean;
      is_verified?: boolean;
      role?: string;
      filiere?: string;
      nivel?: StudentLevel;
    },
  ): Promise<User> => api.patch<User>(`/admin/users/${userId}`, data),

  deleteUser: (userId: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(`/admin/users/${userId}`),

  listTeacherRequests: (params?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<TeacherVerificationRequest>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    const query = searchParams.toString();
    return api.get<PaginatedResponse<TeacherVerificationRequest>>(
      `/admin/teacher-requests${query ? `?${query}` : ""}`,
    );
  },

  approveTeacherRequest: (
    requestId: string,
    data?: { review_note?: string },
  ): Promise<{ message: string }> =>
    api.post<{ message: string }>(`/admin/teacher-requests/${requestId}/approve`, data || {}),

  listReports: (params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Report>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    const query = searchParams.toString();
    return api.get<PaginatedResponse<Report>>(`/admin/reports${query ? `?${query}` : ""}`);
  },

  resolveReport: (
    reportId: string,
    data: { action: "warn" | "remove" | "dismiss"; note?: string },
  ): Promise<{ message: string }> =>
    api.patch<{ message: string }>(`/admin/reports/${reportId}`, data),

  // ── Major CRUD ──
  listMajors: (params?: {
    department_id?: string;
    level?: string;
  }): Promise<{
    id: string;
    name: string;
    department_id: string;
    level: string;
    created_at: string;
  }[]> => {
    const searchParams = new URLSearchParams();
    if (params?.department_id) searchParams.append("department_id", params.department_id);
    if (params?.level) searchParams.append("level", params.level);
    const query = searchParams.toString();
    return api.get(`/admin/majors${query ? `?${query}` : ""}`);
  },

  createMajor: (data: {
    name: string;
    department_id: string;
    level: string;
  }) => api.post("/admin/majors", data),

  updateMajor: (majorId: string, data: {
    name?: string;
    department_id?: string;
    level?: string;
  }) => api.patch(`/admin/majors/${majorId}`, data),

  deleteMajor: (majorId: string) => api.delete(`/admin/majors/${majorId}`),
};


export class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 2;
  private reconnectDelay = 3000;
  private channel: string = "";
  private accessToken: string | null = null;

  constructor(private baseUrl: string = WS_BASE_URL) {}

  connect(channel: string, token?: string): void {
    this.channel = channel;
    this.accessToken = token || getAccessToken();

    const url = `${this.baseUrl}${channel}${this.accessToken ? `?accessToken=${this.accessToken}` : ""}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        console.log(`WebSocket connected to ${channel}`);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const channelListeners = this.listeners.get(channel);
          if (channelListeners) {
            channelListeners.forEach((callback) => callback(data));
          }
        } catch {
          // Silently skip malformed messages
        }
      };

      this.ws.onerror = () => {
        // Silenced: WebSocket errors are expected when Redis/backend WS is offline
      };

      this.ws.onclose = () => {
        this.attemptReconnect();
      };
    } catch {
      // Silenced: WebSocket unavailable in this environment
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay =
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      setTimeout(
        () => this.connect(this.channel, this.accessToken || undefined),
        delay,
      );
    }
  }

  disconnect(): void {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.listeners.clear();
    this.reconnectAttempts = this.maxReconnectAttempts;
  }

  subscribe(channel: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(callback);

    return () => {
      this.listeners.get(channel)?.delete(callback);
    };
  }

  send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WebSocketClient();

export function createForumWebSocket(courseId: string): WebSocketClient {
  const client = new WebSocketClient();
  client.connect(`/ws/forum/${courseId}`);
  return client;
}

export function createNotificationsWebSocket(userId: string): WebSocketClient {
  const client = new WebSocketClient();
  client.connect(`/ws/notifications/${userId}`);
  return client;
}

export { API_BASE_URL, WS_BASE_URL };
export type { InternalAxiosRequestConfig };



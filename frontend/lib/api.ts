import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/lib/store/useAuthStore';
import {
  QuizGenerateRequest,
  QuizGenerateResponse,
  SubmitAnswersRequest,
  QuizEvaluationResult,
  HistoryDataPoint,
  GenerateSummaryRequest,
  SummaryResponse,
  GenerateMindMapRequest,
  GenerateMindMapResponse
} from '@/types/api';

// --- Type Definitions ---
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// --- Axios Instance Setup ---
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  // CRITICAL: Required to send and receive httpOnly cookies cross-origin.
  // Without this, the browser will not send the refresh_token cookie to the backend.
  withCredentials: true, 
});

// --- Concurrency Management for Refresh Flow ---
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: any) => void;
}> = [];

/**
 * Processes the queued requests that failed while the token was refreshing.
 */
const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// --- Request Interceptor ---
api.interceptors.request.use(
  (config) => {
    // Ensure we are in the browser environment before accessing localStorage
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Response Interceptor ---
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    // Trigger auto-refresh flow only on 401 and if we haven't already retried this specific request.
    // DEFENSIVE ARCHITECTURE: Prevent infinite loops by not intercepting 401s from the auth endpoints themselves.
    if (
      error.response?.status === 401 && 
      originalRequest && 
      !originalRequest._retry &&
      originalRequest.url !== '/auth/login' &&
      originalRequest.url !== '/auth/refresh'
    ) {
      originalRequest._retry = true;

      // If a refresh is already in progress, queue the request
      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      isRefreshing = true;

      try {
        // We no longer pass the refresh_token in the body.
        // The browser automatically attaches the httpOnly cookie to this request.
        const response = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {}, {
          // Explicitly require credentials for the refresh call to ensure cookie inclusion
          withCredentials: true 
        });

        const newAccessToken = response.data.access_token;

        // Persist new access token securely
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', newAccessToken);
          // Note: We do NOT set the refreshToken here anymore. The backend handles it via Set-Cookie.
        }

        api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        // Resolve all queued requests with the new token
        processQueue(null, newAccessToken);
        
        // Retry the original request
        return api(originalRequest);
        
      } catch (refreshError: any) {
        // Refresh failed (e.g., refresh token expired, invalid, or blacklisted in Redis)
        processQueue(refreshError, null);
        
        // DEFENSIVE ARCHITECTURE: Sync the Axios network failure with the React global state
        if (typeof window !== 'undefined') {
          useAuthStore.getState().logout(); 
          
          // ARCHITECTURE FIX: Route Awareness.
          // Only force a hard redirect if the user is sitting on a protected route.
          // Public routes (like '/', '/about') should just silently degrade to an unauthenticated state.
          const currentPath = window.location.pathname;
          const isProtectedRoute = 
            currentPath.startsWith('/search') || 
            currentPath.startsWith('/upload') || 
            currentPath.startsWith('/admin') || 
            currentPath.startsWith('/document');

          if (isProtectedRoute) {
            window.location.href = '/auth/login?session_expired=true';
          }
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ==========================================
// API DOMAIN SERVICES
// ==========================================

export const quizApi = {
  /**
   * Generates a new quiz session for a specific document.
   */
  generateQuiz: async (data: QuizGenerateRequest): Promise<QuizGenerateResponse> => {
    const response = await api.post<QuizGenerateResponse>('/quizzes/generate', data);
    return response.data;
  },

  /**
   * Submits a completed quiz for evaluation.
   */
  submitQuiz: async (sessionId: string, data: SubmitAnswersRequest): Promise<QuizEvaluationResult> => {
    const response = await api.post<QuizEvaluationResult>(`/quizzes/${sessionId}/submit`, data);
    return response.data;
  },

  /**
   * Retrieves the 30-day quiz history for the current user.
   */
  getHistory: async (): Promise<HistoryDataPoint[]> => {
    const response = await api.get<HistoryDataPoint[]>('/quizzes/history');
    return response.data;
  },
};

export const studyApi = {
  /**
   * US-18: Generates an AI summary in one of three formats (EXECUTIVE, STRUCTURED, COMPARATIVE).
   */
  generateSummary: async (data: GenerateSummaryRequest): Promise<SummaryResponse> => {
    const response = await api.post<SummaryResponse>('/summaries/generate', data);
    return response.data;
  },

  /**
   * US-18: Retrieves the generated summary as a high-fidelity PDF Blob.
   * Strictly requests 'blob' response type to prevent binary stream corruption.
   */
  exportSummaryPdf: async (summaryId: string): Promise<Blob> => {
    const response = await api.get<Blob>(`/summaries/${summaryId}/export/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * US-18: Generates an interactive React Flow Mind Map from the document.
   */
  generateMindMap: async (data: GenerateMindMapRequest): Promise<GenerateMindMapResponse> => {
    const response = await api.post<GenerateMindMapResponse>('/mindmaps/generate', data);
    return response.data;
  },
};

export default api;
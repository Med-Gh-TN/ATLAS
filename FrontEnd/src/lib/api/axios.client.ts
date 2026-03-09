import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// ============================================================================
// ATLAS - SOTA API Client (Axios)
// Author: Mouhamed (Lead FE)
// Description: Configures Axios with httpOnly cookies and a robust queueing 
// system for handling concurrent 401 auto-refreshes without race conditions.
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  // CRITICAL: Required for sending and receiving httpOnly cookies securely
  withCredentials: true, 
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// --- State variables for the refresh queue lock ---
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

/**
 * Processes the queue of failed requests once a token refresh succeeds or fails.
 */
const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// ============================================================================
// REQUEST INTERCEPTOR
// ============================================================================
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Note: Since we use httpOnly cookies for JWT, we do not manually attach 
    // an Authorization header here. The browser handles it automatically.
    // We can add CSRF tokens or custom headers here if required by Tony (BE).
    return config;
  },
  (error: AxiosError) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// ============================================================================
// RESPONSE INTERCEPTOR
// ============================================================================
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 1. Check if the error is a 401 and we haven't already retried this specific request
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      
      // Prevent infinite refresh loops if the refresh endpoint itself fails
      if (originalRequest.url?.includes('/auth/refresh')) {
        // Refresh failed, user is completely logged out. Redirect to login.
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // 2a. If a refresh is already in progress, put this request in a queue
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      // 2b. Start the refresh process
      originalRequest._retry = true;
      isRefreshing = true;

      try {
        console.info('[API] Attempting token rotation...');
        // The backend uses a POST to /auth/refresh and reads the httpOnly refresh cookie
        await apiClient.post('/auth/refresh');
        
        // Refresh successful. Process queued requests.
        processQueue(null);
        
        // Retry the original failed request
        return apiClient(originalRequest);
      } catch (refreshError) {
        console.error('[API] Token rotation failed. Redirecting to login.', refreshError);
        processQueue(refreshError as AxiosError, null);
        
        // Redirect to login on failure
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        // Release the lock
        isRefreshing = false;
      }
    }

    // Pass through any other errors (400, 403, 500, etc.)
    return Promise.reject(error);
  }
);
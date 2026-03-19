import { create } from 'zustand';

// --- Type Definitions ---
export interface User {
  id: string;
  email: string;
  role?: string;
  // Expand this interface based on the JWT payload or backend user model
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  /**
   * Updates the global state to reflect a logged-in user.
   * Note: Token persistence is handled by the API layer/interceptor.
   */
  login: (user: User) => void;
  /**
   * Purges user state and aggressively clears client-side access tokens.
   * NOTE: To fully log out, the UI component MUST call `api.post('/auth/logout')` 
   * to clear the httpOnly refresh cookie and blacklist it in Redis before calling this.
   */
  logout: () => void;
}

// --- Global Auth Store ---
export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,

  login: (user: User) => {
    set({ 
      isAuthenticated: true, 
      user 
    });
  },

  logout: () => {
    // DEFENSIVE ARCHITECTURE: Ensure all traces of authentication are wiped 
    // from the browser environment to prevent replay attacks or stale state.
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      // We no longer attempt to remove 'refreshToken' here.
      // It is secured in an httpOnly cookie and managed by the backend / interceptor.
    }
    
    set({ 
      isAuthenticated: false, 
      user: null 
    });
  },
}));

// DEFENSIVE FIX: Provide default export to satisfy downstream dependents 
// (ChatInterface, DocumentHeader, FlashcardReviewModal) while maintaining the named export.
export default useAuthStore;
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// ATLAS - Global Auth State (Zustand)
// Author: Mouhamed (Lead FE)
// Description: Manages client-side user session data. Does NOT store JWTs, 
// as those are strictly handled via httpOnly cookies by the Axios client.
// ============================================================================

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean; // Tracks if the OTP validation is complete
  firstName?: string;
  lastName?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  
  // isLoading starts true because on first load, we don't know if the user 
  // has a valid httpOnly cookie until we ping the /auth/me endpoint.
  isLoading: boolean; 

  // Actions
  setAuth: (user: User) => void;
  clearAuth: () => void;
  setLoading: (status: boolean) => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true, 

      setAuth: (user: User) => 
        set({ 
          user, 
          isAuthenticated: true, 
          isLoading: false 
        }, false, 'auth/setAuth'),

      clearAuth: () => 
        set({ 
          user: null, 
          isAuthenticated: false, 
          isLoading: false 
        }, false, 'auth/clearAuth'),

      setLoading: (status: boolean) => 
        set({ 
          isLoading: status 
        }, false, 'auth/setLoading'),

      updateUser: (updates: Partial<User>) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null
        }), false, 'auth/updateUser'),
    }),
    { name: 'ATLAS_Auth_Store' }
  )
);
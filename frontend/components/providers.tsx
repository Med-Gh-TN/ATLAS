'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../lib/store/useAuthStore';
import api from '../lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  // DEFENSIVE ARCHITECTURE: Instantiate QueryClient inside useState.
  // This guarantees the client and its cache are not recreated on every React render,
  // preventing memory leaks and preserving the cache lifecycle.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is considered fresh for 1 minute before background refetching is triggered
            staleTime: 60 * 1000, 
            // Prevent aggressive refetching every time the user switches browser tabs
            refetchOnWindowFocus: false, 
            // Only retry failing requests once to prevent spamming the backend
            retry: 1, 
          },
        },
      })
  );

  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    // DEFENSIVE ARCHITECTURE: Silent Auth Hydration
    // Verifies the httpOnly cookie against the backend before rendering the application.
    const hydrateAuthState = async () => {
      try {
        const response = await api.get('/auth/me');
        if (response.data) {
          login(response.data);
        }
      } catch (error) {
        // 401 Unauthorized is expected if the cookie is missing or expired.
        // Purge any stale client state to be safe.
        logout();
      } finally {
        setIsHydrating(false);
      }
    };

    hydrateAuthState();
  }, [login, logout]);

  // Prevent UI layout shifts and unauthenticated "flashes" by holding the render
  // until the session state is mathematically proven.
  if (isHydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="flex flex-col items-center gap-4">
           {/* Minimalist ATLAS loading sequence */}
           <div className="w-8 h-8 border-4 border-neutral-900 border-t-transparent rounded-full animate-spin"></div>
           <p className="text-sm font-medium text-neutral-500 tracking-widest uppercase">Securing Session...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
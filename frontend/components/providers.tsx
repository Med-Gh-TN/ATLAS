'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

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

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
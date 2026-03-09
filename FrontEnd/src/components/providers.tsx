'use client';

// ============================================================================
// ATLAS - Global App Providers
// Author: Mouhamed (Lead FE)
// Description: Wraps the application in TanStack Query for state management
// and API data caching. Instantiated once per user session.
// ============================================================================

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export default function Providers({ children }: { children: React.ReactNode }) {
  // We use useState to ensure the QueryClient is only created once per session,
  // preventing it from being recreated during React re-renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // Data is fresh for 1 minute
            refetchOnWindowFocus: false, // Don't spam the backend on tab switch
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
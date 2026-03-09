import React from 'react';
import Providers from '@/components/providers';
import './globals.css';

// ============================================================================
// ATLAS - Root Layout
// Author: Mouhamed (Lead FE)
// Description: The absolute HTML skeleton of the app. Applies global providers
// (like TanStack Query) and standard styling to all routes.
// ============================================================================

export const metadata = {
  title: 'ATLAS - Plateforme Académique',
  description: 'Aggregated Tunisian Learning & Academic System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="antialiased">
      <body className="min-h-screen bg-gray-50 text-gray-900 selection:bg-blue-200">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
import React from 'react';
import { IBM_Plex_Sans } from 'next/font/google';
import Providers from '@/components/providers';
import './globals.css';

// ============================================================================
// ATLAS - Root Layout
// Author: Mouhamed (Lead FE)
// Description: The absolute HTML skeleton of the app. Applies global providers
// (TanStack Query) and the official IBM Plex typography.
// ============================================================================

// SOTA Font Loading: Optimized at build time, zero layout shift
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ibm-plex',
});

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
    <html lang="fr" className={`${ibmPlexSans.variable} antialiased`}>
      {/* We apply the font variable and a fallback sans-serif to the body */}
      <body className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-200">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
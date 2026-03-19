import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import Script from 'next/script';

// SOTA Absolute Import - Maps directly to frontend/globals.css
import '@/globals.css';

// Import our newly created global providers and navigation components
import { Providers } from '@/components/providers';
import GlobalHeader from '@/components/GlobalHeader';
import GlobalFooter from '@/components/GlobalFooter';

// Enforcing IBM Plex typography per US-02 ATLAS Design Tokens
const ibmPlex = IBM_Plex_Sans({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ibm-plex',
});

export const metadata: Metadata = {
  title: 'ATLAS | Academic Knowledge Platform',
  description: 'From chaos to clarity. An AI-Powered Platform for Centralizing and Democratizing Academic Resources.',
  manifest: '/manifest.json', // Best practice for PWA integration
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ibmPlex.variable} antialiased`} suppressHydrationWarning>
      {/* DEFENSIVE UI: suppressHydrationWarning is required on the HTML tag 
        to prevent React mismatch errors when next-themes injects dark mode classes on the client.
      */}
      <body className="min-h-screen bg-background text-foreground font-sans flex flex-col selection:bg-primary/20 selection:text-primary">
        
        {/* Inject TanStack Query Global Provider */}
        <Providers>
          {/* ARCHITECTURE FIX: Inject dynamic global header */}
          <GlobalHeader />
          
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          
          {/* ARCHITECTURE FIX: Inject dynamic global footer */}
          <GlobalFooter />
        </Providers>

        {/* DEFENSIVE ARCHITECTURE: PWA & Push Notification Lifecycle Integration 
          Using dangerouslySetInnerHTML prevents SWC minifier corruption bugs 
          caused by inline template literals and double-slash comments.
        */}
        <Script 
          id="service-worker-registry" 
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('[ATLAS Architecture] Service Worker registered with scope: ', registration.scope);
                    },
                    function(err) {
                      console.error('[ATLAS Architecture] Service Worker registration failed: ', err);
                    }
                  );
                  
                  /* US-16: Request notification permission for spaced-repetition reminders */
                  if ('Notification' in window && Notification.permission === 'default') {
                    Notification.requestPermission().then(function(permission) {
                      if (permission === 'granted') {
                        console.log('[ATLAS Architecture] Push Notification permission granted.');
                      }
                    });
                  }
                });
              }
            `
          }}
        />
      </body>
    </html>
  );
}
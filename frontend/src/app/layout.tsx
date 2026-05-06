import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";
import {
  Inter,
  IBM_Plex_Mono,
  Noto_Naskh_Arabic,
} from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegistration } from "@/components/service-worker";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const notoNaskhArabic = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5e9bff" },
    { media: "(prefers-color-scheme: dark)", color: "#0842a0" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "ATLAS - Tunisian Academic Platform",
    template: "%s | ATLAS",
  },
  description:
    "ATLAS - Aggregated Tunisian Learning & Academic System. Your intelligent companion for academic excellence in Tunisia.",
  keywords: [
    "education",
    "Tunisia",
    "learning",
    "academic",
    "university",
    "study",
    "flashcards",
    "quizzes",
  ],
  authors: [{ name: "ATLAS Team" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ATLAS",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    siteName: "ATLAS",
    title: "ATLAS - Tunisian Academic Platform",
    description:
      "Your intelligent companion for academic excellence in Tunisia",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const lang = cookieStore.get("atlas_lang")?.value || "fr";
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body
        className={`${inter.variable} ${ibmPlexMono.variable} ${notoNaskhArabic.variable} min-h-screen flex flex-col bg-background text-foreground antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          {children}
        </Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
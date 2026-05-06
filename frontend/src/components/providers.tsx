/**
 * @file frontend/src/components/providers.tsx
 * @description Global application providers.
 * SOTA FIX: Eradicated the `<div style={{ visibility: "hidden" }}>` anti-pattern. NextThemes handles hydration automatically via script injection.
 * @layer Configuration
 */

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ThemeSync } from "@/components/theme-sync";

type Language = "fr" | "ar" | "en";

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  initialLang: Language;
}

function getInitialLanguage(): Language {
  if (typeof window === "undefined") {
    return "fr";
  }
  const stored = localStorage.getItem("atlas_lang");
  if (stored === "fr" || stored === "ar" || stored === "en") {
    return stored;
  }
  return "fr";
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "fr",
  setLang: () => {},
  initialLang: "fr",
});

export const useLanguageContext = () => useContext(LanguageContext);

export function useAppLanguage() {
  const context = useLanguageContext();
  return {
    lang: context.lang,
    setLanguage: context.setLang,
    isRTL: context.lang === "ar",
    languageNames: {
      fr: "Français",
      ar: "العربية",
      en: "English",
    },
  };
}

export function Providers({ 
  children,
}: { 
  children: React.ReactNode;
}) {
  const [lang, setLang] = useState<Language>("fr");
  
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    const initial = getInitialLanguage();
    setLang(initial);
    document.documentElement.lang = initial;
    document.documentElement.dir = initial === "ar" ? "rtl" : "ltr";
  }, []);

  const handleSetLang = (nextLang: Language) => {
    setLang(nextLang);
    localStorage.setItem("atlas_lang", nextLang);
    document.cookie = `atlas_lang=${encodeURIComponent(nextLang)}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = nextLang;
    document.documentElement.dir = nextLang === "ar" ? "rtl" : "ltr";
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: handleSetLang, initialLang: lang }}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>
          <ThemeSync />
          {children}
        </QueryClientProvider>
      </NextThemesProvider>
    </LanguageContext.Provider>
  );
}
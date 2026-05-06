"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme as useNextTheme } from "next-themes";
import { useUIStore } from "@/store/auth.store";
import { useLanguageContext } from "@/components/providers";

export type Language = "fr" | "ar" | "en";

const SUPPORTED_LANGUAGES: Language[] = ["fr", "ar", "en"];

function isLanguage(value: string | null | undefined): value is Language {
  return !!value && SUPPORTED_LANGUAGES.includes(value as Language);
}

interface RTLContext {
  dir: "ltr" | "rtl";
  isRTL: boolean;
  lang: Language;
  setLanguage: (lang: Language) => void;
  languageNames: Record<Language, string>;
  toggleRTL: () => void;
}

export function useRTL(): RTLContext {
  const { lang: contextLang, setLang: setContextLang } = useLanguageContext();
  const { isRTL, setRTL } = useUIStore();
  
  const [lang, setLang] = useState<Language>(contextLang);

  useEffect(() => {
    setLang(contextLang);
  }, [contextLang]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    }
    setRTL(lang === "ar");
  }, [lang, setRTL]);

  const setLanguage = useCallback((nextLang: Language) => {
    setLang(nextLang);
    setContextLang(nextLang);
    localStorage.setItem("atlas_lang", nextLang);
    if (typeof document !== "undefined") {
      document.cookie = `atlas_lang=${encodeURIComponent(nextLang)}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.lang = nextLang;
      document.documentElement.dir = nextLang === "ar" ? "rtl" : "ltr";
    }
  }, [setContextLang]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "atlas_lang") return;
      if (isLanguage(event.newValue)) {
        setLanguage(event.newValue);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setLanguage]);

  return {
    dir: lang === "ar" ? "rtl" : "ltr",
    isRTL: lang === "ar",
    lang,
    setLanguage,
    languageNames: {
      fr: "Français",
      ar: "العربية",
      en: "English",
    },
    toggleRTL: () => {
      const newLang = lang === "ar" ? "fr" : "ar";
      setLanguage(newLang);
    },
  };
}

export function useTheme() {
  const { theme, setTheme: setStoredTheme } = useUIStore();
  const { resolvedTheme, setTheme: setNextTheme } = useNextTheme();

  return {
    theme,
    resolvedTheme,
    setTheme: (nextTheme: "light" | "dark" | "system") => {
      setStoredTheme(nextTheme);
      setNextTheme(nextTheme);
    },
  };
}

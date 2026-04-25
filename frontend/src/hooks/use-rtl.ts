"use client";

import { useEffect, useState } from "react";
import { useTheme as useNextTheme } from "next-themes";
import { useUIStore } from "@/store/auth.store";

export type Language = "fr" | "ar" | "en";

interface RTLContext {
  dir: "ltr" | "rtl";
  isRTL: boolean;
  lang: Language;
  setLanguage: (lang: Language) => void;
  languageNames: Record<Language, string>;
}

function applyDocumentLanguage(lang: Language, setRTL: (rtl: boolean) => void) {
  const rtl = lang === "ar";
  setRTL(rtl);
  document.documentElement.lang = lang;
  document.documentElement.dir = rtl ? "rtl" : "ltr";
}

export function useRTL(): RTLContext {
  const { isRTL, setRTL } = useUIStore();
  const [lang, setLangState] = useState<Language>("fr");

  const setLanguage = (nextLang: Language) => {
    setLangState(nextLang);
    localStorage.setItem("atlas_lang", nextLang);
    document.cookie = `atlas_lang=${nextLang}; path=/; max-age=31536000; SameSite=Lax`;
    applyDocumentLanguage(nextLang, setRTL);
  };

  useEffect(() => {
    const stored = (localStorage.getItem("atlas_lang") as Language | null) || "fr";
    setLangState(stored);
    applyDocumentLanguage(stored, setRTL);
  }, [setRTL]);

  return {
    dir: isRTL ? "rtl" : "ltr",
    isRTL,
    lang,
    setLanguage,
    languageNames: {
      fr: "Francais",
      ar: "Arabic",
      en: "English",
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

"use client";

import { useEffect } from "react";
import { useTheme as useNextTheme } from "next-themes";
import { useRTL } from "@/hooks/use-rtl";
import { useUIStore } from "@/store/auth.store";

export function ThemeSync() {
  const { lang, dir } = useRTL();
  const storedTheme = useUIStore((state) => state.theme);
  const { setTheme } = useNextTheme();

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [dir, lang]);

  useEffect(() => {
    setTheme(storedTheme);
  }, [setTheme, storedTheme]);

  return null;
}

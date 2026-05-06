"use client";

import { useLanguageContext } from "@/components/providers";
import { useState, useEffect } from "react";

export function useForceUpdate() {
  const { lang } = useLanguageContext();
  const [, setTick] = useState(0);

  useEffect(() => {
    setTick((t) => t + 1);
  }, [lang]);
}
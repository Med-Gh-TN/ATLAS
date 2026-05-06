"use client";

import { useLanguageContext } from "@/components/providers";
import { translations, Language } from "@/lib/translations";
import { useForceUpdate } from "@/hooks/use-force-update";

const allTranslations = translations as any;

/**
 * Helper to convert camelCase keys to Human Readable text
 * e.g., "manageUsers" -> "Manage Users"
 */
function humanizeKey(key: string): string {
  const result = key.replace(/([A-Z])/g, " $1");
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function useTranslation() {
  const { lang } = useLanguageContext();
  useForceUpdate();

  const t = (
    section: string,
    params?: Record<string, string | number>
  ): string => {
    const sections = section.split(".");
    let value: any = allTranslations[lang as Language];

    // Try target language
    for (const key of sections) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        value = undefined;
        break;
      }
    }

    // Fallback to English if target language is missing the key
    if (value === undefined) {
      value = allTranslations.en;
      for (const k of sections) {
        if (value && typeof value === "object" && k in value) {
          value = value[k];
        } else {
          value = undefined;
          break;
        }
      }
    }

    // DEFENSIVE ARCHITECTURE: Fallback to humanized key name
    if (typeof value !== "string") {
      const lastKey = sections[sections.length - 1];
      return humanizeKey(lastKey);
    }

    let text = value;

    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        text = text.replace(new RegExp(`\\{${key}\\}`, "g"), String(val));
      });
    }

    return text;
  };

  const tSection = (section: string): Record<string, string> => {
    // Merge Target Lang with English Fallback
    const targetData = allTranslations[lang as Language]?.[section] || {};
    const fallbackData = allTranslations.en[section] || {};
    const mergedData = { ...fallbackData, ...targetData };

    // DEFENSIVE ARCHITECTURE: JS Proxy to prevent 'undefined' UI crashes
    return new Proxy(mergedData, {
      get(target, prop) {
        if (typeof prop === "string") {
          // If the key exists in our dictionaries, return it
          if (prop in target) {
            return target[prop];
          }
          // If the key is missing entirely, auto-generate a readable string!
          // This prevents .toLowerCase() crashes in components.
          return humanizeKey(prop);
        }
        return undefined;
      },
    });
  };

  return { t, tSection, lang };
}
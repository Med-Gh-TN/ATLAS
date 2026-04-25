import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "atlas-blue-dark": "var(--atlas-blue-dark)",
        "atlas-blue-mid": "var(--atlas-blue-mid)",
        "atlas-blue-light": "var(--atlas-blue-light)",
        "atlas-blue-pale": "var(--atlas-blue-pale)",
        "atlas-gray-dark": "var(--atlas-gray-dark)",
        "atlas-gray-900": "var(--atlas-gray-900)",
        "atlas-gray-800": "var(--atlas-gray-800)",
        "atlas-success": "var(--success)",
        "atlas-warning": "var(--warning)",
        "atlas-danger": "var(--destructive)",
      },
      fontFamily: {
        sans: ["var(--font-ibm-plex-sans)", "system-ui", "sans-serif"],
        arabic: [
          "var(--font-noto-naskh-arabic)",
          "var(--font-ibm-plex-sans)",
          "sans-serif",
        ],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
      },
    },
  },
};

export default config;

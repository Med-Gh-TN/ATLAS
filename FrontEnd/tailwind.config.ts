import type { Config } from "tailwindcss";

// ============================================================================
// ATLAS - Tailwind Configuration
// Description: Global design tokens, including the official IBM Plex font.
// ============================================================================

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/ui/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Overrides the default Tailwind 'sans' to use IBM Plex Sans
        sans: ['var(--font-ibm-plex)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
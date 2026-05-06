import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      /* ═══════════════════════════════════════════════════════════
         MATHEMATICAL GRID & PROPORTIONS
         Resource #1, #2, #5, #7
         ═══════════════════════════════════════════════════════════ */
      spacing: {
        "0":   "0",
        "1":   "0.25rem",      /*  4px = 1 grid unit  */
        "2":   "0.5rem",       /*  8px = 2 units     */
        "3":   "0.75rem",      /* 12px = 3 units     */
        "4":   "1rem",         /* 16px = 4 units     */
        "5":   "1.25rem",      /* 20px               */
        "6":   "1.5rem",       /* 24px = 6 units     */
        "8":   "2rem",         /* 32px = 8 units     */
        "10":  "2.5rem",       /* 40px               */
        "12":  "3rem",         /* 48px = 12 units    */
        "16":  "4rem",         /* 64px = 16 units    */
        "golden": "61.8%",      /* golden ratio width helper */
        "sqrt2":  "70.7%",      /* 1 / 1.414 ≈ 0.707 */
      },

      /* ═══════════════════════════════════════════════════════════
         TYPOGRAPHY — clamp() responsive scale (Resource #6)
         ═══════════════════════════════════════════════════════════ */
      fontSize: {
        xs:   "clamp(0.6875rem, 0.65rem + 0.2vw, 0.75rem)",
        sm:   "clamp(0.75rem,  0.7rem  + 0.3vw, 0.875rem)",
        base: "clamp(0.875rem, 0.8rem  + 0.5vw, 1.05rem)",
        lg:   "clamp(1rem,     0.9rem  + 0.6vw, 1.25rem)",
        xl:   "clamp(1.125rem, 1rem    + 0.8vw, 1.5rem)",
        "2xl": "clamp(1.25rem,  1.1rem  + 1.0vw, 1.75rem)",
        "3xl": "clamp(1.5rem,   1.3rem  + 1.4vw, 2.25rem)",
        "4xl": "clamp(1.75rem,  1.5rem  + 2.0vw, 3rem)",
      },

      /* ═══════════════════════════════════════════════════════════
         RESTRICTED COLOR PALETTE (Resource #8: ≤3 functional colors)
         ═══════════════════════════════════════════════════════════ */
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        /* Semantic feedback */
        success: {
          DEFAULT: "hsl(142 76% 36%)",
          foreground: "hsl(0 0% 100%)",
        },
        destructive: {
          DEFAULT: "hsl(0 84% 60%)",
          foreground: "hsl(0 0% 100%)",
        },
      },

      /* ═══════════════════════════════════════════════════════════
         APPLE HIG: 8×N Corner Radii (Resource #7)
         ═══════════════════════════════════════════════════════════ */
      borderRadius: {
        sm:   "8px",      /* 8×1 */
        md:   "16px",     /* 8×2 */
        lg:   "24px",     /* 8×3 */
        xl:   "32px",     /* 8×4 */
        "2xl": "40px",    /* 8×5 */
        full: "9999px",
      },

      /* ═══════════════════════════════════════════════════════════
         SHADOWS — depth hierarchy (Resource #7)
         ═══════════════════════════════════════════════════════════ */
      boxShadow: {
        sm:  "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        md:  "0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
        lg:  "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
        xl:  "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.05)",
        glow: "0 0 15px -3px hsl(194 73% 57% / 0.3)",  /* primary glow */
      },

      /* ═══════════════════════════════════════════════════════════
         FONT FAMILIES (unchanged)
         ═══════════════════════════════════════════════════════════ */
      fontFamily: {
        sans: ["Inter", "Google Sans Text", "ui-sans-serif", "system-ui"],
        arabic: ["Noto Naskh Arabic", "IBM Plex Sans Arabic", "serif"],
        mono: ["IBM Plex Mono", "Roboto Mono", "monospace"],
      },

      /* ═══════════════════════════════════════════════════════════
         TRANSITION DURATIONS (Resource #3: Norman feedback timing)
         ═══════════════════════════════════════════════════════════ */
      transitionDuration: {
        fast:   "150ms",
        normal: "250ms",
        slow:   "350ms",
      },
      transitionTimingFunction: {
        "default": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
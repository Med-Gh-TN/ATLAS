/**
 * @file frontend/src/components/ui/generative-canvas.tsx
 * @description Dynamic rendering surface for Generative UI. Reacts instantly to LLM JSON payloads.
 * SOTA FIX: Replaced basic mindmap with a Semantic Virtual Board mimicking a high-contrast chalkboard.
 * Supports structured lists, grid layouts, and process flows driven entirely by JSON.
 * @layer Core Logic / Presentation
 * @dependencies react, framer-motion, lucide-react, @/store/live-sync.store
 */

"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Lightbulb, ChevronRight } from "lucide-react";
import { useLiveSyncStore } from "@/store/live-sync.store";

// --- CHALKBOARD COLOR MAPPINGS ---
const THEME_MAP = {
  blue: {
    text: "text-sky-300",
    border: "border-sky-400/40",
    bg: "bg-sky-950/30",
    icon: "text-sky-400",
  },
  yellow: {
    text: "text-amber-200",
    border: "border-amber-400/40",
    bg: "bg-amber-950/30",
    icon: "text-amber-400",
  },
  green: {
    text: "text-emerald-300",
    border: "border-emerald-400/40",
    bg: "bg-emerald-950/30",
    icon: "text-emerald-400",
  },
  red: {
    text: "text-rose-300",
    border: "border-rose-400/40",
    bg: "bg-rose-950/30",
    icon: "text-rose-400",
  },
  white: {
    text: "text-slate-200",
    border: "border-slate-500/40",
    bg: "bg-slate-800/30",
    icon: "text-slate-400",
  }
};

type ThemeKey = keyof typeof THEME_MAP;

// --- GENERATIVE COMPONENT REGISTRY ---

interface BoardSection {
  id: string;
  title: string;
  type: "list" | "process" | "grid";
  items: string[];
  colorTheme?: ThemeKey;
}

interface VirtualBoardProps {
  title: string;
  subtitle?: string;
  sections: BoardSection[];
  activeAnimations?: Record<string, boolean>;
}

function VirtualBoard({ title, subtitle, sections = [], activeAnimations = {} }: VirtualBoardProps) {
  return (
    // Mimicking a dark chalkboard with a subtle inner shadow and texture
    <div className="flex h-full w-full flex-col overflow-y-auto bg-slate-950 p-6 shadow-[inset_0_0_60px_rgba(0,0,0,0.5)]">
      
      {/* Board Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col items-center justify-center border-b-2 border-slate-700/50 pb-4 text-center"
      >
        <h2 className="text-2xl font-bold tracking-widest text-slate-100 uppercase drop-shadow-md">
          {title || "Virtual Board"}
        </h2>
        {subtitle && (
          <p className="mt-2 text-sm font-medium tracking-wider text-amber-200/80">
            {subtitle}
          </p>
        )}
      </motion.div>

      {/* Dynamic Sections Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {sections.map((section, index) => {
          const theme = THEME_MAP[section.colorTheme || "white"] || THEME_MAP.white;
          const sectionId = section.id || `section_${index}`;
          
          // Check if sync engine triggered an animation for this specific section
          const isActive = Object.entries(activeAnimations).some(
            ([animKey, animConfig]) =>
              (animConfig as any).target === sectionId && activeAnimations[animKey] === true
          );

          return (
            <motion.div
              key={sectionId}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{
                opacity: 1,
                scale: isActive ? 1.02 : 1,
                boxShadow: isActive
                  ? `0 0 20px -2px var(--tw-shadow-color)`
                  : "none",
              }}
              transition={{ duration: 0.4 }}
              className={`relative flex flex-col rounded-xl border-2 ${theme.border} ${theme.bg} p-4 backdrop-blur-sm ${isActive ? "shadow-sky-500/30 z-10" : ""}`}
            >
              {/* Section Title */}
              <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
                <Lightbulb className={`h-4 w-4 ${theme.icon}`} />
                <h3 className={`text-sm font-bold uppercase tracking-wider ${theme.text}`}>
                  {section.title}
                </h3>
              </div>

              {/* Render based on semantic type */}
              {section.type === "process" ? (
                // Process Flow: Render items inline with arrows
                <div className="flex flex-wrap items-center gap-2">
                  {section.items.map((item, i) => (
                    <React.Fragment key={i}>
                      <div className={`rounded border ${theme.border} bg-black/20 px-3 py-1.5 text-sm font-medium ${theme.text}`}>
                        {item}
                      </div>
                      {i < section.items.length - 1 && (
                        <ArrowRight className={`h-4 w-4 ${theme.icon} opacity-70`} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              ) : section.type === "grid" ? (
                // Grid: Render items in a 2-column grid
                <div className="grid grid-cols-2 gap-3">
                  {section.items.map((item, i) => (
                    <div key={i} className={`flex items-start gap-2 text-sm ${theme.text}`}>
                      <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                      <span className="leading-snug">{item}</span>
                    </div>
                  ))}
                </div>
              ) : (
                // List (Default): Render items sequentially
                <div className="flex flex-col gap-2">
                  {section.items.map((item, i) => (
                    <div key={i} className={`flex items-start gap-2 text-sm ${theme.text}`}>
                      <ChevronRight className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${theme.icon} opacity-60`} />
                      <span className="leading-snug">{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// Map the string names from the LLM JSON to actual React Components
const COMPONENT_REGISTRY: Record<string, React.FC<any>> = {
  VirtualBoard,
};

// --- MAIN CANVAS COMPONENT ---

export function GenerativeCanvas() {
  const activeComponent = useLiveSyncStore((state) => state.activeComponent);
  const componentProps = useLiveSyncStore((state) => state.componentProps);
  const activeAnimations = useLiveSyncStore((state) => state.activeAnimations);

  // Safely resolve the component from the registry
  const RenderedComponent = useMemo(() => {
    if (!activeComponent) return null;
    return COMPONENT_REGISTRY[activeComponent] || null;
  }, [activeComponent]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-slate-900">
      {/* Decorative Header */}
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur-sm">
        <Sparkles className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
          Live Interactive Board
        </span>
      </div>

      {/* Render Surface */}
      <div className="relative flex-1 bg-slate-900">
        <AnimatePresence mode="wait">
          {RenderedComponent ? (
            <motion.div
              key={activeComponent}
              initial={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
              animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
              exit={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full"
            >
              {/* Pass the JSON props + the active 60FPS animation triggers */}
              <RenderedComponent {...(componentProps || {})} activeAnimations={activeAnimations} />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center text-slate-500"
            >
              <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 bg-slate-800/50 shadow-inner">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/20 opacity-75"></span>
                <Sparkles className="h-6 w-6 text-amber-400/60" />
              </div>
              <p className="text-sm font-semibold tracking-wide text-slate-300">Listening and analyzing...</p>
              <p className="mt-1 text-xs opacity-70">The virtual board will populate as topics are discussed.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
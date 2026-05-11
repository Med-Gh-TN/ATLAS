/**
 * @file frontend/src/components/ui/sticky-notes.tsx
 * @description Visualizes background memory events (Node C) such as student weaknesses, extracted concepts, and summaries.
 * SOTA FIX: Removed hardcoded slate colors. Implemented semantic theme variables and refined Framer Motion spring physics.
 * SOTA UPDATE: Notes now display newest first (reversed order).
 * @layer Core Logic / Presentation
 * @dependencies react, framer-motion, lucide-react
 */

"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Target, CheckCircle2, AlertTriangle } from "lucide-react";

export type NoteType = "concept" | "weakness" | "mastery" | "summary";

export interface StickyNote {
  id: string;
  type: NoteType;
  content: string;
  timestamp: number;
}

interface StickyNotesProps {
  notes: StickyNote[];
}

// Using semantic opacity overlays to ensure they look good in both Dark and Light modes.
const NOTE_STYLES: Record<NoteType, { border: string; bg: string; icon: React.ReactNode; label: string }> = {
  concept: {
    border: "border-amber-500/40 dark:border-amber-500/50",
    bg: "bg-amber-500/5 dark:bg-amber-500/10",
    icon: <Lightbulb className="h-4 w-4 text-amber-500 dark:text-amber-400" />,
    label: "Key Concept",
  },
  weakness: {
    border: "border-rose-500/40 dark:border-rose-500/50",
    bg: "bg-rose-500/5 dark:bg-rose-500/10",
    icon: <Target className="h-4 w-4 text-rose-500 dark:text-rose-400" />,
    label: "Focus Area",
  },
  mastery: {
    border: "border-emerald-500/40 dark:border-emerald-500/50",
    bg: "bg-emerald-500/5 dark:bg-emerald-500/10",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />,
    label: "Mastered",
  },
  summary: {
    border: "border-sky-500/40 dark:border-sky-500/50",
    bg: "bg-sky-500/5 dark:bg-sky-500/10",
    icon: <AlertTriangle className="h-4 w-4 text-sky-500 dark:text-sky-400" />,
    label: "Session Note",
  },
};

export function StickyNotes({ notes }: StickyNotesProps) {
  // Reverse the notes array so newest entries appear first
  const orderedNotes = React.useMemo(() => [...notes].reverse(), [notes]);

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-y-auto px-2 pb-2 custom-scrollbar">
      <AnimatePresence mode="popLayout">
        {orderedNotes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex h-full flex-col items-center justify-center text-center text-muted-foreground"
          >
            <Lightbulb className="mb-2 h-8 w-8 opacity-20" />
            <p className="text-sm font-medium">No notes yet.</p>
            <p className="text-xs opacity-70">Insights will appear here automatically.</p>
          </motion.div>
        ) : (
          orderedNotes.map((note) => {
            const style = NOTE_STYLES[note.type];
            return (
              <motion.div
                key={note.id}
                layout
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={`relative flex flex-col gap-2 rounded-xl border border-l-4 ${style.border} ${style.bg} p-3.5 shadow-sm backdrop-blur-md transition-all hover:shadow-md`}
              >
                {/* Note Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {style.icon}
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
                      {style.label}
                    </span>
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {new Date(note.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* Note Content */}
                <p className="text-sm leading-relaxed text-foreground/90">
                  {note.content}
                </p>
                
                {/* Fold effect decorator (top right corner) */}
                <div className="absolute -right-[1px] -top-[1px] h-3.5 w-3.5 rounded-bl-md border-b border-l border-border bg-card/50" />
              </motion.div>
            );
          })
        )}
      </AnimatePresence>
    </div>
  );
}
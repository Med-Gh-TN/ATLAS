/**
 * @file frontend/src/store/live-sync.store.ts
 * @description Global state manager for the Multi-Agent Swarm.
 * SOTA UPDATE: Added thinking indicator and sticky notes.
 * @layer State Persistence
 * @dependencies zustand
 */

import { create } from "zustand";

export interface SyncMark {
  name: string;
  time_ms: number;
  executed: boolean;
}

export interface StickyNote {
  id: string;
  type: "mastery" | "weakness";
  content: string;
  timestamp: number;
}

interface LiveSyncState {
  // --- Node A: Audio & Transcript State ---
  transcript: string;
  isAudioPlaying: boolean;
  thinking: boolean;              // true while AI is forming a response

  // --- Node B: Generative UI State (RSC Hydration) ---
  activeComponent: string | null;
  componentProps: Record<string, any> | null;

  // --- Node C: Memory Controller (Sticky Notes) ---
  stickyNotes: StickyNote[];

  // --- Sync Engine State ---
  metadataQueue: SyncMark[];
  activeAnimations: Record<string, boolean>;

  // --- Actions ---
  appendTranscript: (text: string) => void;
  setAudioPlaying: (isPlaying: boolean) => void;
  setThinking: (isThinking: boolean) => void;           // new
  hydrateUi: (componentName: string, props: Record<string, any>) => void;
  addStickyNotes: (notes: StickyNote[]) => void;
  enqueueMark: (name: string, time_ms: number) => void;
  triggerAnimation: (name: string) => void;
  clearAnimation: (name: string) => void;
  resetSession: () => void;
}

export const useLiveSyncStore = create<LiveSyncState>((set) => ({
  transcript: "",
  isAudioPlaying: false,
  thinking: false,
  activeComponent: null,
  componentProps: null,
  stickyNotes: [],
  metadataQueue: [],
  activeAnimations: {},

  appendTranscript: (text) =>
    set((state) => ({ transcript: state.transcript + text })),

  setAudioPlaying: (isPlaying) => {
    set({ isAudioPlaying: isPlaying });
    if (isPlaying) set({ thinking: false });   // audio playing → not thinking
  },

  setThinking: (isThinking) => set({ thinking: isThinking }),

  hydrateUi: (componentName, props) =>
    set({
      activeComponent: componentName,
      componentProps: props,
    }),

  addStickyNotes: (notes) =>
    set((state) => {
      const existingContents = new Set(
        state.stickyNotes.map((n) => `${n.type}:${n.content}`)
      );
      const newNotes = notes.filter(
        (n) => !existingContents.has(`${n.type}:${n.content}`)
      );
      if (newNotes.length === 0) return state;
      return {
        stickyNotes: [...state.stickyNotes, ...newNotes].slice(-50),
      };
    }),

  enqueueMark: (name, time_ms) =>
    set((state) => ({
      metadataQueue: [
        ...state.metadataQueue,
        { name, time_ms, executed: false },
      ],
    })),

  triggerAnimation: (name) =>
    set((state) => {
      const updatedQueue = state.metadataQueue.map((mark) =>
        mark.name === name ? { ...mark, executed: true } : mark
      );
      return {
        metadataQueue: updatedQueue,
        activeAnimations: { ...state.activeAnimations, [name]: true },
      };
    }),

  clearAnimation: (name) =>
    set((state) => {
      const nextAnimations = { ...state.activeAnimations };
      delete nextAnimations[name];
      return { activeAnimations: nextAnimations };
    }),

  resetSession: () =>
    set({
      transcript: "",
      isAudioPlaying: false,
      thinking: false,
      activeComponent: null,
      componentProps: null,
      stickyNotes: [],
      metadataQueue: [],
      activeAnimations: {},
    }),
}));
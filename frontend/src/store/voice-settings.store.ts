/**
 * @file frontend/src/store/voice-settings.store.ts
 * @description Persisted voice selection for the AI tutor.
 *              Can be later integrated with the user's account settings.
 * @layer State Persistence
 * @dependencies zustand
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type TutorVoice = "Zephyr" | "Charon";

interface VoiceSettingsState {
  voice: TutorVoice;
  setVoice: (voice: TutorVoice) => void;
}

export const useVoiceSettingsStore = create<VoiceSettingsState>()(
  persist(
    (set) => ({
      voice: "Zephyr", // default female study companion
      setVoice: (voice) => set({ voice }),
    }),
    {
      name: "atlas-voice-settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
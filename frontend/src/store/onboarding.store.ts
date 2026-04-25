import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  isCompleted: boolean;
  currentStep: number;
  totalSteps: number;
  profile: {
    fullName: string;
    filiere: string;
    niveau: string;
  };
  preferences: {
    interests: string[];
    preferredLanguage: string;
    notificationsEnabled: boolean;
  };
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setProfile: (profile: Partial<OnboardingState["profile"]>) => void;
  setPreferences: (
    preferences: Partial<OnboardingState["preferences"]>,
  ) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      isCompleted: false,
      currentStep: 1,
      totalSteps: 5,
      profile: {
        fullName: "",
        filiere: "",
        niveau: "L1",
      },
      preferences: {
        interests: [],
        preferredLanguage: "fr",
        notificationsEnabled: true,
      },
      setStep: (step) => set({ currentStep: step }),
      nextStep: () => {
        const { currentStep, totalSteps } = get();
        if (currentStep < totalSteps) {
          set({ currentStep: currentStep + 1 });
        }
      },
      prevStep: () => {
        const { currentStep } = get();
        if (currentStep > 1) {
          set({ currentStep: currentStep - 1 });
        }
      },
      setProfile: (profile) =>
        set((state) => ({
          profile: { ...state.profile, ...profile },
        })),
      setPreferences: (preferences) =>
        set((state) => ({
          preferences: { ...state.preferences, ...preferences },
        })),
      completeOnboarding: () => set({ isCompleted: true, currentStep: 1 }),
      resetOnboarding: () =>
        set({
          isCompleted: false,
          currentStep: 1,
          profile: { fullName: "", filiere: "", niveau: "L1" },
          preferences: {
            interests: [],
            preferredLanguage: "fr",
            notificationsEnabled: true,
          },
        }),
    }),
    {
      name: "atlas-onboarding",
    },
  ),
);

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StudentLevel, User } from "@/types/api.types";
import { AtlasApiError, authApi, setAccessToken } from "@/lib/api";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: User | null;
  status: AuthStatus;
  error: string | null;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    full_name?: string;
    role: "STUDENT" | "TEACHER";
    filiere?: string;
    level?: StudentLevel;
  }) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  clearError: () => void;
  markHydrated: () => void;
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AtlasApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: "idle",
  error: null,
  hydrated: false,

  login: async (email, password) => {
    set({ status: "loading", error: null });
    try {
      const response = await authApi.login({ username: email, password });
      setAccessToken(response.accessToken);
      set({
        user: response.user,
        status: "authenticated",
        error: null,
      });
    } catch (error) {
      set({
        user: null,
        status: "unauthenticated",
        error: toErrorMessage(error, "Login failed"),
      });
      throw error;
    }
  },

  register: async (data) => {
    set({ status: "loading", error: null });
    try {
      await authApi.register(data);
      set({ status: "unauthenticated", error: null });
    } catch (error) {
      set({ status: "idle", error: toErrorMessage(error, "Registration failed") });
      throw error;
    }
  },

  logout: async () => {
    set({ status: "loading", error: null });
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      set({ user: null, status: "unauthenticated", error: null });
    }
  },

  checkAuth: async () => {
    set({ status: "loading", error: null });
    try {
      const user = await authApi.me();
      set({ user, status: "authenticated", error: null });
    } catch {
      setAccessToken(null);
      set({ user: null, status: "unauthenticated", error: null });
    }
  },

  setUser: (user) =>
    set({
      user,
      status: user ? "authenticated" : "unauthenticated",
    }),

  clearError: () => set({ error: null }),
  markHydrated: () => set({ hydrated: true }),
}));

if (typeof window !== "undefined") {
  window.addEventListener("auth:logout", () => {
    const { logout, status } = useAuthStore.getState();
    if (status !== "unauthenticated") {
      void logout();
    }
  });
}

interface UIState {
  sidebarOpen: boolean;
  isRTL: boolean;
  theme: "light" | "dark" | "system";
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleRTL: () => void;
  setRTL: (rtl: boolean) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      isRTL: false,
      theme: "system",
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
      toggleRTL: () => set((state) => ({ isRTL: !state.isRTL })),
      setRTL: (rtl: boolean) => set({ isRTL: rtl }),
      setTheme: (theme: "light" | "dark" | "system") => set({ theme }),
    }),
    {
      name: "atlas-ui",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

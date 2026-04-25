"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, useUIStore } from "@/store/auth.store";
import type { UserRole } from "@/types/api.types";

export function useAuth() {
  const router = useRouter();
  const {
    user,
    status,
    error,
    login,
    logout,
    register,
    checkAuth,
    clearError,
  } = useAuthStore();

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";
  const isUnauthenticated = status === "unauthenticated";
  const isIdle = status === "idle";

  const hasRole = useCallback((role: UserRole) => user?.role === role, [user]);

  const isStudent = user?.role === "STUDENT";
  const isTeacher = user?.role === "TEACHER";
  const isAdmin = user?.role === "ADMIN";

  const requireAuth = useCallback(
    (redirectTo = "/auth/login") => {
      if (isUnauthenticated || isIdle) {
        router.push(redirectTo);
        return false;
      }
      return true;
    },
    [isUnauthenticated, isIdle, router],
  );

  const requireRole = useCallback(
    (role: UserRole, redirectTo = "/") => {
      if (!hasRole(role)) {
        router.push(redirectTo);
        return false;
      }
      return true;
    },
    [hasRole, router],
  );

  useEffect(() => {
    if (isIdle && user) {
      checkAuth();
    }
  }, [isIdle, user, checkAuth]);

  return {
    user,
    status,
    error,
    isLoading,
    isAuthenticated,
    isUnauthenticated,
    isIdle,
    isStudent,
    isTeacher,
    isAdmin,
    hasRole,
    requireAuth,
    requireRole,
    login,
    logout,
    register,
    checkAuth,
    clearError,
  };
}

export function useSSE<T>(
  url: string | null,
  options?: {
    onMessage?: (data: T) => void;
    onError?: (error: Event) => void;
    enabled?: boolean;
  },
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Event | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!url) return;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data) as T;
        setData(parsedData);
        options?.onMessage?.(parsedData);
      } catch {
        setData(event.data as unknown as T);
      }
    };

    eventSource.onerror = (event) => {
      setIsConnected(false);
      setError(event);
      options?.onError?.(event);
    };
  }, [url, options]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    if (options?.enabled !== false && url) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [url, options?.enabled, connect, disconnect]);

  return { data, error, isConnected, connect, disconnect };
}

export function useWebSocket(
  url: string | null,
  options?: {
    onMessage?: (data: string) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event) => void;
    reconnectInterval?: number;
    enabled?: boolean;
  },
) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!url || !options?.enabled) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      options?.onOpen?.();
    };

    ws.onmessage = (event) => {
      setLastMessage(event.data);
      options?.onMessage?.(event.data);
    };

    ws.onclose = () => {
      setIsConnected(false);
      options?.onClose?.();

      if (options?.reconnectInterval) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, options.reconnectInterval);
      }
    };

    ws.onerror = (event) => {
      options?.onError?.(event);
    };
  }, [url, options]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  useEffect(() => {
    if (options?.enabled !== false) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [url, options?.enabled, connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    send,
    connect: disconnect,
    disconnect: connect,
  };
}

export function useRTL() {
  const { isRTL, toggleRTL, setRTL } = useUIStore();

  useEffect(() => {
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = isRTL ? "ar" : "fr";
  }, [isRTL]);

  return { isRTL, toggleRTL, setRTL };
}

export function useTheme() {
  const { theme, setTheme } = useUIStore();

  useEffect(() => {
    const root = window.document.documentElement;

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      root.classList.remove("light", "dark");
      root.classList.add(systemTheme);
    } else {
      root.classList.remove("light", "dark");
      root.classList.add(theme);
    }
  }, [theme]);

  return { theme, setTheme };
}

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue],
  );

  return [storedValue, setValue];
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = () => setMatches(media.matches);
    media.addEventListener("change", listener);

    return () => media.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery("(max-width: 768px)");
}

export function useIsTablet() {
  return useMediaQuery("(max-width: 1024px)");
}

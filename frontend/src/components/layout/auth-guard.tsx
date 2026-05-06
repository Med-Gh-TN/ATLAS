"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import type { UserRole } from "@/types/api.types";

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  redirectTo?: string;
  loadingComponent?: React.ReactNode;
}

const roleHome: Record<UserRole, string> = {
  STUDENT: "/dashboard",
  TEACHER: "/teacher/dashboard",
  ADMIN: "/admin/dashboard",
  SUPERADMIN: "/superadmin/dashboard",
};

export function AuthGuard({
  children,
  allowedRoles,
  redirectTo = "/auth/login",
  loadingComponent,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, status, hydrated, checkAuth } = useAuthStore();

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";
  const isIdle = status === "idle";

  useEffect(() => {
    // Only check auth after hydration is complete
    if (hydrated && isIdle) {
      checkAuth();
    }
  }, [hydrated, isIdle, checkAuth]);

  useEffect(() => {
    // Only redirect after hydration completes and auth check is done
    if (hydrated && !isLoading && !isIdle) {
      if (!isAuthenticated) {
        const returnUrl = encodeURIComponent(pathname);
        router.push(`${redirectTo}?returnUrl=${returnUrl}`);
      } else if (user?.status === "PENDING_VERIFICATION" && !pathname.includes("/auth/pending")) {
        router.push("/auth/pending");
      } else if (allowedRoles && user && !allowedRoles.includes(user.role)) {
        router.push(roleHome[user.role] || "/auth/login");
      }
    }
  }, [
    hydrated,
    isLoading,
    isIdle,
    isAuthenticated,
    user,
    allowedRoles,
    redirectTo,
    pathname,
    router,
  ]);

  // Show loading while hydrating or loading auth
  if (!hydrated || isLoading || isIdle) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (user?.status === "PENDING_VERIFICATION" && !pathname.includes("/auth/pending")) {
    return null; // Prevents rendering protected content briefly before redirect
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, hydrated, checkAuth } = useAuthStore();

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";
  const isIdle = status === "idle";

  useEffect(() => {
    if (hydrated && isIdle) {
      checkAuth();
    }
  }, [hydrated, isIdle, checkAuth]);

  useEffect(() => {
    if (hydrated && !isLoading && isAuthenticated) {
      const user = useAuthStore.getState().user;
      if (user?.status === "PENDING_VERIFICATION") {
        router.push("/auth/pending");
      } else {
        router.push(user ? roleHome[user.role] || "/dashboard" : "/dashboard");
      }
    }
  }, [hydrated, isLoading, isAuthenticated, router]);

  if (!hydrated || isLoading || isIdle) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

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
  const { user, status, checkAuth } = useAuthStore();

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";
  const isIdle = status === "idle";

  useEffect(() => {
    if (isIdle) {
      checkAuth();
    }
  }, [isIdle, checkAuth]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        const returnUrl = encodeURIComponent(pathname);
        router.push(`${redirectTo}?returnUrl=${returnUrl}`);
      } else if (allowedRoles && user && !allowedRoles.includes(user.role)) {
        router.push(roleHome[user.role] || "/auth/login");
      }
    }
  }, [
    isLoading,
    isAuthenticated,
    user,
    allowedRoles,
    redirectTo,
    pathname,
    router,
  ]);

  if (isLoading || isIdle) {
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

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, checkAuth } = useAuthStore();

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";
  const isIdle = status === "idle";

  useEffect(() => {
    if (isIdle) {
      checkAuth();
    }
  }, [isIdle, checkAuth]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const user = useAuthStore.getState().user;
      router.push(user ? roleHome[user.role] || "/dashboard" : "/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || isIdle) {
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

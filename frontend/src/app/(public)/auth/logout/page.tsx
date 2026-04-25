"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useLogoutMutation } from "@/queries";

export default function LogoutPage() {
  const router = useRouter();
  const logoutMutation = useLogoutMutation();

  useEffect(() => {
    const performLogout = async () => {
      try {
        await logoutMutation.mutateAsync();
      } finally {
        router.push("/auth/login");
      }
    };

    performLogout();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Signing out...</p>
      </div>
    </div>
  );
}

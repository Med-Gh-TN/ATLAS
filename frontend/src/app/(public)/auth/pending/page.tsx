"use client";

import { useAuthStore } from "@/store/auth.store";
import { Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function PendingVerificationPage() {
  const { user } = useAuthStore();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-background p-8 text-center shadow-lg">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-10 w-10 text-primary" />
        </div>
        
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Account Under Review</h1>
        <p className="mb-8 text-muted-foreground">
          Hello {user?.full_name || "Educator"}, your account is currently pending verification by your institution&apos;s administrator.
        </p>

        <div className="mb-8 flex items-center justify-center space-x-3 rounded-lg bg-secondary/50 p-4 text-sm text-secondary-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Waiting for admin approval...</span>
        </div>

        <p className="mb-8 text-sm text-muted-foreground">
          You will receive an email once your account has been verified. If you believe this is taking too long, please contact your department head.
        </p>

        <div className="flex justify-center">
          <Link href="/auth/login" className="flex items-center text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

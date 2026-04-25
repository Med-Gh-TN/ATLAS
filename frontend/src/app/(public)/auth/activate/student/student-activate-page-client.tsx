"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, GraduationCap, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OTPInput } from "@/components/ui/otp-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRequestOtpMutation, useVerifyOtpMutation } from "@/queries";
import { useAuthStore } from "@/store/auth.store";

export function StudentActivatePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromParams = searchParams.get("email") || "";
  const { user } = useAuthStore();
  const [email] = useState(emailFromParams || user?.email || "");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [step, setStep] = useState<"verify" | "success">("verify");
  const verifyMutation = useVerifyOtpMutation();
  const requestMutation = useRequestOtpMutation();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    try {
      await verifyMutation.mutateAsync({ email, code: otp, purpose: "ACCOUNT_ACTIVATION" });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    try {
      await requestMutation.mutateAsync({ email, purpose: "ACCOUNT_ACTIVATION" });
      setResendCooldown(60);
      setOtp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    }
  };

  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <GraduationCap className="h-8 w-8 text-success" />
              </div>
              <h2 className="text-2xl font-bold">Account Activated</h2>
              <p className="text-muted-foreground">
                Your student account has been verified. Welcome to ATLAS.
              </p>
              <Button className="mt-4 w-full" onClick={() => router.push("/dashboard")}>
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <GraduationCap className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Activate Account</CardTitle>
            <CardDescription>Enter the 6-digit code sent to your email</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-6">
            {error ? (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium">Verification Code</label>
              <div className="flex justify-center">
                <OTPInput length={6} value={otp} onChange={setOtp} error={!!error} />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Enter the code sent to <span className="font-medium">{email}</span>
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={otp.length !== 6 || verifyMutation.isPending}
            >
              {verifyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify Code"
              )}
            </Button>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Didn&apos;t receive a code? </span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || requestMutation.isPending}
                className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                {requestMutation.isPending
                  ? "Sending..."
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend code"}
              </button>
            </div>
          </form>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>Check your email for the activation code</span>
          </div>
          <div className="mt-4 text-center">
            <Link
              href="/auth/login"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OTPInput } from "@/components/ui/otp-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useVerifyOtpMutation } from "@/queries";
import { authApi } from "@/lib/api";

const PASSWORD_REQUIREMENTS = [
  { id: "length", label: "At least 8 characters", test: (password: string) => password.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (password: string) => /[A-Z]/.test(password) },
  { id: "lower", label: "One lowercase letter", test: (password: string) => /[a-z]/.test(password) },
  { id: "number", label: "One number", test: (password: string) => /\d/.test(password) },
];

export function ResetPasswordPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"verify" | "reset" | "success">("verify");
  const [email] = useState(searchParams.get("email") || "");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const verifyMutation = useVerifyOtpMutation();

  const passwordsMatch = newPassword === confirmPassword && confirmPassword !== "";
  const passwordStrong = PASSWORD_REQUIREMENTS.every((requirement) =>
    requirement.test(newPassword),
  );

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    try {
      await verifyMutation.mutateAsync({ email, code: otp, purpose: "PASSWORD_RESET" });
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code");
    }
  };

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!passwordsMatch) {
      setError("Passwords do not match");
      return;
    }
    if (!passwordStrong) {
      setError("Password does not meet requirements");
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword({
        email,
        code: otp,
        new_password: newPassword,
      });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <Check className="h-8 w-8 text-success" />
              </div>
              <h2 className="text-2xl font-bold">Password Reset</h2>
              <p className="text-muted-foreground">
                Your password has been successfully reset. You can now sign in with your new password.
              </p>
              <Button className="w-full" onClick={() => router.push("/auth/login")}>
                Sign In
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "reset") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary">
              <GraduationCap className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">New Password</CardTitle>
              <CardDescription>Enter your new password below</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleReset} className="space-y-4">
              {error ? (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
              <div className="space-y-2">
                <label className="text-sm font-medium">New Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="space-y-1 rounded-lg bg-muted/50 p-3">
                  {PASSWORD_REQUIREMENTS.map((requirement) => (
                    <div
                      key={requirement.id}
                      className={`flex items-center gap-2 text-xs ${
                        requirement.test(newPassword) ? "text-success" : "text-muted-foreground"
                      }`}
                    >
                      {requirement.test(newPassword) ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                      {requirement.label}
                    </div>
                  ))}
                </div>
              </div>
              <Input
                type="password"
                label="Confirm Password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                autoComplete="new-password"
                className={confirmPassword && !passwordsMatch ? "border-destructive focus:border-destructive" : ""}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !passwordsMatch || !passwordStrong}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting password...
                  </>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </form>
            <div className="mt-6 text-center">
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <GraduationCap className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Enter Reset Code</CardTitle>
            <CardDescription>
              We sent a code to <span className="font-medium text-foreground">{email || "your email"}</span>
            </CardDescription>
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
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Didn&apos;t receive a code?{" "}
            <button
              onClick={() => router.push("/auth/forgot-password")}
              className="text-primary hover:underline"
            >
              Request a new one
            </button>
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

import type { Metadata } from "next";
import { ResetPasswordPageClient } from "./reset-password-page-client";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Verify your reset code and choose a new password for ATLAS.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordPageClient />;
}

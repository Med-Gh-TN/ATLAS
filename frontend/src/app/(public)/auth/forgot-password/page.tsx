import type { Metadata } from "next";
import { ForgotPasswordPageClient } from "./forgot-password-page-client";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Request a password reset code for your ATLAS account.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordPageClient />;
}

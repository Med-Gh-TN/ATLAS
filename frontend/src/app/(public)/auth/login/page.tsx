import type { Metadata } from "next";
import { LoginPageClient } from "./login-page-client";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to access your ATLAS dashboard and study tools.",
};

export default function LoginPage() {
  return <LoginPageClient />;
}

import type { Metadata } from "next";
import { RegisterPageClient } from "./register-page-client";

export const metadata: Metadata = {
  title: "Register",
  description: "Create your ATLAS account as a student or teacher.",
};

export default function RegisterPage() {
  return <RegisterPageClient />;
}

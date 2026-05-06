import type { Metadata } from "next";
import { RegisterPageClient } from "./register-page-client";

export const metadata: Metadata = {
  title: "Student Registration",
  description: "Create your ATLAS student account and start your learning journey.",
};

export default function RegisterPage() {
  return <RegisterPageClient />;
}

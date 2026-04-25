import type { Metadata } from "next";
import { TeacherActivatePageClient } from "./teacher-activate-page-client";

export const metadata: Metadata = {
  title: "Activate Teacher Account",
  description: "Verify your teacher account with the activation code sent by ATLAS.",
};

export default function TeacherActivatePage() {
  return <TeacherActivatePageClient />;
}

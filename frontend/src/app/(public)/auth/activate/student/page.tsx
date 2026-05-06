import type { Metadata } from "next";
import { StudentActivatePageClient } from "./student-activate-page-client";

export const metadata: Metadata = {
  title: "Activate Student Account",
  description: "Verify your student account with the activation code sent by ATLAS.",
};

export default function StudentActivatePage() {
  return <StudentActivatePageClient />;
}

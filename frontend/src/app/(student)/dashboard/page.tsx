import type { Metadata } from "next";
import { StudentDashboardPageClient } from "./dashboard-page-client";

export const metadata: Metadata = {
  title: "Student Dashboard",
  description: "Track your progress, goals, and recommendations in ATLAS.",
};

export default function StudentDashboardPage() {
  return <StudentDashboardPageClient />;
}

import type { Metadata } from "next";
import { TeacherDashboardPageClient } from "./teacher-dashboard-page-client";

export const metadata: Metadata = {
  title: "Teacher Dashboard",
  description: "Monitor course activity, contributions, and analytics in ATLAS.",
};

export default function TeacherDashboardPage() {
  return <TeacherDashboardPageClient />;
}

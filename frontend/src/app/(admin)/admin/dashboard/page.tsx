import type { Metadata } from "next";
import { AdminDashboardPageClient } from "./admin-dashboard-page-client";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Review platform operations, moderation, and system activity in ATLAS.",
};

export default function AdminDashboardPage() {
  return <AdminDashboardPageClient />;
}

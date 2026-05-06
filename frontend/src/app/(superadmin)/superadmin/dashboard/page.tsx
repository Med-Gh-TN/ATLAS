import type { Metadata } from "next";
import { SuperadminDashboardPageClient } from "./superadmin-dashboard-page-client";

export const metadata: Metadata = {
  title: "Superadmin Dashboard",
  description: "View multi-establishment platform health and governance signals in ATLAS.",
};

export default function SuperadminDashboardPage() {
  return <SuperadminDashboardPageClient />;
}

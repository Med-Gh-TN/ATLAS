import type { Metadata } from "next";
import { StatusPageClient } from "./status-page-client";

export const metadata: Metadata = {
  title: "System Status",
  description: "Live health and incident status for the ATLAS platform.",
};

export default function StatusPage() {
  return <StatusPageClient />;
}

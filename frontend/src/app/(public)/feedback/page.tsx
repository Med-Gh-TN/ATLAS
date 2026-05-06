import type { Metadata } from "next";
import { FeedbackPageClient } from "./feedback-page-client";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Report bugs, request features, and share product feedback for ATLAS.",
};

export default function FeedbackPage() {
  return <FeedbackPageClient />;
}

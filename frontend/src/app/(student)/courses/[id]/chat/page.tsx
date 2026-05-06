"use client";

import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { AIToolsTabPanel } from "@/components/ai/ai-tools-tab-panel";
import { useCourseQuery } from "@/queries";

export default function ChatPage() {
  const params = useParams();
  const courseId = params.id as string;
  const { data: course, isLoading, isError } = useCourseQuery(courseId);

  if (isLoading) {
    return <Skeleton className="h-full w-full" />;
  }

  if (isError || !course) {
    return (
      <EmptyState
        type="error"
        title="Course unavailable"
        description="We couldn't load this course for the AI chat."
      />
    );
  }

  return (
    // 🚨 SOTA FIX: Let the parent flex layout determine the height; min-h-0 prevents overflow
    <div className="h-full min-h-0 overflow-hidden rounded-xl border">
      <AIToolsTabPanel tool="chat" course={course} className="h-full" />
    </div>
  );
}
"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCourseQuery } from "@/queries";
import { coursesApi, summariesApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export default function CourseSummaryPage() {
  const params = useParams();
  const courseId = params.id as string;
  const { data: course, isLoading: isCourseLoading } = useCourseQuery(courseId);

  const documentVersionId =
    course?.current_version_id || course?.current_version?.id || null;

  const {
    data: myAssets,
    isLoading: isAssetMetaLoading,
  } = useQuery({
    queryKey: ["my-assets", courseId, documentVersionId],
    queryFn: () => coursesApi.getMyAssets(courseId, documentVersionId!),
    enabled: !!documentVersionId,
  });

  const [summaryData, setSummaryData] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (summaryId: string) => {
    const data = await summariesApi.get(summaryId);
    setSummaryData(data);
  }, []);

  const generateSummary = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const { job_id } = await summariesApi.generate(courseId, "EXECUTIVE", "fr");
      await fetchSummary(job_id);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to generate summary. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [courseId, fetchSummary]);

  useEffect(() => {
    if (!myAssets || isAssetMetaLoading) return;
    if (summaryData) return;

    if (myAssets.summary.exists && myAssets.summary.id) {
      fetchSummary(myAssets.summary.id);
    } else {
      generateSummary();
    }
  }, [myAssets, isAssetMetaLoading, summaryData, fetchSummary, generateSummary]);

  if (isCourseLoading || isAssetMetaLoading || generating) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !summaryData) {
    return (
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">{error || "Could not load summary."}</p>
        <Button onClick={generateSummary}>Try again</Button>
      </div>
    );
  }

  const content =
    typeof summaryData.content === "string"
      ? summaryData.content
      : summaryData.content?.overview || JSON.stringify(summaryData.content);

  return (
    <div className="prose prose-sm max-w-none p-4 whitespace-pre-wrap">
      {content}
    </div>
  );
}
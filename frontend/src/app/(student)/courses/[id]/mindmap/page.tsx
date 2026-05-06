"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCourseQuery } from "@/queries";
import { coursesApi, mindmapsApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { MindMapVisualizer } from "@/components/ai/ai-tools-tab-panel";

export default function CourseMindmapPage() {
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

  const [mindmapData, setMindmapData] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMindmap = useCallback(async (mindmapId: string) => {
    const data = await mindmapsApi.get(mindmapId);
    setMindmapData(data);
  }, []);

  const generateMindmap = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const { job_id } = await mindmapsApi.generate(courseId, "fr");
      await fetchMindmap(job_id);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to generate mind map. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [courseId, fetchMindmap]);

  useEffect(() => {
    if (!myAssets || isAssetMetaLoading) return;
    if (mindmapData) return;

    if (myAssets.mindmap.exists && myAssets.mindmap.id) {
      fetchMindmap(myAssets.mindmap.id);
    } else {
      generateMindmap();
    }
  }, [myAssets, isAssetMetaLoading, mindmapData, fetchMindmap, generateMindmap]);

  if (isCourseLoading || isAssetMetaLoading || generating) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !mindmapData) {
    return (
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">{error || "Could not load mind map."}</p>
        <Button onClick={generateMindmap}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-220px)] overflow-hidden rounded-xl border">
      <MindMapVisualizer
        initialNodes={mindmapData.nodes || []}
        initialEdges={mindmapData.edges || []}
      />
    </div>
  );
}
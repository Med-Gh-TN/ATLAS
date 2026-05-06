"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BookOpen, Download } from "lucide-react";
import { FilePreview } from "@/components/ui/file-preview";
import { Skeleton } from "@/components/ui/skeleton";
import { useCourseQuery, useVersionQuery } from "@/queries";
import { useTrackLearning } from "@/hooks/use-continue-learning";

export default function ReadPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = params.id as string;
  const versionId = searchParams.get("version");
  
  const { data: course, isLoading: courseLoading } = useCourseQuery(courseId);
  const { data: specificVersion, isLoading: versionLoading } = useVersionQuery(versionId);

  useTrackLearning(courseId, course?.title || "Course Material", "read");

  const isLoading = courseLoading || (!!versionId && versionLoading);
  const activeVersion = versionId ? specificVersion : course?.current_version;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Reader</h1>
          <p className="text-muted-foreground">
            {versionId ? `Reading: ${activeVersion?.title || "Specific Material"}` : "Read and study the course material"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled>
            <Download className="h-4 w-4 mr-2" />
            Use preview actions below
          </Button>
        </div>
      </div>

      <Card className="min-h-[600px] bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {course?.title || "Course material"}
            {versionId && activeVersion && (
               <span className="text-xs font-normal text-muted-foreground ml-2"> 
                 (v{activeVersion.version_number}) 
               </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeVersion?.storage_path ? (
            <FilePreview
              storagePath={activeVersion.storage_path}
              mimeType={activeVersion.mime_type}
              title={course?.title || activeVersion.title || "Document"}
            />
          ) : (
            <EmptyState
              type="reader"
              title="No approved document available"
              description="This course file is still being prepared or is waiting for approval."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

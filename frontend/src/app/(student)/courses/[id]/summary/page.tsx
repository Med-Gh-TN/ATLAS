"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseQuery } from "@/queries";
import { FileText, Loader2, Download, Copy } from "lucide-react";

export default function SummaryPage() {
  const params = useParams();
  const courseId = params.id as string;
  const { data: course } = useCourseQuery(courseId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [formatType, setFormatType] = useState("bullet");
  const [targetLang, setTargetLang] = useState("fr");

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Summary</h1>
          <p className="text-muted-foreground">
            AI-generated summaries of {course?.title || "this course"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generate Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Format</label>
              <Select
                value={formatType}
                onChange={(e) => setFormatType(e.target.value)}
              >
                <option value="bullet">Bullet Points</option>
                <option value="paragraph">Paragraph</option>
                <option value="outline">Outline</option>
              </Select>
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Language</label>
              <Select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </Select>
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[400px]">
        <CardContent className="flex items-center justify-center h-[400px]">
          <EmptyState
            type="summary"
            title="No summary generated"
            description="Click Generate to create an AI-powered summary"
          />
        </CardContent>
      </Card>

      <div className="flex justify-center gap-2">
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
        <Button variant="outline">
          <Copy className="h-4 w-4 mr-2" />
          Copy to Clipboard
        </Button>
      </div>
    </div>
  );
}

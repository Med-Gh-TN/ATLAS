"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseQuery } from "@/queries";
import { Map, Loader2, Download } from "lucide-react";

export default function MindmapPage() {
  const params = useParams();
  const courseId = params.id as string;
  const { data: course } = useCourseQuery(courseId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [targetLang, setTargetLang] = useState("fr");

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mind Map</h1>
          <p className="text-muted-foreground">
            Visualize concepts from {course?.title || "this course"}
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="w-32"
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </Select>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Map className="h-4 w-4 mr-2" />
                Generate
              </>
            )}
          </Button>
        </div>
      </div>

      <Card className="min-h-[500px]">
        <CardContent className="flex items-center justify-center h-[500px]">
          <EmptyState
            type="mindmap"
            title="No mind map generated"
            description="Click Generate to create a mind map from the course content"
          />
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Download as Image
        </Button>
      </div>
    </div>
  );
}

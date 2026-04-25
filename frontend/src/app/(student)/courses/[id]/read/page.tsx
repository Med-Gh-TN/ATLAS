"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BookOpen, Download, ZoomIn, ZoomOut } from "lucide-react";

export default function ReadPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Reader</h1>
          <p className="text-muted-foreground">
            Read and study the course material
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

      <Card className="min-h-[600px] flex items-center justify-center bg-muted/30">
        <EmptyState
          type="reader"
          title="No document loaded"
          description="Select a document version to start reading"
        />
      </Card>

      <div className="flex justify-center gap-4">
        <Button variant="outline">Previous Page</Button>
        <span className="flex items-center px-4">Page 1 of 1</span>
        <Button variant="outline">Next Page</Button>
      </div>
    </div>
  );
}

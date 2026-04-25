"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare, Send, Plus } from "lucide-react";

export default function ForumPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Discussion Forum</h1>
          <p className="text-muted-foreground">Ask questions and help others</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Discussion
        </Button>
      </div>

      <div className="flex gap-2">
        <Input placeholder="Search discussions..." className="max-w-sm" />
        <Button variant="outline">Filter</Button>
      </div>

      <div className="space-y-4">
        <EmptyState
          type="forum"
          title="No discussions yet"
          description="Start a discussion to connect with other students"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Discussion Guidelines
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Be respectful and constructive in your discussions.</p>
          <p>Search before posting to avoid duplicates.</p>
          <p>Use clear titles that describe your question.</p>
        </CardContent>
      </Card>
    </div>
  );
}

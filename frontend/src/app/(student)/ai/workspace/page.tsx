"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, BookOpen, MessageSquare, Layers, FileQuestion, GitBranch, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { AIToolsTabPanel, type AIToolType } from "@/components/ai/ai-tools-tab-panel";
import { useCourseQuery } from "@/queries/courses";
import type { AutocompleteResult, Course } from "@/types/api.types";

const tabs = [
  { id: "chat" as const, label: "Chat", icon: MessageSquare },
  { id: "summary" as const, label: "Summary", icon: FileQuestion },
  { id: "flashcards" as const, label: "Flashcards", icon: Layers },
  { id: "quiz" as const, label: "Quiz", icon: FileQuestion },
  { id: "mindmap" as const, label: "Mind Map", icon: GitBranch },
];

function AIWorkspaceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [searchResults, setSearchResults] = useState<AutocompleteResult[]>([]);
  const [activeTab, setActiveTab] = useState<AIToolType>(
    (searchParams.get("tab") as AIToolType) || "chat",
  );
  const [initialQuery] = useState(searchParams.get("q") || "");

  const courseIdParam = searchParams.get("course");
  const { data: fetchedCourse, isLoading: isCourseLoading } = useCourseQuery(courseIdParam || "");

  useEffect(() => {
    if (fetchedCourse) {
      setSelectedCourse(fetchedCourse as unknown as Course);
    }
  }, [fetchedCourse]);

  useEffect(() => {
    const tab = searchParams.get("tab") as AIToolType | null;
    if (tab && tabs.some((t) => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const setCourseParam = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("course", id);
    router.replace(url.pathname + url.search);
  };

  const handleCourseSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await searchApi.autocomplete(query);
      setSearchResults(results);
    } catch (error) {
      console.error("Search failed:", error);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      handleCourseSearch(courseSearch);
    }, 300);
    return () => clearTimeout(timeout);
  }, [courseSearch, handleCourseSearch]);

  const handleTabChange = (tab: AIToolType) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.pathname + url.search);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="w-80 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold mb-4">Select Course</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search courses..."
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 max-h-64 overflow-y-auto bg-background border rounded-lg">
              {searchResults.map((result) => (
                <button
                  key={result.course_id}
                  onClick={() => {
                    setCourseParam(result.course_id);
                    setCourseSearch("");
                    setSearchResults([]);
                  }}
                  className="flex w-full items-center gap-3 p-3 hover:bg-muted text-left"
                >
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate">{result.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedCourse && (
          <div className="p-4 border-b">
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-medium truncate">{selectedCourse.title}</h3>
                {selectedCourse.filiere && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedCourse.filiere}
                  </p>
                )}
                {selectedCourse.niveau && (
                  <span className="inline-block mt-2 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                    {selectedCourse.niveau}
                  </span>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex border-b">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-hidden">
          {!selectedCourse ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState
                type="search"
                title="Select a course"
                description="Choose a course from the left panel to start using AI tools"
              />
            </div>
          ) : (
            <AIToolsTabPanel tool={activeTab} course={selectedCourse} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function AIWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-4rem)]">
          <div className="w-80 border-r bg-muted/30 p-4">
            <Skeleton className="h-8 w-full mb-4" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="flex-1 p-4">
            <Skeleton className="h-12 w-full mb-4" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      }
    >
      <AIWorkspaceContent />
    </Suspense>
  );
}

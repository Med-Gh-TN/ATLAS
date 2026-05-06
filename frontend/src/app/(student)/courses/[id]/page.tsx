"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  GraduationCap,
  BookOpen,
  Brain,
  MessageSquare,
  Map,
  FileQuestion,
  FileText,
  ChevronRight,
  Play,
  Star,
  Clock,
  Users,
  Download,
  Share2,
  Headset,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseQuery, useCourseStatsQuery } from "@/queries";
import { useTrackLearning } from "@/hooks/use-continue-learning";
import { MaterialSelectionDialog } from "@/components/course/material-selection-dialog";
import { useQuery } from "@tanstack/react-query";
import { coursesApi } from "@/lib/api";
import { useState } from "react";

const STUDY_TOOLS = [
  { id: "read", icon: BookOpen, label: "Read", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { id: "tutor", icon: Headset, label: "Live Tutor", color: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  { id: "chat", icon: MessageSquare, label: "AI Chat", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { id: "flashcards", icon: Brain, label: "Flashcards", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  { id: "quiz", icon: FileQuestion, label: "Quiz", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  { id: "summary", icon: FileText, label: "Summary", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
  { id: "mindmap", icon: Map, label: "Mind Map", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
];

export default function CourseDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = params.id as string;
  const versionId = searchParams.get("version") || searchParams.get("versions")?.split(",")[0] || undefined;
  const { data: course, isLoading } = useCourseQuery(courseId);
  const { data: stats, isLoading: statsLoading } = useCourseStatsQuery(courseId);

  useTrackLearning(courseId, course?.title || "Course Material");
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);

  // Fetch user's existing assets for the current document version
  const { data: myAssets, isLoading: assetsLoading } = useQuery({
    queryKey: ["my-assets", courseId, versionId],
    queryFn: () => coursesApi.getMyAssets(courseId, versionId!),
    enabled: !!courseId && !!versionId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <EmptyState
        type="not-found"
        title="Course not found"
        description="This course may have been removed or doesn't exist."
      />
    );
  }

  const courseMeta =
    [course.filiere, course.level].filter(Boolean).join(" • ") || "Course details";

  // Unified tool link: always go to per‑course page, auto‑detect there
  const getToolLink = (toolId: string) => {
    const base = `/courses/${courseId}/${toolId}`;
    return versionId ? `${base}?versions=${versionId}` : base;
  };

  const getToolLabel = (toolId: string, defaultLabel: string) => {
    if (!myAssets) return defaultLabel;
    const map = {
      flashcards: myAssets.flashcards?.exists ? "Review Flashcards" : "Generate Flashcards",
      quiz: myAssets.quiz?.exists ? "View Quiz" : "Generate Quiz",
      summary: myAssets.summary?.exists ? "View Summary" : "Generate Summary",
      mindmap: myAssets.mindmap?.exists ? "View Mind Map" : "Generate Mind Map",
    };
    return (map as any)[toolId] || defaultLabel;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/courses" className="hover:text-foreground">
              Courses
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span>{course.filiere || "Course"}</span>
          </div>
          <h1 className="text-2xl font-bold">{course.title}</h1>
          {course.description ? (
            <p className="mt-1 text-muted-foreground">{course.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button variant="outline" size="sm" className="min-h-11 flex-1 sm:flex-none">
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
          <Button size="sm" className="min-h-11 flex-1 sm:flex-none">
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Study Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {STUDY_TOOLS.map((tool) => {
                  const href = getToolLink(tool.id);
                  const label = getToolLabel(tool.id, tool.label);
                  const isExisting = 
                    (tool.id === "flashcards" && myAssets?.flashcards?.exists) ||
                    (tool.id === "quiz" && myAssets?.quiz?.exists) ||
                    (tool.id === "summary" && myAssets?.summary?.exists) ||
                    (tool.id === "mindmap" && myAssets?.mindmap?.exists);

                  return (
                    <Link
                      key={tool.id}
                      href={href}
                      className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border p-4 text-center transition-colors hover:bg-muted/50"
                    >
                      <div className={`rounded-lg p-3 ${tool.color}`}>
                        <tool.icon className="h-6 w-6" />
                      </div>
                      <span className="text-sm font-medium">
                        {assetsLoading && tool.id !== "read" && tool.id !== "tutor" && tool.id !== "chat" ? (
                          <Loader2 className="h-4 w-4 animate-spin inline-block" />
                        ) : (
                          <>
                            {label}
                            {isExisting && (
                              <span className="ml-1 text-xs text-green-600">✓</span>
                            )}
                          </>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Course Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Filiere</p>
                  <p className="font-medium">{course.filiere || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Level</p>
                  <p className="font-medium">{course.level || "All levels"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{course.course_type || "Course"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Language</p>
                  <p className="font-medium">{course.language || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Academic Year</p>
                  <p className="font-medium">{course.academic_year || "Current"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <GraduationCap className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mt-4 font-semibold">{course.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{courseMeta}</p>
                <Button
                  className="mt-4 min-h-11 w-full"
                  onClick={() => setIsSelectionModalOpen(true)}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Start Learning
                </Button>
              </div>
            </CardContent>
          </Card>

          <MaterialSelectionDialog
            isOpen={isSelectionModalOpen}
            courseId={courseId}
            courseTitle={course.title}
            onClose={() => setIsSelectionModalOpen(false)}
          />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Course Stats</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((key) => (
                    <Skeleton key={key} className="h-5 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" /> Learners
                    </span>
                    <span className="font-medium">{stats?.learner_count ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Star className="h-4 w-4" /> AI Study Assets
                    </span>
                    <span className="font-medium">{stats?.generated_assets_count ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" /> Estimated Read Time
                    </span>
                    <span className="font-medium">
                      {stats?.estimated_read_minutes
                        ? `~${stats.estimated_read_minutes} min`
                        : "Not available"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Download className="h-4 w-4" /> Versions
                    </span>
                    <span className="font-medium">{stats?.version_count ?? 0}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">Overall</span>
                    <span className="font-medium">0%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 w-0 rounded-full bg-primary transition-all" />
                  </div>
                </div>
                <Button variant="outline" className="min-h-11 w-full" asChild>
                  <Link
                    href={`/courses/${courseId}/flashcards${versionId ? `?versions=${versionId}` : ""}`}
                  >
                    {myAssets?.flashcards?.exists ? "Review Flashcards" : "Generate Flashcards"}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseQuery } from "@/queries";
import { useAuthStore } from "@/store/auth.store";

const STUDY_TOOLS = [
  {
    id: "read",
    icon: BookOpen,
    label: "Read",
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    id: "chat",
    icon: MessageSquare,
    label: "AI Chat",
    color: "bg-purple-500/10 text-purple-600",
  },
  {
    id: "flashcards",
    icon: Brain,
    label: "Flashcards",
    color: "bg-green-500/10 text-green-600",
  },
  {
    id: "quiz",
    icon: FileQuestion,
    label: "Quiz",
    color: "bg-orange-500/10 text-orange-600",
  },
  {
    id: "summary",
    icon: FileText,
    label: "Summary",
    color: "bg-pink-500/10 text-pink-600",
  },
  {
    id: "mindmap",
    icon: Map,
    label: "Mind Map",
    color: "bg-indigo-500/10 text-indigo-600",
  },
];

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const { user } = useAuthStore();

  const { data: course, isLoading } = useCourseQuery(courseId);

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
        description="This course may have been removed or doesn't exist"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/courses" className="hover:text-foreground">
              Courses
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span>{course.filiere || "Course"}</span>
          </div>
          <h1 className="text-2xl font-bold">{course.title}</h1>
          {course.description && (
            <p className="mt-1 text-muted-foreground">{course.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Study Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {STUDY_TOOLS.map((tool) => (
                  <Link
                    key={tool.id}
                    href={`/courses/${courseId}/${tool.id}`}
                    className="flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className={`rounded-lg p-3 ${tool.color}`}>
                      <tool.icon className="h-6 w-6" />
                    </div>
                    <span className="text-sm font-medium">{tool.label}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Course Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Filiere</p>
                    <p className="font-medium">
                      {course.filiere || "Not specified"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Level</p>
                    <p className="font-medium">
                      {course.level || "All levels"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <p className="font-medium">
                      {course.course_type || "Course"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Language</p>
                    <p className="font-medium">
                      {course.language || "Not specified"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Academic Year
                    </p>
                    <p className="font-medium">
                      {course.academic_year || "Current"}
                    </p>
                  </div>
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
                <p className="mt-1 text-sm text-muted-foreground">
                  {course.filiere} • {course.level}
                </p>
                <Button className="mt-4 w-full">
                  <Play className="h-4 w-4 mr-2" />
                  Start Learning
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Course Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Star className="h-4 w-4" /> Rating
                  </span>
                  <span className="font-medium">4.8/5</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" /> Students
                  </span>
                  <span className="font-medium">1,234</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Duration
                  </span>
                  <span className="font-medium">~12 hours</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Overall</span>
                    <span className="font-medium">0%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 w-0 rounded-full bg-primary transition-all" />
                  </div>
                </div>
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/courses/${courseId}/flashcards`}>
                    View Flashcards
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

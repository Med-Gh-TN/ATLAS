"use client";

import { useMemo, useState } from "react";
import {
  GraduationCap,
  BookOpen,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MaterialSelectionDialog } from "@/components/course/material-selection-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCoursesQuery } from "@/queries/courses";
import { useTranslation } from "@/hooks/use-translation";

export default function CoursesPage() {
  const { t } = useTranslation();
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; title: string } | null>(null);

  const { data: coursesRaw, isLoading } = useCoursesQuery();

  // 🔥 Defensive filter – remove any ghost entries with missing/empty titles
  const courses = useMemo(
    () => (coursesRaw || []).filter(c => c.id && c.title?.trim()),
    [coursesRaw]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("nav.catalog")}</h1>
        <p className="text-muted-foreground">{t("catalog.browseDescription")}</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          type="no-results"
          title={t("search.noResultsFound")}
          description={t("catalog.adjustSearchFilters")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <div
              key={course.id}
              className="cursor-pointer"
              onClick={() => setSelectedCourse({ id: course.id, title: course.title })}
            >
              <Card className="h-full transition-all hover:border-primary/50 hover:shadow-lg active:scale-[0.98]">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <GraduationCap className="h-5 w-5 text-primary" />
                    </div>
                    {course.course_type && (
                      <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium">
                        {course.course_type}
                      </span>
                    )}
                  </div>
                  <CardTitle className="mt-3 line-clamp-2">{course.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {course.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {course.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {course.filiere && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {course.filiere}
                      </span>
                    )}
                    {course.level && (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {course.level}
                      </span>
                    )}
                    {course.language && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {course.language}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      <MaterialSelectionDialog
        isOpen={!!selectedCourse}
        courseId={selectedCourse?.id || null}
        courseTitle={selectedCourse?.title}
        onClose={() => setSelectedCourse(null)}
      />
    </div>
  );
}
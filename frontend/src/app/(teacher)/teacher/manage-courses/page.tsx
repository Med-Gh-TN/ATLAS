"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Eye, Loader2, Plus, Search, Trash2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contributionsApi, filesApi } from "@/lib/api";
import { PDFPreviewer } from "@/components/ui/pdf-previewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusChip } from "@/components/ui/status-chip";
import { useTeacherCourses } from "@/queries/courses";
import { MaterialSelectionDialog } from "@/components/course/material-selection-dialog";
import { useTranslation } from "@/hooks/use-translation";

type CourseItem = {
  id: string;
  contributionId: string;          // primary contribution ID (first)
  allContributionIds?: string[];   // optional for batch operations
  title: string;
  description: string | null;
  filiere: string;
  level: string;
  status: string;
  department_name?: string;
  major_name?: string;
};

type GroupedByMajor = {
  majorName: string;
  courses: CourseItem[];
};

type GroupedByDepartment = {
  departmentName: string;
  majors: GroupedByMajor[];
};

export default function ManageCourses() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [courseToDelete, setCourseToDelete] = useState<any>(null);
  const [previewContributionId, setPreviewContributionId] = useState<string | null>(null);
  const [materialSelectionCourse, setMaterialSelectionCourse] = useState<{id: string, title: string} | null>(null);
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({});
  const itemsPerPage = 6;
  
  const deleteMutation = useMutation({
    mutationFn: (id: string) => contributionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses", "my-uploads"] });
      setCourseToDelete(null);
    },
  });

  const { data: courses = [], isLoading } = useTeacherCourses();

  // ── DEDUPLICATE COURSES BY ID, KEEP FIRST CONTRIBUTION ──
  const mappedCourses: CourseItem[] = useMemo(() => {
    const courseMap = new Map<string, CourseItem>();
    
    for (const course of courses) {
      const id = course.id;
      if (!courseMap.has(id)) {
        const deptName = (course as any).department_name;
        const majorName = (course as any).major_name;
        const filiere = (course as any).filiere;
        
        courseMap.set(id, {
          id: course.id,
          contributionId: (course as any).contribution_id,
          title: course.title,
          description: course.description,
          filiere: filiere || deptName || "Department",
          level: course.level || "-",
          status: (course as any).is_deleted ? "archived" : "active",
          department_name: deptName || filiere || "Department",
          major_name: majorName || filiere || "Unspecified",
        });
      } else {
        // Optionally collect all contribution IDs for future batch actions
        const existing = courseMap.get(id)!;
        if (!existing.allContributionIds) {
          existing.allContributionIds = [existing.contributionId];
        }
        existing.allContributionIds.push((course as any).contribution_id);
      }
    }
    return Array.from(courseMap.values());
  }, [courses]);

  // Hierarchical grouping: department → major → courses
  const groupedData = useMemo(() => {
    const filtered = mappedCourses.filter((course) =>
      course.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    const departmentMap = new Map<string, Map<string, CourseItem[]>>();

    for (const course of filtered) {
      const dept = course.department_name || "Department";
      const major = course.major_name || "Major";
      
      if (!departmentMap.has(dept)) {
        departmentMap.set(dept, new Map());
      }
      const majorMap = departmentMap.get(dept)!;
      if (!majorMap.has(major)) {
        majorMap.set(major, []);
      }
      majorMap.get(major)!.push(course);
    }

    const result: GroupedByDepartment[] = [];
    for (const [dept, majorMap] of departmentMap.entries()) {
      const majors: GroupedByMajor[] = [];
      for (const [major, coursesList] of majorMap.entries()) {
        majors.push({ majorName: major, courses: coursesList });
      }
      result.push({ departmentName: dept, majors });
    }
    return result;
  }, [mappedCourses, searchQuery]);

  const totalFilteredItems = groupedData.reduce(
    (acc, dept) => acc + dept.majors.reduce((sum, major) => sum + major.courses.length, 0),
    0,
  );
  const totalPages = Math.max(1, Math.ceil(totalFilteredItems / itemsPerPage));

  const toggleDepartment = (deptName: string) => {
    setExpandedDepartments(prev => ({ ...prev, [deptName]: !prev[deptName] }));
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("teacher.myCourseMaterials")}</h1>
          <p className="text-muted-foreground">
            {t("teacher.myCourseMaterialsDescription")}
          </p>
        </div>
        <Button asChild>
          <Link href="/teacher/courses/upload">
            <Plus className="mr-2 h-4 w-4" />
            {t("teacher.uploadMaterial")}
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("teacher.searchCourseUploads")}
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setCurrentPage(1);
          }}
          className="pl-10"
        />
      </div>

      {/* Hierarchical grouping */}
      <div className="space-y-6">
        {groupedData.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No course materials found.
          </div>
        )}
        {groupedData.map((department) => (
          <div key={department.departmentName} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleDepartment(department.departmentName)}
              className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <h2 className="text-lg font-semibold">{department.departmentName}</h2>
              {expandedDepartments[department.departmentName] ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </button>
            {expandedDepartments[department.departmentName] !== false && (
              <div className="p-4 space-y-4">
                {department.majors.map((major) => (
                  <div key={major.majorName} className="space-y-2">
                    <h3 className="text-md font-medium text-primary pl-2 border-l-2 border-primary">
                      {major.majorName}
                    </h3>
                    <div className="grid gap-4 pl-4">
                      {major.courses.map((course) => (
                        <Card key={course.id}>
                          <CardContent className="p-4">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                                  <BookOpen className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                  <h3 className="font-semibold">{course.title}</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {course.filiere} | {course.level}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground hidden lg:flex">
                                  <Users className="h-4 w-4" />
                                  {t("course.catalog")}
                                </div>
                                <StatusChip status={course.status} />
                                <Button variant="outline" size="sm" onClick={() => setMaterialSelectionCourse({ id: course.id, title: course.title })}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  {t("teacher.manageMaterials")}
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setSelectedCourse(course)}>
                                  {t("ui.view")}
                                </Button>
                                <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setCourseToDelete(course)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination info (optional) */}
      {totalFilteredItems > itemsPerPage && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("ui.showing")} 1 {t("ui.to")} {totalFilteredItems} {t("ui.of")} {totalFilteredItems} {t("teacher.courses")}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled>
              {currentPage}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!courseToDelete} onOpenChange={(open) => !open && setCourseToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teacher.deleteUploadedMaterial")}</DialogTitle>
            <DialogDescription>
              {t("teacher.deleteMaterialDescription", { title: courseToDelete?.title })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCourseToDelete(null)}>{t("ui.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!courseToDelete?.contributionId) return;
                deleteMutation.mutate(courseToDelete.contributionId);
              }}
              disabled={deleteMutation.isPending || !courseToDelete?.contributionId}
            >
              {deleteMutation.isPending ? t("ui.deleting") : t("ui.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Course details dialog */}
      <Dialog open={!!selectedCourse} onOpenChange={(open) => !open && setSelectedCourse(null)}>
        <DialogContent>
          {selectedCourse ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedCourse.title}</DialogTitle>
                <DialogDescription>{t("teacher.adminManagedCourse")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2 text-sm">
                <p><strong>{t("teacher.department")}:</strong> {selectedCourse.department_name || selectedCourse.filiere}</p>
                <p><strong>{t("teacher.major")}:</strong> {selectedCourse.major_name || "—"}</p>
                <p><strong>{t("course.lessons")}:</strong> {selectedCourse.level}</p>
                <p><strong>{t("status.status")}:</strong> {selectedCourse.status}</p>
                {selectedCourse.description ? <p>{selectedCourse.description}</p> : null}
              </div>
              <DialogFooter>
                <Button onClick={() => setSelectedCourse(null)}>{t("ui.close")}</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <MaterialSelectionDialog
        isOpen={!!materialSelectionCourse}
        courseId={materialSelectionCourse?.id || null}
        courseTitle={materialSelectionCourse?.title}
        onClose={() => setMaterialSelectionCourse(null)}
      />

      <Dialog open={!!previewContributionId} onOpenChange={(open) => !open && setPreviewContributionId(null)}>
        <DialogContent className="max-w-[95vw] lg:max-w-[85vw] h-[90vh] p-0 overflow-hidden border-none shadow-2xl">
          {previewContributionId && (
            <div className="flex h-full flex-col overflow-hidden rounded-lg">
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
                <h3 className="font-semibold text-sm">Document Preview</h3>
                <Button variant="ghost" size="sm" onClick={() => setPreviewContributionId(null)}>Close</Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <PDFPreviewer
                  storagePath={previewContributionId}
                  onRequestPresignedUrl={(id) => filesApi.getPreviewUrl(id).then(r => r.url)}
                  title="Course Material"
                  className="rounded-none border-none"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
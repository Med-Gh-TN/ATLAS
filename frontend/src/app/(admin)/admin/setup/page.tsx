/**
 * @file frontend/src/app/(admin)/admin/setup/page.tsx
 * @description Academic catalog setup – departments, majors, courses with soft‑deletion.
 * @layer Core Logic
 */

"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Building2,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Tag,
  Trash2,
  X,
  Archive,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useAdminCatalogCoursesQuery,
  useAdminDepartmentsQuery,
  useAdminMajorsQuery,
  useCreateCatalogCourseMutation,
  useCreateDepartmentMutation,
  useCreateMajorMutation,
  useUpdateCatalogCourseMutation,
  useUpdateDepartmentMutation,
  useUpdateMajorMutation,
  useDeleteDepartmentMutation,
  useDeleteMajorMutation,
} from "@/queries/admin.queries";
import { useTranslation } from "@/hooks/use-translation";

// ─── Local type helpers ─────────────────────────────────────────────────────
interface Department {
  id: string;
  name: string;
  is_deleted?: boolean;
}

interface Major {
  id: string;
  name: string;
  department_id: string;
  level: string;
  is_deleted?: boolean;
}

interface CatalogCourse {
  id: string;
  title: string;
  description?: string | null;
  department_id?: string | null;
  major_id?: string | null;
  level?: string;
  academic_year?: string;
  department_name?: string;
  is_deleted?: boolean;
}
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_OPTIONS = ["L1", "L2", "L3", "M1", "M2", "Doctorat"];

type CourseFormState = {
  title: string;
  description: string;
  department_id: string;
  major_id: string;
  level: string;
  academic_year: string;
};

const EMPTY_COURSE_FORM: CourseFormState = {
  title: "",
  description: "",
  department_id: "",
  major_id: "",
  level: "L1",
  academic_year: "2025-2026",
};

export default function AdminSetupPage() {
  const { t, tSection } = useTranslation();
  const adminT = tSection("admin");

  // ── State ──
  const [showArchived, setShowArchived] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [filterMajorId, setFilterMajorId] = useState<string | null>(null);

  // ── Queries with include_archived ──
  const departmentsQuery = useAdminDepartmentsQuery(showArchived);
  const majorsQuery = useAdminMajorsQuery(showArchived ? { include_archived: true } : undefined);
  const coursesQuery = useAdminCatalogCoursesQuery(showArchived);

  // Force‑type the data to arrays of our interfaces to avoid `{}` inference
  const departments: Department[] = departmentsQuery.data ?? [];
  const majors: Major[] = majorsQuery.data ?? [];
  const courses: CatalogCourse[] = (coursesQuery.data as CatalogCourse[]) ?? [];
  // ── Mutations ──
  const createDepartment = useCreateDepartmentMutation();
  const updateDepartment = useUpdateDepartmentMutation();
  const deleteDepartment = useDeleteDepartmentMutation();
  const createMajor = useCreateMajorMutation();
  const updateMajor = useUpdateMajorMutation();
  const deleteMajor = useDeleteMajorMutation();
  const createCourse = useCreateCatalogCourseMutation();
  const updateCourse = useUpdateCatalogCourseMutation();

  // ── UI local state for forms ──
  const [newDeptName, setNewDeptName] = useState("");
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState("");

  const [newMajorName, setNewMajorName] = useState("");
  const [newMajorLevel, setNewMajorLevel] = useState("L1");
  const [editingMajorId, setEditingMajorId] = useState<string | null>(null);
  const [editingMajorName, setEditingMajorName] = useState("");

  const [courseForm, setCourseForm] = useState<CourseFormState>(EMPTY_COURSE_FORM);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingCourseForm, setEditingCourseForm] = useState<CourseFormState>(EMPTY_COURSE_FORM);

  // ── Derived data (memoized) ──
  const majorsByDept = useMemo(() => {
    const map: Record<string, Major[]> = {};
    for (const dept of departments) map[dept.id] = [];
    for (const major of majors) {
      if (!map[major.department_id]) map[major.department_id] = [];
      map[major.department_id].push(major);
    }
    return map;
  }, [departments, majors]);

  const coursesByDept = useMemo(() => {
    const map: Record<string, CatalogCourse[]> = {};
    for (const dept of departments) map[dept.id] = [];
    for (const course of courses) {
      if (course.department_id && map[course.department_id]) {
        map[course.department_id].push(course);
      }
    }
    return map;
  }, [departments, courses]);

  const selectedDepartment = departments.find((d) => d.id === selectedDeptId) ?? null;
  const departmentMajors = selectedDeptId ? (majorsByDept[selectedDeptId] ?? []) : [];
  const departmentCourses: CatalogCourse[] = selectedDeptId ? (coursesByDept[selectedDeptId] ?? []) : [];

  const filteredDepartmentCourses: CatalogCourse[] = filterMajorId
    ? departmentCourses.filter((c) => c.major_id === filterMajorId)
    : departmentCourses;

  // ── Handlers ──
  const handleCourseMajorChange = (majorId: string) => {
    if (majorId) {
      const major = majors.find((m) => m.id === majorId);
      setCourseForm((prev) => ({
        ...prev,
        major_id: majorId,
        level: major ? major.level : prev.level,
      }));
    } else {
      setCourseForm((prev) => ({ ...prev, major_id: "", level: "L1" }));
    }
  };

  const handleEditCourseMajorChange = (majorId: string) => {
    if (majorId) {
      const major = majors.find((m) => m.id === majorId);
      setEditingCourseForm((prev) => ({
        ...prev,
        major_id: majorId,
        level: major ? major.level : prev.level,
      }));
    } else {
      setEditingCourseForm((prev) => ({ ...prev, major_id: "", level: "L1" }));
    }
  };

  // ── Department handlers ──
  const handleCreateDepartment = async () => {
    if (!newDeptName.trim()) return;
    await createDepartment.mutateAsync({ name: newDeptName.trim(), allowed_levels: LEVEL_OPTIONS });
    setNewDeptName("");
  };

  const startRenameDepartment = (id: string, name: string) => {
    setEditingDeptId(id);
    setEditingDeptName(name);
  };

  const saveDepartmentRename = async () => {
    if (!editingDeptId || !editingDeptName.trim()) return;
    // The mutation type might not include name in data; cast to any if needed
    await updateDepartment.mutateAsync({
      departmentId: editingDeptId,
      data: { name: editingDeptName.trim() } as any,
    });
    setEditingDeptId(null);
  };

  const archiveDepartment = async (deptId: string, currentlyArchived: boolean) => {
    // Cast to any because the mutation type doesn't include is_deleted
    await updateDepartment.mutateAsync({
      departmentId: deptId,
      data: { is_deleted: !currentlyArchived } as any,
    });
    if (selectedDeptId === deptId && !currentlyArchived) setSelectedDeptId(null);
  };

  // ── Major handlers ──
  const handleCreateMajor = async () => {
    if (!newMajorName.trim() || !selectedDeptId) return;
    await createMajor.mutateAsync({ name: newMajorName.trim(), department_id: selectedDeptId, level: newMajorLevel });
    setNewMajorName("");
    setNewMajorLevel("L1");
  };

  const startRenameMajor = (id: string, name: string) => {
    setEditingMajorId(id);
    setEditingMajorName(name);
  };

  const saveMajorRename = async () => {
    if (!editingMajorId || !editingMajorName.trim()) return;
    await updateMajor.mutateAsync({
      majorId: editingMajorId,
      data: { name: editingMajorName.trim() } as any,
    });
    setEditingMajorId(null);
  };

  const archiveMajor = async (majorId: string, currentlyArchived: boolean) => {
    await updateMajor.mutateAsync({
      majorId,
      data: { is_deleted: !currentlyArchived } as any,
    });
    if (filterMajorId === majorId && !currentlyArchived) setFilterMajorId(null);
  };

  // ── Course handlers ──
  const handleCreateCourse = async () => {
    if (!courseForm.title.trim() || !courseForm.department_id || !courseForm.academic_year.trim()) return;
    await createCourse.mutateAsync({
      title: courseForm.title.trim(),
      description: courseForm.description.trim() || null,
      department_id: courseForm.department_id,
      level: courseForm.level,
      academic_year: courseForm.academic_year.trim(),
      major_id: courseForm.major_id || undefined,
      filiere: undefined,
      course_type: "LESSON",
      language: "fr",
    });
    setCourseForm({ ...EMPTY_COURSE_FORM, department_id: selectedDeptId || "" });
  };

  const startEditCourse = (courseId: string) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    setEditingCourseId(courseId);
    setEditingCourseForm({
      title: course.title,
      description: course.description ?? "",
      department_id: course.department_id ?? "",
      major_id: course.major_id ?? "",
      level: course.level ?? "L1",
      academic_year: course.academic_year ?? "2025-2026",
    });
  };

  const saveEditCourse = async () => {
    if (
      !editingCourseId ||
      !editingCourseForm.title.trim() ||
      !editingCourseForm.department_id ||
      !editingCourseForm.academic_year.trim()
    )
      return;
    await updateCourse.mutateAsync({
      courseId: editingCourseId,
      data: {
        ...editingCourseForm,
        title: editingCourseForm.title.trim(),
        description: editingCourseForm.description.trim() || null,
        academic_year: editingCourseForm.academic_year.trim(),
        major_id: editingCourseForm.major_id || undefined,
        filiere: undefined,
        course_type: "LESSON",
        language: "fr",
        is_deleted: false,
      } as any,
    });
    setEditingCourseId(null);
  };

  const archiveCourse = async (courseId: string, currentlyArchived: boolean) => {
    await updateCourse.mutateAsync({
      courseId,
      data: { is_deleted: !currentlyArchived } as any,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{adminT.academicSetup}</h1>
          <p className="text-muted-foreground">{adminT.academicSetupDescription}</p>
        </div>
        <Button variant="outline" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
          {showArchived ? "Hide Archived" : "Show Archived"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-4">
        {/* Sidebar: Departments */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{adminT.departments}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder={adminT.departmentPlaceholder}
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
              />
              <Button size="icon" onClick={handleCreateDepartment} disabled={createDepartment.isPending}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
              {departmentsQuery.isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : departments.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">No departments.</p>
              ) : (
                departments.map((dept) => (
                  <div
                    key={dept.id}
                    className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedDeptId === dept.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                    onClick={() => {
                      setSelectedDeptId(dept.id);
                      setFilterMajorId(null);
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {editingDeptId === dept.id ? (
                        <Input
                          value={editingDeptName}
                          onChange={(e) => setEditingDeptName(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && saveDepartmentRename()}
                        />
                      ) : (
                        <span className="truncate font-medium text-sm">
                          {dept.name}
                          {dept.is_deleted && (
                            <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-1 py-0.5 rounded">
                              Archived
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 ml-2">
                      {editingDeptId === dept.id ? (
                        <>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); saveDepartmentRename(); }}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingDeptId(null); }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); startRenameDepartment(dept.id, dept.name); }}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!(dept.is_deleted ?? false) && window.confirm(adminT.confirmDeleteDepartment))
                                archiveDepartment(dept.id, dept.is_deleted ?? false);
                              else if (dept.is_deleted)
                                archiveDepartment(dept.id, dept.is_deleted ?? false);
                            }}
                          >
                            {dept.is_deleted ? (
                              <RotateCcw className="h-3 w-3 text-green-600" />
                            ) : (
                              <Archive className="h-3 w-3 text-destructive" />
                            )}
                          </Button>
                        </>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main content */}
        <div className="xl:col-span-3 space-y-6">
          {!selectedDepartment ? (
            <EmptyState
              type="no-results"
              title="Select a department"
              description="Click on a department from the list to manage its majors and courses."
            />
          ) : (
            <>
              <div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-6 w-6 text-primary" />
                  <h2 className="text-xl font-bold">{selectedDepartment.name}</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startRenameDepartment(selectedDepartment.id, selectedDepartment.name)}
                  >
                    Rename
                  </Button>
                </div>
              </div>

              {/* Majors section */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{adminT.majors}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3 items-end border rounded-lg p-4">
                    <Input
                      label="Major Name"
                      value={newMajorName}
                      onChange={(e) => setNewMajorName(e.target.value)}
                      placeholder="e.g., IoT"
                      className="w-40"
                    />
                    <Select value={newMajorLevel} onChange={(e) => setNewMajorLevel(e.target.value)}>
                      {LEVEL_OPTIONS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </Select>
                    <Button onClick={handleCreateMajor} disabled={createMajor.isPending}>
                      <Plus className="mr-1 h-4 w-4" /> Add Major
                    </Button>
                  </div>

                  {departmentMajors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No majors for this department.</p>
                  ) : (
                    <div className="space-y-2">
                      {departmentMajors.map((major) => (
                        <div
                          key={major.id}
                          className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${
                            filterMajorId === major.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          }`}
                          onClick={() => setFilterMajorId(filterMajorId === major.id ? null : major.id)}
                        >
                          <div className="flex items-center gap-3">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            {editingMajorId === major.id ? (
                              <Input
                                value={editingMajorName}
                                onChange={(e) => setEditingMajorName(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-7 w-40"
                              />
                            ) : (
                              <span className="font-medium">
                                {major.name}{" "}
                                <span className="text-sm text-muted-foreground">({major.level})</span>
                                {major.is_deleted && (
                                  <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-1 py-0.5 rounded">
                                    Archived
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {editingMajorId === major.id ? (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveMajorRename();
                                  }}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingMajorId(null);
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startRenameMajor(major.id, major.name);
                                  }}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    archiveMajor(major.id, major.is_deleted ?? false);
                                  }}
                                >
                                  {major.is_deleted ? (
                                    <RotateCcw className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <Archive className="h-4 w-4 text-destructive" />
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Courses section */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{adminT.catalogCourses}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Add Course form */}
                  <div className="grid gap-3 border rounded-lg p-4">
                    <Input
                      label="Title"
                      value={courseForm.title}
                      onChange={(e) => setCourseForm((c) => ({ ...c, title: e.target.value }))}
                      placeholder="e.g., Introduction to Programming"
                    />
                    <Input
                      label="Description"
                      value={courseForm.description}
                      onChange={(e) => setCourseForm((c) => ({ ...c, description: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Select
                        value={courseForm.major_id}
                        onChange={(e) => handleCourseMajorChange(e.target.value)}
                      >
                        <option value="">Select a major (optional)</option>
                        {departmentMajors.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.level}) {m.is_deleted ? "(Archived)" : ""}
                          </option>
                        ))}
                      </Select>
                      <Input
                        label="Academic Year"
                        value={courseForm.academic_year}
                        onChange={(e) => setCourseForm((c) => ({ ...c, academic_year: e.target.value }))}
                      />
                    </div>
                    <Button
                      onClick={() => {
                        setCourseForm((f) => ({ ...f, department_id: selectedDeptId! }));
                        handleCreateCourse();
                      }}
                      disabled={createCourse.isPending}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add Course
                    </Button>
                  </div>

                  {/* Course list – shown only when a major is selected */}
                  {!filterMajorId ? (
                    <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg bg-muted/20 text-center">
                      <BookOpen className="h-8 w-8 text-muted-foreground mb-3 opacity-40" />
                      <p className="text-sm font-medium text-muted-foreground">No major selected</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Select a major from the list above to view and manage its courses.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2 pb-2 border-b">
                        <span className="text-sm font-medium text-muted-foreground">
                          Showing courses for{" "}
                          {majors.find((m) => m.id === filterMajorId)?.name ?? "selected major"}
                          {majors.find((m) => m.id === filterMajorId)?.is_deleted && (
                            <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-1 py-0.5 rounded">
                              (Archived)
                            </span>
                          )}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => setFilterMajorId(null)}>
                          Clear selection
                        </Button>
                      </div>

                      {filteredDepartmentCourses.length === 0 ? (
                        <p className="text-sm text-muted-foreground pt-2">
                          No courses to display for this major.
                        </p>
                      ) : (
                        <div className="space-y-3 pt-2">
                          {filteredDepartmentCourses.map((course) => (
                            <div key={course.id} className="rounded-lg border p-4">
                              {editingCourseId === course.id ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <Input
                                    label="Title"
                                    value={editingCourseForm.title}
                                    onChange={(e) =>
                                      setEditingCourseForm((c) => ({ ...c, title: e.target.value }))
                                    }
                                  />
                                  <Input
                                    label="Description"
                                    value={editingCourseForm.description}
                                    onChange={(e) =>
                                      setEditingCourseForm((c) => ({ ...c, description: e.target.value }))
                                    }
                                  />
                                  <Select
                                    value={editingCourseForm.major_id}
                                    onChange={(e) => handleEditCourseMajorChange(e.target.value)}
                                  >
                                    <option value="">None</option>
                                    {departmentMajors
                                      .filter((m) => !m.is_deleted)
                                      .map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {m.name} ({m.level})
                                        </option>
                                      ))}
                                  </Select>
                                  <Input
                                    label="Academic Year"
                                    value={editingCourseForm.academic_year}
                                    onChange={(e) =>
                                      setEditingCourseForm((c) => ({
                                        ...c,
                                        academic_year: e.target.value,
                                      }))
                                    }
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={saveEditCourse} disabled={updateCourse.isPending}>
                                      Save
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingCourseId(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                                      <h4 className="font-semibold">{course.title}</h4>
                                      {course.is_deleted && (
                                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                                          Archived
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {course.department_name} | {course.level} | {course.academic_year}
                                      {course.major_id &&
                                        ` | ${majors.find((m) => m.id === course.major_id)?.name ?? ""}`}
                                    </p>
                                    {course.description && (
                                      <p className="text-sm text-muted-foreground mt-1">{course.description}</p>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => startEditCourse(course.id)}>
                                      Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => archiveCourse(course.id, course.is_deleted ?? false)}
                                    >
                                      {course.is_deleted ? "Restore" : "Archive"}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
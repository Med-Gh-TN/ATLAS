"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { coursesApi, authApi, api } from "@/lib/api";
import { useTranslation } from "@/hooks/use-translation";

const getDefaultAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

export default function TeacherCourseUploadPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const uploadMutation = useMutation({
    mutationFn: (data: {
      major_id: string;
      course_id: string;
      course_type: string;
      language: string;
      academic_year: string;
      file: File;
    }) => coursesApi.upload(data),
  });

  const [file, setFile] = useState<File | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [majorId, setMajorId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [courseType, setCourseType] = useState("LECTURE");
  const [language, setLanguage] = useState("FR");
  const [academicYear, setAcademicYear] = useState(getDefaultAcademicYear());
  const [error, setError] = useState("");

  const { data: regOptions } = useQuery({
    queryKey: ["auth", "registration-options"],
    queryFn: () => authApi.getRegistrationOptions(),
    staleTime: 5 * 60 * 1000,
  });
  const departments = regOptions?.departments ?? [];

  const { data: majorsData, isLoading: majorsLoading } = useQuery({
    queryKey: ["auth", "majors", departmentId],
    queryFn: async () => {
      if (!departmentId) return [];
      return await api.get<
        { id: string; name: string; department_id: string; level: string }[]
      >(`/auth/majors/${departmentId}`);
    },
    enabled: Boolean(departmentId),
    staleTime: 2 * 60 * 1000,
  });
  const availableMajors = majorsData ?? [];

  const { data: existingCourses, isLoading: coursesLoading } = useQuery({
    queryKey: ["courses", "major", majorId],
    queryFn: async () => {
      if (!majorId) return [];
      return await api.get<{ id: string; title: string }[]>(`/courses?major_id=${majorId}`);
    },
    enabled: Boolean(majorId),
    staleTime: 60 * 1000,
  });

  // ── Filter out ghost / untitled entries ─────────────────────
  const validCourses = useMemo(
    () => (existingCourses || []).filter((c) => c.id && c.title?.trim()),
    [existingCourses],
  );
  // ─────────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((selectedFile: File) => setFile(selectedFile), []);

  const handleDepartmentChange = (newDeptId: string) => {
    setDepartmentId(newDeptId);
    setMajorId("");
    setSelectedCourseId("");
  };

  const handleMajorChange = (newMajorId: string) => {
    setMajorId(newMajorId);
    setSelectedCourseId("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!departmentId) { setError("Please select a department"); return; }
    if (!majorId) { setError(t("teacher.selectMajorError") || "Please select a major"); return; }
    if (!selectedCourseId) { setError("Please select a course"); return; }
    if (!file) { setError(t("teacher.uploadSelectFileError") || "Please select a file"); return; }
    if (!academicYear || !/^\d{4}-\d{4}$/.test(academicYear)) {
      setError("Please enter a valid academic year (e.g., 2024-2025)"); return;
    }

    try {
      await uploadMutation.mutateAsync({
        major_id: majorId,
        course_id: selectedCourseId,
        course_type: courseType,
        language,
        academic_year: academicYear,
        file,
      });
      router.push("/teacher/manage-courses");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("teacher.uploadFailed") || "Upload failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("teacher.uploadCourseMaterial")}</h1>
        <p className="text-muted-foreground">{t("teacher.uploadDescription")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("teacher.selectCourseInfo") || "Course Details"}</CardTitle>
                <CardDescription>
                  {t("teacher.selectCourseInfoDescription") || "Choose the department, major, and existing course."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" /> {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("leaderboard.department")} <span className="text-destructive">*</span>
                  </label>
                  <select
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={departmentId}
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                    required
                  >
                    <option value="">Select a department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("teacher.major") || "Major"} <span className="text-destructive">*</span>
                  </label>
                  <select
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={majorId}
                    onChange={(e) => handleMajorChange(e.target.value)}
                    disabled={!departmentId || majorsLoading}
                    required
                  >
                    <option value="">
                      {!departmentId
                        ? "Select a department first"
                        : majorsLoading
                        ? "Loading majors…"
                        : availableMajors.length === 0
                        ? "No majors found for this department"
                        : "Select a major"}
                    </option>
                    {availableMajors.map((major) => (
                      <option key={major.id} value={major.id}>
                        {major.name} ({major.level})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("teacher.courseTitle") || "Course"} <span className="text-destructive">*</span>
                  </label>
                  <select
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    disabled={!majorId || coursesLoading}
                    required
                  >
                    <option value="">
                      {!majorId
                        ? "Select a major first"
                        : coursesLoading
                        ? "Loading courses…"
                        : validCourses.length === 0
                        ? "No courses available for this major"
                        : "Select a course"}
                    </option>
                    {validCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("teacher.documentType")}</label>
                    <select
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      value={courseType}
                      onChange={(e) => setCourseType(e.target.value)}
                    >
                      <option value="LECTURE">{t("teacher.lectureNotes")} (Cours)</option>
                      <option value="TD">{t("teacher.worksheet")} (TD)</option>
                      <option value="TP">{t("teacher.lab")} (TP)</option>
                      <option value="EXAM">{t("teacher.exam")}</option>
                      <option value="SUMMARY">{t("teacher.summary")}</option>
                      <option value="OTHER">{t("ui.other")}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("account.language")}</label>
                    <select
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="FR">{t("teacher.french")} (Français)</option>
                      <option value="EN">{t("teacher.english")} (Anglais)</option>
                      <option value="AR">{t("teacher.arabic")} (العربية)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Academic Year</label>
                    <Input
                      type="text"
                      placeholder="YYYY-YYYY"
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      pattern="\d{4}-\d{4}"
                      title="Format: YYYY-YYYY (e.g. 2024-2025)"
                      required
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("teacher.uploadDocument")}</CardTitle>
                <CardDescription>{t("teacher.supportedFormatsDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {file ? (
                  <div className="flex items-center gap-3 rounded-lg border p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <FileDropzone
                    onFileSelect={handleFileSelect}
                    accept={{
                      "application/pdf": [".pdf"],
                      "application/msword": [".doc"],
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
                      "application/vnd.ms-powerpoint": [".ppt"],
                      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
                      "image/png": [".png"],
                      "image/jpeg": [".jpg", ".jpeg"],
                    }}
                  />
                )}
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("teacher.uploading")}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" /> {t("teacher.uploadMaterial")}
                </>
              )}
            </Button>
          </form>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("teacher.catalogRules")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p>{t("teacher.ruleAdminsCreateCourses")}</p>
              </div>
              <div className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p>{t("teacher.ruleTeachersUpload")}</p>
              </div>
              <div className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p>{t("teacher.ruleStudentReview")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
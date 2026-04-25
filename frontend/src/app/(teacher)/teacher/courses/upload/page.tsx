import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upload Course",
  description: "Upload a new course document as a teacher.",
};

export default function TeacherCourseUploadPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Upload Course</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        This route restores the required `/teacher/courses/upload` path for the frontend contract. The upload workflow will be wired to the rebuilt backend contract in the data-layer pass.
      </p>
    </div>
  );
}

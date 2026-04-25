import { useQuery } from "@tanstack/react-query";
import { coursesApi } from "@/lib/api";

export function useCoursesQuery(params?: {
  filiere?: string;
  niveau?: string;
  type?: string;
}) {
  return useQuery({
    queryKey: ["courses", params],
    queryFn: () => coursesApi.list(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCourseQuery(courseId: string) {
  return useQuery({
    queryKey: ["course", courseId],
    queryFn: () => coursesApi.getById(courseId),
    enabled: Boolean(courseId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCourseVersionsQuery(courseId: string) {
  return useQuery({
    queryKey: ["course", courseId, "versions"],
    queryFn: () => coursesApi.getVersions(courseId),
    enabled: Boolean(courseId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeacherCourses() {
  return useQuery({
    queryKey: ["courses", "my-uploads"],
    queryFn: () => coursesApi.getMyUploads(),
    staleTime: 5 * 60 * 1000,
  });
}

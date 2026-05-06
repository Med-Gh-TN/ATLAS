/**
 * @file frontend/src/queries/courses.ts
 * @description React Query hooks for course-related API calls.
 * SOTA FIX: Implemented Strict Hook Firewalls to prevent React Query from spamming the backend with 422-inducing invalid UUIDs (e.g., 'global', 'undefined').
 * @layer Core Logic
 * @dependencies @tanstack/react-query, api
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { coursesApi, api } from "@/lib/api";
import type { CourseVersion, InstantCourseResult } from "@/types/api.types";
import { keepPreviousData } from "@tanstack/react-query"; // add this import at the top

// Explicitly define the new hierarchical payload shape from the backend
export interface CourseVersionsResponse {
  items: CourseVersion[];
  hierarchy: Record<string, Record<string, CourseVersion[]>>;
}

/**
 * Instant course search powered by Meilisearch (debounced).
 * Returns lightweight results for search-as-you-type components.
 */
export function useCourseInstantSearch(
  query: string,
  options?: { enabled?: boolean }
) {
  return useQuery<InstantCourseResult[]>({
    queryKey: ["courses", "instant", query],
    queryFn: async () => {
      if (!query || query.length < 1) return [];
      const data = await api.get<InstantCourseResult[]>(
        `/search/instant?q=${encodeURIComponent(query)}`
      );
      return data;
    },
    enabled: options?.enabled ?? query.length >= 1,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,  // v5 style placeholder
  });
}

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
  const isValidId = Boolean(courseId) && !["global", "undefined", "null"].includes(courseId);

  return useQuery({
    queryKey: ["course", courseId],
    queryFn: () => coursesApi.getById(courseId),
    enabled: isValidId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCourseVersionsQuery(courseId: string) {
  const isValidId = Boolean(courseId) && !["global", "undefined", "null"].includes(courseId);

  return useQuery<CourseVersionsResponse>({
    queryKey: ["course", courseId, "versions"],
    queryFn: async () => {
      const data = await coursesApi.getVersions(courseId);
      return data as unknown as CourseVersionsResponse;
    },
    enabled: isValidId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVersionQuery(versionId: string | null) {
  const isValidId = Boolean(versionId) && !["global", "undefined", "null"].includes(versionId!);

  return useQuery({
    queryKey: ["version", versionId],
    queryFn: () => coursesApi.getVersion(versionId!),
    enabled: isValidId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCourseStatsQuery(courseId: string) {
  const isValidId = Boolean(courseId) && !["global", "undefined", "null"].includes(courseId);

  return useQuery({
    queryKey: ["course", courseId, "stats"],
    queryFn: () => coursesApi.getStats(courseId),
    enabled: isValidId,
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

export function useCourseCatalogQuery() {
  return useQuery({
    queryKey: ["courses", "catalog"],
    queryFn: () => coursesApi.getCatalog(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeleteCourseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => coursesApi.delete(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses", "my-uploads"] });
    },
  });
}

export function useUpdateCourseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, data }: { courseId: string; data: any }) =>
      coursesApi.update(courseId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["courses", "my-uploads"] });
      queryClient.invalidateQueries({ queryKey: ["course", variables.courseId] });
    },
  });
}
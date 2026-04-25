import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api";

export function useStudentDashboardQuery() {
  return useQuery({
    queryKey: ["dashboard", "student"],
    queryFn: dashboardApi.student.getOverview,
  });
}

export function useStudentHistoryQuery(params?: {
  limit?: number;
  before?: string;
}) {
  return useQuery({
    queryKey: ["dashboard", "student", "history", params],
    queryFn: () => dashboardApi.student.getHistory(params),
  });
}

export function useTeacherAnalyticsQuery() {
  return useQuery({
    queryKey: ["dashboard", "teacher"],
    queryFn: dashboardApi.teacher.getAnalytics,
  });
}

export function useCourseAnalyticsQuery(courseId: string) {
  return useQuery({
    queryKey: ["course", courseId, "analytics"],
    queryFn: () => dashboardApi.teacher.getCourseAnalytics(courseId),
    enabled: Boolean(courseId),
  });
}

export function useAdminDashboardQuery() {
  return useQuery({
    queryKey: ["dashboard", "admin"],
    queryFn: dashboardApi.admin.getDashboard,
  });
}

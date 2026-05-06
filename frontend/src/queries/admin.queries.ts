import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, superadminApi, api } from "@/lib/api";

export function useAdminUsersQuery() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminApi.listUsers(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeacherRequestsQuery() {
  return useQuery({
    queryKey: ["admin", "teacher-requests"],
    queryFn: () => adminApi.listTeacherRequests(),
    staleTime: 60 * 1000,
  });
}

export function useAdminDepartmentsQuery(includeArchived: boolean = false) {
  return useQuery({
    queryKey: ["admin", "departments", { includeArchived }],
    queryFn: () => adminApi.listDepartments(includeArchived),
    staleTime: 5 * 60 * 1000,
  });
}


export function useAdminCatalogCoursesQuery(includeArchived: boolean = false) {
  return useQuery({
    queryKey: ["admin", "catalog", "courses", { includeArchived }],
    queryFn: () => adminApi.listCatalogCourses(includeArchived),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSuperadminEstablishmentsQuery() {
  return useQuery({
    queryKey: ["superadmin", "establishments"],
    queryFn: () => superadminApi.getEstablishments(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminEstablishmentsQuery() {
  return useQuery({
    queryKey: ["admin", "establishments"],
    queryFn: () => adminApi.getEstablishments(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateEstablishmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; domain: string }) =>
      superadminApi.createEstablishment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "establishments"] });
    },
  });
}

export function useToggleEstablishmentAuthorizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (establishmentId: string) =>
      superadminApi.toggleEstablishmentAuthorization(establishmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "establishments"] });
    },
  });
}

export function useCreateAdminMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { full_name: string; email: string; password: string; establishment_id: string }) =>
      superadminApi.createAdmin(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "establishments"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin", "dashboard", "stats"] });
    },
  });
}

export function useSuperadminDashboardStatsQuery() {
  return useQuery({
    queryKey: ["superadmin", "dashboard", "stats"],
    queryFn: () => superadminApi.getDashboardStats(),
    staleTime: 60 * 1000,
  });
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: Parameters<typeof adminApi.updateUser>[1] }) =>
      adminApi.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "admin"] }); // Invalidate dashboard stats
    },
  });
}

export function useDeleteUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "admin"] }); // Invalidate dashboard stats
    },
  });
}

export function useApproveTeacherRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, data }: { requestId: string; data?: { review_note?: string } }) =>
      adminApi.approveTeacherRequest(requestId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teacher-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "admin"] });
    },
  });
}

export function useImportTeachersMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) => adminApi.importTeachers(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "teacher-requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "admin"] });
    },
  });
}

export function useCreateDepartmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; allowed_levels: string[] }) =>
      adminApi.createDepartment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "departments"] });
    },
  });
}

export function useUpdateDepartmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      departmentId,
      data,
    }: {
      departmentId: string;
      data: { name?: string; allowed_levels?: string[] };
    }) => adminApi.updateDepartment(departmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "departments"] });
    },
  });
}

export function useDeleteDepartmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (departmentId: string) => adminApi.deleteDepartment(departmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "departments"] });
    },
  });
}

export function useCreateCatalogCourseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string | null;
      department_id: string;
      level: string;
      course_type: string;
      language: string;
      academic_year?: string;
      major_id?: string;
      filiere?: string | null;
    }) => adminApi.createCatalogCourse(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "catalog", "courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

export function useUpdateCatalogCourseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      courseId,
      data,
    }: {
      courseId: string;
      data: {
        title?: string;
        description?: string | null;
        department_id?: string;
        level?: string;
        course_type?: string;
        academic_year?: string;
        language?: string;
        is_deleted?: boolean;
        major_id?: string;
        filiere?: string | null;
      };
    }) => adminApi.updateCatalogCourse(courseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "catalog", "courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

export function useDeleteCatalogCourseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => adminApi.deleteCatalogCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "catalog", "courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

export function useSuperadminUsersQuery(params?: {
  role?: string;
  establishment_id?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["superadmin", "users", params],
    queryFn: () => superadminApi.listUsers(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSuperadminEstablishmentDetailsQuery(establishmentId: string) {
  return useQuery({
    queryKey: ["superadmin", "establishments", establishmentId],
    queryFn: () => superadminApi.getEstablishment(establishmentId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateSuperadminEstablishmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ establishmentId, data }: { establishmentId: string; data: { name?: string; domain?: string } }) =>
      superadminApi.updateEstablishment(establishmentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "establishments"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin", "establishments", variables.establishmentId] });
    },
  });
}

export function useDeleteSuperadminEstablishmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (establishmentId: string) => superadminApi.deleteEstablishment(establishmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "establishments"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin", "dashboard", "stats"] });
    },
  });
}

export function useUpdateSuperadminUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: { is_active?: boolean; role?: string; full_name?: string } }) =>
      superadminApi.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "admin"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin", "dashboard", "stats"] });
    },
  });
}

export function useDeleteSuperadminUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => superadminApi.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin", "dashboard", "stats"] });
    },
  });
}

// ────────────── Major hooks ──────────────
export function useAdminMajorsQuery(params?: { department_id?: string; level?: string; include_archived?: boolean }) {
  return useQuery({
    queryKey: ["admin", "majors", params],
    queryFn: () => adminApi.listMajors(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateMajorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; department_id: string; level: string }) =>
      adminApi.createMajor(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "majors"] });
    },
  });
}

export function useUpdateMajorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ majorId, data }: { majorId: string; data: { name?: string; department_id?: string; level?: string; is_deleted?: boolean } }) =>
      api.patch(`/admin/majors/${majorId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "majors"] });
    },
  });
}

export function useDeleteMajorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (majorId: string) => adminApi.deleteMajor(majorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "majors"] });
    },
  });
}
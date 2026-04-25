import { useQuery } from "@tanstack/react-query";
import { adminApi, superadminApi } from "@/lib/api";

export function useAdminUsersQuery() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminApi.getUsers(),
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

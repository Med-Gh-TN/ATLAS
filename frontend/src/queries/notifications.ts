import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api";

export function useNotificationsQuery(params?: { limit?: number; before?: string }) {
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: () => notificationsApi.list(params),
    staleTime: 30 * 1000,
  });
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationIds: string[]) =>
      notificationsApi.markAllAsRead(notificationIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ragApi } from "@/lib/api";

export function useCreateRagSessionMutation(courseId: string) {
  return useMutation({
    mutationFn: () => ragApi.createSession(courseId),
  });
}

export function useRagMessagesQuery(
  sessionId: string,
  params?: { limit?: number; before?: string },
) {
  return useQuery({
    queryKey: ["rag", sessionId, "messages", params],
    queryFn: () => ragApi.getMessages(sessionId, params),
    enabled: Boolean(sessionId),
  });
}

export function useDeleteRagSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => ragApi.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rag"] });
    },
  });
}

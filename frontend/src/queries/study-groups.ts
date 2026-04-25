import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface StudyGroup {
  id: string;
  name: string;
  module: string;
  member_count: number;
  max_members: number;
  is_public: boolean;
  last_active: string;
  notes?: string;
  members?: Array<{user_id: string; name: string; is_online: boolean; role: string}>;
}

export const studyGroupKeys = {
  all: ["study-groups"] as const,
  list: () => [...studyGroupKeys.all, "list"] as const,
  detail: (id: string) => [...studyGroupKeys.all, "detail", id] as const,
};

export const useStudyGroupsQuery = () => {
  return useQuery({
    queryKey: studyGroupKeys.list(),
    queryFn: async () => {
      const res = await api.get<StudyGroup[]>("/study-groups");
      return res;
    },
  });
};

export const useStudyGroupQuery = (id: string) => {
  return useQuery({
    queryKey: studyGroupKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<StudyGroup>(`/study-groups/${id}`);
      return res;
    },
    enabled: !!id,
  });
};

export const useCreateStudyGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<StudyGroup>) => {
      const res = await api.post<StudyGroup>("/study-groups", data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studyGroupKeys.list() });
    },
  });
};

export const useJoinStudyGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/study-groups/${id}/join`);
      return res as any;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: studyGroupKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studyGroupKeys.list() });
    },
  });
};

export const useUpdateStudyGroupNotesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const res = await api.patch(`/study-groups/${id}/notes`, { notes });
      return res as any;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: studyGroupKeys.detail(id) });
    },
  });
};

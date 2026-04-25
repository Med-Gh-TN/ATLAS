import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contributionsApi } from "@/lib/api";

export function useContributionsMineQuery(params?: { status?: string }) {
  return useQuery({
    queryKey: ["contributions", "mine", params],
    queryFn: () => contributionsApi.listMine(params),
  });
}

export function useSubmitContributionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) => contributionsApi.submit(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contributions"] });
    },
  });
}

export function useAdminContributionsQuery(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["admin", "contributions", params],
    queryFn: () => contributionsApi.admin.list(params),
  });
}

export function useApproveContributionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      contributionId,
      reviewNote,
    }: {
      contributionId: string;
      reviewNote?: string;
    }) =>
      contributionsApi.admin.approve(contributionId, {
        review_note: reviewNote,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "contributions"] });
    },
  });
}

export function useRejectContributionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      contributionId,
      reviewNote,
    }: {
      contributionId: string;
      reviewNote: string;
    }) => contributionsApi.admin.reject(contributionId, reviewNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "contributions"] });
    },
  });
}

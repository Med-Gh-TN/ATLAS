import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import type { RegisterRequest } from "@/types/api.types";

export function useUserQuery() {
  return useQuery({
    queryKey: ["user"],
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login({ username: email, password }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (data: RegisterRequest) => authApi.register(data),
  });
}

export function useVerifyOtpMutation() {
  return useMutation({
    mutationFn: ({
      email,
      code,
      purpose,
    }: {
      email: string;
      code: string;
      purpose?: "ACCOUNT_ACTIVATION" | "TEACHER_ONBOARDING" | "PASSWORD_RESET";
    }) => authApi.verifyOtp({ email, code, purpose }),
  });
}

export function useRequestOtpMutation() {
  return useMutation({
    mutationFn: ({
      email,
      purpose,
    }: {
      email: string;
      purpose?: "ACCOUNT_ACTIVATION" | "TEACHER_ONBOARDING" | "PASSWORD_RESET";
    }) => authApi.requestOtp({ email, purpose }),
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

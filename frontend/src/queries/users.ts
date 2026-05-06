/**
 * @file frontend/src/queries/users.ts
 * @description API hooks for user-related data, including public profiles.
 * @layer Core Logic
 * @dependencies @tanstack/react-query, @/lib/api, @/types/api.types
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UserProfile } from "@/types/api.types";

/**
 * Fetches the public profile of a user by their username.
 * @param username The username of the profile to fetch
 */
export function useUserProfileQuery(username: string) {
  return useQuery({
    queryKey: ["userProfile", username],
    queryFn: () => api.get<UserProfile>(`/users/profile/${username}`),
    enabled: !!username,
  });
}
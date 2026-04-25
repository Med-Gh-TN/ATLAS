import { useQuery } from "@tanstack/react-query";
import { gamificationApi } from "@/lib/api";

export function useUserXpQuery(userId: string) {
  return useQuery({
    queryKey: ["gamification", "xp", userId],
    queryFn: () => gamificationApi.getXP(userId),
    enabled: Boolean(userId),
  });
}

export function useUserBadgesQuery(userId: string) {
  return useQuery({
    queryKey: ["gamification", "badges", userId],
    queryFn: () => gamificationApi.getBadges(userId),
    enabled: Boolean(userId),
  });
}

export function useLeaderboardQuery(
  limit = 20,
  filiere?: string,
  anonymous = false,
) {
  return useQuery({
    queryKey: ["gamification", "leaderboard", limit, filiere, anonymous],
    queryFn: () => gamificationApi.getLeaderboard(limit, filiere, anonymous),
    staleTime: 60 * 1000,
  });
}

export function useUserProfileQuery(username: string) {
  return useQuery({
    queryKey: ["profile", username],
    queryFn: () => gamificationApi.getProfile(username),
    enabled: Boolean(username),
    staleTime: 60 * 1000,
  });
}

import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/lib/api";

export function useDailyActivityQuery(days: number = 365) {
  return useQuery({
    queryKey: ["daily-activity", days],
    queryFn: async () => {
      const data = await analyticsApi.dailyActivity(days);
      // Ensure shape: [{ date, value }]
      return data as any[];
    },
  });
}

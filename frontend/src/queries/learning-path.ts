import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface LearningStep {
  order: number;
  type: "READ" | "STUDY" | "TEST";
  course_id?: string;
  deck_id?: string;
  quiz_id?: string;
  title: string;
  estimated_minutes?: number;
  card_count?: number;
  question_count?: number;
}

export interface LearningPath {
  goal: string;
  steps: LearningStep[];
  estimated_total_hours: number;
}

export interface LearningPathJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: LearningPath;
}

export const learningPathKeys = {
  all: ["learning-path"] as const,
  job: (id: string) => [...learningPathKeys.all, "job", id] as const,
};

export const useGenerateLearningPath = () => {
  return useMutation({
    mutationFn: async ({ title, topics }: { title: string; topics: string[] }) => {
      const res = await api.post<{ id: string }>("/learning-paths/generate", {
        title,
        topics,
      });
      return res;
    },
  });
};

export const useLearningPathJob = (jobId: string | null) => {
  return useQuery({
    queryKey: learningPathKeys.job(jobId!),
    queryFn: async () => {
      const res = await api.get<LearningPathJob>(`/learning-paths/jobs/${jobId}`);
      return res;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (state && (state.status === "completed" || state.status === "failed")) {
        return false;
      }
      return 3000; // Poll every 3 seconds
    },
  });
};

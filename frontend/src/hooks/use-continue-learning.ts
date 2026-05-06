"use client";

import { useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";

export interface ContinueLearningState {
  courseId: string;
  courseTitle: string;
  toolId?: string;
  path: string;
  timestamp: number;
  progress?: number;
}

const STORAGE_KEY = "atlas_continue_learning";

export function useTrackLearning(courseId: string, courseTitle: string, toolId?: string) {
  const pathname = usePathname();

  const track = useCallback(() => {
    if (typeof window === "undefined") return;

    const state: ContinueLearningState = {
      courseId,
      courseTitle,
      toolId,
      path: pathname,
      timestamp: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Also set the old key for backward compatibility if any
    localStorage.setItem("atlas_last_course_path", pathname);
  }, [courseId, courseTitle, toolId, pathname]);

  useEffect(() => {
    track();
  }, [track]);
}

export function useContinueLearning() {
  const getContinueLearning = useCallback((): ContinueLearningState | null => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as ContinueLearningState;
    } catch {
      return null;
    }
  }, []);

  return { getContinueLearning };
}

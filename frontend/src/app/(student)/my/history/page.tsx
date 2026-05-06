"use client";

import { useState } from "react";
import {
  Clock,
  BookOpen,
  Brain,
  FileQuestion,
  TrendingUp,
  Calendar,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudentDashboardQuery } from "@/queries";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { ActivityLogItem } from "@/types/api.types";
import { useTranslation } from "@/hooks/use-translation";

export default function HistoryPage() {
  const { t, tSection } = useTranslation();
  const histT = tSection("history");
  const { data: dashboard, isLoading: isDashboardLoading } =
    useStudentDashboardQuery();
  const [filter, setFilter] = useState("all");

  const { data: historyItems, isLoading: isHistoryLoading } = useQuery({
    queryKey: ["student-history"],
    queryFn: () => api.get<ActivityLogItem[]>("/students/me/history"),
  });

  const filteredHistory =
    historyItems?.filter((h) => {
      if (filter === "all") return true;
      return h.activity_type === filter;
    }) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{histT.title}</h1>
        <p className="text-muted-foreground">{histT.description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {isDashboardLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    dashboard?.progress?.active_streak_days || 0
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{histT.dayStreak}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {isDashboardLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    (historyItems?.length ?? 0)
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{histT.thisWeek}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {isDashboardLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    (historyItems?.length ?? 0)
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{histT.totalHours}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-40"
        >
          <option value="all">{histT.allTypes}</option>
          <option value="flashcard">{histT.flashcards}</option>
          <option value="quiz">{histT.quizzes}</option>
          <option value="read">{histT.reading}</option>
        </Select>
      </div>

      {isHistoryLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 py-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredHistory.length === 0 ? (
        <EmptyState
          type="history"
          title={histT.noHistory}
          description={histT.noHistoryDescription}
        />
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((item) => {
            const Icon = getIcon(item.activity_type);
            return (
              <Card
                key={item.id}
                className="transition-colors hover:bg-muted/50"
              >
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString(t("common.locale") === "ar" ? "ar-TN" : "fr-TN", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getIcon(type: string) {
  switch (type) {
    case "flashcard":
      return Brain;
    case "quiz":
      return FileQuestion;
    case "read":
      return BookOpen;
    default:
      return Clock;
  }
}

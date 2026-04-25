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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudentDashboardQuery } from "@/queries";

const MOCK_HISTORY = [
  {
    id: "1",
    type: "flashcard",
    title: "Algorithms - Sorting",
    duration: "15 min",
    date: "2024-03-30",
    score: 85,
  },
  {
    id: "2",
    type: "quiz",
    title: "Database Fundamentals",
    duration: "20 min",
    date: "2024-03-29",
    score: 72,
  },
  {
    id: "3",
    type: "read",
    title: "Data Structures - Trees",
    duration: "30 min",
    date: "2024-03-28",
    score: null,
  },
  {
    id: "4",
    type: "flashcard",
    title: "Calculus - Derivatives",
    duration: "10 min",
    date: "2024-03-27",
    score: 90,
  },
];

export default function HistoryPage() {
  const { data: dashboard } = useStudentDashboardQuery();
  const [filter, setFilter] = useState("all");

  const getIcon = (type: string) => {
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
  };

  const filteredHistory = MOCK_HISTORY.filter((h) => {
    if (filter === "all") return true;
    return h.type === filter;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Study History</h1>
        <p className="text-muted-foreground">Review your learning activity</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {dashboard?.progress.active_streak_days || 5}
                </p>
                <p className="text-sm text-muted-foreground">Day Streak</p>
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
                <p className="text-2xl font-bold">24</p>
                <p className="text-sm text-muted-foreground">This Week</p>
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
                <p className="text-2xl font-bold">156</p>
                <p className="text-sm text-muted-foreground">Total Hours</p>
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
          <option value="all">All Types</option>
          <option value="flashcard">Flashcards</option>
          <option value="quiz">Quizzes</option>
          <option value="read">Reading</option>
        </Select>
      </div>

      {filteredHistory.length === 0 ? (
        <EmptyState
          type="history"
          title="No history yet"
          description="Start studying to see your activity here"
        />
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((item) => {
            const Icon = getIcon(item.type);
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
                    <p className="font-medium truncate">{item.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.duration} •{" "}
                      {new Date(item.date).toLocaleDateString("fr-TN", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  {item.score !== null && (
                    <div className="text-right">
                      <p
                        className={`font-bold ${
                          item.score >= 80
                            ? "text-success"
                            : item.score >= 60
                              ? "text-warning"
                              : "text-destructive"
                        }`}
                      >
                        {item.score}%
                      </p>
                      <p className="text-xs text-muted-foreground">Score</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

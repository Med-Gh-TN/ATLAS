"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Flame,
  GraduationCap,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudentDashboardQuery } from "@/queries";
import { useAuthStore } from "@/store/auth.store";

export function StudentDashboardPageClient() {
  const { user } = useAuthStore();
  const { data: overview, isLoading: overviewLoading } = useStudentDashboardQuery();

  const greeting =
    overview?.greeting ||
    `Welcome back, ${user?.full_name?.split(" ")[0] || "Student"}!`;
  const streak = overview?.progress?.active_streak_days || 0;
  const completion = overview?.progress?.overall_completion_percentage || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{greeting}</h1>
          <p className="text-muted-foreground">
            Ready to continue your learning journey?
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            <Flame className="h-4 w-4" />
            {streak} day streak
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Overall Progress"
          value={`${completion}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          trend={completion > 50 ? "up" : "down"}
          isLoading={overviewLoading}
        />
        <StatsCard
          title="Active Goals"
          value={
            overview?.daily_goals?.filter((goal) => !goal.is_completed).length || 0
          }
          subtitle="of daily goals"
          icon={<Target className="h-5 w-5" />}
          isLoading={overviewLoading}
        />
        <StatsCard
          title="Study Streak"
          value={streak}
          subtitle="days"
          icon={<Clock className="h-5 w-5" />}
          trend={streak > 7 ? "up" : "neutral"}
          isLoading={overviewLoading}
        />
        <StatsCard
          title="Recommended"
          value={overview?.recommended_courses?.length || 0}
          subtitle="courses"
          icon={<BookOpen className="h-5 w-5" />}
          isLoading={overviewLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Daily Goals</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1">
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((key) => (
                  <Skeleton key={key} className="h-12 w-full" />
                ))}
              </div>
            ) : overview?.daily_goals?.length ? (
              <div className="space-y-3">
                {overview.daily_goals.slice(0, 5).map((goal) => (
                  <div
                    key={goal.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        goal.is_completed ? "bg-success" : "bg-primary"
                      }`}
                    />
                    <span
                      className={`flex-1 text-sm ${
                        goal.is_completed ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {goal.description}
                    </span>
                    {goal.is_completed ? <Star className="h-4 w-4 text-success" /> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                No daily goals set yet
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recommended for You</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1" asChild>
              <Link href="/courses">Browse all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((key) => (
                  <Skeleton key={key} className="h-16 w-full" />
                ))}
              </div>
            ) : overview?.recommended_courses?.length ? (
              <div className="space-y-3">
                {overview.recommended_courses.slice(0, 5).map((course) => (
                  <Link
                    key={course.course_id}
                    href={`/courses/${course.course_id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <GraduationCap className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{course.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${course.progress_percentage}%` }}
                          />
                        </div>
                        <span>{course.progress_percentage}%</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                No recommendations yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {overview?.weak_topics?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-amber-500" />
              Areas to Improve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {overview.weak_topics.slice(0, 6).map((topic, index) => (
                <div key={`${topic.topic_name}-${index}`} className="rounded-lg border p-3">
                  <p className="font-medium">{topic.topic_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {topic.accuracy_percentage}% accuracy
                  </p>
                  <p className="mt-2 text-xs text-primary">{topic.suggested_action}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {overview?.suggested_flashcards?.length ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Flashcards Due</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/my/flashcards">
                Study now <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {overview.suggested_flashcards.slice(0, 4).map((deck) => (
                <Link
                  key={deck.deck_id}
                  href={`/my/flashcards?deck=${deck.deck_id}`}
                  className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <p className="truncate font-medium">{deck.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {deck.due_cards_count} cards due
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/contribute">
                <GraduationCap className="h-5 w-5" />
                <span>Contribute</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/search">
                <BookOpen className="h-5 w-5" />
                <span>Browse Courses</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/leaderboard">
                <Trophy className="h-5 w-5" />
                <span>Leaderboard</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/my/history">
                <Clock className="h-5 w-5" />
                <span>Study History</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  isLoading,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        {isLoading ? (
          <>
            <Skeleton className="mb-2 h-4 w-20" />
            <Skeleton className="h-8 w-16" />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{title}</p>
              <div className="text-muted-foreground">{icon}</div>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <p className="text-2xl font-bold">{value}</p>
              {subtitle ? (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {trend ? (
              <div
                className={`mt-2 flex items-center gap-1 text-xs ${
                  trend === "up"
                    ? "text-success"
                    : trend === "down"
                      ? "text-destructive"
                      : "text-muted-foreground"
                }`}
              >
                <span>
                  {trend === "up"
                    ? "Improving"
                    : trend === "down"
                      ? "Needs attention"
                      : "Stable"}
                </span>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

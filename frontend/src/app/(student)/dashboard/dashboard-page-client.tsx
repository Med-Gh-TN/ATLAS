"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Clock,
  Flame,
  GraduationCap,
  Star,
  Target,
  TrendingUp,
  Zap,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudentDashboardQuery } from "@/queries";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/use-translation";
import { Award } from "lucide-react";
import {
  RadialBarChart,
  RadialBar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from "recharts";

export function StudentDashboardPageClient() {
  const { user } = useAuthStore();
  const { data: overview, isLoading: overviewLoading } = useStudentDashboardQuery();
  const { t } = useTranslation();

  const greeting =
    overview?.greeting ||
    t("dashboard.welcomeBack", { name: user?.full_name?.split(" ")[0] || "Student" });
  const streak = overview?.progress?.active_streak_days || 0;
  const completion = overview?.progress?.overall_completion_percentage || 0;
  const todayStudyMinutes = overview?.progress?.today_study_minutes || 0;

  const streakData = Array.from({ length: 7 }, (_, i) => ({
    day: [
      t("teacher.sun"),
      t("teacher.mon"),
      t("teacher.tue"),
      t("teacher.wed"),
      t("teacher.thu"),
      t("teacher.fri"),
      t("teacher.sat")
    ][i],
    hours: i < streak ? Math.random() * 3 + 1 : 0,
  }));

  const topicData = overview?.weak_topics?.slice(0, 5).map((topic, i) => ({
    subject: topic.topic_name.substring(0, 10),
    accuracy: topic.accuracy_percentage,
    fullMark: 100,
  })) || [{ subject: 'Math', accuracy: 75, fullMark: 100 }];

  const weeklyActivity = overview?.weekly_activity || Array.from({ length: 7 }, (_, i) => ({
    day: [
      t("teacher.sun"),
      t("teacher.mon"),
      t("teacher.tue"),
      t("teacher.wed"),
      t("teacher.thu"),
      t("teacher.fri"),
      t("teacher.sat")
    ][i],
    activities: 0,
  }));

  const heatmapData: Array<{ date: string; value: number }> = [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{greeting}</h1>
          <p className="text-muted-foreground">
            {t("dashboard.continueLearningJourney")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            <Flame className="h-4 w-4" />
            {t("dashboard.dayStreak", { count: streak })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RadialProgressCard
          title={t("dashboard.overallProgress")}
          value={completion}
          icon={<TrendingUp className="h-5 w-5" />}
          isLoading={overviewLoading}
        />
        <StatsCard
          title={t("dashboard.activeGoals")}
          value={
            overview?.daily_goals?.filter((goal) => !goal.is_completed).length || 0
          }
          subtitle={t("dashboard.ofDailyGoals")}
          icon={<Target className="h-5 w-5" />}
          isLoading={overviewLoading}
        />
        <StatsCard
          title={t("dashboard.studyStreak")}
          value={streak}
          subtitle={t("dashboard.days")}
          icon={<Flame className="h-5 w-5" />}
          trend={streak > 7 ? "up" : "neutral"}
          isLoading={overviewLoading}
        />
        <StatsCard
          title={t("dashboard.todayStudy")}
          value={`${todayStudyMinutes}m`}
          subtitle={t("dashboard.minutes")}
          icon={<Clock className="h-5 w-5" />}
          isLoading={overviewLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("dashboard.weeklyStudyActivity")}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span>{t("dashboard.last7Days")}</span>
            </div>
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={weeklyActivity}>
                  <defs>
                    <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="activities" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1} 
                    fill="url(#colorActivity)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("dashboard.dailyGoals")}</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1">
              {t("dashboard.viewAll")}
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
                    className="flex items-center gap-3 rounded-lg border p-3 transition-all hover:bg-muted/50"
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
                {t("dashboard.noDailyGoalsSetYet")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      { /* Heatmap intentionally omitted for students */ }

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("dashboard.recommendedForYou")}</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1" asChild>
              <Link href="/courses">{t("dashboard.browseAll")}</Link>
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
                    className="flex items-center gap-3 rounded-lg border p-3 transition-all hover:bg-muted/50 hover:shadow-sm"
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
                {t("dashboard.noRecommendationsYet")}
              </p>
            )}
          </CardContent>
        </Card>

        {overview?.weak_topics?.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-amber-500" />
                {t("dashboard.topicPerformance")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={topicData}>
                  <PolarGrid className="stroke-muted/30" />
                  <PolarAngleAxis dataKey="subject" className="text-xs" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} className="text-xs" />
                  <Radar
                    name="Accuracy"
                    dataKey="accuracy"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {overview.weak_topics.slice(0, 3).map((topic, index) => (
                  <div key={`${topic.topic_name}-${index}`} className="rounded-lg border p-3">
                    <p className="font-medium text-sm">{topic.topic_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("dashboard.accuracy", { percent: topic.accuracy_percentage })}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {overview?.suggested_flashcards?.length ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              {t("dashboard.flashcardsDue")}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              {/* Changed: goes directly to the global study page */}
              <Link href="/my/flashcards/study">
                {t("dashboard.studyNow")} <ArrowRight className="ms-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {overview.suggested_flashcards.slice(0, 4).map((deck) => (
                <Link
                  key={deck.deck_id}
                  href={`/my/flashcards/study?deck_id=${deck.deck_id}`}
                  className="group relative overflow-hidden rounded-lg border p-4 transition-all hover:bg-muted/50 hover:shadow-md"
                >
                  <div className="absolute top-0 inset-inline-end-0 h-16 w-16 ltr:translate-x-8 rtl:-translate-x-8 -translate-y-8 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors" />
                  <p className="truncate font-medium relative z-10">{deck.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground relative z-10">
                    <span className="font-semibold text-primary">{deck.due_cards_count}</span> {t("dashboard.cardsDue")}
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("dashboard.quickActions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button 
              variant="outline" 
              className="h-auto py-4 flex-col gap-2 group hover:border-primary/50 transition-all" 
              asChild
            >
              <Link href="/upload">
                <div className="rounded-full bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                  <GraduationCap className="h-5 w-5 text-primary" />
                </div>
                <span>{t("dashboard.contribute")}</span>
              </Link>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-4 flex-col gap-2 group hover:border-primary/50 transition-all" 
              asChild
            >
              <Link href="/search">
                <div className="rounded-full bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <span>{t("dashboard.browseCourses")}</span>
              </Link>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-4 flex-col gap-2 group hover:border-primary/50 transition-all" 
              asChild
            >
              <Link href="/my/history">
                <div className="rounded-full bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <span>{t("dashboard.studyHistory")}</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2 group hover:border-primary/50 transition-all"
              onClick={async () => {
                try {
                  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/study/calendar/ics`, {
                    credentials: "include",
                  });
                  if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `atlas-study-calendar-${new Date().toISOString().split("T")[0]}.ics`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  }
                } catch (error) {
                  console.error("Failed to download calendar:", error);
                }
              }}
            >
              <div className="rounded-full bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <span>{t("dashboard.exportCalendar")}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RadialProgressCard({
  title,
  value,
  icon,
  isLoading,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  isLoading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        {isLoading ? (
          <>
            <Skeleton className="mb-2 h-4 w-20" />
            <Skeleton className="h-24 w-24 mx-auto rounded-full" />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{title}</p>
              <div className="text-muted-foreground">{icon}</div>
            </div>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width={100} height={100}>
                <RadialBarChart cx="50" cy="50" innerRadius="35" outerRadius="45" barSize={10} data={[{ value }]}>
                  <RadialBar 
                    dataKey="value" 
                    cornerRadius={10} 
                    fill="hsl(var(--primary))"
                    background={{ fill: 'hsl(var(--muted))', fillOpacity: 0.3 }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold">{value}%</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
  const { t } = useTranslation();
  return (
    <Card className="transition-all hover:shadow-md">
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
                    ? t("dashboard.improving")
                    : trend === "down"
                      ? t("dashboard.needsAttention")
                      : t("dashboard.stable")}
                </span>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
/**
 * @file frontend/src/app/(teacher)/teacher/dashboard/teacher-dashboard-page-client.tsx
 * @description Client-side dashboard for the teacher portal.
 * @layer Core Logic / UI
 */

"use client";

import Link from "next/link";
import { BookOpen, CheckCircle, Upload, Activity, TrendingUp, FileText } from "lucide-react";
import { CalendarHeatmap } from "@/components/ui/calendar-heatmap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDailyActivityQuery } from "@/queries/daily-activity";
import { useTeacherAnalyticsQuery } from "@/queries/dashboard";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/use-translation";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from "recharts";

const COLORS = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];

export function TeacherDashboardPageClient() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const analyticsQuery = useTeacherAnalyticsQuery();

  const isLoading = analyticsQuery.isLoading;

  // Prepare data for charts
  const statusData = analyticsQuery.data ? [
    { name: t("status.approved"), value: analyticsQuery.data.approved_uploads },
    { name: t("status.pending"), value: analyticsQuery.data.pending_uploads },
    { name: t("status.rejected"), value: analyticsQuery.data.rejected_uploads },
  ].filter(d => d.value > 0) : [];

  const courseData = analyticsQuery.data?.top_courses.map(course => ({
    name: course.title.length > 15 ? course.title.substring(0, 15) + '...' : course.title,
    uploads: course.uploads,
    approved: course.approved_uploads,
  })) || [];

  // Activity data from backend (Area Chart)
  const activityData = analyticsQuery.data?.weekly_trend?.slice(-7).map((item) => ({
    day: item.week,
    uploads: item.uploads,
  })) || Array.from({ length: 7 }, (_, i) => ({
    day: `W-${7 - i}`,
    uploads: 0,
  }));

  // Rely exclusively on the proper 365-day query for the CalendarHeatmap.
  const { data: dailyActivity } = useDailyActivityQuery(365);
  const calendarHeatMapData = dailyActivity ?? [];

  const stats = [
    {
      title: t("teacher.totalUploads"),
      value: analyticsQuery.data?.total_uploads ?? 0,
      icon: Upload,
      color: "text-blue-500",
    },
    {
      title: t("teacher.approvedUploads"),
      value: analyticsQuery.data?.approved_uploads ?? 0,
      icon: CheckCircle,
      color: "text-green-500",
    },
    {
      title: t("course.courses"),
      value: analyticsQuery.data?.total_courses ?? 0,
      icon: BookOpen,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {t("teacher.welcomeBackTeacher", { name: user?.full_name?.split(" ")[0] || t("teacher.teacher") })}
          </h1>
          <p className="text-muted-foreground">
            {t("teacher.dashboardDescription")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
             <Link href="/teacher/manage-contributions">{t("teacher.manageQueue")}</Link>
          </Button>
          {/* The "Upload New Material" button has been removed. Teachers should use the "Upload Material" button on the /teacher/manage-courses page. */}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="transition-all hover:shadow-md">
            <CardContent className="p-4">
              {isLoading ? (
                <>
                  <Skeleton className="mb-2 h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{stat.value}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Exclusively rendering the fused CalendarHeatmap */}
      <CalendarHeatmap data={calendarHeatMapData} title={t("teacher.calendarHeatmap") ?? "Calendar Heatmap"} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("teacher.uploadStatus")}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={
                          entry.name === t("status.approved") ? '#10B981' : 
                          entry.name === t("status.pending") ? '#F59E0B' : 
                          '#EF4444'
                        } 
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                {t("teacher.noUploadData")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("teacher.courseAnalytics")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : courseData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={courseData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="uploads" name={t("teacher.uploads")} fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="approved" name={t("teacher.approved")} fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                {t("teacher.noCourseData")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t("teacher.recentActivity")}</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
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
                  dataKey="uploads" 
                  stroke="hsl(var(--primary))" 
                  fillOpacity={1} 
                  fill="url(#colorUploads)"
                  name={t("teacher.uploads")}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
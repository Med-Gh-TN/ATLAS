"use client";

import { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Users,
  BookOpen,
  Download,
  Calendar,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function TeacherAnalytics() {
  const [timeRange, setTimeRange] = useState<string>("week");
  const [isLoading, setIsLoading] = useState(true);

  useState(() => {
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  });

  const stats = [
    { title: "Total Views", value: "12,450", change: "+12%", trend: "up" },
    { title: "Unique Students", value: "348", change: "+8%", trend: "up" },
    { title: "Completion Rate", value: "76%", change: "+3%", trend: "up" },
    { title: "Avg. Time on Page", value: "4.2m", change: "-5%", trend: "down" },
  ];

  const topCourses = [
    {
      title: "Mathematics Fundamentals",
      views: 2450,
      completions: 189,
      rating: 4.8,
    },
    {
      title: "Introduction to Programming",
      views: 1980,
      completions: 156,
      rating: 4.7,
    },
    {
      title: "Physics for Engineers",
      views: 1650,
      completions: 134,
      rating: 4.6,
    },
    { title: "Calculus I", views: 1420, completions: 112, rating: 4.5 },
  ];

  const weeklyData = [
    { day: "Mon", views: 1200, contributions: 8 },
    { day: "Tue", views: 1890, contributions: 12 },
    { day: "Wed", views: 2100, contributions: 15 },
    { day: "Thu", views: 1750, contributions: 10 },
    { day: "Fri", views: 2200, contributions: 18 },
    { day: "Sat", views: 980, contributions: 5 },
    { day: "Sun", views: 1330, contributions: 7 },
  ];

  const maxViews = Math.max(...weeklyData.map((d) => d.views));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Track your teaching performance and student engagement
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="rounded-lg border bg-background px-4 py-2 text-sm"
          >
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="quarter">Last 90 days</option>
            <option value="year">Last year</option>
          </select>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              {isLoading ? (
                <>
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {stat.title}
                    </p>
                    <TrendingUp
                      className={`h-5 w-5 ${stat.trend === "up" ? "text-success" : "text-destructive"}`}
                    />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{stat.value}</p>
                  <p
                    className={`text-xs ${stat.trend === "up" ? "text-success" : "text-destructive"}`}
                  >
                    {stat.change} from last period
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weekly Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-4">
                <div
                  className="flex items-end justify-between gap-2"
                  style={{ height: 200 }}
                >
                  {weeklyData.map((data, i) => (
                    <div
                      key={i}
                      className="flex flex-1 flex-col items-center gap-2"
                    >
                      <div
                        className="w-full rounded-t-lg bg-primary transition-all"
                        style={{ height: `${(data.views / maxViews) * 160}px` }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {data.day}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded bg-primary" />
                    <span>Page Views</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Performing Courses</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {topCourses.map((course, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{course.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {course.views.toLocaleString()} views •{" "}
                        {course.completions} completions
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-amber-500">
                      <span className="text-sm font-medium">
                        {course.rating}
                      </span>
                      <span className="text-xs">★</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Student Engagement</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-3xl font-bold text-primary">348</p>
                <p className="text-sm text-muted-foreground">Active Students</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-3xl font-bold text-primary">76%</p>
                <p className="text-sm text-muted-foreground">
                  Course Completion
                </p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-3xl font-bold text-primary">4.2m</p>
                <p className="text-sm text-muted-foreground">
                  Avg. Session Time
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

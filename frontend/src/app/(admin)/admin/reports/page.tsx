"use client";

import { useState } from "react";
import {
  FileText,
  Download,
  Calendar,
  TrendingUp,
  Users,
  BookOpen,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const reportTypes = [
  {
    id: "activity",
    title: "User Activity Report",
    description: "Daily/weekly/monthly active users, engagement metrics",
    icon: Users,
  },
  {
    id: "content",
    title: "Content Performance",
    description: "Course views, completion rates, ratings",
    icon: BookOpen,
  },
  {
    id: "contributions",
    title: "Contributions Summary",
    description: "Submitted content, approval rates, top contributors",
    icon: FileText,
  },
  {
    id: "engagement",
    title: "Engagement Analytics",
    description: "Time spent, session duration, feature usage",
    icon: BarChart3,
  },
  {
    id: "growth",
    title: "Growth Report",
    description: "New registrations, retention, churn",
    icon: TrendingUp,
  },
  {
    id: "system",
    title: "System Health",
    description: "Server performance, errors, uptime",
    icon: BarChart3,
  },
];

const recentReports = [
  {
    id: 1,
    title: "Weekly Activity Report",
    type: "activity",
    date: "2024-03-15",
    status: "completed",
  },
  {
    id: 2,
    title: "Content Performance - February",
    type: "content",
    date: "2024-03-10",
    status: "completed",
  },
  {
    id: 3,
    title: "Contributions Summary Q1",
    type: "contributions",
    date: "2024-03-05",
    status: "completed",
  },
  {
    id: 4,
    title: "User Engagement - Weekly",
    type: "engagement",
    date: "2024-03-14",
    status: "completed",
  },
];

export default function AdminReports() {
  const [dateRange, setDateRange] = useState("week");
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Generate and view platform reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-lg border bg-background px-4 py-2 text-sm"
          >
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="quarter">Last 90 days</option>
            <option value="year">Last year</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((report) => (
          <Card
            key={report.id}
            className={`cursor-pointer transition-colors hover:border-primary ${
              selectedReport === report.id ? "border-primary" : ""
            }`}
            onClick={() => setSelectedReport(report.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <report.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{report.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {report.description}
                  </p>
                </div>
              </div>
              <Button className="w-full mt-4" variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Generate Report
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Reports</CardTitle>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export All
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentReports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{report.title}</p>
                    <p className="text-xs text-muted-foreground">
                      <Calendar className="inline h-3 w-3 mr-1" />
                      {report.date}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Completed
                  </span>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Platform Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Total Registrations
                </span>
                <span className="font-medium">12,458</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Active Users (30d)
                </span>
                <span className="font-medium">8,234</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Course Completions
                </span>
                <span className="font-medium">34,567</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Content Contributions
                </span>
                <span className="font-medium">5,678</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Avg. Session Time
                </span>
                <span className="font-medium">24 min</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  ↑ 23% increase in daily active users
                </p>
                <p className="text-xs text-muted-foreground">
                  Compared to last week
                </p>
              </div>
              <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-3">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                  Course completion rate improved
                </p>
                <p className="text-xs text-muted-foreground">
                  From 67% to 72% this month
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  15 courses need content review
                </p>
                <p className="text-xs text-muted-foreground">
                  Action required from moderators
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

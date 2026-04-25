"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle,
  Clock,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { useAuthStore } from "@/store/auth.store";

export function TeacherDashboardPageClient() {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  const stats = [
    { title: "Total Courses", value: 12, icon: BookOpen, color: "text-blue-500" },
    { title: "Active Students", value: 348, icon: Users, color: "text-green-500" },
    { title: "Pending Reviews", value: 5, icon: Clock, color: "text-amber-500" },
    { title: "Approved This Week", value: 18, icon: CheckCircle, color: "text-emerald-500" },
  ];

  const recentContributions = [
    { id: 1, title: "Chapter 5 Quiz - Mathematics", author: "Ahmed Ben Ali", status: "pending", date: "2 hours ago" },
    { id: 2, title: "Flashcard Deck: Physics Formulas", author: "Fatma Trabelsi", status: "approved", date: "5 hours ago" },
    { id: 3, title: "Course Summary: History 101", author: "Mohamed Hedi", status: "rejected", date: "1 day ago" },
  ];

  const topContributors = [
    { name: "Ahmed Ben Ali", contributions: 45, xp: 1250, avatar: "AB" },
    { name: "Fatma Trabelsi", contributions: 38, xp: 980, avatar: "FT" },
    { name: "Mohamed Hedi", contributions: 32, xp: 850, avatar: "MH" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {user?.full_name?.split(" ")[0] || "Teacher"}!
          </h1>
          <p className="text-muted-foreground">
            Here&apos;s what&apos;s happening with your courses today.
          </p>
        </div>
        <Button asChild>
          <Link href="/teacher/contributions">Review Contributions</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-4">
              {isLoading ? (
                <>
                  <Skeleton className="mb-2 h-4 w-20" />
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Contributions</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/teacher/contributions">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((key) => (
                  <Skeleton key={key} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {recentContributions.map((contribution) => (
                  <div key={contribution.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{contribution.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {contribution.author} | {contribution.date}
                      </p>
                    </div>
                    <StatusChip status={contribution.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Top Contributors</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/teacher/analytics">Analytics</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((key) => (
                  <Skeleton key={key} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {topContributors.map((contributor) => (
                  <div key={contributor.name} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground">
                      {contributor.avatar}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{contributor.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {contributor.contributions} contributions
                      </p>
                    </div>
                    <div className="text-right font-medium text-primary">{contributor.xp} XP</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link href="/teacher/courses">
                <BookOpen className="h-5 w-5" />
                <span>Manage Courses</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link href="/teacher/contributions">
                <CheckCircle className="h-5 w-5" />
                <span>Review Content</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link href="/teacher/analytics">
                <TrendingUp className="h-5 w-5" />
                <span>View Analytics</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link href="/teacher/settings">
                <Users className="h-5 w-5" />
                <span>Settings</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

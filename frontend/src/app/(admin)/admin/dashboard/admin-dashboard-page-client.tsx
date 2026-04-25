"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Clock,
  GraduationCap,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { useAuthStore } from "@/store/auth.store";

export function AdminDashboardPageClient() {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  const stats = [
    { title: "Total Users", value: "12,458", icon: Users, color: "text-blue-500", change: "+156 this week" },
    { title: "Active Courses", value: "342", icon: BookOpen, color: "text-green-500", change: "+12 this month" },
    { title: "Pending Reviews", value: "28", icon: Clock, color: "text-amber-500", change: "8 urgent" },
    { title: "System Health", value: "99.8%", icon: CheckCircle, color: "text-emerald-500", change: "All systems operational" },
  ];

  const recentActivity = [
    { id: 1, action: "New user registered", user: "Ahmed Mansour", type: "student", time: "2 minutes ago" },
    { id: 2, action: "Course approved", user: "Physics Fundamentals", type: "course", time: "15 minutes ago" },
    { id: 3, action: "Teacher account created", user: "Prof. Fatma Trabelsi", type: "teacher", time: "1 hour ago" },
  ];

  const systemAlerts = [
    { id: 1, severity: "warning", message: "High storage usage on server EU-WEST-2", time: "1 hour ago" },
    { id: 2, severity: "info", message: "Scheduled maintenance on Sunday 2AM-4AM UTC", time: "5 hours ago" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.full_name?.split(" ")[0] || "Admin"}. Here&apos;s your system overview.
        </p>
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
                  <p className="text-xs text-muted-foreground">{stat.change}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/reports">View all</Link>
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
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <GraduationCap className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{activity.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {activity.user} | {activity.time}
                      </p>
                    </div>
                    <StatusChip
                      status={activity.type === "course" ? "approved" : "pending"}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              System Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((key) => (
                  <Skeleton key={key} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {systemAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`rounded-lg border p-3 ${
                      alert.severity === "warning"
                        ? "border-amber-500/50 bg-amber-500/10"
                        : "border-blue-500/50 bg-blue-500/10"
                    }`}
                  >
                    <p className="text-sm font-medium">{alert.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{alert.time}</p>
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
              <Link href="/admin/users">
                <Users className="h-5 w-5" />
                <span>Manage Users</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link href="/admin/courses">
                <BookOpen className="h-5 w-5" />
                <span>Manage Courses</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link href="/admin/reports">
                <TrendingUp className="h-5 w-5" />
                <span>View Reports</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link href="/admin/settings">
                <CheckCircle className="h-5 w-5" />
                <span>System Settings</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

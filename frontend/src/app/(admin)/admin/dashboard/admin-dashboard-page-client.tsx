"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Users, TrendingUp, FileText, AlertCircle, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { adminApi } from "@/lib/api";
import { formatRole } from "@/lib/utils";
import { useAdminDashboardQuery } from "@/queries/dashboard";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/use-translation";
import { CalendarHeatmap } from "@/components/ui/calendar-heatmap";
import { useDailyActivityQuery } from "@/queries/daily-activity";
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
  LineChart,
  Line,
  Area,
  AreaChart,
  Legend,
} from "recharts";

const roleColors: Record<string, string> = {
  STUDENT: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  TEACHER: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ADMIN: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const COLORS = ['#006989', '#42BBE0', '#FFA500', '#10B981', '#EF4444'];

export function AdminDashboardPageClient() {
  const { t, tSection } = useTranslation();
  const adminT = tSection("admin");
  const { user } = useAuthStore();
  const dashboardQuery = useAdminDashboardQuery();
  const usersQuery = useQuery({
    queryKey: ["admin", "dashboard", "users"],
    queryFn: () => adminApi.listUsers({ limit: 20, offset: 0 }),
  });

  // Prepare data for charts - only show Student, Admin, and Teacher roles
  const roleDistribution = dashboardQuery.data?.users_by_role 
    ? Object.entries(dashboardQuery.data.users_by_role)
        .filter(([name]) => ['STUDENT', 'ADMIN', 'TEACHER'].includes(name.toUpperCase()))
        .map(([name, value]) => ({ name: formatRole(name), value }))
    : [];

  const contributionStatus = dashboardQuery.data?.contributions_by_status
    ? Object.entries(dashboardQuery.data.contributions_by_status)
        .filter(([name]) => ['approved', 'pending', 'rejected'].includes(name.toLowerCase()))
        .map(([name, value]) => ({ name, value }))
    : [];

  // Activity trend data from backend
  const activityTrend = dashboardQuery.data?.weekly_activity || Array.from({ length: 7 }, (_, i) => ({
    day: [
      t("teacher.sun"),
      t("teacher.mon"),
      t("teacher.tue"),
      t("teacher.wed"),
      t("teacher.thu"),
      t("teacher.fri"),
      t("teacher.sat")
    ][i],
    users: 0,
    contributions: 0,
  }));

  const stats = [
    {
      title: adminT.totalUsers,
      value: dashboardQuery.data?.total_users ?? 0,
      icon: Users,
      color: "text-blue-500",
    },
    {
      title: adminT.totalCourses,
      value: dashboardQuery.data?.total_courses ?? 0,
      icon: BookOpen,
      color: "text-green-500",
    },
    {
      title: adminT.contributions,
      value: dashboardQuery.data?.total_contributions ?? 0,
      icon: FileText,
      color: "text-purple-500",
    },
    {
      title: adminT.pendingReview,
      value: dashboardQuery.data?.pending_contributions ?? 0,
      icon: AlertCircle,
      color: "text-amber-500",
    },
  ];

  // Admin calendar heatmap data (recent daily activity)
  const { data: adminDaily } = useDailyActivityQuery(365);
  const adminHeatmapData = adminDaily ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{adminT.platformOverview}</h1>
        <p className="text-muted-foreground">
          {t("admin.welcomeBackAdmin", { name: user?.full_name?.split(" ")[0] || t("teacher.teacher") })}
          {" "}{adminT.dashboardDescription}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">{adminT.academicStructure}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {adminT.academicStructureDescription}
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/setup">{adminT.openAcademicSetup}</Link>
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="transition-all hover:shadow-md">
            <CardContent className="p-4">
              {dashboardQuery.isLoading ? (
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{adminT.userDistribution}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{adminT.byRole}</span>
            </div>
          </CardHeader>
          <CardContent>
            {dashboardQuery.isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : roleDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={roleDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {roleDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-muted-foreground">{t("common.noDataAvailable")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{adminT.activityHeatmap ?? "Activity Heatmap"}</CardTitle>
          </CardHeader>
          <CardContent>
            <CalendarHeatmap data={adminHeatmapData} title={t("dashboard.activityHeatmap")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{adminT.contributionStatus}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{adminT.byStatus}</span>
            </div>
          </CardHeader>
          <CardContent>
            {dashboardQuery.isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : contributionStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={contributionStatus}>
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
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {contributionStatus.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.name.toLowerCase() === 'approved' ? '#10B981' :
                          entry.name.toLowerCase() === 'pending' ? '#F59E0B' :
                          entry.name.toLowerCase() === 'rejected' ? '#EF4444' :
                          COLORS[index % COLORS.length]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-muted-foreground">{t("common.noDataAvailable")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{adminT.platformActivity}</CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span>{t("dashboard.last7Days")}</span>
          </div>
        </CardHeader>
        <CardContent>
          {dashboardQuery.isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={activityTrend}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorContributions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
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
                  dataKey="users" 
                  stroke="hsl(var(--primary))" 
                  fillOpacity={1} 
                  fill="url(#colorUsers)"
                  name={adminT.activeUsers}
                />
                <Area 
                  type="monotone" 
                  dataKey="contributions" 
                  stroke="#10B981" 
                  fillOpacity={1} 
                  fill="url(#colorContributions)"
                  name={adminT.contributions}
                />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{adminT.recentUsers}</CardTitle>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((key) => (
                <Skeleton key={key} className="h-16 w-full" />
              ))}
            </div>
          ) : usersQuery.data?.items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left text-sm font-medium">{adminT.user}</th>
                    <th className="px-3 py-2 text-left text-sm font-medium">{adminT.role}</th>
                    <th className="px-3 py-2 text-left text-sm font-medium">{adminT.status}</th>
                    <th className="px-3 py-2 text-left text-sm font-medium">{adminT.joined}</th>
                  </tr>
                </thead>
                <tbody>
                  {usersQuery.data.items.map((u) => (
                    <tr key={u.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="px-3 py-3">
                        <div>
                          <p className="font-medium">{u.full_name || "Unnamed user"}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${roleColors[u.role] || roleColors.STUDENT}`}>
                          {formatRole(u.role)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <StatusChip status={u.is_active ? "active" : "inactive"} />
                      </td>
                      <td className="px-3 py-3 text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground p-4 text-center">{adminT.noUsersFound}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

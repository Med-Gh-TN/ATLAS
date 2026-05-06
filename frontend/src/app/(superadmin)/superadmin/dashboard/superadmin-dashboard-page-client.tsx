"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Building2,
  Server,
  Users,
  TrendingUp,
  Globe,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth.store";
import { useSuperadminDashboardStatsQuery, useSuperadminEstablishmentsQuery } from "@/queries/admin.queries";
import { useTranslation } from "@/hooks/use-translation";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ['#006989', '#42BBE0', '#FFA500', '#10B981', '#EF4444'];

export function SuperadminDashboardPageClient() {
  const { t, tSection } = useTranslation();
  const superadminT = tSection("superadmin");
  const { user } = useAuthStore();
  const statsQuery = useSuperadminDashboardStatsQuery();
  const establishmentsQuery = useSuperadminEstablishmentsQuery();
  
  const isLoading = statsQuery.isLoading;
  const establishmentsLoading = establishmentsQuery.isLoading;
  const establishments = establishmentsQuery.data?.slice(0, 3) || [];

  // Generate mock growth data for line chart
  const growthData = Array.from({ length: 12 }, (_, i) => ({
    month: [
      t("teacher.jan"), t("teacher.feb"), t("teacher.mar"), t("teacher.apr"), 
      t("teacher.may"), t("teacher.jun"), t("teacher.jul"), t("teacher.aug"), 
      t("teacher.sep"), t("teacher.oct"), t("teacher.nov"), t("teacher.dec")
    ][i] || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
    establishments: Math.floor(Math.random() * 5) + 1 + i * 0.5,
    users: Math.floor(Math.random() * 100) + 50 + i * 20,
  }));

  // Generate mock system health data
  // SOTA FIX: Added explicit 'id' keys to prevent React mapping warnings
  const healthMetrics = [
    { id: "health-api", name: superadminT.apiResponse || "API Response", value: 95, fullMark: 100 },
    { id: "health-db", name: superadminT.database || "Database", value: 88, fullMark: 100 },
    { id: "health-storage", name: superadminT.storage || "Storage", value: 72, fullMark: 100 },
    { id: "health-cdn", name: superadminT.cdn || "CDN", value: 98, fullMark: 100 },
    { id: "health-redis", name: superadminT.redis || "Redis Cache", value: 91, fullMark: 100 },
  ];

  // Prepare establishment comparison data
  const establishmentComparison = establishments.map((est) => ({
    name: est.name.substring(0, 15),
    users: est.users || 0,
    students: est.students || 0,
    teachers: est.teachers || 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{superadminT.platformOverview || "Platform Overview"}</h1>
        <p className="text-muted-foreground">
          {t("superadmin.welcomeBackSuperadmin", { name: user?.full_name?.split(" ")[0] || "Superadmin" }) || `Welcome back, ${user?.full_name?.split(" ")[0] || "Superadmin"}`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { id: "stat-est", title: superadminT.totalEstablishments || "Total Establishments", value: statsQuery.data?.total_establishments || 0, icon: Building2, color: "text-blue-500" },
          { id: "stat-users", title: superadminT.totalUsers || "Total Users", value: statsQuery.data?.total_users.toLocaleString() || "0", icon: Users, color: "text-green-500" },
          { id: "stat-sessions", title: superadminT.activeSessions || "Active Sessions", value: statsQuery.data?.active_sessions_estimated.toLocaleString() || "0", icon: Activity, color: "text-purple-500" },
          { id: "stat-health", title: superadminT.systemHealth || "System Health", value: `${statsQuery.data?.system_health || 100}%`, icon: Server, color: "text-emerald-500" },
        ].map((stat) => (
          // SOTA FIX: Using explicit ID as key
          <Card key={stat.id} className="transition-all hover:shadow-md">
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
            <CardTitle className="text-lg">{superadminT.platformGrowth || "Platform Growth"}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span>{superadminT.last12Months || "Last 12 Months"}</span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={growthData}>
                  <defs>
                    <linearGradient id="colorEstablishments" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="month" className="text-xs" />
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
                    dataKey="establishments" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1} 
                    fill="url(#colorEstablishments)"
                    name={superadminT.establishments || "Establishments"}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="users" 
                    stroke="#10B981" 
                    fillOpacity={1} 
                    fill="url(#colorUsers)"
                    name={superadminT.totalUsers || "Total Users"}
                  />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{superadminT.establishmentsOverview || "Establishments Overview"}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/superadmin/establishments">{superadminT.manageAll || "Manage All"}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {establishmentsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((key) => (
                  <Skeleton key={key} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {establishments.map((establishment) => (
                  <div
                    key={establishment.id}
                    className="flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{establishment.name}</p>
                        <p className="text-xs text-muted-foreground">{establishment.domain}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-medium">{(establishment.users || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{superadminT.users || "Users"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{superadminT.establishmentComparison || "Establishment Comparison"}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span>{superadminT.userDistribution || "User Distribution"}</span>
            </div>
          </CardHeader>
          <CardContent>
            {establishmentsLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : establishmentComparison.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={establishmentComparison}>
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
                  <Bar dataKey="users" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name={superadminT.totalUsers || "Total Users"} />
                  <Bar dataKey="students" fill="#10B981" radius={[4, 4, 0, 0]} name={superadminT.students || "Students"} />
                  <Bar dataKey="teachers" fill="#FFA500" radius={[4, 4, 0, 0]} name={superadminT.teachers || "Teachers"} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-muted-foreground">{t("common.noDataAvailable") || "No Data Available"}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{superadminT.systemHealthMetrics || "System Health Metrics"}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              <span>{superadminT.performance || "Performance"}</span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <div className="space-y-4">
                {healthMetrics.map((metric) => (
                  <div key={metric.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{metric.name}</span>
                      <span className={metric.value > 80 ? "text-green-500" : metric.value > 60 ? "text-amber-500" : "text-red-500"}>
                        {metric.value}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${
                          metric.value > 80 ? "bg-green-500" : metric.value > 60 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${metric.value}%` }}
                      />
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
          <CardTitle className="text-lg">{superadminT.quickActions || "Quick Actions"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button 
              variant="outline" 
              className="h-auto py-4 flex-col gap-2 group hover:border-primary/50 transition-all" 
              asChild
            >
              <Link href="/superadmin/establishments">
                <div className="rounded-full bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <span>{superadminT.manageEstablishments || "Manage Establishments"}</span>
              </Link>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-4 flex-col gap-2 group hover:border-primary/50 transition-all" 
              asChild
            >
              <Link href="/status">
                <div className="rounded-full bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                  <Server className="h-5 w-5 text-primary" />
                </div>
                <span>{superadminT.systemHealth || "System Health"}</span>
              </Link>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-4 flex-col gap-2 group hover:border-primary/50 transition-all"
            >
              <div className="rounded-full bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <span>{superadminT.viewLogs || "View Logs"}</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-4 flex-col gap-2 group hover:border-primary/50 transition-all"
            >
              <div className="rounded-full bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                <AlertTriangle className="h-5 w-5 text-primary" />
              </div>
              <span>{superadminT.incidentReports || "Incident Reports"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle,
  Server,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { useAuthStore } from "@/store/auth.store";

export function SuperadminDashboardPageClient() {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  const establishments = [
    { id: 1, name: "ISET Nabeul", region: "Nabeul", users: 12340, status: "active", health: 98 },
    { id: 2, name: "ISET Sfax", region: "Sfax", users: 8920, status: "active", health: 95 },
    { id: 3, name: "ISET Kairouan", region: "Kairouan", users: 4560, status: "active", health: 92 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Superadmin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.full_name?.split(" ")[0] || "Superadmin"}. Platform overview.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Total Establishments", value: "8", icon: Building2, color: "text-blue-500" },
          { title: "Total Users", value: "45,678", icon: Users, color: "text-green-500" },
          { title: "Active Sessions", value: "2,456", icon: Activity, color: "text-purple-500" },
          { title: "System Health", value: "99.9%", icon: Server, color: "text-emerald-500" },
        ].map((stat) => (
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Establishments Overview</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/superadmin/establishments">Manage all</Link>
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
              {establishments.map((establishment) => (
                <div
                  key={establishment.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{establishment.name}</p>
                      <p className="text-xs text-muted-foreground">{establishment.region}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-medium">{establishment.users.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">users</p>
                    </div>
                    <div className="w-24 text-right text-sm">{establishment.health}% health</div>
                    <StatusChip status={establishment.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link href="/superadmin/establishments">
                <Building2 className="h-5 w-5" />
                <span>Manage Establishments</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link href="/status">
                <Server className="h-5 w-5" />
                <span>System Health</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4">
              <Activity className="h-5 w-5" />
              <span>View Logs</span>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4">
              <AlertTriangle className="h-5 w-5" />
              <span>Incident Reports</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

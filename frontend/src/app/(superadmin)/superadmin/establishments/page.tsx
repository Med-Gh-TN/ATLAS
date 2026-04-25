"use client";

import { useState } from "react";
import {
  Building2,
  Search,
  MoreVertical,
  Plus,
  Edit,
  Trash2,
  Users,
  Server,
  Activity,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusChip } from "@/components/ui/status-chip";

const mockEstablishments = [
  {
    id: 1,
    name: "ISET Nabeul",
    code: "ISET-NAB",
    region: "Nabeul",
    city: "Nabeul",
    users: 12340,
    students: 10890,
    teachers: 890,
    admins: 12,
    status: "active",
    health: 98,
    joined: "2022-01-15",
  },
  {
    id: 2,
    name: "ISET Sfax",
    code: "ISET-SFA",
    region: "Sfax",
    city: "Sfax",
    users: 8920,
    students: 7850,
    teachers: 620,
    admins: 8,
    status: "active",
    health: 95,
    joined: "2022-03-20",
  },
  {
    id: 3,
    name: "ISET Kairouan",
    code: "ISET-KAI",
    region: "Kairouan",
    city: "Kairouan",
    users: 4560,
    students: 3980,
    teachers: 320,
    admins: 5,
    status: "active",
    health: 92,
    joined: "2023-01-10",
  },
  {
    id: 4,
    name: "ISET Rades",
    code: "ISET-RAD",
    region: "Ben Arous",
    city: "Rades",
    users: 11230,
    students: 9870,
    teachers: 780,
    admins: 10,
    status: "active",
    health: 99,
    joined: "2021-09-01",
  },
  {
    id: 5,
    name: "ISET Sousse",
    code: "ISET-SOU",
    region: "Sousse",
    city: "Sousse",
    users: 6780,
    students: 5920,
    teachers: 480,
    admins: 7,
    status: "active",
    health: 97,
    joined: "2022-06-15",
  },
  {
    id: 6,
    name: "ISET Bizerte",
    code: "ISET-BIZ",
    region: "Bizerte",
    city: "Bizerte",
    users: 5230,
    students: 4580,
    teachers: 380,
    admins: 6,
    status: "pending",
    health: 0,
    joined: "2024-02-01",
  },
  {
    id: 7,
    name: "ISET Gabes",
    code: "ISET-GAB",
    region: "Gabes",
    city: "Gabes",
    users: 3890,
    students: 3400,
    teachers: 280,
    admins: 4,
    status: "inactive",
    health: 85,
    joined: "2023-08-20",
  },
  {
    id: 8,
    name: "ISET Monastir",
    code: "ISET-MON",
    region: "Monastir",
    city: "Monastir",
    users: 2450,
    students: 2150,
    teachers: 180,
    admins: 3,
    status: "active",
    health: 94,
    joined: "2023-11-05",
  },
];

export default function SuperadminEstablishments() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const regions = [...new Set(mockEstablishments.map((e) => e.region))];

  const filteredEstablishments = mockEstablishments.filter((est) => {
    const matchesSearch =
      est.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      est.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || est.status === statusFilter;
    const matchesRegion = regionFilter === "all" || est.region === regionFilter;
    return matchesSearch && matchesStatus && matchesRegion;
  });

  const totalPages = Math.ceil(filteredEstablishments.length / itemsPerPage);
  const paginatedEstablishments = filteredEstablishments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const stats = {
    total: establishments.length,
    active: establishments.filter((e) => e.status === "active").length,
    totalUsers: establishments.reduce((acc, e) => acc + (e.users || 0), 0),
    avgHealth: establishments.filter((e) => (e.health || 0) > 0).length > 0 ? Math.round(
      establishments
        .filter((e) => (e.health || 0) > 0)
        .reduce((acc, e) => acc + (e.health || 0), 0) /
        establishments.filter((e) => (e.health || 0) > 0).length,
    ) : 0,
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Establishment Management</h1>
          <p className="text-muted-foreground">
            Manage all educational institutions on the platform
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Establishment
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">
              Total Establishments
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{stats.active}</p>
            <p className="text-sm text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">
              {stats.totalUsers.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-500">
              {stats.avgHealth}%
            </p>
            <p className="text-sm text-muted-foreground">Avg. Health</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search establishments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">All Regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Establishment
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Users
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Teachers
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Health
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedEstablishments.map((est) => (
                  <tr key={est.id} className="border-b">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{est.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {est.code}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {est.city}, {est.region}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {est.users.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {est.teachers.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {est.health > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                est.health >= 95
                                  ? "bg-green-500"
                                  : est.health >= 80
                                    ? "bg-amber-500"
                                    : "bg-red-500"
                              }`}
                              style={{ width: `${est.health}%` }}
                            />
                          </div>
                          <span className="text-sm">{est.health}%</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={est.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Server className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Activity className="mr-2 h-4 w-4" />
                            System Health
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Users className="mr-2 h-4 w-4" />
                            Manage Users
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Establishment
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(
              currentPage * itemsPerPage,
              filteredEstablishments.length,
            )}{" "}
            of {filteredEstablishments.length} establishments
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

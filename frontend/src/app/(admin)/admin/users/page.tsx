"use client";

import { useState } from "react";
import {
  Users,
  Search,
  MoreVertical,
  UserPlus,
  Ban,
  CheckCircle,
  XCircle,
  Mail,
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

const mockUsers = [
  {
    id: 1,
    name: "Ahmed Ben Ali",
    email: "ahmed.benali@atlas.tn",
    role: "student",
    filiere: "Computer Science",
    level: "L2",
    status: "active",
    joined: "2024-01-15",
    xp: 1250,
  },
  {
    id: 2,
    name: "Fatma Trabelsi",
    email: "fatma.trabelsi@atlas.tn",
    role: "teacher",
    filiere: "Physics",
    status: "active",
    joined: "2023-09-01",
    xp: 4500,
  },
  {
    id: 3,
    name: "Mohamed Hedi",
    email: "mohamed.hedi@atlas.tn",
    role: "student",
    filiere: "Mathematics",
    level: "L1",
    status: "active",
    joined: "2024-02-20",
    xp: 890,
  },
  {
    id: 4,
    name: "Sarra Mansour",
    email: "sarra.mansour@atlas.tn",
    role: "student",
    filiere: "Biology",
    level: "L3",
    status: "inactive",
    joined: "2023-06-10",
    xp: 2100,
  },
  {
    id: 5,
    name: "Youssef Salah",
    email: "youssef.salah@atlas.tn",
    role: "teacher",
    filiere: "Computer Science",
    status: "active",
    joined: "2023-03-15",
    xp: 3800,
  },
  {
    id: 6,
    name: "Nadia Khelifi",
    email: "nadia.khelifi@atlas.tn",
    role: "student",
    filiere: "Chemistry",
    level: "L2",
    status: "pending",
    joined: "2024-03-01",
    xp: 150,
  },
  {
    id: 7,
    name: "Prof. Ali Jaziri",
    email: "ali.jaziri@atlas.tn",
    role: "teacher",
    filiere: "History",
    status: "active",
    joined: "2022-01-10",
    xp: 6200,
  },
  {
    id: 8,
    name: "Mariem Saidi",
    email: "mariem.saidi@atlas.tn",
    role: "student",
    filiere: "Arts",
    level: "L1",
    status: "active",
    joined: "2024-01-05",
    xp: 560,
  },
];

const roleColors: Record<string, string> = {
  student: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  teacher:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const filteredUsers = mockUsers.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "all" || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const stats = {
    total: mappedUsers.length,
    students: mappedUsers.filter((u) => u.role === "student").length,
    teachers: mappedUsers.filter((u) => u.role === "teacher").length,
    active: mappedUsers.filter((u) => u.status === "active").length,
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
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Manage all users across the platform
          </p>
        </div>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">{stats.students}</p>
            <p className="text-sm text-muted-foreground">Students</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-500">
              {stats.teachers}
            </p>
            <p className="text-sm text-muted-foreground">Teachers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{stats.active}</p>
            <p className="text-sm text-muted-foreground">Active</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">All Roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
        </select>
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
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Details
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    XP
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((user) => (
                  <tr key={user.id} className="border-b">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-medium">
                          {user.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${roleColors[user.role]}`}
                      >
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {user.role === "student"
                        ? `${user.filiere} • ${user.level}`
                        : user.filiere}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={user.status} />
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {user.xp.toLocaleString()}
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
                            <Mail className="mr-2 h-4 w-4" />
                            Send Email
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Activate
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Ban className="mr-2 h-4 w-4" />
                            Suspend
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <XCircle className="mr-2 h-4 w-4" />
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
            {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of{" "}
            {filteredUsers.length} users
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

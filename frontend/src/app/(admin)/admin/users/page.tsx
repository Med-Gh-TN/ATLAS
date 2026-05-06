"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Search, Trash2, Users, MoreVertical, ShieldAlert, ShieldCheck, UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRole } from "@/lib/utils";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAdminUsersQuery, useDeleteUserMutation, useUpdateUserMutation } from "@/queries/admin.queries";
import { useTranslation } from "@/hooks/use-translation";

const roleColors: Record<string, string> = {
  STUDENT: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  TEACHER:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ADMIN: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function AdminUsersPage() {
  const { t, tSection } = useTranslation();
  const adminT = tSection("admin");
  const headerT = tSection("header");
  const { data, isLoading, isError } = useAdminUsersQuery();
  const updateMutation = useUpdateUserMutation();
  const deleteMutation = useDeleteUserMutation();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const users = useMemo(() => data?.items ?? [], [data]);
  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const normalizedRole = user.role.toUpperCase();
        const normalizedStatus = user.is_active ? "active" : "inactive";
        const fullName = user.full_name || "";

        const matchesSearch =
          fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole =
          roleFilter === "all" || normalizedRole.toLowerCase() === roleFilter;
        const matchesStatus =
          statusFilter === "all" || normalizedStatus === statusFilter;

        return matchesSearch && matchesRole && matchesStatus;
      }),
    [users, searchQuery, roleFilter, statusFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const stats = {
    total: users.length,
    students: users.filter((user) => user.role === "STUDENT").length,
    teachers: users.filter((user) => user.role === "TEACHER").length,
    active: users.filter((user) => user.is_active).length,
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        type="error"
        title={adminT.usersUnavailable}
        description={adminT.couldNotLoadUsers}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{adminT.userManagement}</h1>
          <p className="text-muted-foreground">
            {adminT.userManagementDescription}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/admin/teachers/import">
              <ShieldCheck className="mr-2 h-4 w-4" />
              {adminT.teacherImport}
            </Link>
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {adminT.export}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">{adminT.totalUsers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">{stats.students}</p>
            <p className="text-sm text-muted-foreground">{t("sidebar.users")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-500">{stats.teachers}</p>
            <p className="text-sm text-muted-foreground">{adminT.teachers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{stats.active}</p>
            <p className="text-sm text-muted-foreground">{adminT.status}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("ui.search")}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
            className="pl-10"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value);
            setCurrentPage(1);
          }}
          className="min-h-11 rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">{adminT.allRoles}</option>
          <option value="student">{t("sidebar.users")}</option>
          <option value="teacher">{adminT.teachers}</option>
          <option value="admin">{t("sidebar.admins")}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setCurrentPage(1);
          }}
          className="min-h-11 rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">{adminT.allStatus}</option>
          <option value="active">{t("status.active")}</option>
          <option value="inactive">{t("status.inactive")}</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {paginatedUsers.length ? (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {paginatedUsers.map((user) => (
                  <div key={user.id} className="rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground">
                        {(user.full_name || user.email)
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{user.full_name || t("admin.noUsersFound")}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">{adminT.role}</p>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ${roleColors[user.role] || roleColors.STUDENT}`}
                        >
                          {formatRole(user.role)}
                        </span>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{adminT.status}</p>
                        <div className="mt-1">
                          <StatusChip status={user.is_active ? "active" : "inactive"} />
                        </div>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("leaderboard.filiere")}</p>
                        <p className="mt-1">{user.filiere || "-"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{adminT.joined}</p>
                        <p className="mt-1">{new Date(user.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ userId: user.id, data: { is_active: !user.is_active } })}
                      >
                        {user.is_active ? <UserX className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                        {user.is_active ? adminT.deactivate : adminT.reactivate}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(t("admin.confirmDeleteUser", { name: user.full_name || user.email }))) {
                            deleteMutation.mutate(user.id);
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> {t("ui.delete")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">{adminT.user}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{adminT.role}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{t("leaderboard.filiere")}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{adminT.status}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{adminT.joined}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">{headerT.reviewQueue}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((user) => (
                    <tr key={user.id} className="border-b">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground">
                            {(user.full_name || user.email)
                              .split(" ")
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{user.full_name || t("admin.noUsersFound")}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${roleColors[user.role] || roleColors.STUDENT}`}
                        >
                          {formatRole(user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {user.filiere || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip status={user.is_active ? "active" : "inactive"} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" disabled={updateMutation.isPending}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => updateMutation.mutate({ userId: user.id, data: { is_active: !user.is_active }})}>
                              {user.is_active ? <><UserX className="mr-2 h-4 w-4 text-destructive" /> {adminT.deactivateBan}</> : <><ShieldCheck className="mr-2 h-4 w-4 text-emerald-500" /> {adminT.reactivate}</>}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={user.role === 'ADMIN'} onClick={() => updateMutation.mutate({ userId: user.id, data: { role: 'ADMIN' }})}>
                              <ShieldAlert className="mr-2 h-4 w-4 text-amber-500" /> {adminT.makeAdmin}
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={user.role === 'TEACHER'} onClick={() => updateMutation.mutate({ userId: user.id, data: { role: 'TEACHER' }})}>
                              <Users className="mr-2 h-4 w-4 text-purple-500" /> {adminT.makeTeacher}
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={user.role === 'STUDENT'} onClick={() => updateMutation.mutate({ userId: user.id, data: { role: 'STUDENT' }})}>
                              <Users className="mr-2 h-4 w-4 text-blue-500" /> {adminT.makeStudent}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (window.confirm(t("admin.confirmDeleteUser", { name: user.full_name || user.email }))) {
                                  deleteMutation.mutate(user.id);
                                }
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> {adminT.deletePermanently}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          ) : (
            <EmptyState
              type="no-results"
              title={adminT.noUsersFound}
              description={adminT.tryAdjustingFilters}
            />
          )}
        </CardContent>
      </Card>

      {filteredUsers.length > itemsPerPage ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("admin.showingUsers", {
              start: (currentPage - 1) * itemsPerPage + 1,
              end: Math.min(currentPage * itemsPerPage, filteredUsers.length),
              total: filteredUsers.length,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="min-h-11" disabled>
              {currentPage}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

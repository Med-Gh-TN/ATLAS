"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, MoreVertical, ShieldCheck, UserX, Trash2, ShieldAlert, Users, ArrowLeft, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { 
  useSuperadminEstablishmentDetailsQuery, 
  useSuperadminUsersQuery, 
  useUpdateSuperadminUserMutation, 
  useDeleteSuperadminUserMutation,
  useUpdateSuperadminEstablishmentMutation
} from "@/queries/admin.queries";

const roleColors: Record<string, string> = {
  STUDENT: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  TEACHER: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ADMIN: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function SuperadminEstablishmentDetailsPage() {
  const router = useRouter();
  const params = useParams() as { id: string };
  const establishmentId = params.id;

  const detailsQuery = useSuperadminEstablishmentDetailsQuery(establishmentId);
  const usersQuery = useSuperadminUsersQuery({ establishment_id: establishmentId });
  const updateEstMutation = useUpdateSuperadminEstablishmentMutation();
  const updateUserMutation = useUpdateSuperadminUserMutation();
  const deleteUserMutation = useDeleteSuperadminUserMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [userToDelete, setUserToDelete] = useState<any | null>(null);

  const establishment = detailsQuery.data;

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data]);
  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const normalizedRole = user.role.toUpperCase();
        const fullName = user.full_name || "";

        const matchesSearch =
          fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole =
          roleFilter === "all" || normalizedRole.toLowerCase() === roleFilter;

        return matchesSearch && matchesRole;
      }),
    [users, searchQuery, roleFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  if (detailsQuery.isLoading || usersQuery.isLoading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (detailsQuery.isError || !establishment) {
    return (
      <EmptyState
        type="error"
        title="Establishment not found"
        description="We couldn't load the details for this establishment."
      />
    );
  }

  const handleSave = async () => {
    try {
      await updateEstMutation.mutateAsync({
        establishmentId,
        data: { name: editName, domain: editDomain }
      });
      setIsEditing(false);
    } catch(e) {
      console.error(e);
      alert("Failed to update establishment details. Ensure the domain is unique.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" className="rounded-full shadow-sm" size="icon" onClick={() => router.push('/superadmin/establishments')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{establishment.name}</h1>
          <p className="text-muted-foreground font-mono text-sm">@{establishment.domain}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <div className="space-y-6">
          <Card className="border-border/50 bg-background/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex justify-between items-center">
                Properties
                {!isEditing && (
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditName(establishment.name);
                    setEditDomain(establishment.domain);
                    setIsEditing(true);
                  }}>
                    Edit
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Campus Name</label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Domain</label>
                    <Input value={editDomain} onChange={(e) => setEditDomain(e.target.value)} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
                    <Button size="sm" disabled={updateEstMutation.isPending} onClick={handleSave}>
                      {updateEstMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Status</label>
                    <div className="mt-1">
                      <StatusChip status={establishment.is_authorized ? "active" : "inactive"} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Created At</label>
                    <p className="mt-1 text-sm font-medium">{new Date(establishment.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/50">
                    <div>
                      <p className="text-2xl font-bold">{establishment.users}</p>
                      <p className="text-xs text-muted-foreground">Total Users</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-500">{establishment.admins}</p>
                      <p className="text-xs text-muted-foreground">Admins</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tenant users..."
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 min-h-11 border-border/50 bg-background/50"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value);
                setCurrentPage(1);
              }}
              className="min-h-11 rounded-lg border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20"
            >
              <option value="all">All Roles</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="admin">Admins</option>
            </select>
          </div>

          <Card className="border-border/50">
            <CardContent className="p-0">
              {paginatedUsers.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left text-sm font-medium">User</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Role</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                        <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user) => (
                        <tr key={user.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">
                                {(user.full_name || user.email)
                                  .split(" ")
                                  .map((part) => part[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium">{user.full_name || "Unnamed user"}</p>
                                <p className="text-xs text-muted-foreground">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${roleColors[user.role] || roleColors.STUDENT}`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusChip status={user.is_active ? "active" : "inactive"} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0" disabled={updateUserMutation.isPending || deleteUserMutation.isPending}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => updateUserMutation.mutate({ userId: user.id, data: { is_active: !user.is_active }})}>
                                  {user.is_active ? <><UserX className="mr-2 h-4 w-4 text-destructive" /> Deactivate</> : <><ShieldCheck className="mr-2 h-4 w-4 text-emerald-500" /> Reactivate</>}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled={user.role === 'ADMIN'} onClick={() => updateUserMutation.mutate({ userId: user.id, data: { role: 'ADMIN' }})}>
                                  <ShieldAlert className="mr-2 h-4 w-4 text-amber-500" /> Make Admin
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={user.role === 'TEACHER'} onClick={() => updateUserMutation.mutate({ userId: user.id, data: { role: 'TEACHER' }})}>
                                  <Users className="mr-2 h-4 w-4 text-purple-500" /> Make Teacher
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={user.role === 'STUDENT'} onClick={() => updateUserMutation.mutate({ userId: user.id, data: { role: 'STUDENT' }})}>
                                  <Users className="mr-2 h-4 w-4 text-blue-500" /> Make Student
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:bg-destructive/10" onClick={() => setUserToDelete(user)}>
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete Account
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  type="no-results"
                  title="No users found"
                  description="Try adjusting the search or filters."
                />
              )}
            </CardContent>
          </Card>

          {filteredUsers.length > itemsPerPage ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of{" "}
                {filteredUsers.length} users
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="min-h-11" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="min-h-11" disabled>{currentPage}</Button>
                <Button variant="outline" size="sm" className="min-h-11" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription className="pt-2">
              Are you sure you want to permanently delete the account for{" "}
              <span className="font-bold text-foreground">
                {userToDelete?.full_name || userToDelete?.email}
              </span>? 
              This action cannot be undone and all associated data will be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setUserToDelete(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={async () => {
                if (userToDelete) {
                  await deleteUserMutation.mutateAsync(userToDelete.id);
                  setUserToDelete(null);
                }
              }}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

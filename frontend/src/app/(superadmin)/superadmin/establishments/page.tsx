"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronLeft, ChevronRight, Download, Loader2, Search, Users, Plus, Shield, ShieldCheck, ShieldX, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useSuperadminEstablishmentsQuery,
  useCreateEstablishmentMutation,
  useToggleEstablishmentAuthorizationMutation,
  useCreateAdminMutation,
  useDeleteSuperadminEstablishmentMutation,
} from "@/queries/admin.queries";
import { useTranslation } from "@/hooks/use-translation";

type EstablishmentRow = {
  id: string;
  name: string;
  domain: string;
  created_at: string;
  is_authorized: boolean;
  users?: number;
  students?: number;
  teachers?: number;
  admins?: number;
};

export default function SuperadminEstablishmentsPage() {
  const { t, tSection } = useTranslation();
  const superadminT = tSection("superadmin");
  const { data, isLoading, isError } = useSuperadminEstablishmentsQuery();
  const createEstablishmentMutation = useCreateEstablishmentMutation();
  const toggleAuthorizationMutation = useToggleEstablishmentAuthorizationMutation();
  const createAdminMutation = useCreateAdminMutation();
  const deleteEstablishmentMutation = useDeleteSuperadminEstablishmentMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [newEstablishmentName, setNewEstablishmentName] = useState("");
  const [newEstablishmentDomain, setNewEstablishmentDomain] = useState("");

  const [newAdminForm, setNewAdminForm] = useState({
    full_name: "",
    email: "",
    password: "",
    establishment_id: "",
  });

  const [establishmentToDelete, setEstablishmentToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleCreateEstablishment = async () => {
    if (!newEstablishmentName.trim() || !newEstablishmentDomain.trim()) return;
    await createEstablishmentMutation.mutateAsync({
      name: newEstablishmentName.trim(),
      domain: newEstablishmentDomain.trim(),
    });
    setNewEstablishmentName("");
    setNewEstablishmentDomain("");
  };

  const handleCreateAdmin = async () => {
    if (!newAdminForm.full_name || !newAdminForm.email || !newAdminForm.password || !newAdminForm.establishment_id) return;
    await createAdminMutation.mutateAsync(newAdminForm);
    setNewAdminForm({ full_name: "", email: "", password: "", establishment_id: "" });
  };

  const confirmDeleteEstablishment = async () => {
    if (!establishmentToDelete) return;
    await deleteEstablishmentMutation.mutateAsync(establishmentToDelete.id);
    setEstablishmentToDelete(null);
  };

  const establishments = useMemo(
    () => (data ?? []) as EstablishmentRow[],
    [data],
  );
  const filteredEstablishments = useMemo(
    () =>
      establishments.filter((establishment) => {
        const query = searchQuery.toLowerCase();
        return (
          establishment.name.toLowerCase().includes(query) ||
          establishment.domain.toLowerCase().includes(query)
        );
      }),
    [establishments, searchQuery],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredEstablishments.length / itemsPerPage),
  );
  const paginatedEstablishments = filteredEstablishments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const stats = {
    total: establishments.length,
    totalUsers: establishments.reduce((sum, item) => sum + (item.users || 0), 0),
    totalStudents: establishments.reduce(
      (sum, item) => sum + (item.students || 0),
      0,
    ),
    totalTeachers: establishments.reduce(
      (sum, item) => sum + (item.teachers || 0),
      0,
    ),
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
        title={superadminT.establishmentsOverview}
        description={superadminT.noEstablishmentsFound}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{superadminT.establishmentManagement}</h1>
          <p className="text-muted-foreground">
            {superadminT.establishmentManagementDescription}
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          {t("admin.export")}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {superadminT.domainAuthorization}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3 rounded-lg border p-4">
              <Input
                label={superadminT.establishmentName}
                value={newEstablishmentName}
                onChange={(event) => setNewEstablishmentName(event.target.value)}
                placeholder={superadminT.establishmentPlaceholder}
              />
              <Input
                label={superadminT.domain}
                value={newEstablishmentDomain}
                onChange={(event) => setNewEstablishmentDomain(event.target.value)}
                placeholder={superadminT.domainPlaceholder}
              />
              <Button onClick={handleCreateEstablishment} disabled={createEstablishmentMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                {superadminT.addEstablishment}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {superadminT.provisionAdminAccount}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3 rounded-lg border p-4">
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={newAdminForm.establishment_id}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, establishment_id: e.target.value })}
              >
                <option value="">{superadminT.selectEstablishment}</option>
                {establishments.map((est) => (
                  <option key={est.id} value={est.id}>
                    {est.name} ({est.domain})
                  </option>
                ))}
              </select>
              <Input
                label={superadminT.fullName}
                value={newAdminForm.full_name}
                onChange={(event) => setNewAdminForm({ ...newAdminForm, full_name: event.target.value })}
                placeholder={superadminT.fullNamePlaceholder}
              />
              <Input
                label={t("auth.email")}
                type="email"
                value={newAdminForm.email}
                onChange={(event) => setNewAdminForm({ ...newAdminForm, email: event.target.value })}
                placeholder={superadminT.emailPlaceholder}
              />
               <Input
                label={superadminT.temporaryPassword}
                type="password"
                value={newAdminForm.password}
                onChange={(event) => setNewAdminForm({ ...newAdminForm, password: event.target.value })}
                placeholder={superadminT.passwordPlaceholder}
              />
              <Button onClick={handleCreateAdmin} disabled={createAdminMutation.isPending}>
                <UserPlus className="mr-2 h-4 w-4" />
                {superadminT.createAdmin}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">{superadminT.establishments}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">
              {stats.totalUsers.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">{superadminT.totalUsers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-500">
              {stats.totalStudents.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">{superadminT.students}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-500">
              {stats.totalTeachers.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">{superadminT.teachers}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={superadminT.searchEstablishments}
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setCurrentPage(1);
          }}
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {paginatedEstablishments.length ? (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {paginatedEstablishments.map((establishment) => (
                  <div key={establishment.id} className="rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{establishment.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {establishment.domain}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">{superadminT.users}</p>
                        <p className="mt-1">{(establishment.users || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{superadminT.students}</p>
                        <p className="mt-1">{(establishment.students || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{superadminT.teachers}</p>
                        <p className="mt-1">{(establishment.teachers || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("admin.joined")}</p>
                        <p className="mt-1">{new Date(establishment.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      {superadminT.establishments}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{superadminT.domain}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{superadminT.authorization}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{superadminT.users}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{superadminT.students}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{superadminT.teachers}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{t("admin.joined")}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">{t("header.reviewQueue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEstablishments.map((establishment) => (
                    <tr key={establishment.id} className="border-b">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <p className="font-medium">{establishment.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {establishment.domain}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Button
                          variant={establishment.is_authorized ? "outline" : "default"}
                          size="sm"
                          onClick={() => toggleAuthorizationMutation.mutate(establishment.id)}
                          disabled={toggleAuthorizationMutation.isPending}
                        >
                          {establishment.is_authorized ? superadminT.revoke : superadminT.authorize}
                        </Button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {(establishment.users || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {(establishment.students || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {(establishment.teachers || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(establishment.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/superadmin/establishments/${establishment.id}`}>
                              {superadminT.manage}
                            </Link>
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => setEstablishmentToDelete({ id: establishment.id, name: establishment.name })}
                            disabled={deleteEstablishmentMutation.isPending}
                          >
                            Delete
                          </Button>
                        </div>
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
              title={superadminT.noEstablishmentsFound}
              description={superadminT.tryAdjustingFilters}
            />
          )}
        </CardContent>
      </Card>

      {filteredEstablishments.length > itemsPerPage ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("superadmin.showingEstablishments", {
              start: (currentPage - 1) * itemsPerPage + 1,
              end: Math.min(currentPage * itemsPerPage, filteredEstablishments.length),
              total: filteredEstablishments.length,
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

      <Dialog open={!!establishmentToDelete} onOpenChange={(open) => !open && setEstablishmentToDelete(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldX className="h-5 w-5" />
              {superadminT.confirmDeletion}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {t("common.confirmDelete")?.replace("{name}", establishmentToDelete?.name || "") || `Are you sure you want to delete "${establishmentToDelete?.name}"?`}
              <br />
              {superadminT.permanentDeletionWarning}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEstablishmentToDelete(null)}>
              {t("ui.cancel")}
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteEstablishment}
              disabled={deleteEstablishmentMutation.isPending}
            >
              {deleteEstablishmentMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Establishment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

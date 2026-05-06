"use client";

import Link from "next/link";
import { Loader2, ShieldCheck, UserRoundSearch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { useTranslation } from "@/hooks/use-translation";
import { useTeacherRequestsQuery, useApproveTeacherRequestMutation } from "@/queries/admin.queries";

export default function AdminTeacherRequestsPage() {
  const { t, tSection } = useTranslation();
  const adminT = tSection("admin");
  const teacherRequestsQuery = useTeacherRequestsQuery();
  const approveTeacherRequestMutation = useApproveTeacherRequestMutation();
  const requests = teacherRequestsQuery.data?.items ?? [];

  if (teacherRequestsQuery.isLoading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{adminT.teacherVerificationRequests}</h1>
        <p className="text-muted-foreground">
          {adminT.teacherVerificationDescription}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{adminT.pendingQueue}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {adminT.pendingQueueDescription}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/teachers/import">{adminT.importTeachers}</Link>
            </Button>
            <StatusChip status={requests.length ? "warning" : "active"} label={`${requests.length} ${t("teacher.pendingContributionsCount")}`} />
          </div>
        </CardHeader>
        <CardContent>
          {requests.length ? (
            <div className="space-y-4">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{request.full_name || adminT.unnamedEducator}</p>
                    <p className="text-sm text-muted-foreground">{request.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {adminT.requestedDepartment}: {request.requested_department}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {adminT.institutionalDomain}: {request.requested_domain}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {adminT.submitted} {new Date(request.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    className="min-h-11"
                    disabled={approveTeacherRequestMutation.isPending}
                    onClick={() => approveTeacherRequestMutation.mutate({ requestId: request.id })}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    {adminT.approveTeacher}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              type="no-results"
              title={adminT.noPendingTeacherRequests}
              description={adminT.educatorRequestsDescription}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <UserRoundSearch className="mt-0.5 h-5 w-5 text-primary" />
          <p>
            {adminT.trustOnboardingDescription}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

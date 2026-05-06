"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { superadminApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/use-translation";
import type { Report } from "@/types/api.types";

const getStatusOptions = (t: any) => [
  { value: "all", label: t("common.all") },
  { value: "PENDING", label: t("moderation.pending") },
  { value: "RESOLVED", label: t("moderation.resolved") },
] as const;

function formatSeverity(severity: string | null | undefined, t: any) {
  if (!severity) return t("status.unspecified");
  const s = severity.toLowerCase();
  if (s === "critical") return t("moderation.critical");
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
}

function formatType(type: string | undefined, t: any) {
  if (!type) return t("common.other");
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

function parseReportMessage(message: string) {
  let reportType = "other";
  let severity: string | null = null;
  let screenshotUrl: string | null = null;
  const descriptionLines: string[] = [];

  for (const line of message.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Type: ")) {
      reportType = trimmed.replace("Type: ", "").trim().toLowerCase() || "other";
    } else if (trimmed.startsWith("Severity: ")) {
      severity = trimmed.replace("Severity: ", "").trim().toLowerCase();
    } else if (trimmed.startsWith("Screenshot: ")) {
      screenshotUrl = trimmed.replace("Screenshot: ", "").trim() || null;
    } else if (trimmed) {
      descriptionLines.push(trimmed);
    }
  }

  return { reportType, severity, screenshotUrl, description: descriptionLines.join("\n") };
}

function ReportsTab() {
  const { t, tSection } = useTranslation();
  const modT = tSection("moderation");
  const statusOptions = getStatusOptions(t);
  const [status, setStatus] = useState<string>("PENDING");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const queryClient = useQueryClient();

  const reportsQuery = useQuery({
    queryKey: ["superadmin", "reports", status],
    queryFn: () =>
      superadminApi.listReports({
        status: status === "all" ? undefined : status,
        limit: 50,
        offset: 0,
      }),
  });

  const resolveReportMutation = useMutation({
    mutationFn: (reportId: string) =>
      superadminApi.resolveReport(reportId, { action: "dismiss" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "reports"] });
      setSelectedReport(null);
    },
  });

  const stats = useMemo(() => {
    const items = reportsQuery.data?.items ?? [];
    return {
      total: reportsQuery.data?.meta.total ?? 0,
      pending: items.filter((item) => !item.is_resolved).length,
      resolved: items.filter((item) => item.is_resolved).length,
      critical: items.filter((item) => {
        const parsed = parseReportMessage(item.message || "");
        return parsed.severity?.toLowerCase() === "critical";
      }).length,
    };
  }, [reportsQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <Button
              key={option.value}
              variant={status === option.value ? "default" : "outline"}
              onClick={() => setStatus(option.value)}
              className="min-h-11 shadow-sm"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">{modT.totalReports}</p>
              <p className="mt-2 text-2xl font-bold">{stats.total}</p>
            </div>
            <FileText className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">{modT.pending}</p>
              <p className="mt-2 text-2xl font-bold">{stats.pending}</p>
            </div>
            <Clock3 className="h-5 w-5 text-amber-500" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">{modT.resolved}</p>
              <p className="mt-2 text-2xl font-bold">{stats.resolved}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">{modT.critical}</p>
              <p className="mt-2 text-2xl font-bold">{stats.critical}</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </CardContent>
        </Card>
      </div>

      {reportsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : reportsQuery.data?.items.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={modT.inboxZero}
          description={modT.noReports}
        />
      ) : (
        <div className="space-y-3">
          {reportsQuery.data?.items.map((report) => {
            const parsed = parseReportMessage(report.message || "");
            return (
              <Card
                key={report.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setSelectedReport(report as Report)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex flex-1 items-center gap-4">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        report.is_read ? "bg-emerald-100" : "bg-amber-100"
                      }`}
                    >
                      {report.is_read ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <Clock3 className="h-5 w-5 text-amber-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{report.title}</p>
                        <StatusChip status="info" label={formatSeverity(parsed.severity, t)} />
                        <StatusChip status="info" label={formatType(parsed.reportType, t)} />
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {parsed.description}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(report.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{modT.incidentLog}</DialogTitle>
            <DialogDescription>
              {modT.incidentLogDescription}
            </DialogDescription>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <StatusChip
                  status={
                    formatSeverity(
                      parseReportMessage(selectedReport.message || "").severity,
                      t
                    ) === modT.critical
                      ? "error"
                      : "info"
                  }
                  label={formatSeverity(
                    parseReportMessage(selectedReport.message || "").severity,
                    t
                  )}
                />
                <StatusChip status="info" label={formatType(parseReportMessage(selectedReport.message || "").reportType, t)} />
                <StatusChip status={selectedReport.is_resolved ? "success" : "warning"} label={selectedReport.is_resolved ? modT.resolved : modT.pending} />
              </div>
              <div>
                <h3 className="font-semibold">{selectedReport.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(selectedReport.created_at).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <pre className="whitespace-pre-wrap text-sm">
                  {parseReportMessage(selectedReport.message || "").description}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReport(null)}>
              {t("ui.close")}
            </Button>
            {!selectedReport?.is_resolved && (
              <Button
                variant="default"
                onClick={() => {
                  if (selectedReport) {
                    resolveReportMutation.mutate(selectedReport.id);
                  }
                }}
                disabled={resolveReportMutation.isPending}
              >
                {resolveReportMutation.isPending ? t("ui.saving") : modT.markResolved}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ReportsPage() {
  const { t, tSection } = useTranslation();
  const modT = tSection("moderation");
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{modT.systemReports}</h1>
        <p className="mt-2 text-muted-foreground">
          {modT.hubDescription}
        </p>
      </div>
      <ReportsTab />
    </div>
  );
}

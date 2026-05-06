"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Eye,
  FileText,
  BookOpen,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { FilePreview } from "@/components/ui/file-preview";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { contributionsApi } from "@/lib/api";
import { useTranslation } from "@/hooks/use-translation";
import type { Contribution, ContributorRequest } from "@/types/api.types";

type QueueKind = "contribution" | "contributor_request";

type QueueRow =
  | { kind: "contribution"; created_at: string; contribution: Contribution }
  | { kind: "contributor_request"; created_at: string; request: ContributorRequest };

type SelectedReview =
  | { kind: "contribution"; contribution: Contribution }
  | { kind: "contributor_request"; request: ContributorRequest };

export default function ManageContributions() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<SelectedReview | null>(null);
  const [contributionToDelete, setContributionToDelete] = useState<Contribution | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const itemsPerPage = 5;

  const queryClient = useQueryClient();

  const contributionParams = {
    limit: 50,
    offset: 0,
    ...(statusFilter !== "all" && { status: statusFilter.toUpperCase() }),
  };

  const requestParams = {
    limit: 50,
    offset: 0,
    ...(statusFilter !== "all" && {
      status: statusFilter.toUpperCase() as ContributorRequest["status"],
    }),
  };

  const contributionsQuery = useQuery({
    queryKey: ["admin_contributions", contributionParams],
    queryFn: () => contributionsApi.admin.list(contributionParams),
  });

  const contributorRequestsQuery = useQuery({
    queryKey: ["admin_contributions", "contributor-requests", requestParams],
    queryFn: () => contributionsApi.admin.listContributorRequests(requestParams),
  });

  const isLoading = contributionsQuery.isLoading || contributorRequestsQuery.isLoading;
  const isError = contributionsQuery.isError || contributorRequestsQuery.isError;
  const errorMessage =
    (contributionsQuery.error as Error)?.message ||
    (contributorRequestsQuery.error as Error)?.message ||
    t("teacher.couldNotLoadContributions");

  const contributions = contributionsQuery.data?.items ?? [];
  const requests = contributorRequestsQuery.data?.items ?? [];

  const mergedRows = useMemo((): QueueRow[] => {
    const fromContributions: QueueRow[] = contributions.map((contribution) => ({
      kind: "contribution",
      created_at: contribution.created_at,
      contribution,
    }));
    const fromRequests: QueueRow[] = requests.map((request) => ({
      kind: "contributor_request",
      created_at: request.created_at,
      request,
    }));
    return [...fromContributions, ...fromRequests].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [contributions, requests]);

  const filteredRows = mergedRows.filter((row) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (row.kind === "contribution" &&
        (row.contribution.title.toLowerCase().includes(q) ||
          row.contribution.uploader_id.toLowerCase().includes(q) ||
          (row.contribution.uploader_name?.toLowerCase().includes(q) ?? false))) ||
      (row.kind === "contributor_request" &&
        (row.request.demo_contribution.title.toLowerCase().includes(q) ||
          row.request.email.toLowerCase().includes(q) ||
          (row.request.full_name?.toLowerCase().includes(q) ?? false)));

    const matchesType =
      typeFilter === "all" ||
      (typeFilter === "course_material" && row.kind === "contribution") ||
      (typeFilter === "contributor_request" && row.kind === "contributor_request");

    return matchesSearch && matchesType;
  });

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage) || 1;
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const pendingCount =
    contributions.filter((c) => c.status === "PENDING").length +
    requests.filter((r) => r.status === "PENDING").length;

  const approveMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      return contributionsApi.admin.approve(id, { review_note: note });
    },
    onSuccess: () => {
      alert(t("teacher.contributionApproved"));
      queryClient.invalidateQueries({ queryKey: ["admin_contributions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "teacher"] });
      setSelected(null);
      setReviewNote("");
    },
    onError: (error: Error) => {
      alert(t("teacher.actionFailed", { error: error.message }));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      return contributionsApi.admin.reject(id, note);
    },
    onSuccess: () => {
      alert(t("teacher.contributionRejected"));
      queryClient.invalidateQueries({ queryKey: ["admin_contributions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "teacher"] });
      setSelected(null);
      setReviewNote("");
    },
    onError: (error: Error) => {
      alert(t("teacher.actionFailed", { error: error.message }));
    },
  });

  const approveRequestMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) =>
      contributionsApi.admin.approveContributorRequest(id, { review_note: note }),
    onSuccess: () => {
      alert(t("teacher.contributorRequestApproved"));
      queryClient.invalidateQueries({ queryKey: ["admin_contributions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "teacher"] });
      setSelected(null);
      setReviewNote("");
    },
    onError: (error: Error) => {
      alert(t("teacher.actionFailed", { error: error.message }));
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) =>
      contributionsApi.admin.rejectContributorRequest(id, note),
    onSuccess: () => {
      alert(t("teacher.contributorRequestRejected"));
      queryClient.invalidateQueries({ queryKey: ["admin_contributions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "teacher"] });
      setSelected(null);
      setReviewNote("");
    },
    onError: (error: Error) => {
      alert(t("teacher.actionFailed", { error: error.message }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contributionsApi.delete(id),
    onSuccess: () => {
      alert(t("teacher.courseDeletedSuccessfully"));
      queryClient.invalidateQueries({ queryKey: ["admin_contributions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "teacher"] });
      setContributionToDelete(null);
    },
    onError: (error: Error) => {
      alert(t("teacher.deleteFailed", { error: error.message }));
    },
  });

  const handleApprove = () => {
    if (!selected) return;
    if (selected.kind === "contribution") {
      approveMutation.mutate({ id: selected.contribution.id, note: reviewNote });
    } else {
      approveRequestMutation.mutate({ id: selected.request.id, note: reviewNote || undefined });
    }
  };

  const handleReject = () => {
    if (!selected) return;
    if (!reviewNote.trim()) {
      alert(t("teacher.reviewNoteRequired"));
      return;
    }
    if (selected.kind === "contribution") {
      rejectMutation.mutate({ id: selected.contribution.id, note: reviewNote });
    } else {
      rejectRequestMutation.mutate({ id: selected.request.id, note: reviewNote });
    }
  };

  const pendingSelected =
    selected?.kind === "contribution"
      ? selected.contribution.status === "PENDING"
      : selected?.kind === "contributor_request"
        ? selected.request.status === "PENDING"
        : false;

  const actionPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    approveRequestMutation.isPending ||
    rejectRequestMutation.isPending;

  const typeIcons = {
    course_material: BookOpen,
    contributor_request: UserPlus,
  } as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("teacher.reviewStudentContributions")}</h1>
          <p className="text-muted-foreground">
            {t("teacher.communityUploadsDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-amber-100 px-4 py-2 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <Clock className="h-5 w-5" />
          <span className="font-medium">{isLoading ? "---" : pendingCount} {t("teacher.pendingReviews", { count: pendingCount })}</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("teacher.searchTitlesStudentEmail")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">{t("teacher.allTypes")}</option>
          <option value="course_material">{t("teacher.communityUploads")}</option>
          <option value="contributor_request">{t("teacher.contributorApplications")}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">{t("teacher.allStatus")}</option>
          <option value="pending">{t("status.pending")}</option>
          <option value="approved">{t("status.approved")}</option>
          <option value="rejected">{t("status.rejected")}</option>
        </select>
      </div>

      {isError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center text-sm">
          <p className="font-medium text-destructive">{t("teacher.couldNotLoadContributions")}</p>
          <p className="mt-2 text-muted-foreground">{errorMessage}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              void contributionsQuery.refetch();
              void contributorRequestsQuery.refetch();
            }}
          >
            {t("teacher.retry")}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex h-[300px] items-center justify-center rounded-lg border">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4">
          {paginatedRows.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center text-muted-foreground">
              <p>{t("teacher.noItemsMatchFilters")}</p>
              <p className="mt-2 text-sm">
                {t("teacher.noItemsDescription")}
              </p>
            </div>
          ) : (
            paginatedRows.map((row) => {
              if (row.kind === "contribution") {
                const { contribution } = row;
                const typeStr = "course_material";
                const TypeIcon = typeIcons[typeStr];
                const uploaderName =
                  contribution.uploader_name || contribution.uploader_id || t("teacher.unknownStudent");
                return (
                  <Card key={`c-${contribution.id}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                            <TypeIcon className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold">{contribution.title}</h3>
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                                {t("teacher.communityUploads")}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {t("teacher.by")} {uploaderName} • {new Date(contribution.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                          <div className="flex items-center gap-2">
                            <StatusChip status={contribution.status} />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setSelected({ kind: "contribution", contribution })
                              }
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              {t("teacher.review")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setContributionToDelete(contribution)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t("teacher.delete")}
                            </Button>
                          </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              const { request } = row;
              const TypeIcon = typeIcons.contributor_request;
              const who = request.full_name || request.email;
              return (
                <Card key={`r-${request.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                          <TypeIcon className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{request.demo_contribution.title}</h3>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                              {t("teacher.contributorApplications")}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {t("teacher.applicant")} {who} • {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                        <div className="flex items-center gap-2">
                          <StatusChip status={request.status} />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelected({ kind: "contributor_request", request })}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            {t("teacher.review")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              setContributionToDelete(
                                request.demo_contribution as unknown as Contribution,
                              )
                            }
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("teacher.delete")}
                          </Button>
                        </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {totalPages > 1 && !isError && !isLoading ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("teacher.showingItems", {
              start: (currentPage - 1) * itemsPerPage + 1,
              end: Math.min(currentPage * itemsPerPage, filteredRows.length),
              total: filteredRows.length,
            })}
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
      ) : null}

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setReviewNote("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("teacher.reviewSubmission")}</DialogTitle>
            <DialogDescription>
              {t("teacher.previewFileApproveOrReject")}
            </DialogDescription>
          </DialogHeader>
          {selected?.kind === "contribution" ? (
            <div className="flex max-h-[calc(85vh-8rem)] flex-col gap-4 overflow-y-auto">
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold">{selected.contribution.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("teacher.by")} {selected.contribution.uploader_name || selected.contribution.uploader_id}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {t("teacher.communityUploads")}
                  </span>
                  <StatusChip status={selected.contribution.status} />
                </div>
              </div>
              <div>
                <h4 className="font-medium">{t("teacher.description")}</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.contribution.description || t("teacher.noDescriptionProvided")}
                </p>
              </div>
              {selected.contribution.status === "REJECTED" && selected.contribution.review_note ? (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <h4 className="font-medium text-destructive">{t("teacher.previousRejectionReason")}</h4>
                  <p className="mt-1 text-sm">{selected.contribution.review_note}</p>
                </div>
              ) : null}
              <div className="min-h-[240px] flex-1">
                <FilePreview
                  storagePath={selected.contribution.s3_key}
                  mimeType={selected.contribution.mime_type}
                  title={selected.contribution.title}
                  previewText={selected.contribution.preview_text}
                />
              </div>
              {selected.contribution.status === "PENDING" ? (
                <div>
                  <label className="font-medium">{t("teacher.reviewNote")}</label>
                  <Textarea
                    placeholder={t("teacher.optionalForApprovalRequired")}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    className="mt-2"
                    rows={3}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {selected?.kind === "contributor_request" ? (
            <div className="flex max-h-[calc(85vh-8rem)] flex-col gap-4 overflow-y-auto">
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold">{selected.request.demo_contribution.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("teacher.applicant")} {selected.request.full_name || selected.request.email} (
                  {selected.request.email})
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {t("teacher.contributorApplications")}
                  </span>
                  <StatusChip status={selected.request.status} />
                </div>
              </div>
              <div>
                <h4 className="font-medium">{t("teacher.description")}</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.request.demo_contribution.description || t("teacher.noDescriptionProvided")}
                </p>
              </div>
              {selected.request.status === "REJECTED" && selected.request.review_note ? (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <h4 className="font-medium text-destructive">{t("teacher.previousRejectionReason")}</h4>
                  <p className="mt-1 text-sm">{selected.request.review_note}</p>
                </div>
              ) : null}
              <div className="min-h-[240px] flex-1">
                <FilePreview
                  storagePath={selected.request.demo_contribution.s3_key}
                  mimeType={selected.request.demo_contribution.mime_type}
                  title={selected.request.demo_contribution.title}
                  previewText={selected.request.demo_contribution.preview_text}
                />
              </div>
              {selected.request.status === "PENDING" ? (
                <div>
                  <label className="font-medium">{t("teacher.reviewNote")}</label>
                  <Textarea
                    placeholder={t("teacher.optionalForApprovalRequired")}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    className="mt-2"
                    rows={3}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            {selected && (
              <Button
                variant="ghost"
                className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  if (selected.kind === "contribution") {
                    setContributionToDelete(selected.contribution);
                  } else {
                    setContributionToDelete(selected.request.demo_contribution as unknown as Contribution);
                  }
                  setSelected(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("teacher.delete")}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={!pendingSelected || actionPending}
            >
              {rejectMutation.isPending || rejectRequestMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              {t("teacher.reject")}
            </Button>
            <Button onClick={handleApprove} disabled={!pendingSelected || actionPending}>
              {approveMutation.isPending || approveRequestMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              {t("teacher.approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!contributionToDelete} onOpenChange={(open) => !open && setContributionToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teacher.deleteContribution")}</DialogTitle>
            <DialogDescription>
              {t("teacher.permanentlyDeleteDescription", { title: contributionToDelete?.title || "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContributionToDelete(null)}>{t("teacher.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!contributionToDelete) return;
                deleteMutation.mutate(contributionToDelete.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t("teacher.deleting") : t("teacher.permanentlyDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

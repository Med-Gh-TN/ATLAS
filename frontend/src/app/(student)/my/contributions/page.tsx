"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FilePreview } from "@/components/ui/file-preview";
import { FileDropzone } from "@/components/ui/file-dropzone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useContributorStatusQuery,
  useContributionsMineQuery,
  useCoursesQuery,
  useSubmitContributionMutation,
  useSubmitContributorRequestMutation,
} from "@/queries";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/use-translation";
import type { Contribution } from "@/types/api.types";

export default function ContributorHubPage() {
  const router = useRouter();
  const { t, tSection } = useTranslation();
  const contT = tSection("contributions");

  const { user } = useAuthStore();
  const contributorStatusQuery = useContributorStatusQuery();
  const contributionsQuery = useContributionsMineQuery();
  const coursesQuery = useCoursesQuery();
  const uploadMutation = useSubmitContributionMutation();
  const contributorRequestMutation = useSubmitContributorRequestMutation();

  const [selectedContribution, setSelectedContribution] = useState<Contribution | null>(null);

  // Upload / request form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState("");
  const [error, setError] = useState("");

  const contributorRequest = contributorStatusQuery.data?.request ?? null;
  const canUpload =
    Boolean(user?.is_contributor) ||
    Boolean(contributorStatusQuery.data?.is_contributor);
  const isPendingRequest = contributorRequest?.status === "PENDING";

  const isBusy =
    uploadMutation.isPending ||
    contributorRequestMutation.isPending ||
    contributorStatusQuery.isLoading;

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
      }
    },
    [title],
  );

  const handleRemoveFile = () => setFile(null);

  const sortedCourses = useMemo(
    () =>
      [...(coursesQuery.data || [])].sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
    [coursesQuery.data],
  );

  const resetForm = () => {
    setFile(null);
    setTitle("");
    setDescription("");
    setCourseId("");
    setError("");
  };

  const handleUploadOrRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("Please select a file to upload.");
      return;
    }
    if (!title.trim() || !courseId) {
      setError("Please fill in all required fields.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("course_id", courseId);

    try {
      if (canUpload) {
        await uploadMutation.mutateAsync(formData);
        resetForm();
        contributionsQuery.refetch();
      } else {
        await contributorRequestMutation.mutateAsync(formData);
        await contributorStatusQuery.refetch();
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    }
  };

  // Contributions list filtered by status
  const [filter, setFilter] = useState<"all" | "PENDING" | "APPROVED" | "REJECTED">("all");
  const filteredContributions = (contributionsQuery.data?.items || []).filter((c) => {
    if (filter === "all") return true;
    return c.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">
          {canUpload ? contT.title : contT.title || "Contributions"}
        </h1>
        <p className="text-muted-foreground">
          {canUpload
            ? "Upload documents and track your submission history."
            : "Request contributor access to start uploading documents."}
        </p>
      </div>

      {/* Show request status if not yet contributor */}
      {!canUpload && contributorRequest && (
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {isPendingRequest ? (
                <>
                  <Clock3 className="h-5 w-5 text-amber-500" />
                  Contributor Request Pending
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Contributor Request Result
                </>
              )}
            </CardTitle>
            <CardDescription>
              {isPendingRequest
                ? "Your demo document is waiting for admin review."
                : "You can review the previous decision below and submit a stronger document."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="font-medium">{contributorRequest.demo_contribution.title}</p>
              <p className="mt-1 text-muted-foreground">
                Submitted on{" "}
                {new Date(contributorRequest.created_at).toLocaleString()}
              </p>
              <p className="mt-2 text-muted-foreground">
                OCR quality score:{" "}
                {Number(contributorRequest.ocr_quality_score || 0).toFixed(2)}
              </p>
            </div>
            {contributorRequest.review_note ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-destructive">
                <p className="font-medium">Reviewer feedback</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {contributorRequest.review_note}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Upload / request form */}
      {isPendingRequest && !canUpload ? null : (
        <form onSubmit={handleUploadOrRequest} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {canUpload
                  ? "Upload New Contribution"
                  : "Request Contributor Access"}
              </CardTitle>
              <CardDescription>
                {canUpload
                  ? "Your submission will be reviewed before it's visible to other students."
                  : "Submit one high-quality demo document. An admin reviews it before contributor upload access is unlocked."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              ) : null}

              {file ? (
                <div className="flex items-center gap-3 rounded-lg border p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleRemoveFile}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <FileDropzone
                  onFileSelect={handleFileSelect}
                  accept={{
                    "application/pdf": [".pdf"],
                    "application/msword": [".doc"],
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                      [".docx"],
                    "application/vnd.ms-powerpoint": [".ppt"],
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
                      [".pptx"],
                    "image/png": [".png"],
                    "image/jpeg": [".jpg", ".jpeg"],
                  }}
                />
              )}

              <Input
                label="Title"
                placeholder="Document title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Description
                </label>
                <textarea
                  className="min-h-[110px] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder={
                    canUpload
                      ? "Describe what this contribution contains..."
                      : "Explain why this demo document shows you can contribute quality academic content..."
                  }
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Course <span className="text-destructive">*</span>
                </label>
                <select
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  required
                >
                  <option value="">Select a course</option>
                  {sortedCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" disabled={isBusy}>
            {isBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : canUpload ? (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Submit Contribution
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Send Contributor Request
              </>
            )}
          </Button>
        </form>
      )}

      {/* Contributions history (only for contributors) */}
      {canUpload && (
        <>
          <div className="flex flex-wrap gap-2 pt-4">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              {contT.all}
            </Button>
            <Button
              variant={filter === "PENDING" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("PENDING")}
            >
              {contT.pending}
            </Button>
            <Button
              variant={filter === "APPROVED" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("APPROVED")}
            >
              {contT.approved}
            </Button>
            <Button
              variant={filter === "REJECTED" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("REJECTED")}
            >
              {contT.rejected}
            </Button>
          </div>

          {contributionsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : filteredContributions.length === 0 ? (
            <EmptyState
              type="contributions"
              title={contT.noContributions}
              description={contT.noContributionsDescription}
              action={{
                label: contT.uploadNow,
                onClick: () => {}, // form is already visible above
              }}
            />
          ) : (
            <div className="space-y-3">
              {filteredContributions.map((contribution) => (
                <Card
                  key={contribution.id}
                  className="transition-colors hover:bg-muted/50"
                >
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">
                        {contribution.title}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {contribution.description || contT.noDescription}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {contribution.is_demo_submission && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                            {contT.contributorApplication}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {new Date(contribution.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusChip status={contribution.status} />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedContribution(contribution)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Information cards (always visible) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p>Every student can request contributor access.</p>
            </div>
            <div className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p>Admins review one demo document before unlocking uploads.</p>
            </div>
            <div className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p>Approved contributors can upload from this page anytime.</p>
            </div>
            <div className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p>Other students only see your file after moderation approval.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accepted Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-2">
              <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>PDF, DOC, DOCX, PPT, PPTX, PNG, JPG, JPEG</p>
            </div>
            <div className="flex gap-2">
              <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>Maximum file size: 50 MB</p>
            </div>
            <div className="flex gap-2">
              <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>OCR quality and clarity are part of the review.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* File preview dialog (reused from old contributions page) */}
      <Dialog
        open={!!selectedContribution}
        onOpenChange={(open) => !open && setSelectedContribution(null)}
      >
        <DialogContent className="max-w-5xl h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{selectedContribution?.title}</DialogTitle>
            <DialogDescription>
              {selectedContribution?.status === "PENDING"
                ? contT.awaitingModeration
                : selectedContribution?.status === "REJECTED"
                  ? contT.rejectedMessage
                  : contT.approvedPreview}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <FilePreview
              storagePath={selectedContribution?.s3_key}
              mimeType={selectedContribution?.mime_type}
              title={selectedContribution?.title}
              previewText={selectedContribution?.preview_text}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
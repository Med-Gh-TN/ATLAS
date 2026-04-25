"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  Lightbulb,
  Send,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";

const feedbackTypes = [
  { value: "bug", label: "Bug Report", icon: Bug },
  { value: "feature", label: "Feature Request", icon: Lightbulb },
  { value: "content", label: "Content Issue", icon: AlertCircle },
  { value: "other", label: "Other", icon: AlertCircle },
];

const severityLevels = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export function FeedbackPageClient() {
  const router = useRouter();
  const [type, setType] = useState("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    setIsSubmitting(false);
    setIsSubmitted(true);

    window.setTimeout(() => {
      router.back();
    }, 3000);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }

    setFile(selectedFile);
  };

  if (isSubmitted) {
    return (
      <div className="container mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="mb-2 text-2xl font-bold">Thank you</h1>
        <p className="mb-4 text-muted-foreground">
          We will review your feedback within 48 hours.
        </p>
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Feedback</h1>
        <p className="text-muted-foreground">
          Share a bug report, request, or product note so we can improve ATLAS.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Feedback Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {feedbackTypes.map((feedbackType) => {
                const Icon = feedbackType.icon;
                return (
                  <button
                    key={feedbackType.value}
                    type="button"
                    onClick={() => setType(feedbackType.value)}
                    className={`flex items-center gap-3 rounded-lg border p-4 transition-colors ${
                      type === feedbackType.value
                        ? "border-primary bg-primary/5"
                        : "hover:border-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{feedbackType.label}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Title</label>
              <Input
                placeholder="Brief description of the issue"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {title.length}/120 characters
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Description <span className="text-destructive">*</span>
              </label>
              <Textarea
                placeholder="Provide detailed information..."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-[150px]"
                required
                minLength={20}
              />
            </div>

            {type === "bug" ? (
              <div>
                <label className="mb-2 block text-sm font-medium">Severity</label>
                <div className="flex gap-2">
                  {severityLevels.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => setSeverity(level.value)}
                      className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                        severity === level.value
                          ? "border-primary bg-primary/5"
                          : "hover:border-muted-foreground"
                      }`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-medium">
                Screenshot (optional)
              </label>
              <div className="rounded-lg border-2 border-dashed p-6 text-center">
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="max-w-[200px] truncate text-sm">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="rounded p-1 hover:bg-muted"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="mb-2 text-sm text-muted-foreground">
                      Drag and drop or click to upload
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Images only, max 5MB
                    </p>
                    <input
                      id="file-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label htmlFor="file-upload">
                      <span className="mt-2 inline-block cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
                        Choose File
                      </span>
                    </label>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>Submitting...</>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Submit Feedback
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

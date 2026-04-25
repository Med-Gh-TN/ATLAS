"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, X, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { useSubmitContributionMutation } from "@/queries";

const FILIERES = [
  "Informatique",
  "Mathematiques",
  "Physique",
  "Chimie",
  "Biologie",
  "Economie",
  "Droit",
];

export default function ContributePage() {
  const router = useRouter();
  const uploadMutation = useSubmitContributionMutation();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [filiere, setFiliere] = useState("");
  const [courseType, setCourseType] = useState("Cours");
  const [error, setError] = useState("");

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
      }
    },
    [title],
  );

  const handleRemoveFile = () => {
    setFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    if (!title || !filiere) {
      setError("Please fill in all required fields");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("description", description);
    formData.append("filiere", filiere);
    formData.append("course_type", courseType);

    try {
      await uploadMutation.mutateAsync(formData);
      router.push("/my/contributions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contribute</h1>
        <p className="text-muted-foreground">
          Share your knowledge with the community
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Document</CardTitle>
                <CardDescription>
                  Share course materials, tutorials, or study guides
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                )}

                {file ? (
                  <div className="flex items-center gap-3 rounded-lg border p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
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
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-none"
                    placeholder="Describe the document..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Filiere <span className="text-destructive">*</span>
                    </label>
                    <select
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      value={filiere}
                      onChange={(e) => setFiliere(e.target.value)}
                      required
                    >
                      <option value="">Select filiere</option>
                      {FILIERES.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Type</label>
                    <select
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      value={courseType}
                      onChange={(e) => setCourseType(e.target.value)}
                    >
                      <option value="Cours">Course</option>
                      <option value="TD">TD (Tutorial)</option>
                      <option value="TP">TP (Lab)</option>
                      <option value="Examen">Exam</option>
                      <option value="Corrige">Solution</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              type="submit"
              className="w-full"
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Submit Contribution
                </>
              )}
            </Button>
          </form>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Guidelines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <p>Use clear, descriptive titles</p>
              </div>
              <div className="flex gap-2">
                <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <p>Include the correct filiere and level</p>
              </div>
              <div className="flex gap-2">
                <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <p>Supported formats: PDF, DOC, DOCX, PPT, PPTX</p>
              </div>
              <div className="flex gap-2">
                <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <p>Maximum file size: 50 MB</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reward Points</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">+50</p>
                <p className="text-sm text-muted-foreground">
                  XP per approved contribution
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

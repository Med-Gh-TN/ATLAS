"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X, Loader2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const MAGIC_BYTES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  doc: [0xd0, 0xcf, 0x11, 0xe0],
  docx: [0x50, 0x4b, 0x03, 0x04], // PK.. (ZIP archive format for Office Open XML)
  png: [0x89, 0x50, 0x4e, 0x47],
  jpg: [0xff, 0xd8, 0xff],
};

async function validateMagicBytes(file: File, types: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = (e) => {
      if (!e.target?.result) return resolve(false);
      const arr = new Uint8Array(e.target.result as ArrayBuffer).subarray(0, 4);
      let isValid = false;

      for (const type of types) {
        const magic = MAGIC_BYTES[type];
        if (!magic) {
          isValid = true; // if no magic byte defined, allow it to pass or we can strictly reject it. We will allow extensions without magic bytes for now.
          continue;
        }
        if (arr.length >= magic.length && magic.every((b, i) => b === arr[i])) {
          isValid = true;
          break;
        }
      }
      resolve(isValid);
    };
    reader.readAsArrayBuffer(file.slice(0, 4));
  });
}

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
  hint?: string;
}

export function FileDropzone({
  onFileSelect,
  accept = {
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      ".docx",
    ],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      [".pptx"],
  },
  maxSize = 50 * 1024 * 1024,
  disabled = false,
  className,
  label = "Drop your file here",
  hint = "PDF, DOCX, PPTX up to 50MB",
}: FileDropzoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [errorMsgs, setErrorMsgs] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[], fileRejections: any[]) => {
      setErrorMsgs(null);
      if (fileRejections.length > 0) {
        setErrorMsgs(`File is invalid or exceeds ${Math.round(maxSize / (1024 * 1024))}MB limit.`);
        return;
      }
      const file = acceptedFiles[0];
      if (file) {
        // Collect all accepted extensions to check against magic bytes
        const acceptedExts = Object.values(accept).flat().map(ext => ext.replace('.', '').toLowerCase());
        const validMagic = await validateMagicBytes(file, acceptedExts);

        if (!validMagic) {
          setErrorMsgs("Invalid file format detected (magic bytes mismatch).");
          return;
        }

        setSelectedFile(file);
        setIsSuccess(false);
        onFileSelect(file);
      }
    },
    [onFileSelect, accept, maxSize],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept,
      maxSize,
      disabled: disabled || isUploading,
      multiple: false,
    });

  const removeFile = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedFile(null);
    setIsSuccess(false);
    setErrorMsgs(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer",
        "hover:border-primary/50 hover:bg-primary/5",
        isDragActive && "border-primary bg-primary/10",
        isDragReject && "border-destructive bg-destructive/5",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <input {...getInputProps()} />

      {selectedFile ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isSuccess ? (
              <CheckCircle className="h-10 w-10 text-success" />
            ) : isUploading ? (
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            ) : (
              <File className="h-10 w-10 text-primary" />
            )}
            <div className="text-left">
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeFile();
            }}
            className="rounded-full p-1 hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              "rounded-full p-4",
              isDragReject || errorMsgs ? "bg-destructive/20" : isDragActive ? "bg-primary/20" : "bg-muted",
            )}
          >
            <Upload
              className={cn(
                "h-8 w-8",
                isDragReject || errorMsgs ? "text-destructive" : isDragActive ? "text-primary" : "text-muted-foreground",
              )}
            />
          </div>
          <div>
            <p className="font-medium">{errorMsgs || (isDragReject ? "File rejected" : label)}</p>
            <p className={cn("text-sm", errorMsgs || isDragReject ? "text-destructive" : "text-muted-foreground")}>{hint}</p>
          </div>
        </div>
      )}
    </div>
  );
}

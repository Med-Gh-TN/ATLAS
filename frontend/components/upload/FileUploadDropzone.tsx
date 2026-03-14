'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { UploadCloud, FileText, X, AlertCircle } from 'lucide-react';

export interface FileUploadDropzoneProps {
  onFileSelect: (file: File | null) => void;
  maxSizeMB?: number;
  acceptedTypes?: Record<string, string[]>;
  isUploading?: boolean; // US-06: Added to support progress state from parent
  uploadProgress?: number; // US-06: Added to support progress bar from parent
}

export default function FileUploadDropzone({
  onFileSelect,
  maxSizeMB = 50,
  acceptedTypes = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx']
  },
  isUploading = false,
  uploadProgress = 0
}: FileUploadDropzoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    setError(null);

    // 1. Strict Validation Handling (US-06)
    if (fileRejections.length > 0) {
      const rejection = fileRejections[0];
      const errorCode = rejection.errors[0]?.code;
      
      if (errorCode === 'file-too-large') {
        setError(`Le fichier est trop volumineux. La taille maximale est de ${maxSizeMB} MB.`);
      } else if (errorCode === 'file-invalid-type') {
        setError('Format non supporté. Veuillez uploader un PDF, DOCX, ou PPTX.');
      } else {
        setError(rejection.errors[0]?.message || 'Erreur lors de la sélection du fichier.');
      }
      return; // Stop execution on error
    }

    // 2. Successful File Selection
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [maxSizeMB, onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedTypes,
    maxSize: maxSizeBytes,
    maxFiles: 1,
    disabled: isUploading // Prevent drops while uploading
  });

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (isUploading) return; // Prevent removal during active upload
    setSelectedFile(null);
    onFileSelect(null);
    setError(null);
  };

  return (
    <div className="w-full">
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ease-in-out group
            ${isDragActive ? 'border-neutral-900 bg-neutral-50/80' : 'border-neutral-300 bg-white hover:bg-neutral-50 hover:border-neutral-400'}
            ${error ? 'border-red-300 bg-red-50/30' : ''}
            ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
            <div 
              className={`p-4 rounded-full mb-5 transition-all duration-300 
                ${isDragActive ? 'bg-neutral-900 text-white shadow-md scale-110' : 'bg-white text-neutral-400 shadow-[0_4px_20px_rgb(0,0,0,0.05)] group-hover:text-neutral-900 border border-neutral-100 group-hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]'}`}
            >
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="mb-2 text-sm text-neutral-900 font-medium">
              <span className="font-semibold underline decoration-neutral-300 underline-offset-4 group-hover:decoration-neutral-900 transition-colors">Cliquez pour uploader</span> ou glissez-déposez
            </p>
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mt-2">
              PDF, DOCX, ou PPTX (MAX. {maxSizeMB}MB)
            </p>
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col p-5 bg-white border border-neutral-100 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 bg-neutral-50 rounded-xl border border-neutral-100">
              <FileText className="w-5 h-5 text-neutral-600" />
            </div>
            <div className="ml-4 flex-1 min-w-0 pr-4">
              <p className="text-sm font-semibold text-neutral-900 truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5 font-medium">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            
            {!isUploading && (
              <button
                type="button"
                onClick={handleRemoveFile}
                className="flex-shrink-0 p-2.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
                aria-label="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* US-06: Inline Progress Bar UI */}
          {isUploading && (
            <div className="mt-4 w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-neutral-900 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Error Message Display */}
      {error && (
        <div className="mt-4 flex items-center gap-3 text-sm text-red-600 bg-red-50/50 p-4 rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      )}
    </div>
  );
}
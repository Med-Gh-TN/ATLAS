// frontend/components/upload/FileUploadDropzone.tsx

'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { UploadCloud, File, X, AlertCircle } from 'lucide-react';

export interface FileUploadDropzoneProps {
  onFileSelect: (file: File | null) => void;
  maxSizeMB?: number;
  // Default accepts PDF, DOCX, PPTX as per US-06
  acceptedTypes?: Record<string, string[]>;
}

export default function FileUploadDropzone({
  onFileSelect,
  maxSizeMB = 50,
  acceptedTypes = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx']
  }
}: FileUploadDropzoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    // Reset errors
    setError(null);

    // Handle rejections (wrong type, too large)
    if (fileRejections.length > 0) {
      const rejection = fileRejections[0];
      if (rejection.errors[0]?.code === 'file-too-large') {
        setError(`Le fichier est trop volumineux. La taille maximale est de ${maxSizeMB} MB.`);
      } else if (rejection.errors[0]?.code === 'file-invalid-type') {
        setError('Type de fichier non supporté. Veuillez uploader un PDF, DOCX ou PPTX.');
      } else {
        setError(rejection.errors[0]?.message || 'Erreur lors de la sélection du fichier.');
      }
      return;
    }

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
    maxFiles: 1, // We only allow one file per contribution upload
  });

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the dropzone click
    setSelectedFile(null);
    onFileSelect(null);
    setError(null);
  };

  return (
    <div className="w-full">
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ease-in-out bg-slate-50
            ${isDragActive ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:bg-slate-100 hover:border-slate-400'}
            ${error ? 'border-red-400 bg-red-50' : ''}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
            <div className={`p-4 rounded-full mb-4 ${isDragActive ? 'bg-blue-100 text-blue-600' : 'bg-white text-slate-400 shadow-sm'}`}>
              <UploadCloud className="w-8 h-8" />
            </div>
            <p className="mb-2 text-sm text-slate-700 font-semibold">
              <span className="text-blue-600">Cliquez pour uploader</span> ou glissez-déposez
            </p>
            <p className="text-xs text-slate-500">
              PDF, DOCX, ou PPTX (MAX. {maxSizeMB} MB)
            </p>
          </div>
        </div>
      ) : (
        <div className="relative flex items-center p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 bg-blue-50 rounded-lg border border-blue-100">
            <File className="w-6 h-6 text-blue-600" />
          </div>
          <div className="ml-4 flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-slate-500">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemoveFile}
            className="ml-4 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            aria-label="Remove file"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Error Message Display */}
      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
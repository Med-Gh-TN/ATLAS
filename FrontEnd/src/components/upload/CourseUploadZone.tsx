'use client';

// ============================================================================
// ATLAS - Course Upload Zone Component
// Author: Mouhamed (Lead FE)
// Description: Handles drag-and-drop file selection (PDF/DOCX/PPTX, <50MB),
// Zod-validated metadata collection, and multipart/form-data upload with 
// real-time progress tracking.
// ============================================================================

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { UploadCloud, File, X, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

import { apiClient } from '@/lib/api/axios.client';

// --- Localized Zod Schema for Metadata ---
const courseMetadataSchema = z.object({
  filiere: z.string().min(2, { message: "La filière est requise." }),
  niveau: z.string().min(2, { message: "Le niveau est requis (ex: L1, M2)." }),
  resourceType: z.enum(['COURS', 'TD', 'TP', 'EXAMEN'], {
    errorMap: () => ({ message: "Veuillez sélectionner un type valide." })
  }),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/, { message: "Format attendu: 2025-2026" }),
  language: z.enum(['FR', 'AR', 'EN'], {
    errorMap: () => ({ message: "Veuillez sélectionner une langue." })
  }),
});

type CourseMetadataInput = z.infer<typeof courseMetadataSchema>;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export default function CourseUploadZone() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 1. Initialize React Hook Form for Metadata
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourseMetadataInput>({
    resolver: zodResolver(courseMetadataSchema),
    defaultValues: {
      filiere: '',
      niveau: '',
      resourceType: 'COURS',
      academicYear: '2025-2026',
      language: 'FR',
    },
  });

  // 2. React Dropzone Setup (Strict validation)
  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setGlobalError(null);
    setSuccessMessage(null);
    setUploadProgress(0);

    if (fileRejections.length > 0) {
      const error = fileRejections[0].errors[0];
      if (error.code === 'file-too-large') {
        setGlobalError('Le fichier dépasse la limite de 50 MB.');
      } else if (error.code === 'file-invalid-type') {
        setGlobalError('Format invalide. Seuls les PDF, DOCX et PPTX sont acceptés.');
      } else {
        setGlobalError('Erreur lors de la sélection du fichier.');
      }
      return;
    }

    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    },
    maxSize: MAX_FILE_SIZE,
    maxFiles: 1,
    multiple: false,
  });

  // 3. Upload Mutation with Progress Tracking
  const uploadMutation = useMutation({
    mutationFn: async (data: CourseMetadataInput) => {
      if (!selectedFile) throw new Error("Aucun fichier sélectionné.");

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('filiere', data.filiere);
      formData.append('niveau', data.niveau);
      formData.append('resourceType', data.resourceType);
      formData.append('academicYear', data.academicYear);
      formData.append('language', data.language);

      const response = await apiClient.post('/courses/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        },
      });
      return response.data;
    },
    onSuccess: () => {
      setGlobalError(null);
      setSuccessMessage('Le cours a été uploadé et indexé avec succès !');
      setSelectedFile(null);
      setUploadProgress(0);
      reset(); // Reset form fields
    },
    onError: (error: any) => {
      console.error('[Upload Error]', error);
      // Handles duplicate detection from backend
      const message = error.response?.data?.message || 'Erreur lors de l\'upload du fichier.';
      setGlobalError(message);
      setUploadProgress(0);
    },
  });

  const onSubmit = (data: CourseMetadataInput) => {
    if (!selectedFile) {
      setGlobalError("Veuillez sélectionner un fichier avant de valider.");
      return;
    }
    uploadMutation.mutate(data);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setGlobalError(null);
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-6 space-y-8 bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Nouveau Cours</h2>
        <p className="text-sm text-gray-500">
          Uploadez un document officiel. Les métadonnées permettront à l'IA de mieux l'indexer.
        </p>
      </div>

      {/* Alerts */}
      {globalError && (
        <div className="flex items-center p-4 text-sm font-medium text-red-800 bg-red-50 rounded-lg border border-red-200">
          <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" />
          {globalError}
        </div>
      )}
      {successMessage && (
        <div className="flex items-center p-4 text-sm font-medium text-green-800 bg-green-50 rounded-lg border border-green-200">
          <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Step 1: File Dropzone */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-900 block">Fichier du cours</label>
          
          {!selectedFile ? (
            <div
              {...getRootProps()}
              className={`relative flex flex-col items-center justify-center w-full h-48 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud className={`w-10 h-10 mb-3 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
              <p className="text-sm font-medium text-gray-700">
                {isDragActive ? 'Déposez ici...' : 'Glissez un fichier PDF, DOCX ou PPTX ici'}
              </p>
              <p className="mt-1 text-xs text-gray-500">Max 50 MB</p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-3 overflow-hidden">
                <File className="w-8 h-8 text-blue-600 flex-shrink-0" />
                <div className="truncate">
                  <p className="text-sm font-semibold text-gray-900 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
              </div>
              {!uploadMutation.isPending && (
                <button
                  type="button"
                  onClick={clearFile}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Metadata Form */}
        <div className="space-y-4 pt-4 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Métadonnées du document</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Filière</label>
              <input
                type="text"
                placeholder="ex: Informatique"
                {...register('filiere')}
                disabled={uploadMutation.isPending}
                className="flex h-10 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none disabled:opacity-50"
              />
              {errors.filiere && <p className="text-xs text-red-500">{errors.filiere.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Niveau</label>
              <input
                type="text"
                placeholder="ex: L1, M2"
                {...register('niveau')}
                disabled={uploadMutation.isPending}
                className="flex h-10 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none disabled:opacity-50"
              />
              {errors.niveau && <p className="text-xs text-red-500">{errors.niveau.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Type de ressource</label>
              <select
                {...register('resourceType')}
                disabled={uploadMutation.isPending}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none disabled:opacity-50"
              >
                <option value="COURS">Cours Magistral</option>
                <option value="TD">Travaux Dirigés (TD)</option>
                <option value="TP">Travaux Pratiques (TP)</option>
                <option value="EXAMEN">Examen / QCM</option>
              </select>
              {errors.resourceType && <p className="text-xs text-red-500">{errors.resourceType.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Année</label>
                <input
                  type="text"
                  placeholder="2025-2026"
                  {...register('academicYear')}
                  disabled={uploadMutation.isPending}
                  className="flex h-10 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none disabled:opacity-50"
                />
                {errors.academicYear && <p className="text-xs text-red-500">{errors.academicYear.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Langue</label>
                <select
                  {...register('language')}
                  disabled={uploadMutation.isPending}
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-600 outline-none disabled:opacity-50"
                >
                  <option value="FR">Français</option>
                  <option value="AR">Arabe</option>
                  <option value="EN">Anglais</option>
                </select>
                {errors.language && <p className="text-xs text-red-500">{errors.language.message}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar UI */}
        {uploadMutation.isPending && uploadProgress > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-gray-700">
              <span>Transfert en cours...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!selectedFile || uploadMutation.isPending}
          className="inline-flex items-center justify-center w-full h-10 px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Traitement IA en cours...
            </>
          ) : (
            'Uploader et Indexer le document'
          )}
        </button>
      </form>
    </div>
  );
}
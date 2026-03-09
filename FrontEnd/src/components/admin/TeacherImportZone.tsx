'use client';

// ============================================================================
// ATLAS - Admin Teacher CSV Import Component
// Author: Mouhamed (Lead FE)
// Description: Drag-and-drop zone for CSV files, client-side preview of rows,
// and multipart/form-data upload to backend for batch teacher creation.
// ============================================================================

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation } from '@tanstack/react-query';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, XCircle, Loader2, X } from 'lucide-react';

import { apiClient } from '@/lib/api/axios.client';

interface ImportReport {
  successCount: number;
  failureCount: number;
  duplicateCount: number;
  errors?: string[];
}

export default function TeacherImportZone() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // 1. CSV Preview Logic (Native FileReader, no heavy libraries)
  const generatePreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        // Split by newlines, take first 6 lines (1 header + 5 data rows)
        const lines = text.split('\n').slice(0, 6);
        // Split each line by comma or semicolon (common CSV delimiters)
        const parsedRows = lines.map(line => line.split(/[,;]/));
        setCsvPreview(parsedRows);
      }
    };
    reader.readAsText(file);
  };

  // 2. React Dropzone Setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setGlobalError(null);
    setReport(null);
    
    const file = acceptedFiles[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        setGlobalError('Format de fichier invalide. Veuillez importer un fichier .csv.');
        return;
      }
      setSelectedFile(file);
      generatePreview(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    multiple: false,
  });

  // 3. Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      // The backend expects multipart/form-data
      const response = await apiClient.post<ImportReport>('/admin/teachers/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    onSuccess: (data) => {
      setReport(data);
      // Keep the report visible but clear the file so they can upload another
      setSelectedFile(null);
      setCsvPreview([]);
    },
    onError: (error: any) => {
      console.error('[CSV Import Error]', error);
      setGlobalError(
        error.response?.data?.message || 'Erreur critique lors de l\'importation du fichier.'
      );
    },
  });

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setCsvPreview([]);
    setGlobalError(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-8 bg-white rounded-xl shadow-sm border border-gray-200">
      
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Importation des Enseignants</h2>
        <p className="text-sm text-gray-500">
          Glissez-déposez un fichier CSV contenant les colonnes : <code>prenom, nom, email, departement</code>
        </p>
      </div>

      {/* Error Banner */}
      {globalError && (
        <div className="flex items-center p-4 text-sm font-medium text-red-800 bg-red-50 rounded-lg border border-red-200">
          <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" />
          {globalError}
        </div>
      )}

      {/* Step 1: Dropzone (Hidden if file is selected to keep UI clean) */}
      {!selectedFile && !report && (
        <div
          {...getRootProps()}
          className={`relative flex flex-col items-center justify-center w-full h-64 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
          }`}
        >
          <input {...getInputProps()} />
          <UploadCloud className={`w-12 h-12 mb-4 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
          <p className="text-sm font-medium text-gray-700">
            {isDragActive ? 'Déposez le fichier ici...' : 'Cliquez ou glissez un fichier CSV ici'}
          </p>
          <p className="mt-1 text-xs text-gray-500">Taille maximale : 5 MB</p>
        </div>
      )}

      {/* Step 2: File Preview & Action */}
      {selectedFile && !report && (
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">{selectedFile.name}</p>
                <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(2)} KB</p>
              </div>
            </div>
            <button
              onClick={clearSelection}
              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
              title="Retirer le fichier"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Data Preview Table */}
          {csvPreview.length > 0 && (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {csvPreview[0].map((header, idx) => (
                      <th key={idx} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {csvPreview.slice(1).map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-gray-50 px-6 py-2 text-xs text-gray-500 border-t border-gray-200">
                Aperçu des 5 premières lignes seulement.
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-4">
            <button
              onClick={clearSelection}
              disabled={uploadMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Traitement en cours...
                </>
              ) : (
                'Confirmer l\'import'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Import Report */}
      {report && (
        <div className="p-6 bg-white border border-gray-200 rounded-xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <h3 className="text-xl font-bold text-gray-900">Rapport d'importation</h3>
            <p className="text-sm text-gray-500">Le traitement du fichier CSV est terminé.</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-center">
              <p className="text-sm font-medium text-green-800 mb-1">Succès</p>
              <p className="text-3xl font-bold text-green-600">{report.successCount}</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 text-center">
              <p className="text-sm font-medium text-amber-800 mb-1">Doublons</p>
              <p className="text-3xl font-bold text-amber-600">{report.duplicateCount}</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-100 text-center">
              <p className="text-sm font-medium text-red-800 mb-1">Échecs</p>
              <p className="text-3xl font-bold text-red-600">{report.failureCount}</p>
            </div>
          </div>

          {report.errors && report.errors.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
              <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center">
                <XCircle className="w-4 h-4 mr-2" /> Détails des erreurs
              </h4>
              <ul className="list-disc list-inside text-xs text-red-700 space-y-1">
                {report.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-center pt-4">
            <button
              onClick={() => setReport(null)}
              className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
            >
              Importer un autre fichier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
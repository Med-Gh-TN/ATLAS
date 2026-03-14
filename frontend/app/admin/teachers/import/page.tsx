"use client";

import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import api from '@/lib/api'; // Inherits the secure Axios instance with interceptors

// --- Strict Typings matching Backend US-05 Schema ---
interface ImportErrorDetail {
  row: number;
  email: string;
  reason: string;
}

interface ImportDuplicateDetail {
  row: number;
  email: string;
}

interface ImportReportResponse {
  success_count: number;
  errors: ImportErrorDetail[];
  duplicates: ImportDuplicateDetail[];
}

export default function TeacherImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [report, setReport] = useState<ImportReportResponse | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- File Handling & Zero-Cost Client-Side Parsing ---
  const processFile = (selectedFile: File) => {
    setGlobalError(null);
    setReport(null);

    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      setGlobalError('Strict File Type Violation: Only .csv files are permitted.');
      setFile(null);
      setPreviewHeaders([]);
      setPreviewRows([]);
      return;
    }

    setFile(selectedFile);

    // Read file locally to generate a preview without server overhead
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        // Basic zero-dependency CSV parsing (handles standard formatting)
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length > 0) {
          const headers = lines[0].split(',').map(h => h.trim());
          // Preview maximum of 5 rows for performance
          const rows = lines.slice(1, 6).map(line => line.split(',').map(c => c.trim()));
          
          setPreviewHeaders(headers);
          setPreviewRows(rows);
        }
      }
    };
    reader.onerror = () => setGlobalError('Failed to read file locally.');
    reader.readAsText(selectedFile);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  // --- API Submission ---
  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setGlobalError(null);
    setReport(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // API payload dispatch via configured Axios instance
      // Assuming backend admin router is prefixed with /admin
      const response = await api.post<ImportReportResponse>('/admin/teachers/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setReport(response.data);
    } catch (error: any) {
      if (error.response && error.response.data && error.response.data.detail) {
        setGlobalError(`Server Error: ${error.response.data.detail}`);
      } else {
        setGlobalError('Network Error: Failed to communicate with the server.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teacher Onboarding Import</h1>
        <p className="text-gray-600 mt-2">
          Upload a CSV file to batch invite teachers. Required columns: <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">email</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">full_name</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">department_name</code>.
        </p>
      </div>

      {/* Dropzone */}
      <div 
        className="border-2 border-dashed border-gray-300 rounded-lg p-10 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          accept=".csv" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={onFileChange} 
        />
        <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-gray-700 font-medium">Click to upload or drag and drop</p>
        <p className="text-gray-500 text-sm mt-1">CSV files only</p>
      </div>

      {globalError && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-md">
          {globalError}
        </div>
      )}

      {/* CSV Preview Section */}
      {file && !report && !globalError && (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
            <div>
              <h3 className="font-semibold text-gray-800">File Preview: {file.name}</h3>
              <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); handleUpload(); }}
              disabled={isUploading}
              className={`px-4 py-2 rounded-md text-white font-medium transition-colors ${isUploading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {isUploading ? 'Processing...' : 'Confirm & Import'}
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {previewHeaders.map((header, idx) => (
                    <th key={idx} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {previewRows.map((row, rowIdx) => (
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
            {previewRows.length === 5 && (
              <p className="text-center text-sm text-gray-500 py-3 italic">Previewing first 5 rows...</p>
            )}
          </div>
        </div>
      )}

      {/* Results Report Section */}
      {report && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 p-6 rounded-lg border border-green-200 text-center">
              <div className="text-3xl font-bold text-green-700">{report.success_count}</div>
              <div className="text-sm font-medium text-green-800 mt-1">Successfully Invited</div>
            </div>
            <div className="bg-red-50 p-6 rounded-lg border border-red-200 text-center">
              <div className="text-3xl font-bold text-red-700">{report.errors.length}</div>
              <div className="text-sm font-medium text-red-800 mt-1">Failed Rows</div>
            </div>
            <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200 text-center">
              <div className="text-3xl font-bold text-yellow-700">{report.duplicates.length}</div>
              <div className="text-sm font-medium text-yellow-800 mt-1">Duplicates Skipped</div>
            </div>
          </div>

          {report.errors.length > 0 && (
            <div className="bg-white border border-red-200 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-red-50 px-6 py-3 border-b border-red-200">
                <h3 className="font-semibold text-red-800">Error Details</h3>
              </div>
              <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
                {report.errors.map((err, idx) => (
                  <li key={idx} className="px-6 py-3 text-sm">
                    <span className="font-medium text-gray-900">Row {err.row}:</span> 
                    <span className="text-gray-600 ml-2">{err.email}</span>
                    <span className="text-red-600 ml-4 block sm:inline">- {err.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.duplicates.length > 0 && (
            <div className="bg-white border border-yellow-200 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-yellow-50 px-6 py-3 border-b border-yellow-200">
                <h3 className="font-semibold text-yellow-800">Duplicates Detected</h3>
              </div>
              <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
                {report.duplicates.map((dup, idx) => (
                  <li key={idx} className="px-6 py-3 text-sm">
                    <span className="font-medium text-gray-900">Row {dup.row}:</span> 
                    <span className="text-gray-600 ml-2">{dup.email}</span>
                    <span className="text-yellow-600 ml-4 italic block sm:inline">- Already exists in system</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="flex justify-end">
            <button 
              onClick={() => { setFile(null); setReport(null); }}
              className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300 transition-colors"
            >
              Upload Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
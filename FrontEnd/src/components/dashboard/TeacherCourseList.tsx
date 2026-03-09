'use client';

// ============================================================================
// ATLAS - Teacher Course List Component
// Author: Mouhamed (Lead FE)
// Description: Fetches and displays the logged-in teacher's uploaded courses,
// including real-time AI pipeline statuses and versioning actions (US-06).
// ============================================================================

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Clock, CheckCircle, AlertTriangle, RotateCw, Plus } from 'lucide-react';

import { apiClient } from '@/lib/api/axios.client';

// Define the expected structure from Tony's backend
export type PipelineStatus = 'PENDING' | 'PROCESSING' | 'INDEXED' | 'FAILED';

export interface CourseData {
  id: string;
  originalFileName: string;
  filiere: string;
  niveau: string;
  versionNumber: number;
  status: PipelineStatus;
  createdAt: string;
}

export default function TeacherCourseList() {
  // Fetch courses specific to the authenticated teacher
  const { data: courses, isLoading, isError, refetch } = useQuery({
    queryKey: ['teacher-courses'],
    queryFn: async () => {
      const response = await apiClient.get<CourseData[]>('/teacher/courses');
      return response.data;
    },
  });

  // Helper to render beautiful Tailwind badges based on AI pipeline status
  const renderStatusBadge = (status: PipelineStatus) => {
    switch (status) {
      case 'PENDING':
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 mr-1 animate-pulse" /> Traitement IA...
          </span>
        );
      case 'INDEXED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" /> Indexé
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            <AlertTriangle className="w-3 h-3 mr-1" /> Échec OCR
          </span>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(dateString));
  };

  if (isLoading) {
    return (
      <div className="w-full p-8 text-center bg-white rounded-xl shadow-sm border border-gray-200 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mx-auto mb-4"></div>
        <div className="h-10 bg-gray-100 rounded w-full mb-2"></div>
        <div className="h-10 bg-gray-100 rounded w-full mb-2"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full p-6 text-center bg-red-50 rounded-xl border border-red-200">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-700">Impossible de charger vos cours. Veuillez réessayer.</p>
        <button onClick={() => refetch()} className="mt-3 text-sm font-medium text-red-600 hover:underline">
          Actualiser
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-blue-600" /> Mes Cours
          </h3>
          <p className="text-sm text-gray-500 mt-1">Gérez vos documents officiels et suivez l'indexation IA.</p>
        </div>
        <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Actualiser la liste">
          <RotateCw className="w-5 h-5" />
        </button>
      </div>

      {courses?.length === 0 ? (
        <div className="p-8 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Vous n'avez pas encore uploadé de cours.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-100 text-xs uppercase text-gray-500">
                <th className="px-6 py-4 font-semibold">Document</th>
                <th className="px-6 py-4 font-semibold">Filière / Niveau</th>
                <th className="px-6 py-4 font-semibold">Version</th>
                <th className="px-6 py-4 font-semibold">Statut IA</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {courses?.map((course) => (
                <tr key={course.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                      {course.originalFileName}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDate(course.createdAt)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-700">{course.filiere}</span>
                    <span className="mx-2 text-gray-300">|</span>
                    <span className="text-sm text-gray-700">{course.niveau}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-blue-50 text-blue-700 border border-blue-100">
                      v{course.versionNumber}.0
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {renderStatusBadge(course.status)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {/* US-06 Requirement: "Nouvelle version" button */}
                    <button className="inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md border border-blue-100">
                      <Plus className="w-3 h-3 mr-1" /> Nv. Version
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
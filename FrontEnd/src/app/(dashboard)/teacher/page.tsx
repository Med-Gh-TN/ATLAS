import React from 'react';
import CourseUploadZone from '@/components/upload/CourseUploadZone';
import TeacherCourseList from '@/components/dashboard/TeacherCourseList';
import { ShieldCheck } from 'lucide-react';

// ============================================================================
// ATLAS - Teacher Dashboard Page
// Author: Mouhamed (Lead FE)
// Description: The main hub for teachers. Combines the MVP Upload Pipeline 
// (US-06) with the historical list of their courses.
// URL: http://localhost:3000/teacher
// ============================================================================

export default function TeacherDashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Teacher Dashboard Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-6 sm:px-6 lg:px-8 mb-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              Espace Enseignant
              {/* US-05 Requirement: Verified Badge displayed on their profile area */}
              <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                <ShieldCheck className="w-3 h-3 mr-1" /> Vérifié
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Publiez vos documents officiels. L'IA d'ATLAS se charge de l'OCR et de l'indexation.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Top Section: The Upload Zone */}
        <section aria-labelledby="upload-section">
          <CourseUploadZone />
        </section>

        {/* Bottom Section: The List of Courses */}
        <section aria-labelledby="list-section">
          <TeacherCourseList />
        </section>

      </div>
    </div>
  );
}
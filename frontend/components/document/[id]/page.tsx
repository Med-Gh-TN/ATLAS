'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Archive, ChevronDown, ChevronUp, AlertCircle, Loader2, BookOpen } from 'lucide-react';

// Adjust these imports based on your exact path aliases (e.g., '@/components/...' or '../../components/...')
import VersionTimeline from '@/components/document/VersionTimeline';
import type { CourseVersion } from '@/types/api';

// Mapped from your project tree: ATLAS-main/frontend/components/document/PdfViewer.tsx
// import PdfViewer from '@/components/document/PdfViewer';

export default function DocumentPage() {
  const params = useParams();
  const courseId = params.id as string;

  // --- State Management ---
  const [versions, setVersions] = useState<CourseVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // US-12: Archives Accordion State (Collapsed by default)
  const [isArchivesOpen, setIsArchivesOpen] = useState(false);
  const [archivedYears, setArchivedYears] = useState<any[]>([]); // To be typed when archive API is built

  // --- Data Fetching ---
  useEffect(() => {
    if (!courseId) return;

    const fetchCourseData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch Versions (Step 2 Endpoint)
        // Replace with your standard axios/fetch wrapper from frontend/lib/api.ts
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/courses/${courseId}/versions`);
        
        if (!res.ok) {
          throw new Error('Failed to fetch version history');
        }

        const data: CourseVersion[] = await res.json();
        setVersions(data);

        // Auto-select the most recent version (highest version_number)
        if (data.length > 0) {
          const sorted = [...data].sort((a, b) => b.version_number - a.version_number);
          setCurrentVersionId(sorted[0].version_id);
        }

        // TODO: Fetch Archived Years (Années Précédentes)
        // const archiveRes = await fetch(`/api/v1/courses/${courseId}/archives`);
        // setArchivedYears(await archiveRes.json());

      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCourseData();
  }, [courseId]);

  // --- Handlers ---
  const handleVersionSelect = (versionId: string) => {
    setCurrentVersionId(versionId);
    // Here you would also update the PdfViewer to load the specific version's file
  };

  const toggleArchives = () => {
    setIsArchivesOpen((prev) => !prev);
  };

  // --- Render States ---
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50">
        <Loader2 className="w-10 h-10 text-neutral-900 animate-spin mb-4" />
        <p className="text-sm font-medium text-neutral-600">Chargement du document et de l'historique...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl flex flex-col items-center max-w-md text-center">
          <AlertCircle className="w-10 h-10 mb-4 text-red-500" />
          <h2 className="text-lg font-bold mb-2">Erreur de chargement</h2>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6 lg:p-8">
      {/* Page Header Placeholder */}
      <div className="mb-8 flex items-center gap-3">
        <BookOpen className="w-8 h-8 text-neutral-900" />
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Détails du Cours</h1>
          <p className="text-sm text-neutral-500">ID: {courseId}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
        
        {/* Left Column: Document Viewer (2/3 width) */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <div className="bg-neutral-200 border border-neutral-300 rounded-2xl h-[800px] flex items-center justify-center shadow-inner">
            {/* Integrate your actual PDF Viewer here. 
              Pass the currently selected version's storage path or URL to it.
              <PdfViewer versionId={currentVersionId} /> 
            */}
            <p className="text-neutral-500 font-medium flex flex-col items-center">
              <BookOpen className="w-12 h-12 mb-4 text-neutral-400" />
              Visionneuse PDF (Version Actuelle: {versions.find(v => v.version_id === currentVersionId)?.version_number})
            </p>
          </div>
        </div>

        {/* Right Column: Sidebar (1/3 width) */}
        <div className="col-span-1 space-y-8">
          
          {/* US-12: Version Timeline */}
          {currentVersionId && (
            <VersionTimeline 
              versions={versions} 
              currentVersionId={currentVersionId} 
              onVersionSelect={handleVersionSelect} 
            />
          )}

          {/* US-12: Archives Accordion (Années Précédentes) */}
          <div className="bg-white border border-neutral-100 rounded-2xl p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all">
            <button 
              onClick={toggleArchives}
              className="w-full flex items-center justify-between focus:outline-none group"
            >
              <div className="flex items-center gap-2.5">
                <Archive className="w-5 h-5 text-neutral-900 group-hover:text-blue-600 transition-colors" />
                <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                  Archives
                </h3>
              </div>
              {isArchivesOpen ? (
                <ChevronUp className="w-5 h-5 text-neutral-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-neutral-500" />
              )}
            </button>

            {/* Accordion Content */}
            {isArchivesOpen && (
              <div className="mt-6 pt-6 border-t border-neutral-100 space-y-4">
                <p className="text-xs text-neutral-500 mb-4">
                  Versions du cours des années universitaires précédentes.
                </p>
                
                {archivedYears.length === 0 ? (
                  <div className="bg-neutral-50 border border-dashed border-neutral-200 rounded-xl p-4 text-center text-xs text-neutral-500">
                    Aucune archive trouvée pour ce cours.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Placeholder for mapping actual archived courses */}
                    {archivedYears.map((archive, i) => (
                      <div key={i} className="flex items-center justify-between p-3 border border-neutral-100 rounded-lg hover:border-neutral-300 cursor-pointer transition-colors">
                        <span className="text-sm font-semibold text-neutral-700">{archive.academic_year}</span>
                        <span className="text-xs text-neutral-400">Voir &rarr;</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
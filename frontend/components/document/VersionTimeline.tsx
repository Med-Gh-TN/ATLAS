'use client';

import React from 'react';
import { History, FileText, Clock, CheckCircle2, Loader2, User as UserIcon, ArrowRight, Star, Globe } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import type { CourseVersion } from '@/types/api';

// ARCHITECTURE FIX: Relaxed the strict type constraint for uploader since it's frequently omitted by the backend
// Added explicit optional typing for language and quality_score to support metadata diffing safely.
export interface ExtendedCourseVersion extends Omit<CourseVersion, 'uploader'> {
  uploader?: {
    name?: string;
    id?: string;
  };
  language?: string;
  quality_score?: number;
}

export interface VersionTimelineProps {
  versions: ExtendedCourseVersion[];
  currentVersionId: string;
  onVersionSelect: (versionId: string) => void;
}

export default function VersionTimeline({
  versions,
  currentVersionId,
  onVersionSelect,
}: VersionTimelineProps) {
  
  // US-12 requirement: Badge "Nouveau" if uploaded in the last 14 days using date-fns
  const isNew = (dateString: string | undefined) => {
    if (!dateString) return false;
    const uploadDate = new Date(dateString);
    const now = new Date();
    // Defensive check to ensure valid dates
    if (isNaN(uploadDate.getTime())) return false;
    return differenceInDays(now, uploadDate) < 14;
  };

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return '0.00 MB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Date inconnue';
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  // Sort versions descending (newest first)
  const sortedVersions = [...versions].sort((a, b) => b.version_number - a.version_number);

  // Helper to calculate size diff between current and previous version
  const getSizeDiffText = (currentSize: number | undefined, prevSize: number | undefined) => {
    if (currentSize === undefined || prevSize === undefined) return null;
    const diffBytes = currentSize - prevSize;
    if (diffBytes === 0) return null;
    
    const sign = diffBytes > 0 ? '+' : '';
    const diffMB = (diffBytes / (1024 * 1024)).toFixed(2);
    // Increased size is a warning (red), decreased size is optimization (green)
    const colorClass = diffBytes > 0 ? 'text-red-500' : 'text-green-500';
    
    return <span className={`ml-2 text-[10px] font-bold ${colorClass}`}>({sign}{diffMB} MB)</span>;
  };

  // Helper to calculate quality score diff
  const getScoreDiffText = (currentScore: number | undefined, prevScore: number | undefined) => {
    if (currentScore === undefined || prevScore === undefined) return null;
    const diff = currentScore - prevScore;
    if (diff === 0) return null;

    const sign = diff > 0 ? '+' : '';
    // Increased quality is good (green), decreased is bad (red)
    const colorClass = diff > 0 ? 'text-green-500' : 'text-red-500';

    return <span className={`ml-2 text-[10px] font-bold ${colorClass}`}>({sign}{diff.toFixed(1)})</span>;
  };

  // Helper to calculate language diff
  const getLanguageDiffText = (currentLang: string | undefined, prevLang: string | undefined) => {
    if (!currentLang || !prevLang || currentLang === prevLang) return null;
    return <span className="ml-2 text-[10px] font-bold text-amber-600">(précédemment {prevLang})</span>;
  };

  if (!versions || versions.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-neutral-100 rounded-2xl p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="flex items-center gap-2.5 mb-8">
        <History className="w-5 h-5 text-neutral-900" />
        <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">Historique des versions</h3>
      </div>

      <div className="relative border-l-2 border-neutral-100 ml-3 space-y-8">
        {sortedVersions.map((version, index) => {
          const isCurrent = version.version_id === currentVersionId || version.id === currentVersionId; // Backend drift coverage
          const isLatest = index === 0;
          // Get the next oldest version in the sorted array for diffing
          const prevVersion = sortedVersions[index + 1];

          // ARCHITECTURE FIX: Fallback logic for missing uploader metadata
          const uploaderName = version.uploader?.name || 'Système ATLAS';

          return (
            <div key={version.version_id || version.id || index} className="relative pl-7 group">
              {/* Timeline Dot */}
              <span className={`absolute -left-[11px] top-1.5 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white transition-colors duration-200 ${
                isCurrent ? 'bg-neutral-900' : 'bg-neutral-200 group-hover:bg-neutral-400'
              }`}>
                {isCurrent && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>

              {/* Version Card */}
              <div 
                className={`flex flex-col p-5 rounded-xl border transition-all duration-200 ${
                  isCurrent 
                    ? 'border-neutral-900 bg-neutral-50 shadow-sm' 
                    : 'border-neutral-100 bg-white hover:border-neutral-300 hover:shadow-sm cursor-pointer'
                }`}
                onClick={() => !isCurrent && onVersionSelect(version.version_id || version.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`font-bold text-sm ${isCurrent ? 'text-neutral-900' : 'text-neutral-700'}`}>
                      Version {version.version_number}
                    </span>
                    {isLatest && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white bg-neutral-900 rounded-full">
                        Actuelle
                      </span>
                    )}
                    {isNew(version.uploaded_at || version.created_at) && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
                        Nouveau
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 text-xs text-neutral-500 font-medium">
                  {/* Uploader Info */}
                  <div className="flex items-center gap-2">
                    <UserIcon className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Uploadé par {uploaderName}</span>
                  </div>
                  
                  {/* Date Info */}
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Le {formatDate(version.uploaded_at || version.created_at)}</span>
                  </div>
                  
                  {/* US-12: Size Diffing */}
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-neutral-400" />
                    <span>
                      Taille: {formatFileSize(version.file_size_bytes)}
                      {getSizeDiffText(version.file_size_bytes, prevVersion?.file_size_bytes)}
                    </span>
                  </div>

                  {/* US-12: Quality Score Diffing (Conditional Render) */}
                  {version.quality_score !== undefined && (
                    <div className="flex items-center gap-2">
                      <Star className="w-3.5 h-3.5 text-neutral-400" />
                      <span>
                        Qualité: {version.quality_score}/10
                        {getScoreDiffText(version.quality_score, prevVersion?.quality_score)}
                      </span>
                    </div>
                  )}

                  {/* US-12: Language Diffing (Conditional Render) */}
                  {version.language && (
                    <div className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-neutral-400" />
                      <span className="uppercase">
                        Langue: {version.language}
                        {getLanguageDiffText(version.language, prevVersion?.language)}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 mt-1">
                    {version.pipeline_status === 'READY' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-neutral-900" />
                        <span className="text-neutral-900 font-semibold">Indexé (Recherchable)</span>
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-3.5 h-3.5 text-neutral-400 animate-spin" />
                        <span>Traitement IA en cours...</span>
                      </>
                    )}
                  </div>
                </div>
                
                {!isCurrent && (
                  <div className="mt-4 text-xs font-semibold text-neutral-900 hover:underline inline-flex items-center gap-1 w-fit">
                    Voir cette version <ArrowRight className="w-3 h-3" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
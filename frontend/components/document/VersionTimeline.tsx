// frontend/components/document/VersionTimeline.tsx

'use client';

import React from 'react';
import { History, FileBadge, Clock, CheckCircle } from 'lucide-react';
import type { DocumentVersion } from '../../types/api';

export interface VersionTimelineProps {
  versions: DocumentVersion[];
  currentVersionId: string;
  onVersionSelect: (versionId: string) => void;
}

export default function VersionTimeline({
  versions,
  currentVersionId,
  onVersionSelect,
}: VersionTimelineProps) {
  
  // US-12 requirement: Badge "Nouveau" if uploaded in the last 14 days
  const isNew = (dateString: string) => {
    const uploadDate = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - uploadDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays <= 14;
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  };

  // Sort versions descending (newest first)
  const sortedVersions = [...versions].sort((a, b) => b.version_number - a.version_number);

  if (!versions || versions.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <History className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-bold text-slate-900">Historique des versions</h3>
      </div>

      <div className="relative border-l-2 border-slate-100 ml-3 space-y-8">
        {sortedVersions.map((version, index) => {
          const isCurrent = version.id === currentVersionId;
          const isLatest = index === 0;

          return (
            <div key={version.id} className="relative pl-6">
              {/* Timeline Dot */}
              <span className={`absolute -left-[11px] top-1 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${
                isCurrent ? 'bg-blue-600' : 'bg-slate-300'
              }`}>
                {isCurrent && <div className="h-2 w-2 rounded-full bg-white" />}
              </span>

              {/* Version Card */}
              <div 
                className={`flex flex-col p-4 rounded-lg border transition-all ${
                  isCurrent 
                    ? 'border-blue-200 bg-blue-50/50 shadow-sm' 
                    : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
                }`}
                onClick={() => !isCurrent && onVersionSelect(version.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${isCurrent ? 'text-blue-900' : 'text-slate-700'}`}>
                      Version {version.version_number}
                    </span>
                    {isLatest && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 rounded-full">
                        Actuelle
                      </span>
                    )}
                    {isNew(version.uploaded_at) && !isLatest && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 rounded-full">
                        Nouveau
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Uploadé le {formatDate(version.uploaded_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FileBadge className="w-3.5 h-3.5" />
                    <span>Taille : {formatFileSize(version.file_size_bytes)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <CheckCircle className={`w-3.5 h-3.5 ${version.pipeline_status === 'READY' ? 'text-emerald-500' : 'text-amber-500'}`} />
                    <span className="font-medium">
                      Statut: {version.pipeline_status === 'READY' ? 'Indexé (Recherche)' : 'En traitement'}
                    </span>
                  </div>
                </div>
                
                {!isCurrent && (
                  <div className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                    Consulter cette version &rarr;
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
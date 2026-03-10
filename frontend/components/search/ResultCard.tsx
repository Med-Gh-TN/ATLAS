// frontend/components/search/ResultCard.tsx

'use client';

import React from 'react';
import { FileText, BadgeCheck, Activity, Tag, ChevronRight, User } from 'lucide-react';

export interface ResultCardProps {
  documentVersionId: string;
  title: string;
  teacherName?: string;
  isOfficial?: boolean;
  qualityScore?: number; // OCR quality score (0-100)
  relevanceScore?: number; // Semantic matching score (0-100)
  snippet?: string;
  tags?: string[];
  onPreview: (id: string) => void;
}

export default function ResultCard({
  documentVersionId,
  title,
  teacherName = "Étudiant Contributeur",
  isOfficial = false,
  qualityScore,
  relevanceScore,
  snippet,
  tags = [],
  onPreview,
}: ResultCardProps) {
  return (
    <div 
      className="group bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row gap-4 items-start"
      onClick={() => onPreview(documentVersionId)}
    >
      {/* Icon & Format indicator */}
      <div className="flex-shrink-0 h-12 w-12 bg-blue-50 rounded-lg flex items-center justify-center border border-blue-100">
        <FileText className="h-6 w-6 text-blue-600" />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 w-full">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate">
              {title}
            </h3>
            
            <div className="mt-1 flex items-center gap-3 text-sm text-slate-600 flex-wrap">
              <span className="flex items-center gap-1.5 font-medium">
                {isOfficial ? (
                  <>
                    <BadgeCheck className="h-4 w-4 text-emerald-600" />
                    <span className="text-emerald-700">{teacherName} (Officiel)</span>
                  </>
                ) : (
                  <>
                    <User className="h-4 w-4 text-slate-400" />
                    <span>{teacherName}</span>
                  </>
                )}
              </span>

              {relevanceScore !== undefined && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
                  {Math.round(relevanceScore * 100)}% Pertinence
                </span>
              )}
              
              {qualityScore !== undefined && (
                <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
                  <Activity className="h-3.5 w-3.5" />
                  Qualité OCR: {qualityScore}/100
                </span>
              )}
            </div>
          </div>
          
          {/* Mobile hidden arrow, desktop visible on hover */}
          <div className="hidden sm:flex flex-shrink-0 items-center justify-center h-8 w-8 rounded-full bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <ChevronRight className="h-5 w-5" />
          </div>
        </div>

        {/* Snippet / Context */}
        {snippet && (
          <p className="mt-3 text-sm text-slate-600 leading-relaxed line-clamp-2 italic border-l-2 border-slate-200 pl-3">
            "... {snippet} ..."
          </p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <span 
                key={index} 
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200"
              >
                <Tag className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
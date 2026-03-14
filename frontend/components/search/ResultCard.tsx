'use client';

import React from 'react';
import { FileText, BadgeCheck, Activity, ArrowUpRight, User } from 'lucide-react';

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
  teacherName = "Student Contributor",
  isOfficial = false,
  qualityScore,
  relevanceScore,
  snippet,
  tags = [],
  onPreview,
}: ResultCardProps) {
  return (
    <div 
      onClick={() => onPreview(documentVersionId)}
      className="group relative flex flex-col sm:flex-row gap-5 p-6 bg-white border border-neutral-100 rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:border-neutral-200 active:scale-[0.99] items-start"
    >
      {/* Icon Indicator */}
      <div className="flex-shrink-0 h-12 w-12 bg-neutral-50 rounded-xl flex items-center justify-center border border-neutral-100 group-hover:bg-white transition-colors duration-300">
        <FileText className="h-5 w-5 text-neutral-600" />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 w-full">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-neutral-900 group-hover:text-black transition-colors line-clamp-1 pr-8 sm:pr-0">
              {title}
            </h3>
            
            <div className="flex items-center gap-3 text-[13px] text-neutral-500 flex-wrap">
              <span className="flex items-center gap-1.5 font-medium">
                {isOfficial ? (
                  <>
                    <BadgeCheck className="h-4 w-4 text-neutral-900" />
                    <span className="text-neutral-900">{teacherName} (Official)</span>
                  </>
                ) : (
                  <>
                    <User className="h-3.5 w-3.5 text-neutral-400" />
                    <span>{teacherName}</span>
                  </>
                )}
              </span>

              {relevanceScore !== undefined && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700 font-medium">
                  Match {Math.round(relevanceScore * 100)}%
                </span>
              )}
              
              {qualityScore !== undefined && (
                <span className="flex items-center gap-1.5 font-medium text-neutral-400" title="OCR Quality">
                  <Activity className="h-3.5 w-3.5" />
                  {qualityScore}%
                </span>
              )}
            </div>
          </div>
          
          {/* Interaction Icon (Desktop visible on hover, Mobile absolute top right) */}
          <div className="absolute top-6 right-6 sm:static sm:top-auto sm:right-auto flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-transparent text-neutral-300 group-hover:bg-neutral-900 group-hover:text-white transition-all duration-300">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>

        {/* Snippet / Context - US-09 Highlight Rendering */}
        {snippet && (
          <div 
            className="mt-4 text-sm text-neutral-500 leading-relaxed line-clamp-2 [&>mark]:bg-yellow-200/60 [&>mark]:text-neutral-900 [&>mark]:font-semibold [&>mark]:rounded-sm [&>mark]:px-1 [&>mark]:py-0.5"
            dangerouslySetInnerHTML={{ __html: snippet }}
          />
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <span 
                key={index} 
                className="inline-flex items-center px-2 py-1 rounded-md bg-neutral-50 text-neutral-500 text-[10px] uppercase tracking-wider font-semibold border border-neutral-100 group-hover:bg-white group-hover:border-neutral-200 transition-colors"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
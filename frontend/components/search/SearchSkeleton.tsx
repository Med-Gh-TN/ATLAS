// frontend/components/search/SearchSkeleton.tsx
'use client';

import React from 'react';

export default function SearchSkeleton() {
  return (
    <div className="relative flex flex-col sm:flex-row gap-5 p-6 bg-white border border-neutral-100 rounded-2xl animate-pulse items-start">
      {/* Icon Indicator Skeleton */}
      <div className="flex-shrink-0 h-12 w-12 bg-neutral-200/50 rounded-xl" />

      {/* Main Content Skeleton */}
      <div className="flex-1 min-w-0 w-full space-y-4">
        
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-3 w-full max-w-lg">
            {/* Title Skeleton */}
            <div className="h-5 bg-neutral-200/60 rounded-md w-3/4" />
            
            {/* Metadata Badges Skeleton */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="h-4 bg-neutral-200/50 rounded w-24" />
              <div className="h-4 bg-neutral-200/50 rounded-full w-20" />
              <div className="h-4 bg-neutral-200/50 rounded w-12" />
            </div>
          </div>
          
          {/* Interaction Icon Skeleton */}
          <div className="absolute top-6 right-6 sm:static sm:top-auto sm:right-auto flex-shrink-0 h-8 w-8 rounded-full bg-neutral-200/50" />
        </div>

        {/* Snippet Skeleton (2 lines) */}
        <div className="space-y-2 mt-2">
          <div className="h-3.5 bg-neutral-200/40 rounded w-full" />
          <div className="h-3.5 bg-neutral-200/40 rounded w-5/6" />
        </div>

        {/* Tags Skeleton */}
        <div className="mt-5 flex flex-wrap gap-2">
          <div className="h-6 bg-neutral-200/50 rounded-md w-16" />
          <div className="h-6 bg-neutral-200/50 rounded-md w-24" />
          <div className="h-6 bg-neutral-200/50 rounded-md w-20" />
        </div>
        
      </div>
    </div>
  );
}
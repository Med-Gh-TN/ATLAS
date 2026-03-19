// frontend/app/search/page.tsx
'use client';

import React, { Suspense, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useDebounce } from 'use-debounce';
import { FolderSearch, ChevronDown, Clock } from 'lucide-react';

import GlobalSearchBar from '../../components/search/GlobalSearchBar';
import SearchSidebarFilters from '../../components/search/SearchSidebarFilters';
import ResultCard from '../../components/search/ResultCard';
import SearchSkeleton from '../../components/search/SearchSkeleton';
import { useHybridSearch, useFilteredContributions, useSearchState } from '../../lib/hooks/useSearch';

// --- Sub-component to handle the URL-dependent logic cleanly ---
function SearchResultsContent() {
  const router = useRouter();
  
  // US-10: Use the centralized state hook instead of raw searchParams
  const { currentParams } = useSearchState();

  // Defensive Architecture: 300ms Debounce to protect backend from typing spam
  const [debouncedQuery] = useDebounce(currentParams.q, 300);

  // Determine if we are actively searching or just browsing the default dashboard
  const isSearching = !!debouncedQuery || !!currentParams.niveau || !!currentParams.filiere || !!currentParams.type_cours || !!currentParams.annee || currentParams.is_official !== undefined;

  // Execute Hybrid Search Engine (MeiliSearch + pgvector RRF)
  const { 
    data: hybridResults, 
    isLoading: isLoadingHybrid 
  } = useHybridSearch({
    ...currentParams,
    q: debouncedQuery,
    top_k: 20
  });

  // Fallback: If no search is active, load recent approved contributions
  const { 
    data: recentContributions, 
    isLoading: isLoadingRecent 
  } = useFilteredContributions(
    { status: 'APPROVED', limit: 20 }, 
    !isSearching
  );

  // US-10: PDF Preview Routing Validation (Navigates to viewer, does not trigger download)
  const handlePreview = (documentVersionId: string) => {
    router.push(`/document/${documentVersionId}`);
  };

  const isLoading = isSearching ? isLoadingHybrid : isLoadingRecent;
  
  // Normalize the data for rendering
  const displayItems = useMemo(() => {
    return isSearching 
      ? hybridResults?.map(item => ({
          id: item.document_version_id,
          title: item.title,
          teacherName: item.teacher_name || "ATLAS Contributor",
          isOfficial: item.is_official,
          qualityScore: item.quality_score || undefined,
          snippet: item.snippet,
          tags: item.tags,
          academicYear: item.tags?.find(t => t.match(/^\d{4}-\d{4}$/)) // Naive extraction from tags if 'annee' isn't explicitly returned
        })) || []
      : recentContributions?.items.map(item => ({
          id: item.id, // Fallback, will redirect to latest version in the preview route
          title: item.title,
          teacherName: "ATLAS Contributor", 
          isOfficial: false,
          qualityScore: undefined,
          snippet: "Document récemment ajouté.",
          tags: item.tags,
          academicYear: undefined
        })) || [];
  }, [isSearching, hybridResults, recentContributions]);

  // US-10: Chronological Grouping ("Années Précédentes" Accordion)
  const groupedResults = useMemo(() => {
    // Current date: March 18, 2026. Academic year is 2025-2026.
    const currentAcademicYear = "2025-2026";
    
    const current = [];
    const previous = [];

    displayItems.forEach(item => {
      // If the user explicitly filters by a specific year, treat everything as "Current View"
      if (currentParams.annee) {
        current.push(item);
      } else if (!item.academicYear || item.academicYear === currentAcademicYear) {
        current.push(item);
      } else {
        previous.push(item);
      }
    });

    return { current, previous };
  }, [displayItems, currentParams.annee]);


  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-neutral-200/60 mb-6">
          <div className="h-4 w-32 bg-neutral-200 rounded animate-pulse" />
        </div>
        {/* US-10: Render High-Fidelity Skeletons */}
        {[1, 2, 3].map((i) => (
          <SearchSkeleton key={`skel-${i}`} />
        ))}
      </div>
    );
  }

  if (displayItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center bg-transparent border-2 border-neutral-200 border-dashed rounded-2xl">
        <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center mb-5 shadow-sm border border-neutral-100">
          <FolderSearch className="h-7 w-7 text-neutral-400" />
        </div>
        <h3 className="text-base font-semibold text-neutral-900 mb-2">Aucun document trouvé</h3>
        <p className="text-sm text-neutral-500 max-w-sm">
          Essayez d'ajuster vos filtres ou de simplifier votre requête pour élargir la recherche.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-200/60 mb-4">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-500">
          {displayItems.length} Résultat{displayItems.length !== 1 ? 's' : ''} Trouvé{displayItems.length !== 1 ? 's' : ''}
        </h2>
      </div>
      
      {/* Current/Relevant Results */}
      <div className="space-y-4">
        {groupedResults.current.map((item, idx) => (
          <ResultCard
            key={`${item.id}-${idx}`}
            documentVersionId={item.id}
            title={item.title}
            teacherName={item.teacherName}
            qualityScore={item.qualityScore}
            isOfficial={item.isOfficial}
            snippet={item.snippet}
            tags={item.tags}
            onPreview={handlePreview}
          />
        ))}
      </div>

      {/* Accordion for Previous Years */}
      {groupedResults.previous.length > 0 && (
        <details className="group mt-12 bg-white rounded-2xl border border-neutral-200/60 shadow-sm overflow-hidden [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-neutral-50 transition-colors select-none">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-neutral-100 text-neutral-500">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Archives des Années Précédentes</h3>
                <p className="text-xs text-neutral-500 mt-0.5">{groupedResults.previous.length} document{groupedResults.previous.length !== 1 ? 's' : ''} plus ancien{groupedResults.previous.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <ChevronDown className="h-5 w-5 text-neutral-400 transition-transform duration-300 group-open:-rotate-180" />
          </summary>
          
          <div className="p-5 pt-2 border-t border-neutral-100 bg-neutral-50/50">
             <div className="space-y-4">
               {groupedResults.previous.map((item, idx) => (
                 <ResultCard
                   key={`archived-${item.id}-${idx}`}
                   documentVersionId={item.id}
                   title={item.title}
                   teacherName={item.teacherName}
                   qualityScore={item.qualityScore}
                   isOfficial={item.isOfficial}
                   snippet={item.snippet}
                   tags={item.tags}
                   onPreview={handlePreview}
                 />
               ))}
             </div>
          </div>
        </details>
      )}
    </div>
  );
}

// --- Main Page Component ---
export default function SearchPage() {
  return (
    <div className="min-h-screen bg-neutral-50 pt-24 pb-20 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header Section */}
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
            ATLAS <span className="text-neutral-400">Bibliothèque</span>
          </h1>
          <p className="text-sm sm:text-base text-neutral-500 max-w-2xl mx-auto leading-relaxed">
            Recherchez intelligemment dans les cours officiels, résumés et examens vérifiés.
          </p>
        </div>

        {/* The Autocomplete Search Bar */}
        <div className="mb-12 relative z-20 max-w-3xl mx-auto">
          <GlobalSearchBar />
        </div>

        {/* Main Grid Layout: Sidebar + Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Faceted Filters */}
          <div className="lg:col-span-3 sticky top-8">
            <Suspense fallback={<div className="h-[600px] w-full bg-white border border-neutral-100 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-pulse" />}>
              <SearchSidebarFilters />
            </Suspense>
          </div>

          {/* Right Column: Search Results Feed */}
          <div className="lg:col-span-9 min-h-[600px]">
            <Suspense fallback={
              <div className="space-y-4">
                <div className="h-5 w-32 bg-neutral-200 rounded animate-pulse mb-8" />
                {[1, 2, 3].map((i) => (
                  <SearchSkeleton key={`fallback-skel-${i}`} />
                ))}
              </div>
            }>
              <SearchResultsContent />
            </Suspense>
          </div>
          
        </div>
      </div>
    </div>
  );
}
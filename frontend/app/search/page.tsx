'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useDebounce } from 'use-debounce';
import { Loader2, FolderSearch, Sparkles } from 'lucide-react';

import GlobalSearchBar from '../../components/search/GlobalSearchBar';
import SearchSidebarFilters from '../../components/search/SearchSidebarFilters';
import ResultCard from '../../components/search/ResultCard';
import { useHybridSearch, useFilteredContributions } from '../../lib/hooks/useSearch';

// --- Sub-component to handle the URL-dependent logic cleanly ---
function SearchResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Extract precise URL state for US-09 / US-10
  const rawQuery = searchParams.get('q') || '';
  const filiere = searchParams.get('filiere') || undefined;
  const niveau = searchParams.get('niveau') || undefined;
  const annee = searchParams.get('annee') || undefined;
  const type_cours = searchParams.get('type_cours') || undefined;
  const langue = searchParams.get('langue') || undefined;
  
  // Parse boolean correctly from string
  const isOfficialParam = searchParams.get('is_official');
  const is_official = isOfficialParam === 'true' ? true : isOfficialParam === 'false' ? false : undefined;

  // Defensive Architecture: 300ms Debounce to protect backend from typing spam
  const [debouncedQuery] = useDebounce(rawQuery, 300);

  // Determine if we are actively searching or just browsing the default dashboard
  const isSearching = !!debouncedQuery || !!niveau || !!filiere || !!type_cours || !!annee || is_official !== undefined;

  // Execute Hybrid Search Engine (MeiliSearch + pgvector RRF)
  const { 
    data: hybridResults, 
    isLoading: isLoadingHybrid 
  } = useHybridSearch({
    q: debouncedQuery,
    filiere,
    niveau,
    annee,
    type_cours,
    langue,
    is_official,
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

  const handlePreview = (documentVersionId: string) => {
    router.push(`/document/${documentVersionId}`);
  };

  const isLoading = isSearching ? isLoadingHybrid : isLoadingRecent;
  
  // Normalize the data for rendering
  const displayItems = isSearching 
    ? hybridResults?.map(item => ({
        id: item.document_version_id,
        title: item.title,
        teacherName: item.teacher_name || "ATLAS Contributor",
        isOfficial: item.is_official,
        qualityScore: item.quality_score,
        snippet: item.snippet
      })) || []
    : recentContributions?.items.map(item => ({
        id: item.id, // Fallback, will redirect to latest version in the preview route
        title: item.title,
        teacherName: "ATLAS Contributor", 
        isOfficial: false,
        qualityScore: 0,
        snippet: "Document récemment ajouté."
      })) || [];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-neutral-400 space-y-5">
        <Sparkles className="h-8 w-8 animate-pulse text-neutral-300" />
        <p className="text-sm font-medium tracking-wide">
          {isSearching ? "Exécution de la recherche hybride..." : "Chargement de la bibliothèque..."}
        </p>
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
      <div className="flex items-center justify-between pb-2 border-b border-neutral-200/60">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-500">
          {displayItems.length} Résultat{displayItems.length !== 1 ? 's' : ''} Trouvé{displayItems.length !== 1 ? 's' : ''}
        </h2>
      </div>
      
      <div className="space-y-4">
        {displayItems.map((item, idx) => (
          <ResultCard
            key={`${item.id}-${idx}`}
            documentVersionId={item.id}
            title={item.title}
            teacherName={item.teacherName}
            qualityScore={item.qualityScore}
            isOfficial={item.isOfficial}
            snippet={item.snippet}
            onPreview={handlePreview}
          />
        ))}
      </div>
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
                  <div key={i} className="h-32 w-full bg-white border border-neutral-100 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-pulse" />
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
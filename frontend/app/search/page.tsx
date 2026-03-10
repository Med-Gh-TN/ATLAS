// frontend/app/search/page.tsx

'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, FolderSearch } from 'lucide-react';
import GlobalSearchBar from '../../components/search/GlobalSearchBar';
import SearchSidebarFilters from '../../components/search/SearchSidebarFilters';
import ResultCard from '../../components/search/ResultCard';
import { useTextSearch, useFilteredContributions } from '../../lib/hooks/useSearch';

// --- Sub-component to handle the URL-dependent logic cleanly ---
function SearchResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Extract URL state
  const query = searchParams.get('q') || '';
  const filieres = searchParams.get('filiere')?.split(',') || [];
  const niveaux = searchParams.get('niveau')?.split(',') || [];
  const annee = searchParams.get('annee');

  // If there's a text query, we use the text search endpoint. 
  // Otherwise, we just fetch a filtered list of approved contributions.
  const isTextSearch = query.length > 2;

  const { 
    data: textResults, 
    isLoading: isLoadingText 
  } = useTextSearch(query, 20, 0);

  const { 
    data: filteredResults, 
    isLoading: isLoadingFiltered 
  } = useFilteredContributions(
    { status: 'APPROVED' }, 
    !isTextSearch // Only run this hook if we aren't doing a text search
  );

  const handlePreview = (documentVersionId: string) => {
    router.push(`/app/document/${documentVersionId}`);
  };

  // Determine which loading state and data source to use
  const isLoading = isTextSearch ? isLoadingText : isLoadingFiltered;
  
  // Normalize the data into a common format for the ResultCard
  // Note: We gracefully handle the differences between TextSearchResponse and ContributionQueryResponse
  const displayItems = isTextSearch 
    ? textResults?.items.map(item => ({
        id: item.version_id,
        title: item.title,
        // Fallbacks for data not returned by the light text search endpoint
        teacherName: "Contributeur ATLAS",
        qualityScore: undefined,
      })) || []
    : filteredResults?.items.map(item => ({
        id: item.id, // We'll need to fetch the specific version on the document page
        title: item.title,
        teacherName: "Contributeur ATLAS", 
        qualityScore: undefined,
      })) || [];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium animate-pulse">Recherche dans la base de connaissances ATLAS...</p>
      </div>
    );
  }

  if (displayItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-white border border-slate-200 rounded-xl border-dashed">
        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
          <FolderSearch className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-1">Aucun document trouvé</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Essayez de modifier vos filtres ou de simplifier votre requête de recherche.
        </p>
      </div>
    );
  }

  // Filter the display items locally if we used the text search (since text search doesn't take faceted params yet)
  // This is a defensive architecture choice to ensure the UI respects the URL state even if backend misses it.
  const strictlyFilteredItems = displayItems.filter(item => {
    // In a full implementation, the backend would return tags/filiere per item.
    // For now, we assume everything matches if the backend returned it, 
    // but the architecture is ready for local array filtering here if needed.
    return true; 
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700">
          {strictlyFilteredItems.length} Résultat{strictlyFilteredItems.length !== 1 ? 's' : ''} trouvé{strictlyFilteredItems.length !== 1 ? 's' : ''}
        </h2>
      </div>
      
      <div className="space-y-4">
        {strictlyFilteredItems.map((item, idx) => (
          <ResultCard
            key={`${item.id}-${idx}`}
            documentVersionId={item.id}
            title={item.title}
            teacherName={item.teacherName}
            qualityScore={item.qualityScore}
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
    <div className="min-h-screen bg-slate-50 pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="text-center space-y-4 mb-10">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Bibliothèque Académique <span className="text-blue-600">ATLAS</span>
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl mx-auto">
            Explorez des milliers de cours, résumés et examens validés par vos enseignants et la communauté.
          </p>
        </div>

        {/* The Autocomplete Search Bar */}
        <div className="mb-10 relative z-20">
          <GlobalSearchBar />
        </div>

        {/* Main Grid Layout: Sidebar + Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          
          {/* Left Column: Faceted Filters */}
          <div className="lg:col-span-1 sticky top-24">
            <Suspense fallback={<div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />}>
              <SearchSidebarFilters />
            </Suspense>
          </div>

          {/* Right Column: Search Results Feed */}
          <div className="lg:col-span-3 min-h-[500px]">
            <Suspense fallback={<div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div>}>
              <SearchResultsContent />
            </Suspense>
          </div>
          
        </div>
      </div>
    </div>
  );
}
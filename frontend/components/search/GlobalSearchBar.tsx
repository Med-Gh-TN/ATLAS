'use client';

import React, { useState, useEffect } from 'react';
import { Search, Loader2, FileText, Sparkles, ArrowRight } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useSearchAutocomplete, useSearchState } from '../../lib/hooks/useSearch';

// --- Local Debounce Hook (Keeps component atomic) ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function GlobalSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentParams, updateParams } = useSearchState();
  
  // Initialize input state from URL if present
  const [inputValue, setInputValue] = useState(currentParams.q || '');
  const [isOpen, setIsOpen] = useState(false);
  
  // Sync input value if URL changes (e.g., via back/forward navigation)
  useEffect(() => {
    if (currentParams.q !== undefined && !isOpen) {
      setInputValue(currentParams.q);
    }
  }, [currentParams.q, isOpen]);

  // Apply 300ms debounce as required by US-10
  const debouncedQuery = useDebounce(inputValue, 300);

  // Fetch real-time suggestions using the isolated, zero-stale-time hook
  const { data: searchResults, isLoading, isError } = useSearchAutocomplete(debouncedQuery);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = () => setIsOpen(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSelectDocument = (documentVersionId: string) => {
    setIsOpen(false);
    setInputValue(''); // Clear on direct document selection
    router.push(`/document/${documentVersionId}`);
  };

  const handleExecuteFullSearch = (e?: React.KeyboardEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsOpen(false);
    
    // Serialize to URL
    updateParams({ q: inputValue });
    
    // Navigate to dedicated search page if not already there
    if (pathname !== '/search') {
      const params = new URLSearchParams();
      if (inputValue) params.set('q', inputValue);
      router.push(`/search?${params.toString()}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleExecuteFullSearch(e);
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto" onClick={(e) => e.stopPropagation()}>
      {/* Search Input Container */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-neutral-400 animate-spin" />
          ) : (
            <Search className="h-5 w-5 text-neutral-400 group-focus-within:text-neutral-900 transition-colors duration-200" />
          )}
        </div>
        <input
          type="text"
          className="block w-full pl-12 pr-12 py-4 bg-white border border-neutral-200 rounded-xl leading-5 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 focus:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] transition-all duration-200 sm:text-base"
          placeholder="Ask ATLAS... (e.g., How does Quicksort work?)"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {/* Execution Button / Hint */}
        <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
           <button 
             onClick={handleExecuteFullSearch}
             className="hidden sm:flex items-center justify-center p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
             aria-label="Execute search"
           >
             <ArrowRight className="h-4 w-4" />
           </button>
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      <div 
        className={`absolute z-50 w-full mt-2 bg-white rounded-xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-neutral-100 overflow-hidden transition-all duration-200 origin-top ${isOpen && inputValue.length >= 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
      >
        <ul className="max-h-[400px] overflow-y-auto py-2">
          {isLoading && (
            <li className="px-4 py-12 flex flex-col items-center justify-center text-neutral-500">
              <Sparkles className="h-6 w-6 animate-pulse mb-3 text-neutral-400" />
              <p className="text-sm font-medium">Scanning the neural network...</p>
            </li>
          )}

          {isError && (
            <li className="px-4 py-6 text-center text-sm text-red-500 bg-red-50/50">
              An error occurred while fetching suggestions. Press Enter to try full search.
            </li>
          )}

          {!isLoading && !isError && searchResults?.length === 0 && (
            <li className="px-4 py-8 flex flex-col items-center justify-center text-neutral-500 hover:bg-neutral-50 cursor-pointer" onClick={handleExecuteFullSearch}>
              <Search className="h-5 w-5 mb-2 text-neutral-300" />
              <p className="text-sm">Search all documents for "{inputValue}"</p>
            </li>
          )}

          {!isLoading && searchResults && searchResults.map((result) => (
            <li 
              key={result.document_version_id}
              className="group px-4 py-3 mx-2 my-1 rounded-lg hover:bg-neutral-50/80 cursor-pointer transition-all duration-150 active:scale-[0.99]"
              onClick={() => handleSelectDocument(result.document_version_id)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 bg-neutral-100 p-2 rounded-md group-hover:bg-white transition-colors border border-transparent group-hover:border-neutral-200">
                  <FileText className="h-4 w-4 text-neutral-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 truncate group-hover:text-black">
                    {result.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {/* US-10: Expose Filiere mapping if available */}
                    {result.filiere && (
                       <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                         {result.filiere}
                       </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-500">
                      Score: {Math.round((result.rrf_score || 0) * 100)}
                    </span>
                    {result.is_official && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-emerald-600">
                        • Official
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
          
          {/* Always provide a fallback path to the main search view */}
          {!isLoading && searchResults && searchResults.length > 0 && (
            <li 
              className="px-4 py-3 mx-2 mt-2 text-sm text-center text-neutral-500 font-medium hover:text-neutral-900 hover:bg-neutral-50 rounded-lg cursor-pointer transition-colors"
              onClick={handleExecuteFullSearch}
            >
              View all results for "{inputValue}" →
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
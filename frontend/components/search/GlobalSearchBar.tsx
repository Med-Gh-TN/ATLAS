// frontend/components/search/GlobalSearchBar.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { Search, Loader2, FileText, CheckCircle } from 'lucide-react';
import { useSemanticSearch } from '../../lib/hooks/useSearch';
import { useRouter } from 'next/navigation';

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
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  
  // Apply 300ms debounce as required by US-10
  const debouncedQuery = useDebounce(inputValue, 300);

  // Fetch results via TanStack Query
  const { data: searchResults, isLoading, isError } = useSemanticSearch(debouncedQuery, 5);

  // Handle outside click to close dropdown (simple implementation)
  useEffect(() => {
    const handleClickOutside = () => setIsOpen(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSelect = (documentVersionId: string) => {
    setIsOpen(false);
    // Route to the document preview page
    router.push(`/app/document/${documentVersionId}`);
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto" onClick={(e) => e.stopPropagation()}>
      {/* Search Input */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
          ) : (
            <Search className="h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          )}
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 sm:text-sm transition-all shadow-sm"
          placeholder="Rechercher un cours par question naturelle (ex: Comment fonctionne le tri rapide ?)"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && inputValue.length > 2 && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-md shadow-lg border border-slate-200 overflow-hidden">
          <ul className="max-h-96 overflow-y-auto py-2 text-sm text-slate-700">
            {isLoading && (
              <li className="px-4 py-8 text-center text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
                <p>Recherche sémantique en cours...</p>
              </li>
            )}

            {isError && (
              <li className="px-4 py-4 text-center text-red-500">
                Une erreur est survenue lors de la recherche.
              </li>
            )}

            {!isLoading && !isError && searchResults?.length === 0 && (
              <li className="px-4 py-8 text-center text-slate-500">
                Aucun résultat trouvé pour "{inputValue}".
              </li>
            )}

            {!isLoading && searchResults && searchResults.map((result) => (
              <li 
                key={result.document_version_id}
                className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors"
                onClick={() => handleSelect(result.document_version_id)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {result.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1 text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md font-medium">
                        <CheckCircle className="h-3 w-3" />
                        Pertinence: {Math.round(result.score * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
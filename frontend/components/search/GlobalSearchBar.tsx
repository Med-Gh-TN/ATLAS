'use client';

import React, { useState, useEffect } from 'react';
import { Search, Loader2, FileText, Sparkles } from 'lucide-react';
import { useHybridSearch } from '../../lib/hooks/useSearch';
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

  // Fetch results via TanStack Query using the correct US-09 Hybrid Search Hook and parameter object
  const { data: searchResults, isLoading, isError } = useHybridSearch({
    q: debouncedQuery,
    top_k: 5
  });

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = () => setIsOpen(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSelect = (documentVersionId: string) => {
    setIsOpen(false);
    setInputValue(''); // Clear on selection for a clean slate
    router.push(`/app/document/${documentVersionId}`);
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
          className="block w-full pl-12 pr-4 py-4 bg-white border border-neutral-200 rounded-xl leading-5 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 focus:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] transition-all duration-200 sm:text-base"
          placeholder="Ask ATLAS... (e.g., How does Quicksort work?)"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {/* Optional Keyboard Shortcut Hint (Visual only for premium feel) */}
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
           <span className="hidden sm:inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-neutral-400 border border-neutral-200 rounded">
             ⌘K
           </span>
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      <div 
        className={`absolute z-50 w-full mt-2 bg-white rounded-xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-neutral-100 overflow-hidden transition-all duration-200 origin-top ${isOpen && inputValue.length > 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
      >
        <ul className="max-h-[400px] overflow-y-auto py-2">
          {isLoading && (
            <li className="px-4 py-12 flex flex-col items-center justify-center text-neutral-500">
              <Sparkles className="h-6 w-6 animate-pulse mb-3 text-neutral-400" />
              <p className="text-sm font-medium">Scanning the knowledge base...</p>
            </li>
          )}

          {isError && (
            <li className="px-4 py-6 text-center text-sm text-red-500 bg-red-50/50">
              An error occurred while connecting to the neural search.
            </li>
          )}

          {!isLoading && !isError && searchResults?.length === 0 && (
            <li className="px-4 py-12 flex flex-col items-center justify-center text-neutral-500">
              <Search className="h-6 w-6 mb-3 text-neutral-300" />
              <p className="text-sm">No results found for "{inputValue}"</p>
            </li>
          )}

          {!isLoading && searchResults && searchResults.map((result) => (
            <li 
              key={result.document_version_id}
              className="group px-4 py-3 mx-2 my-1 rounded-lg hover:bg-neutral-50/80 cursor-pointer transition-all duration-150 active:scale-[0.99]"
              onClick={() => handleSelect(result.document_version_id)}
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
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full">
                      Relevance {Math.round((result.rrf_score || 0) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        
        {/* Footer for premium detail */}
        {searchResults && searchResults.length > 0 && !isLoading && (
          <div className="px-4 py-2 bg-neutral-50 border-t border-neutral-100 text-xs text-neutral-400 flex justify-between">
            <span>Powered by ATLAS AI</span>
            <span>Use ↑↓ to navigate</span>
          </div>
        )}
      </div>
    </div>
  );
}
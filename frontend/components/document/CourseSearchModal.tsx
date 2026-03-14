'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2, FileText, BookOpen } from 'lucide-react';
import api from '../../lib/api';

export interface CourseSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  // ARCHITECTURE ADDITION: Enables reusable "Picker" mode for forms
  onSelect?: (selectedId: string, selectedTitle: string) => void;
}

interface SearchResult {
  id: string; // Document version ID
  course_id?: string; // Explicit Course UUID if provided by backend search engine
  title: string;
  course_code?: string;
  author_name?: string;
}

export default function CourseSearchModal({ isOpen, onClose, onSelect }: CourseSearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    } else {
      document.body.style.overflow = 'unset';
      setQuery('');
      setResults([]);
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Debounced Search Execution
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        // Hits the hybrid search endpoint
        const res = await api.get<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}&limit=5`);
        setResults(res.data.results || []);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    onClose();
    
    if (onSelect) {
      // Form Mode: Pass the UUID back to the form state
      // Defensively prefer course_id if the MeiliSearch index returns it
      const targetId = result.course_id || result.id;
      onSelect(targetId, result.title);
    } else {
      // Global Navigation Mode: Route to the document
      router.push(`/document/${result.id}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[20vh] px-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-neutral-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header / Input */}
        <div className="flex items-center px-4 py-4 border-b border-neutral-100 bg-neutral-50/50">
          <Search className="w-5 h-5 text-neutral-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Rechercher un autre cours, concept ou document..."
            className="flex-grow bg-transparent border-none focus:outline-none focus:ring-0 text-base font-medium text-neutral-900 placeholder:text-neutral-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-neutral-400 ml-3 shrink-0" />}
          <button 
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() && (
            <div className="p-8 text-center text-neutral-500">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-neutral-300" />
              <p className="text-sm font-medium">Tapez quelques lettres pour explorer ATLAS.</p>
            </div>
          )}

          {query.trim() && results.length === 0 && !isLoading && (
            <div className="p-8 text-center text-neutral-500">
              <p className="text-sm font-medium">Aucun résultat trouvé pour "{query}".</p>
            </div>
          )}

          {results.length > 0 && (
            <ul className="p-2">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    onClick={() => handleSelect(result)}
                    className="w-full text-left flex items-start gap-3 p-3 rounded-xl hover:bg-neutral-50 focus:bg-neutral-50 focus:outline-none transition-colors group"
                  >
                    <div className="mt-0.5 p-2 bg-neutral-100 rounded-lg text-neutral-500 group-hover:bg-white group-hover:text-neutral-900 group-hover:shadow-sm transition-all border border-transparent group-hover:border-neutral-200">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-neutral-900 line-clamp-1">{result.title}</p>
                      <p className="text-xs font-medium text-neutral-500 mt-0.5 line-clamp-1">
                        {result.course_code ? `${result.course_code} • ` : ''} {result.author_name || 'ATLAS Contributor'}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-neutral-50/80 border-t border-neutral-100 text-[10px] font-bold uppercase tracking-wider text-neutral-400 text-right">
          Appuyez sur <kbd className="px-1.5 py-0.5 rounded-md bg-white border border-neutral-200 shadow-sm mx-0.5 text-neutral-600 font-sans">Échap</kbd> pour fermer
        </div>
      </div>
    </div>
  );
}
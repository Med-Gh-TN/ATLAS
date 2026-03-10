// frontend/components/search/SearchSidebarFilters.tsx

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';

const FILIERES = ["Informatique", "Mathématiques", "Physique", "Chimie", "Biologie"];
const NIVEAUX = ["L1", "L2", "L3", "M1", "M2"];
const TYPES = ["Cours Officiel", "Résumé", "TD", "TP", "Examen", "Contribution"];

export default function SearchSidebarFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // State for collapsible sections
  const [openSections, setOpenSections] = useState({
    filiere: true,
    niveau: true,
    type: true,
    annee: true,
  });

  // Local state for the slider to avoid laggy URL updates while dragging
  const currentYear = new Date().getFullYear();
  const [yearRange, setYearRange] = useState(searchParams.get('annee') || currentYear.toString());

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Helper to toggle comma-separated URL parameters (e.g., ?niveau=L1,L2)
  const toggleQueryParam = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const existing = params.get(name);
      
      if (existing) {
        let values = existing.split(',');
        if (values.includes(value)) {
          // Remove if it exists
          values = values.filter((v) => v !== value);
          if (values.length > 0) {
            params.set(name, values.join(','));
          } else {
            params.delete(name);
          }
        } else {
          // Add if it doesn't
          params.set(name, existing + ',' + value);
        }
      } else {
        params.set(name, value);
      }
      return params.toString();
    },
    [searchParams]
  );

  const handleCheckboxChange = (category: string, value: string) => {
    const queryString = toggleQueryParam(category, value);
    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setYearRange(e.target.value);
  };

  const handleYearCommit = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('annee', yearRange);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clearFilters = () => {
    const q = searchParams.get('q'); // Preserve the search query if it exists
    if (q) {
      router.push(`${pathname}?q=${q}`, { scroll: false });
    } else {
      router.push(pathname, { scroll: false });
    }
    setYearRange(currentYear.toString());
  };

  const isChecked = (category: string, value: string) => {
    const param = searchParams.get(category);
    return param ? param.split(',').includes(value) : false;
  };

  // Check if any filter (besides 'q') is currently active
  const hasActiveFilters = Array.from(searchParams.keys()).filter(k => k !== 'q').length > 0;

  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-slate-900 font-semibold">
          <Filter className="h-5 w-5 text-blue-600" />
          <h2>Filtres</h2>
        </div>
        {hasActiveFilters && (
          <button 
            onClick={clearFilters}
            className="text-xs font-medium text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors"
          >
            <X className="h-3 w-3" /> Effacer
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* FILIÈRE SECTION */}
        <div className="border-b border-slate-100 pb-4">
          <button 
            className="flex w-full items-center justify-between text-sm font-semibold text-slate-800 mb-3"
            onClick={() => toggleSection('filiere')}
          >
            Filière
            {openSections.filiere ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {openSections.filiere && (
            <div className="space-y-2">
              {FILIERES.map((filiere) => (
                <label key={filiere} className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={isChecked('filiere', filiere)}
                    onChange={() => handleCheckboxChange('filiere', filiere)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 transition-colors"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{filiere}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* NIVEAU SECTION */}
        <div className="border-b border-slate-100 pb-4">
          <button 
            className="flex w-full items-center justify-between text-sm font-semibold text-slate-800 mb-3"
            onClick={() => toggleSection('niveau')}
          >
            Niveau
            {openSections.niveau ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {openSections.niveau && (
            <div className="space-y-2">
              {NIVEAUX.map((niveau) => (
                <label key={niveau} className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={isChecked('niveau', niveau)}
                    onChange={() => handleCheckboxChange('niveau', niveau)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 transition-colors"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{niveau}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* TYPE SECTION */}
        <div className="border-b border-slate-100 pb-4">
          <button 
            className="flex w-full items-center justify-between text-sm font-semibold text-slate-800 mb-3"
            onClick={() => toggleSection('type')}
          >
            Type de ressource
            {openSections.type ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {openSections.type && (
            <div className="space-y-2">
              {TYPES.map((type) => (
                <label key={type} className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={isChecked('type', type)}
                    onChange={() => handleCheckboxChange('type', type)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 transition-colors"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">{type}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ANNÉE (SLIDER) SECTION */}
        <div>
          <button 
            className="flex w-full items-center justify-between text-sm font-semibold text-slate-800 mb-3"
            onClick={() => toggleSection('annee')}
          >
            Année Académique
            {openSections.annee ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {openSections.annee && (
            <div className="pt-2 px-1">
              <input
                type="range"
                min="2010"
                max={currentYear.toString()}
                step="1"
                value={yearRange}
                onChange={handleYearChange}
                onMouseUp={handleYearCommit} // Commit to URL only when user stops dragging
                onTouchEnd={handleYearCommit} // For mobile touch release
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-2 font-mono">
                <span>2010</span>
                <span className="font-semibold text-blue-600">{yearRange}</span>
                <span>{currentYear}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
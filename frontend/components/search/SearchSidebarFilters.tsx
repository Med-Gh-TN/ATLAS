'use client';

import React, { useState, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react';

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
    <div className="w-full bg-white border border-neutral-100 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5 text-neutral-900 font-medium">
          <SlidersHorizontal className="h-4 w-4" />
          <h2 className="text-sm uppercase tracking-wider font-semibold">Filters</h2>
        </div>
        {hasActiveFilters && (
          <button 
            onClick={clearFilters}
            className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400 hover:text-neutral-900 flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-neutral-100"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* FILIÈRE SECTION */}
        <div className="border-b border-neutral-100 pb-5">
          <button 
            className="flex w-full items-center justify-between text-sm font-medium text-neutral-900 mb-3 group"
            onClick={() => toggleSection('filiere')}
          >
            Major (Filière)
            <ChevronDown 
              className={`h-4 w-4 text-neutral-400 transition-transform duration-200 group-hover:text-neutral-900 ${openSections.filiere ? 'rotate-180' : ''}`} 
            />
          </button>
          <div className={`space-y-1 overflow-hidden transition-all duration-300 ${openSections.filiere ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
            {FILIERES.map((filiere) => (
              <label key={filiere} className="flex items-center gap-3 cursor-pointer group py-1.5">
                <input 
                  type="checkbox" 
                  checked={isChecked('filiere', filiere)}
                  onChange={() => handleCheckboxChange('filiere', filiere)}
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 transition-colors accent-neutral-900"
                />
                <span className="text-sm text-neutral-500 group-hover:text-neutral-900 transition-colors">{filiere}</span>
              </label>
            ))}
          </div>
        </div>

        {/* NIVEAU SECTION */}
        <div className="border-b border-neutral-100 pb-5">
          <button 
            className="flex w-full items-center justify-between text-sm font-medium text-neutral-900 mb-3 group"
            onClick={() => toggleSection('niveau')}
          >
            Level
            <ChevronDown 
              className={`h-4 w-4 text-neutral-400 transition-transform duration-200 group-hover:text-neutral-900 ${openSections.niveau ? 'rotate-180' : ''}`} 
            />
          </button>
          <div className={`space-y-1 overflow-hidden transition-all duration-300 ${openSections.niveau ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
            {NIVEAUX.map((niveau) => (
              <label key={niveau} className="flex items-center gap-3 cursor-pointer group py-1.5">
                <input 
                  type="checkbox" 
                  checked={isChecked('niveau', niveau)}
                  onChange={() => handleCheckboxChange('niveau', niveau)}
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 transition-colors accent-neutral-900"
                />
                <span className="text-sm text-neutral-500 group-hover:text-neutral-900 transition-colors">{niveau}</span>
              </label>
            ))}
          </div>
        </div>

        {/* TYPE SECTION */}
        <div className="border-b border-neutral-100 pb-5">
          <button 
            className="flex w-full items-center justify-between text-sm font-medium text-neutral-900 mb-3 group"
            onClick={() => toggleSection('type')}
          >
            Resource Type
            <ChevronDown 
              className={`h-4 w-4 text-neutral-400 transition-transform duration-200 group-hover:text-neutral-900 ${openSections.type ? 'rotate-180' : ''}`} 
            />
          </button>
          <div className={`space-y-1 overflow-hidden transition-all duration-300 ${openSections.type ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
            {TYPES.map((type) => (
              <label key={type} className="flex items-center gap-3 cursor-pointer group py-1.5">
                <input 
                  type="checkbox" 
                  checked={isChecked('type', type)}
                  onChange={() => handleCheckboxChange('type', type)}
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 transition-colors accent-neutral-900"
                />
                <span className="text-sm text-neutral-500 group-hover:text-neutral-900 transition-colors">{type}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ANNÉE (SLIDER) SECTION */}
        <div>
          <button 
            className="flex w-full items-center justify-between text-sm font-medium text-neutral-900 mb-3 group"
            onClick={() => toggleSection('annee')}
          >
            Academic Year
            <ChevronDown 
              className={`h-4 w-4 text-neutral-400 transition-transform duration-200 group-hover:text-neutral-900 ${openSections.annee ? 'rotate-180' : ''}`} 
            />
          </button>
          <div className={`overflow-hidden transition-all duration-300 ${openSections.annee ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
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
                className="w-full h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-900 transition-all"
              />
              <div className="flex justify-between text-[11px] font-medium text-neutral-400 mt-3 tracking-wider">
                <span>2010</span>
                <span className="text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded">{yearRange}</span>
                <span>{currentYear}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
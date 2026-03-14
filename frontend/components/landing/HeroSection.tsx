'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Search, BookOpen } from 'lucide-react';

export default function HeroSection() {
  const [isMounted, setIsMounted] = useState(false);

  // Trigger zero-cost entry animations on client hydration
  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 min-h-[90vh]">
      
      {/* Abstract Background Elements for Premium Tech Aesthetic */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-100 via-white to-white"></div>
      <div className="absolute top-0 w-full h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent opacity-50"></div>
      
      <div 
        className={`max-w-5xl mx-auto transition-all duration-1000 ease-out transform ${
          isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Trust Signal Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-100 border border-neutral-200 text-sm font-semibold text-neutral-700 mb-8 shadow-sm">
          <ShieldCheck className="w-4 h-4 text-neutral-900" />
          <span>Peer-Reviewed & Faculty Verified</span>
        </div>

        {/* Core Value Proposition (H1) */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-neutral-900 mb-8 leading-[1.1]">
          The ultimate source of truth for your{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-900 to-neutral-500">
            academic journey.
          </span>
        </h1>

        {/* Supporting Narrative */}
        <p className="max-w-2xl mx-auto text-lg sm:text-xl text-neutral-500 leading-relaxed mb-10 font-medium">
          ATLAS is a premium, moderated knowledge engine. Bypass the noise and instantly access high-quality, verified course materials powered by state-of-the-art neural search.
        </p>

        {/* Primary Call-to-Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link 
            href="/auth/register" 
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-neutral-900 text-white rounded-xl font-bold text-lg hover:bg-neutral-800 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-neutral-900/20"
          >
            Start Learning
            <ArrowRight className="w-5 h-5" />
          </Link>
          
          <Link 
            href="/search" 
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-white text-neutral-900 border-2 border-neutral-200 rounded-xl font-bold text-lg hover:border-neutral-900 hover:bg-neutral-50 transition-all active:scale-95"
          >
            <Search className="w-5 h-5" />
            Try the Search
          </Link>
        </div>

        {/* Secondary Trust Metrics */}
        <div className="mt-16 pt-8 border-t border-neutral-100 grid grid-cols-2 md:grid-cols-3 gap-8 max-w-3xl mx-auto opacity-70">
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-3xl font-black text-neutral-900">99%</span>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Query Accuracy</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-3xl font-black text-neutral-900">Zero</span>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Duplicate Files</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 col-span-2 md:col-span-1">
            <span className="text-3xl font-black text-neutral-900 flex items-center gap-2">
              <BookOpen className="w-6 h-6" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Structured Knowledge</span>
          </div>
        </div>
      </div>
    </section>
  );
}
'use client';

import React from 'react';
import ContributionForm from '../../components/upload/ContributionForm';
import { ShieldCheck, Zap, AlertTriangle, Sparkles } from 'lucide-react';

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-neutral-50 pt-24 pb-20 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Page Header */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
            Share a Document
          </h1>
          <p className="text-neutral-500 mt-3 max-w-2xl text-sm sm:text-base leading-relaxed">
            Contribute to the ATLAS knowledge library. Every document helps your peers and earns you Experience Points (XP) on your academic profile.
          </p>
        </div>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: The Upload Form */}
          <div className="lg:col-span-8">
            <ContributionForm />
          </div>

          {/* Right Column: Guidelines & Info */}
          <div className="lg:col-span-4 space-y-6 sticky top-24">
            
            {/* Moderation Rules Card */}
            <div className="bg-white border border-neutral-100 rounded-2xl p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              <h3 className="text-[11px] font-bold text-neutral-400 mb-6 uppercase tracking-wider">
                Process & Guidelines
              </h3>
              <ul className="space-y-6">
                <li className="flex gap-4 items-start">
                  <ShieldCheck className="w-5 h-5 text-neutral-900 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-sm font-semibold text-neutral-900 mb-0.5">Strict Moderation</strong>
                    <p className="text-sm text-neutral-500 leading-relaxed">
                      All documents enter a <code>PENDING</code> state and must be approved by a verified teacher or administrator before becoming public.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 items-start">
                  <Sparkles className="w-5 h-5 text-neutral-900 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-sm font-semibold text-neutral-900 mb-0.5">AI Processing</strong>
                    <p className="text-sm text-neutral-500 leading-relaxed">
                      Once uploaded, our OCR pipeline automatically extracts text to make your document fully searchable via the neural engine.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 items-start">
                  <AlertTriangle className="w-5 h-5 text-neutral-900 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-sm font-semibold text-neutral-900 mb-0.5">Duplicate Detection</strong>
                    <p className="text-sm text-neutral-500 leading-relaxed">
                      The platform automatically blocks files with identical cryptographic hashes. Please do not re-upload existing courses.
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Gamification Card (US-11) */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-7 shadow-lg relative overflow-hidden group">
              {/* Subtle background glow effect */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
              
              <div className="relative z-10">
                <div className="flex items-center gap-2.5 mb-3">
                  <Zap className="w-5 h-5 text-white fill-white" />
                  <h3 className="text-sm font-bold text-white tracking-wide">Earn Rewards</h3>
                </div>
                <p className="text-sm text-neutral-300 leading-relaxed">
                  If your contribution is validated by the moderation team, you will automatically receive <strong className="text-white font-semibold">+50 XP</strong> on your student profile!
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
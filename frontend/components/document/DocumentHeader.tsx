'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock, Calendar, User, BrainCircuit, Loader2, PlayCircle, Target, Flame } from 'lucide-react';
import useAuthStore from '../../lib/store/useAuthStore';
import type { DocumentVersion, Contribution } from '../../types/api';
import FlashcardReviewModal from './FlashcardReviewModal';

export interface DocumentHeaderProps {
  /** The parent contribution data containing title, description, and status */
  contribution: Contribution;
  /** The currently active document version containing the upload timestamp */
  currentVersion: DocumentVersion;
}

interface DeckStats {
  id: string;
  mastery_percentage: number;
  due_cards_count: number;
}

/**
 * Presentation component for the document metadata header, enhanced with AI Study Tool triggers.
 */
export default function DocumentHeader({ contribution, currentVersion }: DocumentHeaderProps) {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const [deckReadyId, setDeckReadyId] = useState<string | null>(null);
  
  // US-16: Integration State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deckStats, setDeckStats] = useState<DeckStats | null>(null);

  // US-16: Check for existing deck on mount
  useEffect(() => {
    if (!token || !currentVersion.id) return;

    const fetchExistingDeck = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/flashcards/documents/${currentVersion.id}/deck`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setDeckStats({
            id: data.id,
            mastery_percentage: data.mastery_percentage || 0,
            due_cards_count: data.due_cards_count || 0
          });
          setDeckReadyId(data.id);
        }
      } catch (error) {
        console.error('[ATLAS Architecture] Failed to fetch deck stats:', error);
      }
    };

    fetchExistingDeck();
  }, [currentVersion.id, token]);

  const handleGenerateFlashcards = async () => {
    if (!token) return;
    setIsGeneratingCards(true);
    setDeckReadyId(null);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/flashcards/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ document_version_id: currentVersion.id, num_cards: 5 })
      });

      if (res.status === 202) {
        // Celery async task accepted. Simulating polling for UI completion.
        setTimeout(() => {
          setIsGeneratingCards(false);
          setDeckReadyId("ready"); 
          // Inject dummy stats for immediate feedback upon generation
          setDeckStats({
            id: "ready",
            mastery_percentage: 0,
            due_cards_count: 5
          });
        }, 5000); 

      } else {
        const data = await res.json();
        setIsGeneratingCards(false);
        if (data.deck_id) {
          setDeckReadyId(data.deck_id);
          setDeckStats({
            id: data.deck_id,
            mastery_percentage: data.mastery_percentage || 0,
            due_cards_count: data.due_cards_count || 5
          });
        }
      }

    } catch (error) {
      console.error('[ATLAS Architecture] Failed to generate flashcards:', error);
      setIsGeneratingCards(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-medium text-neutral-400 hover:text-neutral-900 transition-colors w-fit group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Back to results
        </button>
        
        <div className="bg-white p-8 rounded-2xl border border-neutral-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col md:flex-row md:items-start justify-between gap-8 relative overflow-hidden">
          {/* Subtle decorative accent */}
          <div className="absolute top-0 left-0 w-2 h-full bg-neutral-900"></div>

          <div className="pl-2 flex-grow">
            <div className="flex items-center gap-4 mb-4">
              {contribution.status === 'APPROVED' ? (
                <span className="flex items-center gap-1.5 px-3 py-1 bg-neutral-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-full shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1 bg-neutral-100 text-neutral-600 text-[10px] font-bold uppercase tracking-widest rounded-full">
                  <Clock className="w-3.5 h-3.5" />
                  In Review
                </span>
              )}
              
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(currentVersion.uploaded_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-3 tracking-tight leading-tight">
              {contribution.title}
            </h1>
            <p className="text-neutral-500 max-w-3xl text-sm leading-relaxed mb-6">
              {contribution.description || "No description provided by the author for this contribution."}
            </p>

            {/* US-16: AI Study Tools Action Bar - "Mes Decks" Implementation */}
            <div className="pt-4 border-t border-neutral-100">
                {deckReadyId ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-neutral-50 p-4 rounded-xl border border-neutral-200 w-full max-w-2xl animate-in fade-in duration-300">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-blue-600" />
                        Spaced Repetition Deck
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                        {/* % Maîtrise Requirement */}
                        <span className="flex items-center gap-1.5 text-xs font-bold text-neutral-700 bg-white px-2.5 py-1 rounded-md border border-neutral-200 shadow-sm">
                          <Target className="w-3.5 h-3.5 text-green-500" />
                          {deckStats?.mastery_percentage || 0}% Maîtrise
                        </span>
                        
                        {/* À réviser aujourd'hui Requirement */}
                        {(deckStats?.due_cards_count ?? 0) > 0 && (
                          <span className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-md shadow-sm border border-red-200 animate-pulse">
                            <Flame className="w-3.5 h-3.5" />
                            {deckStats?.due_cards_count} À réviser aujourd'hui
                          </span>
                        )}
                      </div>
                    </div>

                    <button 
                      onClick={() => setIsModalOpen(true)}
                      className="flex items-center justify-center w-full sm:w-auto gap-2 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-bold py-2.5 px-6 rounded-lg transition-colors shadow-sm whitespace-nowrap"
                    >
                      <PlayCircle className="w-4 h-4" /> Start Review
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleGenerateFlashcards}
                    disabled={isGeneratingCards}
                    className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-sm font-bold py-2.5 px-5 rounded-lg transition-colors shadow-sm"
                  >
                    {isGeneratingCards ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Generating via AI...</>
                    ) : (
                      <><BrainCircuit className="w-4 h-4" /> Generate Flashcards</>
                    )}
                  </button>
                )}
            </div>

          </div>
          
          <div className="flex items-center gap-4 bg-neutral-50/80 p-4 rounded-xl border border-neutral-100 shrink-0 h-fit hidden md:flex">
            <div className="w-10 h-10 bg-white border border-neutral-200 text-neutral-600 rounded-full flex items-center justify-center shadow-sm">
              <User className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-0.5">
                Author
              </p>
              <p className="text-sm font-semibold text-neutral-900">
                Student Contributor
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* US-16: Core Review Modal Mounting */}
      <FlashcardReviewModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        deckId={deckReadyId} 
      />
    </>
  );
}
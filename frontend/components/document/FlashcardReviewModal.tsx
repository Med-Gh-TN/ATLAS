'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, BrainCircuit, CheckCircle2, Loader2, Timer, PlayCircle, Trophy } from 'lucide-react';
import useAuthStore from '../../lib/store/useAuthStore';
import FlipCard from './FlipCard'; // US-16: Integrating the 60fps 3D primitive

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  next_review_at: string;
  interval: number;
  ease_factor: number;
  repetitions: number;
}

interface FlashcardReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckId: string | null;
}

type ReviewMode = 'STANDARD' | 'SPRINT' | null;

export default function FlashcardReviewModal({ isOpen, onClose, deckId }: FlashcardReviewModalProps) {
  const token = useAuthStore((state) => state.token);
  
  // Core State
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  // US-16: Gamification & Modes State
  const [isStarted, setIsStarted] = useState(false);
  const [mode, setMode] = useState<ReviewMode>(null);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes = 300 seconds
  const [masteredCount, setMasteredCount] = useState(0); // Tracks GOOD/EASY answers

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch due cards when modal opens
  useEffect(() => {
    if (!isOpen || !deckId || !token) return;

    const fetchDueCards = async () => {
      setIsLoading(true);
      setIsComplete(false);
      setIsStarted(false);
      setCurrentIndex(0);
      setIsFlipped(false);
      setMasteredCount(0);
      setMode(null);
      setTimeLeft(300);

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/flashcards/decks/${deckId}/review`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.due_cards.length === 0) {
            setIsComplete(true);
          } else {
            setCards(data.due_cards);
          }
        } else {
          console.error("[ATLAS Architecture] Failed to fetch due cards");
        }
      } catch (error) {
        console.error("[ATLAS Architecture] Network error fetching cards:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDueCards();
  }, [isOpen, deckId, token]);

  // US-16: 5-Minute Sprint Auto-Submission Timer Hook
  useEffect(() => {
    if (isStarted && mode === 'SPRINT' && !isComplete) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setIsComplete(true); // Force auto-submission at 00:00
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStarted, mode, isComplete]);

  const handleStart = (selectedMode: ReviewMode) => {
    setMode(selectedMode);
    setIsStarted(true);
  };

  const handleReview = async (button: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY') => {
    if (!token || cards.length === 0 || isSubmitting) return;

    const currentCard = cards[currentIndex];
    setIsSubmitting(true);

    // Track mastery for progress UI
    if (button === 'GOOD' || button === 'EASY') {
      setMasteredCount(prev => prev + 1);
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/flashcards/${currentCard.id}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ button })
      });

      if (res.ok) {
        if (currentIndex + 1 >= cards.length) {
          setIsComplete(true);
          if (timerRef.current) clearInterval(timerRef.current);
        } else {
          setCurrentIndex((prev) => prev + 1);
          setIsFlipped(false);
        }
      } else {
        console.error("[ATLAS Architecture] Failed to submit review");
      }
    } catch (error) {
      console.error("[ATLAS Architecture] Network error submitting review:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to format sprint timer
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const progressPercentage = cards.length > 0 ? (currentIndex / cards.length) * 100 : 0;
  const masteryPercentage = cards.length > 0 ? Math.round((masteredCount / cards.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col relative">
        
        {/* US-16: Progress Bar (Animated Green Fill) */}
        {isStarted && !isComplete && (
          <div className="absolute top-0 left-0 w-full h-1.5 bg-neutral-100 z-10">
            <div 
              className="h-full bg-green-500 transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/50 mt-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-neutral-900 font-bold">
              <BrainCircuit className="w-5 h-5 text-blue-600" />
              <span>Active Recall</span>
            </div>
            {isStarted && mode === 'SPRINT' && !isComplete && (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${timeLeft < 60 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-orange-100 text-orange-600'}`}>
                <Timer className="w-3.5 h-3.5" />
                {formatTime(timeLeft)}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {isStarted && !isComplete && (
              <span className="text-xs font-semibold text-neutral-400">
                {masteredCount}/{cards.length} Mastered
              </span>
            )}
            <button 
              onClick={onClose}
              className="p-2 hover:bg-neutral-200 rounded-full text-neutral-500 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-8 min-h-[450px] flex flex-col items-center justify-center bg-neutral-50/30">
          
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 text-neutral-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="font-medium">Loading spaced repetition data...</p>
            </div>
          ) : isComplete ? (
            <div className="flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center border border-green-100 mb-2">
                {mode === 'SPRINT' && timeLeft === 0 ? (
                  <Timer className="w-10 h-10 text-orange-500" />
                ) : (
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                )}
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">
                {mode === 'SPRINT' && timeLeft === 0 ? "Time's Up!" : "Session Complete!"}
              </h2>
              <p className="text-neutral-500 max-w-md">
                You achieved a <strong className="text-green-600">{masteryPercentage}% mastery rate</strong> in this session. 
                The SM-2 algorithm has updated the intervals for these cards.
              </p>
              <button 
                onClick={onClose}
                className="mt-6 px-8 py-3 bg-neutral-900 text-white font-bold rounded-xl hover:bg-neutral-800 transition-colors shadow-sm"
              >
                Return to Dashboard
              </button>
            </div>
          ) : !isStarted && cards.length > 0 ? (
            <div className="flex flex-col items-center text-center gap-6 animate-in fade-in duration-300 w-full max-w-md">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100 mb-2">
                <Trophy className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-neutral-900 mb-2">{cards.length} Cards Due</h2>
                <p className="text-neutral-500 text-sm">Select your review mode to begin the session.</p>
              </div>
              
              <div className="grid gap-4 w-full mt-4">
                <button 
                  onClick={() => handleStart('STANDARD')}
                  className="flex items-center justify-between p-4 border-2 border-neutral-200 rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                >
                  <div>
                    <h3 className="font-bold text-neutral-900 group-hover:text-blue-700">Standard Review</h3>
                    <p className="text-xs text-neutral-500 mt-1">Untimed, meticulous study.</p>
                  </div>
                  <PlayCircle className="w-6 h-6 text-neutral-300 group-hover:text-blue-600" />
                </button>

                <button 
                  onClick={() => handleStart('SPRINT')}
                  className="flex items-center justify-between p-4 border-2 border-neutral-200 rounded-2xl hover:border-orange-500 hover:bg-orange-50 transition-all text-left group"
                >
                  <div>
                    <h3 className="font-bold text-neutral-900 group-hover:text-orange-700">5-Minute Sprint</h3>
                    <p className="text-xs text-neutral-500 mt-1">Beat the clock. Auto-submits at 00:00.</p>
                  </div>
                  <Timer className="w-6 h-6 text-neutral-300 group-hover:text-orange-600" />
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-lg flex flex-col gap-6 w-full animate-in slide-in-from-bottom-4 duration-300 h-full">
              
              {/* US-16: GPU Accelerated FlipCard Primitive Integration */}
              <div className="flex-1">
                <FlipCard 
                  question={cards[currentIndex].question}
                  answer={cards[currentIndex].answer}
                  isFlipped={isFlipped}
                  onFlip={() => setIsFlipped(true)}
                  onSwipeLeft={() => handleReview('AGAIN')}
                  onSwipeRight={() => handleReview('GOOD')}
                  disabled={isSubmitting}
                />
              </div>

              {/* SM-2 Evaluation Actions */}
              <div className="h-20 flex items-center justify-center">
                {isFlipped && (
                  <div className="grid grid-cols-4 gap-2 md:gap-3 w-full animate-in slide-in-from-bottom-2 duration-300">
                    <button 
                      onClick={() => handleReview('AGAIN')}
                      disabled={isSubmitting}
                      className="flex flex-col items-center justify-center py-2 md:py-3 border-2 border-red-100 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl transition-colors disabled:opacity-50 font-bold"
                    >
                      <span className="text-[10px] text-red-500/80 mb-0.5">&lt; 1m</span>
                      <span className="text-sm md:text-base">AGAIN</span>
                    </button>
                    <button 
                      onClick={() => handleReview('HARD')}
                      disabled={isSubmitting}
                      className="flex flex-col items-center justify-center py-2 md:py-3 border-2 border-orange-100 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-xl transition-colors disabled:opacity-50 font-bold"
                    >
                      <span className="text-[10px] text-orange-500/80 mb-0.5">1d</span>
                      <span className="text-sm md:text-base">HARD</span>
                    </button>
                    <button 
                      onClick={() => handleReview('GOOD')}
                      disabled={isSubmitting}
                      className="flex flex-col items-center justify-center py-2 md:py-3 border-2 border-green-100 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors disabled:opacity-50 font-bold"
                    >
                      <span className="text-[10px] text-green-500/80 mb-0.5">3d</span>
                      <span className="text-sm md:text-base">GOOD</span>
                    </button>
                    <button 
                      onClick={() => handleReview('EASY')}
                      disabled={isSubmitting}
                      className="flex flex-col items-center justify-center py-2 md:py-3 border-2 border-blue-100 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors disabled:opacity-50 font-bold"
                    >
                      <span className="text-[10px] text-blue-500/80 mb-0.5">7d+</span>
                      <span className="text-sm md:text-base">EASY</span>
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
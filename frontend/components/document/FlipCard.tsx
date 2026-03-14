'use client';

import React, { memo } from 'react';
import { useSwipeable } from 'react-swipeable';
import { RotateCcw } from 'lucide-react';

export interface FlipCardProps {
  question: string;
  answer: string;
  isFlipped: boolean;
  onFlip: () => void;
  onSwipeLeft: () => void;  // Mapped to AGAIN
  onSwipeRight: () => void; // Mapped to GOOD
  disabled?: boolean;
}

/**
 * Hardware-accelerated 3D FlipCard primitive.
 * Enforces strict GPU layer promotion to guarantee 60fps transitions.
 */
const FlipCard = memo(({
  question,
  answer,
  isFlipped,
  onFlip,
  onSwipeLeft,
  onSwipeRight,
  disabled = false
}: FlipCardProps) => {
  // US-16: Mobile touch integration. 
  // Bounded strictly to the card to prevent ghost-swipes on the modal overlay.
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (!disabled && isFlipped) onSwipeLeft();
    },
    onSwipedRight: () => {
      if (!disabled && isFlipped) onSwipeRight();
    },
    preventScrollOnSwipe: true,
    trackMouse: false, // Strict mobile focus per AC
  });

  return (
    <div
      {...swipeHandlers}
      className="relative w-full h-full min-h-[350px] cursor-pointer group perspective-[1000px]"
      onClick={() => {
        if (!disabled && !isFlipped) onFlip();
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isFlipped}
      onKeyDown={(e) => {
        // Defensive Accessibility Validation
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled && !isFlipped) onFlip();
        }
      }}
    >
      {/* Strict hardware-accelerated 3D wrapper.
        Uses arbitrary Tailwind values for preserve-3d to bypass global CSS requirements.
      */}
      <div
        className={`w-full h-full relative [transform-style:preserve-3d] transition-transform duration-500 ease-out will-change-transform transform-gpu ${
          isFlipped ? '[transform:rotateY(180deg)]' : ''
        }`}
      >
        {/* FRONT FACE (Question) */}
        <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] bg-white border border-neutral-200 rounded-3xl shadow-sm p-8 flex flex-col items-center justify-center text-center">
          <span className="text-xs font-bold tracking-widest text-neutral-400 uppercase mb-6">
            Question
          </span>
          <h3 className="text-2xl md:text-3xl font-semibold text-neutral-900 leading-relaxed max-w-lg">
            {question}
          </h3>
          
          {!isFlipped && (
            <div className="absolute bottom-6 flex items-center gap-2 text-neutral-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              <RotateCcw className="w-4 h-4" /> Click to reveal
            </div>
          )}
        </div>

        {/* BACK FACE (Answer) */}
        <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] bg-blue-50/40 border border-blue-200 rounded-3xl shadow-sm p-8 flex flex-col items-center justify-center text-center [transform:rotateY(180deg)]">
          <span className="text-xs font-bold tracking-widest text-blue-500 uppercase mb-6">
            Answer
          </span>
          <div className="text-xl md:text-2xl text-neutral-800 leading-relaxed font-medium overflow-y-auto max-w-lg">
            {answer}
          </div>
          
          {/* Mobile swipe gesture hints - Visible only on mobile viewports when flipped */}
          {isFlipped && (
            <div className="absolute bottom-6 left-0 w-full flex justify-between px-8 text-[11px] font-bold text-neutral-400 uppercase tracking-wider md:hidden">
              <span className="flex items-center gap-1 text-red-500/70 bg-red-50/50 px-2 py-1 rounded">
                ← Again
              </span>
              <span className="flex items-center gap-1 text-green-500/70 bg-green-50/50 px-2 py-1 rounded">
                Good →
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

FlipCard.displayName = 'FlipCard';

export default FlipCard;
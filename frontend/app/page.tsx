'use client';

import React, { useEffect } from 'react';

// Architectural Split: Importing atomic, modular sections to enforce SOLID principles.
// Note: These will throw 'Module not found' errors until Steps 2, 3, and 4 are complete.
import HeroSection from '../components/landing/HeroSection';
import StorySection from '../components/landing/StorySection';
import TrustSection from '../components/landing/TrustSection';

export default function LandingPage() {
  
  // ==========================================
  // SIDE EFFECT: Engagement Telemetry
  // ==========================================
  // US-Requirement: Track user engagement as a first-class architectural citizen.
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollPosition = window.scrollY;
          const windowHeight = window.innerHeight;
          const documentHeight = document.documentElement.scrollHeight;
          const scrollPercentage = (scrollPosition / (documentHeight - windowHeight)) * 100;

          // Fire telemetry events at key scroll thresholds.
          // In production, these console.logs should be piped to an analytics service (e.g., PostHog, Mixpanel).
          if (scrollPercentage > 25 && !window.__atlas_scroll_25) {
            console.info('[Telemetry] Conversion Funnel: User reached 25% scroll depth.');
            window.__atlas_scroll_25 = true;
          }
          if (scrollPercentage > 50 && !window.__atlas_scroll_50) {
            console.info('[Telemetry] Conversion Funnel: User reached 50% scroll depth.');
            window.__atlas_scroll_50 = true;
          }
          if (scrollPercentage > 90 && !window.__atlas_scroll_90) {
            console.info('[Telemetry] Conversion Funnel: User reached 90% scroll depth.');
            window.__atlas_scroll_90 = true;
          }
          
          ticking = false;
        });
        ticking = true;
      }
    };

    // Use passive listener for zero-cost performance optimization (Core Web Vitals)
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <main className="min-h-screen bg-white selection:bg-neutral-900 selection:text-white overflow-x-hidden relative">
      {/* Section 1: The Hook & Value Proposition 
      */}
      <HeroSection />

      {/* Section 2: The Core Scrollytelling Narrative (Problem & ATLAS Solution) 
      */}
      <StorySection />

      {/* Section 3: Social Proof, Quality Assurance, and Call to Action 
      */}
      <TrustSection />
    </main>
  );
}

// Global augmentation to prevent TypeScript compiler errors for our temporary telemetry flags
declare global {
  interface Window {
    __atlas_scroll_25?: boolean;
    __atlas_scroll_50?: boolean;
    __atlas_scroll_90?: boolean;
  }
}
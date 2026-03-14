'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Shield, Lock, Award, ArrowRight } from 'lucide-react';

// --- Zero-Cost Intersection Observer Hook ---
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Unobserve after revealing to save CPU cycles
          if (ref.current) observer.unobserve(ref.current);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) observer.unobserve(ref.current);
    };
  }, []);

  return { ref, isVisible };
}

export default function TrustSection() {
  const { ref: trustRef, isVisible: isTrustVisible } = useScrollReveal();
  const { ref: ctaRef, isVisible: isCtaVisible } = useScrollReveal();

  return (
    <section className="py-24 lg:py-32 bg-white relative overflow-hidden">
      {/* Background Accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Security & Integrity Badges */}
        <div 
          ref={trustRef}
          className={`grid grid-cols-1 md:grid-cols-3 gap-12 mb-32 transition-all duration-1000 ease-out transform ${
            isTrustVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
        >
          <div className="flex flex-col items-center text-center">
            <div className="p-4 bg-neutral-50 rounded-full mb-6 border border-neutral-100">
              <Shield className="w-8 h-8 text-neutral-900" />
            </div>
            <h4 className="text-lg font-bold text-neutral-900 mb-2">Academic Integrity</h4>
            <p className="text-neutral-500 font-medium">Strict moderation policies ensure all materials are legitimate and officially approved.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="p-4 bg-neutral-50 rounded-full mb-6 border border-neutral-100">
              <Lock className="w-8 h-8 text-neutral-900" />
            </div>
            <h4 className="text-lg font-bold text-neutral-900 mb-2">Enterprise Security</h4>
            <p className="text-neutral-500 font-medium">Your data is secured with industry-standard encryption and strict access controls.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="p-4 bg-neutral-50 rounded-full mb-6 border border-neutral-100">
              <Award className="w-8 h-8 text-neutral-900" />
            </div>
            <h4 className="text-lg font-bold text-neutral-900 mb-2">Quality Guaranteed</h4>
            <p className="text-neutral-500 font-medium">A gamified reputation system rewards the highest quality contributors.</p>
          </div>
        </div>

        {/* Final Conversion CTA */}
        <div 
          ref={ctaRef}
          className={`relative bg-neutral-900 rounded-3xl p-12 lg:p-16 text-center overflow-hidden transition-all duration-1000 ease-out transform delay-200 ${
            isCtaVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          {/* Subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-neutral-800 via-neutral-900 to-neutral-900 -z-10"></div>
          
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-6 relative z-10">
            Ready to upgrade your study stack?
          </h2>
          <p className="text-xl text-neutral-400 font-medium max-w-2xl mx-auto mb-10 relative z-10">
            Join ATLAS today. Access verified knowledge, bypass the noise, and elevate your academic performance.
          </p>
          <div className="relative z-10">
            <Link 
              href="/auth/register" 
              className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-white text-neutral-900 rounded-xl font-bold text-lg hover:bg-neutral-100 hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
            >
              Create Free Account
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}
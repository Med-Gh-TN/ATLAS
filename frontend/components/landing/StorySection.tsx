'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Filter, Zap, Database } from 'lucide-react';

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

// --- Reusable Feature Block Component ---
const FeatureBlock = ({ 
  icon: Icon, 
  title, 
  description, 
  delay 
}: { 
  icon: any, 
  title: string, 
  description: string, 
  delay: string 
}) => {
  const { ref, isVisible } = useScrollReveal();
  return (
    <div 
      ref={ref}
      className={`flex flex-col items-start p-8 bg-white rounded-2xl shadow-sm border border-neutral-100 transition-all duration-1000 ease-out transform ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
      }`}
      style={{ transitionDelay: delay }}
    >
      <div className="p-3 bg-neutral-900 rounded-xl mb-6 shadow-md text-white">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-xl font-bold text-neutral-900 mb-3 tracking-tight">{title}</h3>
      <p className="text-neutral-500 leading-relaxed font-medium">{description}</p>
    </div>
  );
};

export default function StorySection() {
  const { ref: headerRef, isVisible: isHeaderVisible } = useScrollReveal();

  return (
    <section className="py-24 lg:py-32 bg-neutral-50 border-t border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Narrative Header */}
        <div 
          ref={headerRef}
          className={`max-w-3xl mb-20 transition-all duration-1000 ease-out transform ${
            isHeaderVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'
          }`}
        >
          <h2 className="text-sm font-extrabold tracking-widest text-neutral-400 uppercase mb-4">
            The Knowledge Crisis
          </h2>
          <h3 className="text-4xl sm:text-5xl font-extrabold text-neutral-900 tracking-tight leading-tight mb-6">
            Stop searching through chaos.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-500 to-neutral-400">
              Start finding answers.
            </span>
          </h3>
          <p className="text-lg text-neutral-600 font-medium leading-relaxed max-w-2xl">
            Traditional learning platforms are dumping grounds for unverified, duplicate files. ATLAS actively moderates, ranks, and structures academic documents using advanced neural networks so you only study what matters.
          </p>
        </div>

        {/* Value Proposition Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          <FeatureBlock 
            icon={Filter}
            title="Peer-Reviewed Precision"
            description="Every uploaded document passes through a stringent moderation pipeline. Teachers and top-tier students verify accuracy, ensuring you never study from flawed notes again."
            delay="100ms"
          />
          <FeatureBlock 
            icon={BrainCircuit}
            title="Neural Semantic Search"
            description="Don't rely on exact keyword matches. Our hybrid search engine understands the context of your query, instantly locating the exact paragraph you need within hundreds of PDFs."
            delay="200ms"
          />
          <FeatureBlock 
            icon={Database}
            title="Version Control for Knowledge"
            description="Course materials evolve. ATLAS maintains a strict version history of every document. Always know you are studying the most up-to-date syllabus and lecture notes."
            delay="300ms"
          />
          <FeatureBlock 
            icon={Zap}
            title="Zero-Latency Delivery"
            description="Built on a high-performance Edge architecture. Whether you are downloading a heavy study guide or querying the database, ATLAS delivers results in milliseconds."
            delay="400ms"
          />
        </div>

      </div>
    </section>
  );
}
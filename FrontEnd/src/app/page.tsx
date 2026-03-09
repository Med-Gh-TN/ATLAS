import React from 'react';
import Link from 'next/link';
import { BookOpen, GraduationCap, ArrowRight, BrainCircuit } from 'lucide-react';

// ============================================================================
// ATLAS - Root Landing Page
// Author: Mouhamed (Lead FE)
// Description: The public-facing welcome page. Acts as the front door,
// directing users to the authentication flows.
// URL: http://localhost:3000/
// ============================================================================

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl w-full text-center space-y-12">
        
        {/* Logo / Icon Area */}
        <div className="flex justify-center animate-fade-in-up">
          <div className="p-5 bg-blue-100 rounded-full shadow-inner border border-blue-200">
            <GraduationCap className="w-16 h-16 text-blue-600" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            Bienvenue sur <span className="text-blue-600">ATLAS</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-gray-500 sm:text-xl leading-relaxed">
            Aggregated Tunisian Learning & Academic System.
            Centralisez vos cours, générez des quiz par IA, et collaborez intelligemment avec votre communauté étudiante.
          </p>
        </div>

        {/* Call to Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 text-base font-medium text-white transition-all bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 md:py-4 md:text-lg md:px-10 shadow-md hover:shadow-lg hover:-translate-y-0.5"
          >
            Se connecter
            <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
          <Link
            href="/register"
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 text-base font-medium text-blue-700 transition-all bg-blue-50 border border-transparent rounded-lg hover:bg-blue-100 md:py-4 md:text-lg md:px-10"
          >
            Créer un compte
          </Link>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 text-left border-t border-gray-200 mt-12">
          <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-blue-100 transition-colors">
            <BookOpen className="w-8 h-8 text-blue-500 mb-4" />
            <h3 className="text-lg font-bold text-gray-900">Bibliothèque Centralisée</h3>
            <p className="mt-2 text-sm text-gray-500">
              Accédez aux cours officiels uploadés et validés par vos enseignants, indexés pour une recherche instantanée.
            </p>
          </div>
          <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-amber-100 transition-colors">
            <BrainCircuit className="w-8 h-8 text-amber-500 mb-4" />
            <h3 className="text-lg font-bold text-gray-900">Suite IA Intégrée</h3>
            <p className="mt-2 text-sm text-gray-500">
              Générez des flashcards SM-2, des quiz auto-corrigés et des résumés interactifs directement depuis vos PDF.
            </p>
          </div>
          <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-green-100 transition-colors">
            <GraduationCap className="w-8 h-8 text-green-500 mb-4" />
            <h3 className="text-lg font-bold text-gray-900">Communauté Active</h3>
            <p className="mt-2 text-sm text-gray-500">
              Participez au forum académique structuré, gagnez de l'XP et annotez les documents de manière collaborative.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
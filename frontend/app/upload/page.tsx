// frontend/app/upload/page.tsx

'use client';

import React from 'react';
import ContributionForm from '../../components/upload/ContributionForm';
import { BookOpen, ShieldCheck, Zap, AlertTriangle } from 'lucide-react';

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Partager un document
          </h1>
          <p className="text-slate-500 mt-2 max-w-2xl text-sm sm:text-base">
            Contribuez à la bibliothèque de connaissances ATLAS. Chaque document aide vos pairs et vous permet de gagner de l'expérience (XP).
          </p>
        </div>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Left Column: The Upload Form */}
          <div className="lg:col-span-2">
            <ContributionForm />
          </div>

          {/* Right Column: Guidelines & Info */}
          <div className="lg:col-span-1 space-y-6 sticky top-24">
            
            {/* Moderation Rules Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider">
                Processus & Règles
              </h3>
              <ul className="space-y-5">
                <li className="flex gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-600 leading-relaxed">
                    <strong className="text-slate-900">Modération stricte.</strong> Tous les documents passent en statut <code>PENDING</code> et doivent être approuvés par un enseignant ou un administrateur avant d'être publics.
                  </p>
                </li>
                <li className="flex gap-3">
                  <BookOpen className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-600 leading-relaxed">
                    <strong className="text-slate-900">Traitement IA.</strong> Une fois uploadé, notre pipeline OCR (PaddleOCR) lira automatiquement le contenu pour le rendre cherchable via l'IA.
                  </p>
                </li>
                <li className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-600 leading-relaxed">
                    <strong className="text-slate-900">Détection de doublons.</strong> La plateforme bloque automatiquement les fichiers ayant le même hash SHA-256. Ne réuploadez pas un cours existant.
                  </p>
                </li>
              </ul>
            </div>

            {/* Gamification Card (US-11) */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-amber-900">Récompenses</h3>
              </div>
              <p className="text-sm text-amber-800 leading-relaxed">
                Si votre contribution est validée par la modération, vous recevrez automatiquement <strong>+50 XP</strong> sur votre profil étudiant !
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
// frontend/app/document/[id]/page.tsx

'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowLeft, AlertCircle, User, Calendar, Tag } from 'lucide-react';
import api from '../../../lib/api';
import type { DocumentVersion, Contribution } from '../../../types/api';

import PdfViewer from '../../../components/document/PdfViewer';
import VersionTimeline from '../../../components/document/VersionTimeline';

export default function DocumentViewPage() {
  const params = useParams();
  const router = useRouter();
  const versionId = params.id as string;

  // Local state to handle version switching via the timeline
  const [activeVersionId, setActiveVersionId] = useState<string>(versionId);

  // 1. Fetch the specific document version to get the storage path and contribution ID
  const { 
    data: currentVersion, 
    isLoading: isVersionLoading, 
    isError: isVersionError 
  } = useQuery({
    queryKey: ['version', activeVersionId],
    queryFn: async () => {
      const res = await api.get<DocumentVersion>(`/version/${activeVersionId}`);
      return res.data;
    },
    enabled: !!activeVersionId,
  });

  // 2. Fetch the parent contribution (Title, Description, etc.)
  const { 
    data: contribution, 
    isLoading: isContributionLoading 
  } = useQuery({
    queryKey: ['contribution', currentVersion?.contribution_id],
    queryFn: async () => {
      const res = await api.get<Contribution>(`/contributions/${currentVersion?.contribution_id}`);
      return res.data;
    },
    enabled: !!currentVersion?.contribution_id,
  });

  // 3. Fetch all versions for the timeline
  const { 
    data: allVersions 
  } = useQuery({
    queryKey: ['contributionVersions', currentVersion?.contribution_id],
    queryFn: async () => {
      const res = await api.get<DocumentVersion[]>(`/contributions/${currentVersion?.contribution_id}/versions`);
      return res.data;
    },
    enabled: !!currentVersion?.contribution_id,
  });

  const handleVersionSwitch = (newVersionId: string) => {
    setActiveVersionId(newVersionId);
    // Optional: Update the URL without full reload
    window.history.pushState(null, '', `/app/document/${newVersionId}`);
  };

  const isLoading = isVersionLoading || isContributionLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 pt-24 pb-12 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-slate-500 font-medium">Chargement du document ATLAS...</p>
      </div>
    );
  }

  if (isVersionError || !currentVersion || !contribution) {
    return (
      <div className="min-h-screen bg-slate-50 pt-24 pb-12 px-4 flex flex-col items-center">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Document introuvable</h2>
          <p className="text-slate-500 mb-6">
            Ce document a peut-être été supprimé, ou l'URL est invalide.
          </p>
          <button 
            onClick={() => router.push('/app/search')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Retour à la recherche
          </button>
        </div>
      </div>
    );
  }

  // NOTE FOR TONY: Replace this dummy URL with your actual MinIO proxy endpoint when ready.
  // Example: const pdfUrl = `${process.env.NEXT_PUBLIC_API_URL}/documents/download/${currentVersion.storage_path}`;
  const pdfUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex flex-col gap-4">
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors w-fit"
          >
            <ArrowLeft className="w-4 h-4" /> Retour aux résultats
          </button>
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-md">
                  {contribution.status === 'APPROVED' ? 'Officiel' : 'En Révision'}
                </span>
                <span className="text-sm font-medium text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {new Date(currentVersion.uploaded_at).toLocaleDateString('fr-FR')}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
                {contribution.title}
              </h1>
              <p className="text-slate-600 max-w-3xl">
                {contribution.description || "Aucune description fournie par l'auteur pour cette contribution."}
              </p>
            </div>
            
            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 shrink-0 h-fit">
              <div className="w-10 h-10 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center font-bold">
                ET
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> Auteur
                </p>
                <p className="text-xs text-slate-500">Étudiant Contributeur</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Left Column: PDF Viewer */}
          <div className="lg:col-span-3">
            <PdfViewer fileUrl={pdfUrl} />
          </div>

          {/* Right Column: Version Timeline & Metadata */}
          <div className="lg:col-span-1 space-y-6">
            <VersionTimeline 
              versions={allVersions || []} 
              currentVersionId={activeVersionId}
              onVersionSelect={handleVersionSwitch}
            />

            {/* AI Tags / Context Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-600" />
                Mots-clés IA (KeyBERT)
              </h3>
              <div className="flex flex-wrap gap-2">
                {/* Fallback tags until backend US-08 is fully wired to return them */}
                {['Intelligence Artificielle', 'Structure de Données', 'Algorithmique', 'Python'].map((tag, idx) => (
                  <span key={idx} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md border border-slate-200">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
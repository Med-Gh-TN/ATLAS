'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Sparkles, AlertCircle, Loader2, Archive, ChevronDown } from 'lucide-react';

// Custom Hook Controllers (The "Brain")
import { useDocumentWorkspace } from '../../../lib/hooks/useDocumentWorkspace';
import { useQuizFlow } from '../../../lib/hooks/useQuizFlow';
import { useStudyTools } from '../../../lib/hooks/useStudyTools';

// Store
import useAuthStore from '../../../lib/store/useAuthStore';

// Domain Components (The "Limbs")
import DocumentHeader from '../../../components/document/DocumentHeader';
import VersionTimeline from '../../../components/document/VersionTimeline';
import ChatInterface from '../../../components/document/ChatInterface';
import QuizConfigModal from '../../../components/document/QuizConfigModal';
import QuizPlayer from '../../../components/document/QuizPlayer';
import QuizResults from '../../../components/document/QuizResults';
import SummaryViewer from '../../../components/document/SummaryViewer';
import MindMapViewer from '../../../components/document/MindMapViewer';
import RevisionBanner from '../../../components/document/workspace/RevisionBanner';
import WorkspaceToolbar from '../../../components/document/workspace/WorkspaceToolbar';

// Dynamic PDF Viewer to prevent SSR DOMMatrix crashes
const PdfViewer = dynamic(() => import('../../../components/document/PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center w-full min-h-[600px] bg-neutral-50/50 rounded-2xl border border-neutral-100">
      <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
    </div>
  ),
});

export default function DocumentViewPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const versionId = params.id as string;

  // 1. Initialize Controllers
  const workspace = useDocumentWorkspace(versionId);
  const quiz = useQuizFlow();
  const studyTools = useStudyTools(workspace.activeVersionId);

  // 2. Local UI View State (Layout orchestration only)
  const [targetPdfPage, setTargetPdfPage] = useState<number | null>(null);
  const [highlightedChunk, setHighlightedChunk] = useState<string | null>(null);
  const [activeRightPane, setActiveRightPane] = useState<'pdf' | 'summary' | 'mindmap'>('pdf');
  const [activeMobileTab, setActiveMobileTab] = useState<'chat' | 'pdf' | 'summary' | 'mindmap'>('chat');

  // Sync navigation from Chat to PDF
  const handleSourceClick = (page: number, chunk: string) => {
    setTargetPdfPage(page);
    setHighlightedChunk(chunk);
    setActiveRightPane('pdf');
    if (window.innerWidth < 1024) setActiveMobileTab('pdf');
  };

  // 3. Loading & Error Boundaries
  if (workspace.isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 pt-32 pb-12 flex flex-col items-center justify-center space-y-5">
        <Sparkles className="w-8 h-8 animate-pulse text-neutral-300" />
        <p className="text-neutral-500 font-medium tracking-wide text-sm">Loading ATLAS document orchestration...</p>
      </div>
    );
  }

  if (workspace.isVersionError || !workspace.currentVersion || !workspace.contribution) {
    return (
      <div className="min-h-screen bg-neutral-50 pt-32 pb-12 px-4 flex flex-col items-center">
        <div className="bg-white p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-neutral-100 text-center max-w-md animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-neutral-900 mb-2 tracking-tight">Document Not Found</h2>
          <p className="text-neutral-500 mb-8 text-sm leading-relaxed">
            This document may have been removed, or the link you followed is invalid.
          </p>
          <button 
            onClick={() => router.push('/search')}
            className="px-6 py-2.5 bg-neutral-900 text-white text-sm font-semibold rounded-lg hover:bg-neutral-800 transition-colors shadow-sm w-full sm:w-auto"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  const pdfUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

  // US-12 ARCHITECTURE: Group versions by academic year or fallback to upload year
  const allVersions = workspace.allVersions || [];
  const getYear = (v: any) => v.academic_year || new Date(v.uploaded_at || v.created_at || Date.now()).getFullYear().toString();

  const groupedVersions = allVersions.reduce((acc, v) => {
    const year = getYear(v);
    if (!acc[year]) acc[year] = [];
    acc[year].push(v);
    return acc;
  }, {} as Record<string, typeof allVersions>);

  const sortedYears = Object.keys(groupedVersions).sort((a, b) => b.localeCompare(a));
  const currentYear = sortedYears[0];
  const currentVersions = currentYear ? groupedVersions[currentYear] : [];
  const archivedYears = sortedYears.slice(1);

  // 4. Main Render
  return (
    <div className="min-h-screen bg-neutral-50 pt-24 pb-20 px-4 sm:px-6 lg:px-8 font-sans flex flex-col relative">
      <div className="max-w-[1600px] w-full mx-auto flex-grow flex flex-col space-y-6">
        
        {/* Core Metadata */}
        <DocumentHeader 
          contribution={workspace.contribution} 
          currentVersion={workspace.currentVersion} 
        />

        {/* US-11 Resubmission Hook */}
        <RevisionBanner 
          contribution={workspace.contribution}
          currentUserId={user?.id}
          onFileUpload={workspace.uploadRevision}
          isUploading={workspace.isUploadingRevision}
        />

        {/* Dynamic Mode Routing */}
        {quiz.quizState === 'playing' && quiz.quizSessionData ? (
          <div className="flex-grow flex items-center justify-center py-8 animate-in fade-in duration-500">
            <QuizPlayer 
              sessionId={quiz.quizSessionData.sessionId}
              timerMinutes={quiz.quizSessionData.timerMinutes}
              questions={quiz.quizSessionData.questions}
              onComplete={quiz.handleQuizComplete}
            />
          </div>
        ) : quiz.quizState === 'results' && quiz.quizResult ? (
          <div className="flex-grow py-8 animate-in fade-in duration-500">
            <QuizResults result={quiz.quizResult} onClose={quiz.handleCloseQuiz} />
          </div>
        ) : (
          <>
            {/* Control Center */}
            <WorkspaceToolbar 
              activeMobileTab={activeMobileTab}
              setActiveMobileTab={setActiveMobileTab}
              activeRightPane={activeRightPane}
              setActiveRightPane={setActiveRightPane}
              hasSummary={!!studyTools.summaryData}
              hasMindMap={!!studyTools.mindmapData}
              onGenerateSummaryClick={() => studyTools.setIsSummaryModalOpen(true)}
              onGenerateMindmapClick={() => studyTools.handleGenerateMindmap(() => {
                setActiveRightPane('mindmap');
                if (window.innerWidth < 1024) setActiveMobileTab('mindmap');
              })}
              isGeneratingMindmap={studyTools.isGeneratingMindmap}
              onStartQuizClick={quiz.openQuizConfig}
            />

            {/* Main Layout Grid */}
            <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[700px] items-stretch">
              
              {/* Left Pane: Chat & Timeline */}
              <div className={`lg:col-span-5 flex flex-col space-y-6 ${activeMobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
                <div className="bg-white rounded-2xl border border-neutral-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 shrink-0 max-h-[500px] overflow-y-auto custom-scrollbar">
                  
                  {/* US-12: Current Year / Primary Timeline */}
                  {currentVersions.length > 0 ? (
                    <VersionTimeline 
                      versions={currentVersions} 
                      currentVersionId={workspace.activeVersionId}
                      onVersionSelect={workspace.handleVersionSwitch}
                    />
                  ) : (
                    <p className="text-sm text-neutral-500 text-center py-4">Aucune version disponible.</p>
                  )}

                  {/* US-12: Archives Accordion */}
                  {archivedYears.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-neutral-100 space-y-3">
                      <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-2">Années Précédentes</h4>
                      {archivedYears.map(year => (
                        <details key={year} className="group">
                          <summary className="flex items-center justify-between cursor-pointer list-none p-3 bg-neutral-50 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition-colors">
                            <div className="flex items-center gap-2">
                              <Archive className="w-4 h-4 text-neutral-500 group-open:text-neutral-900" />
                              <span className="font-semibold text-sm text-neutral-700 group-open:text-neutral-900">Archives — {year}</span>
                            </div>
                            <ChevronDown className="w-4 h-4 text-neutral-400 group-open:rotate-180 transition-transform duration-200" />
                          </summary>
                          <div className="mt-4 pl-1 pb-2 animate-in slide-in-from-top-2">
                            <VersionTimeline
                              versions={groupedVersions[year]}
                              currentVersionId={workspace.activeVersionId}
                              onVersionSelect={workspace.handleVersionSwitch}
                            />
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>

                <ChatInterface 
                  documentVersionId={workspace.currentVersion.id} 
                  onSourceClick={handleSourceClick} 
                />
              </div>

              {/* Right Pane: PDF / Summary / Mindmap */}
              <div className={`lg:col-span-7 bg-white border border-neutral-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden ${activeMobileTab !== 'chat' ? 'block' : 'hidden lg:block'}`}>
                {studyTools.isGeneratingSummary || studyTools.isGeneratingMindmap ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <Sparkles className="w-10 h-10 animate-spin text-blue-500" />
                    <p className="text-sm font-medium text-slate-600 animate-pulse">
                      ATLAS génère votre contenu. Veuillez patienter...
                    </p>
                  </div>
                ) : activeRightPane === 'mindmap' && studyTools.mindmapData ? (
                  <MindMapViewer 
                    initialNodes={studyTools.mindmapData.nodes} 
                    initialEdges={studyTools.mindmapData.edges} 
                    title={studyTools.mindmapData.title} 
                  />
                ) : activeRightPane === 'summary' && studyTools.summaryData ? (
                  <SummaryViewer 
                    summaryId={studyTools.summaryData.id} 
                    format={studyTools.summaryData.format} 
                    content={studyTools.summaryData.content} 
                  />
                ) : (
                  <PdfViewer 
                    fileUrl={pdfUrl} 
                    targetPage={targetPdfPage} 
                    highlightedChunk={highlightedChunk}
                    onSyncComplete={() => { 
                      setTargetPdfPage(null); 
                      setHighlightedChunk(null); 
                    }}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {/* Global Modals */}
        <QuizConfigModal 
          isOpen={quiz.quizState === 'configuring'}
          onClose={quiz.handleCloseQuiz}
          documentId={workspace.currentVersion.id}
          onQuizReady={quiz.handleQuizReady}
        />

        {studyTools.isSummaryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Générer un Résumé</h3>
                <button 
                  onClick={() => studyTools.setIsSummaryModalOpen(false)} 
                  className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-2 transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={(e) => studyTools.handleGenerateSummary(e, () => {
                setActiveRightPane('summary');
                if (window.innerWidth < 1024) setActiveMobileTab('summary');
              })} className="space-y-5">
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Format du résumé</label>
                  <select 
                    value={studyTools.summaryFormatForm} 
                    onChange={e => studyTools.setSummaryFormatForm(e.target.value as any)} 
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="EXECUTIVE">Exécutif (5 Points clés)</option>
                    <option value="STRUCTURED">Structuré (Plan hiérarchique)</option>
                    <option value="COMPARATIVE">Comparatif (Différence des versions)</option>
                  </select>
                </div>
                
                {studyTools.summaryFormatForm === 'COMPARATIVE' && (
                  <div className="animate-in slide-in-from-top-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Version à comparer</label>
                    <select 
                      required 
                      value={studyTools.summaryCompareVersionId} 
                      onChange={e => studyTools.setSummaryCompareVersionId(e.target.value)} 
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                      <option value="" disabled>Sélectionner une version antérieure</option>
                      {workspace.allVersions?.filter(v => v.id !== workspace.activeVersionId).map(v => (
                        <option key={v.id} value={v.id}>
                          Version {v.version_number} ({new Date(v.uploaded_at || v.created_at).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                    {(!workspace.allVersions || workspace.allVersions.filter(v => v.id !== workspace.activeVersionId).length === 0) && (
                      <p className="text-xs text-rose-500 mt-1">Aucune autre version disponible pour comparaison.</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Langue cible</label>
                  <select 
                    value={studyTools.summaryLangForm} 
                    onChange={e => studyTools.setSummaryLangForm(e.target.value)} 
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="fr">Français</option>
                    <option value="en">Anglais</option>
                    <option value="ar">Arabe</option>
                  </select>
                </div>

                <div className="pt-2">
                  <button 
                    type="submit" 
                    disabled={studyTools.summaryFormatForm === 'COMPARATIVE' && !studyTools.summaryCompareVersionId}
                    className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors shadow-md flex justify-center items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" /> Lancer la Génération
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, AlertCircle, MessageSquare, FileText, BrainCircuit, AlignLeft, Network } from 'lucide-react';
import api, { studyApi } from '../../../lib/api';
import type { DocumentVersion, Contribution, SanitizedQuestionResponse, QuizEvaluationResult, SummaryFormat } from '../../../types/api';

// Existing Components
import PdfViewer from '../../../components/document/PdfViewer';
import VersionTimeline from '../../../components/document/VersionTimeline';
import DocumentHeader from '../../../components/document/DocumentHeader';
import ChatInterface from '../../../components/document/ChatInterface';

// US-17 Components (Quiz Generation & Simulation)
import QuizConfigModal from '../../../components/document/QuizConfigModal';
import QuizPlayer from '../../../components/document/QuizPlayer';
import QuizResults from '../../../components/document/QuizResults';

// US-18 Components (Summaries & Concept Maps)
import SummaryViewer from '../../../components/document/SummaryViewer';
import MindMapViewer from '../../../components/document/MindMapViewer';

type QuizModeState = 'idle' | 'configuring' | 'playing' | 'results';
type RightPaneState = 'pdf' | 'summary' | 'mindmap';

export default function DocumentViewPage() {
  const params = useParams();
  const router = useRouter();
  const versionId = params.id as string;

  // --- STANDARD DOCUMENT STATE ---
  const [activeVersionId, setActiveVersionId] = useState<string>(versionId);
  const [targetPdfPage, setTargetPdfPage] = useState<number | null>(null);
  const [highlightedChunk, setHighlightedChunk] = useState<string | null>(null);
  
  const [activeRightPane, setActiveRightPane] = useState<RightPaneState>('pdf');
  const [activeMobileTab, setActiveMobileTab] = useState<'chat' | 'pdf' | 'summary' | 'mindmap'>('chat');

  // --- US-17 QUIZ STATE MACHINE ---
  const [quizState, setQuizState] = useState<QuizModeState>('idle');
  const [quizSessionData, setQuizSessionData] = useState<{
    sessionId: string;
    timerMinutes: number;
    questions: SanitizedQuestionResponse[];
  } | null>(null);
  const [quizResult, setQuizResult] = useState<QuizEvaluationResult | null>(null);

  // --- US-18 SUMMARY & MIND MAP STATE ---
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [summaryFormatForm, setSummaryFormatForm] = useState<SummaryFormat>('EXECUTIVE');
  const [summaryLangForm, setSummaryLangForm] = useState('fr');
  const [summaryCompareVersionId, setSummaryCompareVersionId] = useState<string>('');

  const [summaryData, setSummaryData] = useState<{ id: string, format: SummaryFormat, content: any } | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const [mindmapData, setMindmapData] = useState<{ nodes: any[], edges: any[], title: string } | null>(null);
  const [isGeneratingMindmap, setIsGeneratingMindmap] = useState(false);

  // 1. Fetch the specific document version
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
    window.history.pushState(null, '', `/app/document/${newVersionId}`);
  };

  const handleSourceClick = (page: number, chunk: string) => {
    setTargetPdfPage(page);
    setHighlightedChunk(chunk);
    setActiveRightPane('pdf');
    if (window.innerWidth < 1024) {
      setActiveMobileTab('pdf');
    }
  };

  // --- QUIZ STATE HANDLERS ---
  const handleQuizReady = (sessionId: string, timerMinutes: number, questions: SanitizedQuestionResponse[]) => {
    setQuizSessionData({ sessionId, timerMinutes, questions });
    setQuizState('playing');
  };

  const handleQuizComplete = (result: QuizEvaluationResult) => {
    setQuizResult(result);
    setQuizState('results');
  };

  const handleCloseQuiz = () => {
    setQuizState('idle');
    setQuizSessionData(null);
    setQuizResult(null);
  };

  // --- US-18 ACTION HANDLERS ---
  const handleGenerateMindmap = async () => {
    setIsGeneratingMindmap(true);
    try {
      const res = await studyApi.generateMindMap({ 
        document_version_id: activeVersionId, 
        target_lang: 'fr' 
      });
      setMindmapData({ nodes: res.nodes, edges: res.edges, title: res.title });
      setActiveRightPane('mindmap');
      if (window.innerWidth < 1024) setActiveMobileTab('mindmap');
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération de la carte mentale.");
    } finally {
      setIsGeneratingMindmap(false);
    }
  };

  const handleGenerateSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingSummary(true);
    setIsSummaryModalOpen(false);
    try {
      const payload: any = {
        document_version_id: activeVersionId,
        format_type: summaryFormatForm,
        target_lang: summaryLangForm
      };
      
      if (summaryFormatForm === 'COMPARATIVE') {
        payload.document_version_id_v2 = summaryCompareVersionId;
      }
      
      const res = await studyApi.generateSummary(payload);
      setSummaryData({ format: res.format, content: res.content, id: res.summary_id });
      setActiveRightPane('summary');
      if (window.innerWidth < 1024) setActiveMobileTab('summary');
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération du résumé.");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const isLoading = isVersionLoading || isContributionLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 pt-32 pb-12 flex flex-col items-center justify-center space-y-5">
        <Sparkles className="w-8 h-8 animate-pulse text-neutral-300" />
        <p className="text-neutral-500 font-medium tracking-wide text-sm">Loading ATLAS document orchestration...</p>
      </div>
    );
  }

  if (isVersionError || !currentVersion || !contribution) {
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

  return (
    <div className="min-h-screen bg-neutral-50 pt-24 pb-20 px-4 sm:px-6 lg:px-8 font-sans flex flex-col relative">
      <div className="max-w-[1600px] w-full mx-auto flex-grow flex flex-col space-y-6">
        
        {/* Extracted Header Metadata Component */}
        <DocumentHeader contribution={contribution} currentVersion={currentVersion} />

        {/* --- DYNAMIC VIEW ROUTING BASED ON QUIZ STATE --- */}
        {quizState === 'playing' && quizSessionData ? (
          // EXAM FOCUS MODE
          <div className="flex-grow flex items-center justify-center py-8 animate-in fade-in duration-500">
            <QuizPlayer 
              sessionId={quizSessionData.sessionId}
              timerMinutes={quizSessionData.timerMinutes}
              questions={quizSessionData.questions}
              onComplete={handleQuizComplete}
            />
          </div>
        ) : quizState === 'results' && quizResult ? (
          // EVALUATION & FEEDBACK MODE
          <div className="flex-grow py-8 animate-in fade-in duration-500">
            <QuizResults 
              result={quizResult}
              onClose={handleCloseQuiz}
            />
          </div>
        ) : (
          // IDLE MODE: STANDARD DOCUMENT VIEW
          <>
            {/* Contextual Action Bar & Mobile Tabs */}
            <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
              
              <div className="lg:hidden flex w-full gap-2">
                <button
                  onClick={() => setActiveMobileTab('chat')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-lg transition-all ${activeMobileTab === 'chat' ? 'bg-neutral-900 text-white shadow-md' : 'text-neutral-500 hover:bg-neutral-50'}`}
                >
                  <MessageSquare className="w-4 h-4" /> IA
                </button>
                <button
                  onClick={() => { setActiveRightPane('pdf'); setActiveMobileTab('pdf'); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-lg transition-all ${activeRightPane === 'pdf' && activeMobileTab !== 'chat' ? 'bg-neutral-900 text-white shadow-md' : 'text-neutral-500 hover:bg-neutral-50'}`}
                >
                  <FileText className="w-4 h-4" /> Doc
                </button>
              </div>

              {/* View Switchers & Generation Actions */}
              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <div className="hidden lg:flex p-1 bg-slate-100 rounded-lg mr-2">
                  <button onClick={() => setActiveRightPane('pdf')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeRightPane === 'pdf' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                    Original
                  </button>
                  {summaryData && (
                    <button onClick={() => setActiveRightPane('summary')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeRightPane === 'summary' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                      Résumé
                    </button>
                  )}
                  {mindmapData && (
                    <button onClick={() => setActiveRightPane('mindmap')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeRightPane === 'mindmap' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                      Carte
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setIsSummaryModalOpen(true)}
                  className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                >
                  <AlignLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Générer Résumé</span>
                </button>
                
                <button
                  onClick={handleGenerateMindmap}
                  disabled={isGeneratingMindmap}
                  className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Network className="w-4 h-4" />
                  <span className="hidden sm:inline">Carte Mentale</span>
                </button>

                <div className="h-6 w-px bg-neutral-300 hidden lg:block mx-1"></div>

                <button
                  onClick={() => setQuizState('configuring')}
                  className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md transition-colors"
                >
                  <BrainCircuit className="w-4 h-4" />
                  Simuler un Examen IA
                </button>
              </div>
            </div>

            {/* Main Layout Grid: Chat (Left) / Content Pane (Right) */}
            <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[700px] items-stretch">
              
              {/* Left Column: Chat Interface & Timeline */}
              <div className={`lg:col-span-5 flex flex-col space-y-6 ${activeMobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
                
                <div className="bg-white rounded-2xl border border-neutral-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 shrink-0">
                  <VersionTimeline 
                    versions={allVersions || []} 
                    currentVersionId={activeVersionId}
                    onVersionSelect={handleVersionSwitch}
                  />
                </div>

                <ChatInterface 
                  documentVersionId={currentVersion.id} 
                  onSourceClick={handleSourceClick} 
                />
              </div>

              {/* Right Column: Dynamic Pane (PDF / Summary / MindMap) */}
              <div className={`lg:col-span-7 bg-white border border-neutral-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden ${activeMobileTab !== 'chat' ? 'block' : 'hidden lg:block'}`}>
                
                {isGeneratingSummary || isGeneratingMindmap ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <Sparkles className="w-10 h-10 animate-spin text-blue-500" />
                    <p className="text-sm font-medium text-slate-600 animate-pulse">
                      ATLAS génère votre contenu. Veuillez patienter...
                    </p>
                  </div>
                ) : activeRightPane === 'mindmap' && mindmapData ? (
                  <MindMapViewer 
                    initialNodes={mindmapData.nodes} 
                    initialEdges={mindmapData.edges} 
                    title={mindmapData.title} 
                  />
                ) : activeRightPane === 'summary' && summaryData ? (
                  <SummaryViewer 
                    summaryId={summaryData.id} 
                    format={summaryData.format} 
                    content={summaryData.content} 
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

        {/* MODALS */}
        <QuizConfigModal 
          isOpen={quizState === 'configuring'}
          onClose={() => setQuizState('idle')}
          documentId={currentVersion.id}
          onQuizReady={handleQuizReady}
        />

        {/* US-18 Summary Config Modal */}
        {isSummaryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Générer un Résumé</h3>
                <button 
                  onClick={() => setIsSummaryModalOpen(false)} 
                  className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-2 transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={handleGenerateSummary} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Format du résumé</label>
                  <select 
                    value={summaryFormatForm} 
                    onChange={e => setSummaryFormatForm(e.target.value as SummaryFormat)} 
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="EXECUTIVE">Exécutif (5 Points clés)</option>
                    <option value="STRUCTURED">Structuré (Plan hiérarchique)</option>
                    <option value="COMPARATIVE">Comparatif (Différence des versions)</option>
                  </select>
                </div>
                
                {summaryFormatForm === 'COMPARATIVE' && (
                  <div className="animate-in slide-in-from-top-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Version à comparer</label>
                    <select 
                      required 
                      value={summaryCompareVersionId} 
                      onChange={e => setSummaryCompareVersionId(e.target.value)} 
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                      <option value="" disabled>Sélectionner une version antérieure</option>
                      {allVersions?.filter(v => v.id !== activeVersionId).map(v => (
                        <option key={v.id} value={v.id}>
                          Version {v.version_number} ({new Date(v.uploaded_at).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                    {(!allVersions || allVersions.filter(v => v.id !== activeVersionId).length === 0) && (
                      <p className="text-xs text-rose-500 mt-1">Aucune autre version disponible pour comparaison.</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Langue cible</label>
                  <select 
                    value={summaryLangForm} 
                    onChange={e => setSummaryLangForm(e.target.value)} 
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
                    disabled={summaryFormatForm === 'COMPARATIVE' && !summaryCompareVersionId}
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
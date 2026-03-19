import React from 'react';
import { MessageSquare, FileText, AlignLeft, Network, BrainCircuit } from 'lucide-react';

export interface WorkspaceToolbarProps {
  // Mobile Tab State
  activeMobileTab: 'chat' | 'pdf' | 'summary' | 'mindmap';
  setActiveMobileTab: (tab: 'chat' | 'pdf' | 'summary' | 'mindmap') => void;
  
  // Desktop Pane State
  activeRightPane: 'pdf' | 'summary' | 'mindmap';
  setActiveRightPane: (pane: 'pdf' | 'summary' | 'mindmap') => void;
  
  // Visibility Flags
  hasSummary: boolean;
  hasMindMap: boolean;
  
  // Action Callbacks
  onGenerateSummaryClick: () => void;
  onGenerateMindmapClick: () => void;
  isGeneratingMindmap: boolean;
  onStartQuizClick: () => void;
}

export default function WorkspaceToolbar({
  activeMobileTab,
  setActiveMobileTab,
  activeRightPane,
  setActiveRightPane,
  hasSummary,
  hasMindMap,
  onGenerateSummaryClick,
  onGenerateMindmapClick,
  isGeneratingMindmap,
  onStartQuizClick
}: WorkspaceToolbarProps) {
  
  // Helper to sync mobile and desktop views safely
  const handlePdfViewClick = () => {
    setActiveRightPane('pdf');
    setActiveMobileTab('pdf');
  };

  return (
    <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
      
      {/* Mobile-Only Tabs */}
      <div className="lg:hidden flex w-full gap-2">
        <button
          onClick={() => setActiveMobileTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-lg transition-all ${
            activeMobileTab === 'chat' ? 'bg-neutral-900 text-white shadow-md' : 'text-neutral-500 hover:bg-neutral-50'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> IA
        </button>
        <button
          onClick={handlePdfViewClick}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-lg transition-all ${
            activeRightPane === 'pdf' && activeMobileTab !== 'chat' ? 'bg-neutral-900 text-white shadow-md' : 'text-neutral-500 hover:bg-neutral-50'
          }`}
        >
          <FileText className="w-4 h-4" /> Doc
        </button>
      </div>

      {/* Desktop View Switchers & Generation Actions */}
      <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
        <div className="hidden lg:flex p-1 bg-slate-100 rounded-lg mr-2">
          <button 
            onClick={() => setActiveRightPane('pdf')} 
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              activeRightPane === 'pdf' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Original
          </button>
          
          {hasSummary && (
            <button 
              onClick={() => setActiveRightPane('summary')} 
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                activeRightPane === 'summary' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Résumé
            </button>
          )}
          
          {hasMindMap && (
            <button 
              onClick={() => setActiveRightPane('mindmap')} 
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                activeRightPane === 'mindmap' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Carte
            </button>
          )}
        </div>

        <button
          onClick={onGenerateSummaryClick}
          className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
        >
          <AlignLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Générer Résumé</span>
        </button>
        
        <button
          onClick={onGenerateMindmapClick}
          disabled={isGeneratingMindmap}
          className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <Network className="w-4 h-4" />
          <span className="hidden sm:inline">Carte Mentale</span>
        </button>

        <div className="h-6 w-px bg-neutral-300 hidden lg:block mx-1"></div>

        <button
          onClick={onStartQuizClick}
          className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md transition-colors"
        >
          <BrainCircuit className="w-4 h-4" />
          <span className="hidden sm:inline">Simuler un Examen IA</span>
        </button>
      </div>
    </div>
  );
}
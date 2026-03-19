import { useState, useCallback } from 'react';
import { studyApi } from '../api';
import type { SummaryFormat, DocumentVersion } from '../../types/api';

export function useStudyTools(activeVersionId: string) {
  // --- Summary State ---
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [summaryFormatForm, setSummaryFormatForm] = useState<SummaryFormat>('EXECUTIVE');
  const [summaryLangForm, setSummaryLangForm] = useState('fr');
  const [summaryCompareVersionId, setSummaryCompareVersionId] = useState<string>('');
  
  const [summaryData, setSummaryData] = useState<{ id: string, format: SummaryFormat, content: any } | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // --- MindMap State ---
  const [mindmapData, setMindmapData] = useState<{ nodes: any[], edges: any[], title: string } | null>(null);
  const [isGeneratingMindmap, setIsGeneratingMindmap] = useState(false);

  // --- Handlers ---
  const handleGenerateMindmap = useCallback(async (onSuccess?: () => void) => {
    setIsGeneratingMindmap(true);
    try {
      const res = await studyApi.generateMindMap({ 
        document_version_id: activeVersionId, 
        target_lang: 'fr' 
      });
      setMindmapData({ nodes: res.nodes, edges: res.edges, title: res.title });
      if (onSuccess) onSuccess();
    } catch (e) {
      console.error('MindMap generation error:', e);
      alert("Erreur lors de la génération de la carte mentale.");
    } finally {
      setIsGeneratingMindmap(false);
    }
  }, [activeVersionId]);

  const handleGenerateSummary = useCallback(async (e: React.FormEvent, onSuccess?: () => void) => {
    e.preventDefault();
    setIsGeneratingSummary(true);
    setIsSummaryModalOpen(false); // Close modal immediately to show loading state
    
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
      if (onSuccess) onSuccess();
    } catch (e) {
      console.error('Summary generation error:', e);
      alert("Erreur lors de la génération du résumé.");
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [activeVersionId, summaryFormatForm, summaryLangForm, summaryCompareVersionId]);

  return {
    // Summary
    isSummaryModalOpen,
    setIsSummaryModalOpen,
    summaryFormatForm,
    setSummaryFormatForm,
    summaryLangForm,
    setSummaryLangForm,
    summaryCompareVersionId,
    setSummaryCompareVersionId,
    summaryData,
    isGeneratingSummary,
    handleGenerateSummary,
    
    // MindMap
    mindmapData,
    isGeneratingMindmap,
    handleGenerateMindmap,
  };
}
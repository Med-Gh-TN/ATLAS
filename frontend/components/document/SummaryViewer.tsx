import React, { useState } from 'react';
import { SummaryFormat } from '@/types/api';
import { studyApi } from '@/lib/api';

interface SummaryViewerProps {
  summaryId: string;
  format: SummaryFormat;
  content: Record<string, any>;
}

export default function SummaryViewer({ summaryId, format, content }: SummaryViewerProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // --- Handlers ---

  const handleCopyMarkdown = async () => {
    let md = "";
    
    if (format === 'EXECUTIVE') {
      md += "# Résumé Exécutif\n\n";
      const bullets = content.bullets || [];
      bullets.forEach((b: string) => { md += `- ${b}\n`; });
    } 
    else if (format === 'STRUCTURED') {
      md += `# ${content.title || "Résumé Structuré"}\n\n`;
      const sections = content.sections || [];
      sections.forEach((s: any) => {
        md += `## ${s.heading || "Section"}\n`;
        const points = s.points || [];
        points.forEach((p: string) => { md += `- ${p}\n`; });
        md += "\n";
      });
    } 
    else if (format === 'COMPARATIVE') {
      md += "# Analyse Comparative\n\n";
      if (content.added && content.added.length > 0) {
        md += "## Ajouts\n";
        content.added.forEach((a: string) => { md += `- ${a}\n`; });
        md += "\n";
      }
      if (content.removed && content.removed.length > 0) {
        md += "## Suppressions\n";
        content.removed.forEach((r: string) => { md += `- ${r}\n`; });
        md += "\n";
      }
      if (content.modified && content.modified.length > 0) {
        md += "## Modifications\n";
        content.modified.forEach((m: string) => { md += `- ${m}\n`; });
        md += "\n";
      }
    }

    try {
      await navigator.clipboard.writeText(md);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      const blob = await studyApi.exportSummaryPdf(summaryId);
      
      // Create a secure Object URL for the binary stream
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ATLAS_Summary_${summaryId.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup DOM and memory
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export PDF:", error);
      alert("Erreur lors de l'exportation du PDF. Veuillez réessayer.");
    } finally {
      setIsExporting(false);
    }
  };

  // --- Renderers ---

  const renderExecutive = () => {
    const bullets = content.bullets || [];
    return (
      <ul className="space-y-3 list-disc list-outside ml-5 text-slate-700">
        {bullets.map((bullet: string, idx: number) => (
          <li key={idx} className="leading-relaxed">{bullet}</li>
        ))}
      </ul>
    );
  };

  const renderStructured = () => {
    const sections = content.sections || [];
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800 border-b pb-2">
          {content.title || "Résumé Structuré"}
        </h2>
        {sections.map((section: any, sIdx: number) => (
          <div key={sIdx} className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-700">{section.heading}</h3>
            <ul className="space-y-2 list-disc list-outside ml-5 text-slate-600">
              {(section.points || []).map((point: string, pIdx: number) => (
                <li key={pIdx} className="leading-relaxed">{point}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  const renderComparative = () => {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800 border-b pb-2">Analyse Comparative</h2>
        
        {content.added && content.added.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-emerald-800 mb-2">Ajouts</h3>
            <ul className="space-y-1 list-disc list-outside ml-5 text-emerald-700">
              {content.added.map((item: string, idx: number) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {content.removed && content.removed.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-rose-800 mb-2">Suppressions</h3>
            <ul className="space-y-1 list-disc list-outside ml-5 text-rose-700 line-through opacity-80">
              {content.removed.map((item: string, idx: number) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {content.modified && content.modified.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-amber-800 mb-2">Modifications</h3>
            <ul className="space-y-1 list-disc list-outside ml-5 text-amber-700">
              {content.modified.map((item: string, idx: number) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white border rounded-xl shadow-sm overflow-hidden">
      {/* Header Actions */}
      <div className="flex items-center justify-between p-4 border-b bg-slate-50">
        <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">
          Format: <span className="text-slate-700 font-bold">{format}</span>
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCopyMarkdown}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            {copySuccess ? "✓ Copié !" : "Copier Markdown"}
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {isExporting ? "Génération..." : "Exporter PDF"}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6 md:p-8 overflow-y-auto">
        {format === 'EXECUTIVE' && renderExecutive()}
        {format === 'STRUCTURED' && renderStructured()}
        {format === 'COMPARATIVE' && renderComparative()}
      </div>
    </div>
  );
}
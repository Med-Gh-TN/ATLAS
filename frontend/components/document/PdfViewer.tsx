// frontend/components/document/PdfViewer.tsx

'use client';

import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, AlertCircle } from 'lucide-react';

// Required for react-pdf to work in a Next.js environment
// We load the worker from the unpkg CDN to avoid complex Webpack configurations
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// CSS imports for react-pdf text selection and annotations
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

export interface PdfViewerProps {
  /** * The URL of the PDF. 
   * Note for Tony: This needs to be a Pre-Signed MinIO URL or a public proxy endpoint. 
   */
  fileUrl: string; 
}

export default function PdfViewer({ fileUrl }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2); // Default zoom

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const changePage = (offset: number) => {
    setPageNumber((prevPageNumber) => {
      const newPage = prevPageNumber + offset;
      if (numPages && newPage > numPages) return numPages;
      if (newPage < 1) return 1;
      return newPage;
    });
  };

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.6));

  return (
    <div className="flex flex-col items-center w-full bg-slate-100 rounded-xl border border-slate-200 overflow-hidden shadow-inner">
      
      {/* Viewer Controls Toolbar */}
      <div className="w-full bg-white border-b border-slate-200 p-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10 shadow-sm">
        
        {/* Pagination Controls */}
        <div className="flex items-center gap-2">
          <button
            disabled={pageNumber <= 1}
            onClick={() => changePage(-1)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition-colors"
            title="Page précédente"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[5rem] text-center">
            {pageNumber} / {numPages || '--'}
          </span>
          <button
            disabled={numPages === null || pageNumber >= numPages}
            onClick={() => changePage(1)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition-colors"
            title="Page suivante"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.6}
            className="p-1.5 rounded hover:bg-white hover:shadow-sm text-slate-600 disabled:opacity-30 transition-all"
            title="Zoom arrière"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-slate-500 w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= 3.0}
            className="p-1.5 rounded hover:bg-white hover:shadow-sm text-slate-600 disabled:opacity-30 transition-all"
            title="Zoom avant"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PDF Document Container */}
      <div className="relative w-full overflow-auto flex justify-center p-4 min-h-[600px] bg-slate-100/50">
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 mt-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Chargement du document PDF...</p>
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center h-full text-red-500 gap-3 mt-20 bg-red-50 p-6 rounded-xl border border-red-100">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm font-medium text-center">
                Impossible de charger le document.<br/> 
                <span className="text-xs text-red-400">Le fichier est peut-être corrompu ou l'URL est invalide.</span>
              </p>
            </div>
          }
        >
          <Page 
            pageNumber={pageNumber} 
            scale={scale} 
            className="shadow-lg rounded-sm overflow-hidden border border-slate-200"
            renderAnnotationLayer={true}
            renderTextLayer={true}
          />
        </Document>
      </div>
    </div>
  );
}
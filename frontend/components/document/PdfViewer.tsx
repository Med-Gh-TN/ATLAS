'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
// DEFENSIVE ARCHITECTURE: Import exact types for v9.x compatibility
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Loader2,
  AlertCircle,
} from 'lucide-react';

// CSS imports for react-pdf text selection and annotations
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// ---------------------------------------------------------------------------
// ARCHITECTURAL FIX: Worker source resolution in Next.js 14.
// Webpack struggles with dynamic `import.meta.url` for pdf workers, and
// local aliases often cause `defineProperty` exceptions on ESM modules.
// The most robust solution to bypass Webpack entirely is deferring to a reliable
// CDN (unpkg) dynamically matched to the exact installed version of pdfjs-dist.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

export interface PdfViewerProps {
  /** The URL of the PDF */
  fileUrl: string;
  /** Programmatic target page to force navigation from external components (e.g., Chat) */
  targetPage?: number | null;
  /** Text string to dynamically highlight on the active page */
  highlightedChunk?: string | null;
  /** Callback fired after the PDF successfully navigates to the targetPage */
  onSyncComplete?: () => void;
}

export default function PdfViewer({
  fileUrl,
  targetPage,
  highlightedChunk,
  onSyncComplete,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [isClient, setIsClient] = useState(false);

  // Suppress rendering until hydration is complete to avoid SSR/CSR mismatch
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Sync page state with parent orchestrator when targetPage changes
  useEffect(() => {
    if (
      targetPage !== undefined &&
      targetPage !== null &&
      targetPage !== pageNumber
    ) {
      if (numPages && targetPage > numPages) {
        setPageNumber(numPages);
      } else if (targetPage < 1) {
        setPageNumber(1);
      } else {
        setPageNumber(targetPage);
      }

      if (onSyncComplete) {
        onSyncComplete();
      }
    }
  }, [targetPage, numPages, pageNumber, onSyncComplete]);

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

  /**
   * Highlighting Logic: Intercepts the text layer rendering to inject <mark>
   * tags. Uses case-insensitive exact substring matching for the RAG chunk.
   * Regex special characters are escaped to prevent catastrophic backtracking.
   */
  const textRenderer = useCallback(
    (textItem: TextItem) => {
      if (!highlightedChunk || highlightedChunk.trim() === '') {
        return textItem.str;
      }

      const escapedChunk = highlightedChunk.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      );
      const parts = textItem.str.split(
        new RegExp(`(${escapedChunk})`, 'gi'),
      );

      if (parts.length === 1) return textItem.str;

      return (
        <React.Fragment>
          {parts.map((part, index) =>
            part.toLowerCase() === highlightedChunk.toLowerCase() ? (
              <mark
                key={index}
                className="bg-yellow-300 text-transparent bg-opacity-40 rounded-[2px] shadow-sm"
              >
                {part}
              </mark>
            ) : (
              part
            ),
          )}
        </React.Fragment>
      );
    },
    [highlightedChunk],
  );

  // SSR guard: render a stable skeleton until hydration completes.
  // This prevents the pdfjs worker from being instantiated on the server
  // where window/Worker APIs do not exist.
  if (!isClient) {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-[600px] bg-neutral-50/50 rounded-2xl border border-neutral-100">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full bg-neutral-50/50 rounded-2xl overflow-hidden h-full">

      {/* Viewer Controls Toolbar */}
      <div className="w-full bg-white border-b border-neutral-100 p-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10">

        <div className="flex items-center gap-2">
          <button
            disabled={pageNumber <= 1}
            onClick={() => changePage(-1)}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-1"
            title="Previous page"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-neutral-700 min-w-[5rem] text-center tracking-wide">
            {pageNumber} / {numPages || '--'}
          </span>
          <button
            disabled={numPages === null || pageNumber >= numPages}
            onClick={() => changePage(1)}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-1"
            title="Next page"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 bg-neutral-50 p-1.5 rounded-xl border border-neutral-100">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.6}
            className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all focus:outline-none"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-neutral-500 w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= 3.0}
            className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all focus:outline-none"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PDF Document Container */}
      <div className="relative w-full overflow-auto flex justify-center p-6 sm:p-8 min-h-[600px] bg-neutral-50/50 flex-grow">
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex flex-col items-center justify-center h-full text-neutral-400 gap-4 mt-32 animate-in fade-in duration-500">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
              <p className="text-sm font-medium tracking-wide">
                Rendering PDF asset...
              </p>
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center h-full text-red-500 gap-3 mt-20 bg-red-50/50 p-8 rounded-2xl border border-red-100 animate-in fade-in duration-300">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm font-semibold text-center text-red-700">
                Failed to load document.
                <br />
                <span className="text-xs text-red-500 font-medium block mt-1.5">
                  The file might be corrupted or the access token has expired.
                </span>
              </p>
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            className="shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-sm overflow-hidden border border-neutral-200"
            renderAnnotationLayer={true}
            renderTextLayer={true}
            customTextRenderer={textRenderer}
          />
        </Document>
      </div>
    </div>
  );
}
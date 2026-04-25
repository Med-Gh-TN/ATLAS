"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { Loader2 } from "lucide-react";

// Use CDN for worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  pageNumber: number;
  onLoadSuccess?: (numPages: number) => void;
}

export function PdfViewer({ url, pageNumber, onLoadSuccess }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    if (onLoadSuccess) {
      onLoadSuccess(numPages);
    }
  }

  return (
    <div className="flex justify-center bg-muted/30 p-4 border rounded-lg overflow-auto h-full w-full">
      <Document
        file={url}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
        error={
          <div className="text-destructive text-center p-4">
            Failed to load PDF.
          </div>
        }
      >
        <Page
          pageNumber={pageNumber}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          className="shadow-lg"
          width={800}
        />
      </Document>
    </div>
  );
}

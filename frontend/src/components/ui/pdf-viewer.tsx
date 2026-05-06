"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Minus, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

if (typeof window !== "undefined") {
  // CSP-safe local worker (served from /public)
  const localWorkerSrc = "/pdf.worker.min.mjs";
  // Guard against accidental external assignment in strict CSP environments.
  if (!pdfjs.GlobalWorkerOptions.workerSrc || pdfjs.GlobalWorkerOptions.workerSrc.startsWith("http")) {
    pdfjs.GlobalWorkerOptions.workerSrc = localWorkerSrc;
  }
}

export type PdfViewerProps = {
  /** Blob URL, remote URL, or buffer */
  file?: string | ArrayBuffer | Uint8Array | null;
  /** Alias for `file` (e.g. course preview URL) */
  url?: string | null;
  title?: string | null;
  /** Controlled page (live session sync). Omit for internal navigation. */
  pageNumber?: number;
  onPageChange?: (page: number) => void;
  /** Called with total page count when the PDF loads */
  onLoadSuccess?: (numPages: number) => void;
  /** Show built-in toolbar + thumbnail strip (default true). Set false for live session UI. */
  showChrome?: boolean;
};

export function PdfViewer({
  file,
  url,
  title,
  pageNumber: controlledPage,
  onPageChange,
  onLoadSuccess,
  showChrome = true,
}: PdfViewerProps) {
  const source = file ?? url ?? null;

  const [numPages, setNumPages] = useState<number | null>(null);
  const [internalPage, setInternalPage] = useState(1);
  const controlled = controlledPage !== undefined;
  const page = controlled ? controlledPage! : internalPage;

  const setPage = useCallback(
    (n: number) => {
      if (controlled) {
        onPageChange?.(n);
      } else {
        setInternalPage(n);
      }
    },
    [controlled, onPageChange],
  );

  const [scale, setScale] = useState(1.0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(720);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
      if (!controlled) setInternalPage(1);
      setLoadError(null);
      onLoadSuccess?.(n);
    },
    [controlled, onLoadSuccess],
  );

  const onDocumentLoadError = useCallback((err: Error) => {
    setLoadError(err.message || "Impossible de charger le PDF");
  }, []);

  useEffect(() => {
    const el = document.getElementById("pdf-viewer-main");
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 200) setContainerWidth(Math.min(w - (showChrome ? 180 : 32), 920));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [showChrome]);

  const pageNumbers = useMemo(
    () => (numPages ? Array.from({ length: numPages }, (_, i) => i + 1) : []),
    [numPages],
  );

  const thumbWidth = 108;
  const mainPageWidth = Math.max(320, containerWidth * scale);

  if (!source) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        Aucun document PDF à afficher.
      </div>
    );
  }

  return (
    <div
      id="pdf-viewer-main"
      className="flex h-full min-h-[560px] flex-col overflow-hidden rounded-lg border bg-[#2b2b2b] text-white"
    >
      {showChrome ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#323639] px-3 py-2 text-sm">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              disabled={page <= 1}
              onClick={() => setPage(Math.max(1, page - 1))}
              aria-label="Page précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums text-white/90">
              {numPages != null ? (
                <span className="inline-flex items-center gap-1">
                  <Input
                    className="h-8 w-12 border-white/20 bg-white/10 px-1 text-center text-white"
                    value={page}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isFinite(v)) return;
                      setPage(Math.min(Math.max(1, v), numPages));
                    }}
                  />
                  <span className="text-white/70">/ {numPages}</span>
                </span>
              ) : (
                "…"
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              disabled={numPages == null || page >= (numPages ?? 0)}
              onClick={() => setPage(numPages ? Math.min(numPages, page + 1) : page)}
              aria-label="Page suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={() => setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))}
              aria-label="Zoom arrière"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center tabular-nums text-white/80">
              {Math.round(scale * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={() => setScale((s) => Math.min(2.5, Math.round((s + 0.1) * 10) / 10))}
              aria-label="Zoom avant"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-red-300">
          {loadError}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <Document
            file={source as string}
            loading={
              <div className="flex min-h-[400px] w-full items-center justify-center bg-[#525659]">
                <Loader2 className="h-10 w-10 animate-spin text-white/60" />
              </div>
            }
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            className="flex min-h-0 min-w-0 flex-1 flex-row"
          >
            {showChrome ? (
              <div className="w-[140px] shrink-0 overflow-y-auto border-r border-white/10 bg-[#1e1e1e] p-2">
                <div className="flex flex-col gap-2">
                  {pageNumbers.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      className={`overflow-hidden rounded border-2 bg-white transition-colors ${
                        n === page ? "border-sky-400" : "border-transparent opacity-80 hover:opacity-100"
                      }`}
                    >
                      <Page
                        pageNumber={n}
                        width={thumbWidth}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="min-w-0 flex-1 overflow-auto bg-[#525659] p-4">
              <div className="mx-auto flex min-h-[400px] justify-center">
                <Page
                  pageNumber={numPages != null ? Math.min(page, numPages) : page}
                  width={mainPageWidth}
                  renderAnnotationLayer
                  renderTextLayer
                  className="shadow-lg"
                />
              </div>
            </div>
          </Document>
        </div>
      )}

      {title ? <span className="sr-only">{title}</span> : null}
    </div>
  );
}

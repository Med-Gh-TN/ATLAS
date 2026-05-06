"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  Printer,
  RefreshCw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// pdf.js Web Worker — CSP-safe, off-main-thread rendering
// ---------------------------------------------------------------------------
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PDFPreviewerProps {
  /** Presigned URL to the PDF file (preferred) */
  url?: string | null;
  /** Raw PDF data as ArrayBuffer/Uint8Array (fallback) */
  data?: ArrayBuffer | Uint8Array | null;
  /** Storage path — used to fetch presigned URL from backend */
  storagePath?: string | null;
  /** Callback to fetch a presigned URL given a storage path */
  onRequestPresignedUrl?: (storagePath: string) => Promise<string>;
  /** Document title for display */
  title?: string | null;
  /** Initial page to scroll to */
  initialPage?: number;
  /** Callback when document loads successfully */
  onLoadSuccess?: (numPages: number) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Additional CSS class */
  className?: string;
}

// Zoom presets
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.25;

// Estimated page height for virtualization (will be refined after first render)
const ESTIMATED_PAGE_HEIGHT = 1100;
const PAGE_GAP = 16;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function PDFPreviewer({
  url,
  data,
  storagePath,
  onRequestPresignedUrl,
  title,
  initialPage = 1,
  onLoadSuccess,
  onError,
  className,
}: PDFPreviewerProps): React.JSX.Element {
  // ---- State ----
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [pageInputValue, setPageInputValue] = useState<string>(String(initialPage));
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(url || null);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  // ---- Refs ----
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  // ---- Resolve presigned URL from storage path ----
  useEffect(() => {
    if (url) {
      setResolvedUrl(url);
      return;
    }
    if (storagePath && onRequestPresignedUrl) {
      let cancelled = false;
      setIsLoading(true);
      setError(null);
      onRequestPresignedUrl(storagePath)
        .then((presignedUrl) => {
          if (!cancelled) setResolvedUrl(presignedUrl);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load document URL");
            onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return () => { cancelled = true; };
    }
  }, [url, storagePath, onRequestPresignedUrl, onError]);

  // ---- File source for react-pdf ----
  const fileSource = useMemo(() => {
    if (data instanceof Uint8Array && data.byteLength > 0) {
      return { data };
    }
    if (data instanceof ArrayBuffer && data.byteLength > 0) {
      return { data: new Uint8Array(data) };
    }
    if (resolvedUrl) {
      return resolvedUrl;
    }
    return null;
  }, [data, resolvedUrl]);

  // ---- Measure container width for responsive page sizing ----
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setContainerWidth(width - 48); // subtract padding
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ---- Computed page width based on scale and container ----
  const pageWidth = useMemo(() => {
    const baseWidth = Math.min(containerWidth, 900);
    return baseWidth * scale;
  }, [containerWidth, scale]);

  // ---- Virtualizer for lazy-loading pages ----
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => (ESTIMATED_PAGE_HEIGHT * scale) + PAGE_GAP,
    overscan: 2, // render 2 pages above/below viewport
  });
  const virtualItems = virtualizer.getVirtualItems();

  // ---- Track current page from scroll position ----
  useEffect(() => {
    if (virtualItems.length > 0) {
      // The first visible item is the current page
      const firstVisible = virtualItems[0];
      const newPage = firstVisible.index + 1;
      if (newPage !== currentPage) {
        setCurrentPage(newPage);
        setPageInputValue(String(newPage));
      }
    }
  }, [virtualItems, currentPage]);

  // ---- Document load handlers ----
  const handleDocumentLoadSuccess = useCallback(
    ({ numPages: pages }: { numPages: number }) => {
      setNumPages(pages);
      setIsLoading(false);
      setError(null);
      onLoadSuccess?.(pages);
    },
    [onLoadSuccess],
  );

  const handleDocumentLoadError = useCallback(
    (err: Error) => {
      setIsLoading(false);
      setError(err.message || "Failed to load PDF document");
      onError?.(err);
    },
    [onError],
  );

  // ---- Navigation ----
  const goToPage = useCallback(
    (page: number) => {
      const target = Math.max(1, Math.min(page, numPages));
      setCurrentPage(target);
      setPageInputValue(String(target));
      virtualizer.scrollToIndex(target - 1, { align: "start" });
    },
    [numPages, virtualizer],
  );

  const handlePageInputSubmit = useCallback(() => {
    const parsed = parseInt(pageInputValue, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= numPages) {
      goToPage(parsed);
    } else {
      setPageInputValue(String(currentPage));
    }
  }, [pageInputValue, numPages, currentPage, goToPage]);

  // ---- Zoom ----
  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
  }, []);

  const zoomToFit = useCallback(() => {
    setScale(1.0);
  }, []);

  // ---- Rotate ----
  const rotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // ---- Helper: convert data prop to a Blob-safe format ----
  const dataToBlobUrl = useCallback((): string | null => {
    if (!data) return null;
    // Create a fresh Uint8Array copy to get a clean ArrayBuffer for Blob constructor
    const safeBytes = new Uint8Array(
      data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
    return URL.createObjectURL(new Blob([safeBytes.buffer as BlobPart], { type: "application/pdf" }));
  }, [data]);

  // ---- Print ----
  const handlePrint = useCallback(() => {
    if (!resolvedUrl && !data) return;
    const printUrl = resolvedUrl || dataToBlobUrl();
    if (printUrl) {
      const printWindow = window.open(printUrl, "_blank");
      if (printWindow) {
        printWindow.addEventListener("load", () => {
          printWindow.print();
        });
      }
    }
  }, [resolvedUrl, data, dataToBlobUrl]);

  // ---- Download ----
  const handleDownload = useCallback(() => {
    const downloadUrl = resolvedUrl || dataToBlobUrl();
    if (downloadUrl) {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = title || "document.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [resolvedUrl, dataToBlobUrl, title]);

  // ---- Fullscreen ----
  const toggleFullscreen = useCallback(async () => {
    const elem = fullscreenRef.current;
    if (!elem) return;

    try {
      if (!document.fullscreenElement) {
        await elem.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen not supported or blocked
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if our container is focused or contains focus
      if (!fullscreenRef.current?.contains(document.activeElement) && document.activeElement !== document.body) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          goToPage(currentPage - 1);
          break;
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          goToPage(currentPage + 1);
          break;
        case "+":
        case "=":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomIn();
          }
          break;
        case "-":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomOut();
          }
          break;
        case "0":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomToFit();
          }
          break;
        case "r":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            rotate();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, goToPage, zoomIn, zoomOut, zoomToFit, rotate]);

  // ---- Retry handler ----
  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    // Force re-resolve URL
    if (storagePath && onRequestPresignedUrl) {
      onRequestPresignedUrl(storagePath)
        .then((presignedUrl) => {
          setResolvedUrl(presignedUrl);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to reload document");
          setIsLoading(false);
        });
    } else if (url) {
      // Force re-render by toggling URL
      setResolvedUrl(null);
      setTimeout(() => setResolvedUrl(url), 50);
    } else {
      setIsLoading(false);
    }
  }, [storagePath, onRequestPresignedUrl, url]);

  // ---- Render: Error state ----
  if (error && !isLoading) {
    return (
      <div className={`flex h-full min-h-[400px] flex-col items-center justify-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-6 text-center ${className || ""}`}>
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div>
          <p className="text-base font-medium text-destructive">Failed to load document</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  // ---- Render: No source ----
  if (!fileSource && !isLoading) {
    return (
      <div className={`flex h-full min-h-[400px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-muted-foreground ${className || ""}`}>
        <AlertCircle className="h-10 w-10 opacity-50" />
        <p>No document source provided.</p>
      </div>
    );
  }

  // ---- Render: Loading state (before fileSource is resolved) ----
  if (!fileSource && isLoading) {
    return (
      <div className={`flex h-full min-h-[400px] items-center justify-center rounded-xl border ${className || ""}`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={fullscreenRef}
      className={`flex flex-col rounded-xl border bg-background shadow-sm overflow-hidden ${isFullscreen ? "fixed inset-0 z-50" : "h-full min-h-[500px]"} ${className || ""}`}
      tabIndex={0}
    >
      {/* ================================================================= */}
      {/* TOOLBAR — Desktop: horizontal bar / Mobile: compact icon bar      */}
      {/* ================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1.5 sm:px-4 sm:py-2">
        {/* Left: Page navigation */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || numPages === 0}
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 text-sm">
            <input
              type="text"
              inputMode="numeric"
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onBlur={handlePageInputSubmit}
              onKeyDown={(e) => e.key === "Enter" && handlePageInputSubmit()}
              className="h-7 w-10 rounded border bg-background px-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-primary sm:w-12"
              disabled={numPages === 0}
            />
            <span className="text-muted-foreground">
              / {numPages || "—"}
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages || numPages === 0}
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Center: Zoom controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={zoomOut}
            disabled={scale <= ZOOM_MIN}
            title="Zoom out (Ctrl+-)"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>

          <button
            onClick={zoomToFit}
            className="hidden h-7 min-w-[3.5rem] rounded border bg-background px-2 text-center text-xs font-medium hover:bg-accent sm:inline-block"
            title="Reset zoom (Ctrl+0)"
          >
            {Math.round(scale * 100)}%
          </button>
          <span className="text-xs font-medium text-muted-foreground sm:hidden">
            {Math.round(scale * 100)}%
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={zoomIn}
            disabled={scale >= ZOOM_MAX}
            title="Zoom in (Ctrl++)"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={rotate}
            title="Rotate 90° (Ctrl+R)"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 sm:inline-flex"
            onClick={handlePrint}
            disabled={!fileSource}
            title="Print"
          >
            <Printer className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 sm:inline-flex"
            onClick={handleDownload}
            disabled={!fileSource}
            title="Download"
          >
            <Download className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Mobile bottom action bar (print/download visible on mobile)       */}
      {/* ================================================================= */}
      <div className="flex items-center justify-center gap-2 border-b bg-muted/20 px-2 py-1 sm:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handlePrint}
          disabled={!fileSource}
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleDownload}
          disabled={!fileSource}
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
      </div>

      {/* ================================================================= */}
      {/* PDF Document — Virtualized scroll container                        */}
      {/* ================================================================= */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-muted/30"
      >
        {fileSource ? (
          <Document
            file={fileSource}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            loading={
              <div className="flex h-96 items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading document...</p>
                </div>
              </div>
            }
            error={
              <div className="flex h-96 flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-destructive">Failed to load PDF document.</p>
                <Button variant="outline" size="sm" onClick={handleRetry}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            }
          >
            {numPages > 0 && (
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className="flex justify-center"
                  >
                    <div className="relative py-2">
                      {/* Page number badge */}
                      <div className="absolute -top-0 left-1/2 z-10 -translate-x-1/2 rounded-b-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                        {virtualItem.index + 1}
                      </div>
                      <Page
                        pageNumber={virtualItem.index + 1}
                        width={pageWidth}
                        rotate={rotation}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="shadow-lg rounded-sm"
                        loading={
                          <div
                            className="flex items-center justify-center rounded-sm bg-white shadow-lg"
                            style={{
                              width: pageWidth,
                              height: pageWidth * 1.414, // A4 aspect ratio
                            }}
                          >
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        }
                        error={
                          <div
                            className="flex flex-col items-center justify-center gap-2 rounded-sm border border-destructive/20 bg-destructive/5"
                            style={{
                              width: pageWidth,
                              height: pageWidth * 1.414,
                            }}
                          >
                            <AlertCircle className="h-6 w-6 text-destructive" />
                            <p className="text-xs text-destructive">
                              Page {virtualItem.index + 1} failed to render
                            </p>
                          </div>
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Document>
        ) : (
          <div className="flex h-96 items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* Footer status bar                                                  */}
      {/* ================================================================= */}
      {numPages > 0 && (
        <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
          <span>
            {title ? `${title} — ` : ""}
            {numPages} page{numPages !== 1 ? "s" : ""}
          </span>
          <span>{Math.round(scale * 100)}% · {rotation > 0 ? `${rotation}°` : "No rotation"}</span>
        </div>
      )}
    </div>
  );
}

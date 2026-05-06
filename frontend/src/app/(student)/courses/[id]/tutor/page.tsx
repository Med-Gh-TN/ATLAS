/**
 * @file frontend/src/app/(student)/courses/[id]/tutor/page.tsx
 * @description Full‑screen immersive AI tutor. Now with voice wave, thinking indicator, and connection quality.
 * @layer Core Logic / Presentation
 */

"use client";

import React, { useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Mic, MicOff, BookOpen, Loader2,
  PanelLeftOpen, PanelLeftClose, BrainCircuit,
  Wifi, WifiOff, Loader, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/ui/file-preview";
import { GenerativeCanvas } from "@/components/ui/generative-canvas";
import { StickyNotes } from "@/components/ui/sticky-notes";
import { useLiveSyncStore } from "@/store/live-sync.store";
import { useSwarmStream } from "@/hooks/use-swarm-stream";
import { useCourseQuery } from "@/queries";

export default function LiveTutorPage() {
  const params = useParams();
  const courseId = params.id as string;

  const { data: course, isLoading: isCourseLoading } = useCourseQuery(courseId);
  const activeVersion = course?.current_version;
  const dynamicStoragePath =
    activeVersion?.storage_path || (course as any)?.storage_path || "";

  const { connect, disconnect, isConnected, isListening } = useSwarmStream(courseId);
  const isAudioPlaying = useLiveSyncStore((s) => s.isAudioPlaying);
  const thinking = useLiveSyncStore((s) => s.thinking);
  const transcript = useLiveSyncStore((s) => s.transcript);
  const stickyNotes = useLiveSyncStore((s) => s.stickyNotes);
  const resetSession = useLiveSyncStore((s) => s.resetSession);
  const activeComponent = useLiveSyncStore((s) => s.activeComponent);

  const [pdfVisible, setPdfVisible] = React.useState(true);
  const isCanvasActive = !!activeComponent;

  useEffect(() => {
    return () => {
      disconnect();
      resetSession();
    };
  }, [disconnect, resetSession]);

  const toggleSession = () => {
    isConnected ? disconnect() : connect();
  };

  if (isCourseLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Initializing Sovereign Swarm AI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex gap-2 p-2 bg-background">
      {/* Collapsible PDF sidebar */}
      {pdfVisible && (
        <div className="w-72 flex-shrink-0 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between p-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 overflow-hidden">
              <BookOpen className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-xs font-semibold truncate">
                {course?.title || "Source Material"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPdfVisible(false)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden p-1">
            {dynamicStoragePath ? (
              <FilePreview storagePath={dynamicStoragePath} title={course?.title} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No document approved for this course yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle button when PDF hidden */}
      {!pdfVisible && (
        <Button
          variant="outline"
          size="icon"
          className="absolute top-4 left-4 z-10"
          onClick={() => setPdfVisible(true)}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      )}

      {/* Right side: Canvas + Bottom panel */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        {/* Generative Canvas */}
        <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden">
          <GenerativeCanvas />
        </div>

        {/* Bottom panel */}
        <div className="h-[40%] flex flex-col gap-2">
          <div className="flex-1 flex gap-2 overflow-hidden">
            {/* Transcript area */}
            <div className="flex-1 rounded-xl border border-border bg-muted/50 p-3 overflow-y-auto text-xs leading-relaxed relative">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-muted-foreground">Live Transcript:</span>
                {/* Connection quality indicator */}
                <div className="flex items-center gap-1">
                  {isConnected ? (
                    <Wifi className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-rose-400" />
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {isConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>
              </div>
              <pre className="mt-1 whitespace-pre-wrap font-sans opacity-80">
                {transcript || "Say something..."}
              </pre>

              {/* Thinking indicator */}
              {thinking && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2 rounded-full bg-muted/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                  <Loader className="h-3 w-3 animate-spin" />
                  AI is thinking...
                </div>
              )}
            </div>
            {/* Sticky Notes */}
            <div className="w-64 rounded-xl border border-border bg-muted/30 p-2 overflow-y-auto">
              <StickyNotes notes={stickyNotes} />
            </div>
          </div>

          {/* Mic Control & Voice Wave */}
          <div className="flex items-center justify-center gap-4 border-t border-border pt-2">
            {/* Voice wave animation when AI speaking */}
            {isAudioPlaying && (
              <div className="flex items-center gap-1 h-8" aria-label="AI speaking">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1 bg-primary rounded-full animate-pulse"
                    style={{
                      animationDelay: `${i * 0.15}s`,
                      height: Math.random() * 20 + 10,
                    }}
                  />
                ))}
              </div>
            )}

            <Button
              onClick={toggleSession}
              size="lg"
              className={`relative h-14 w-14 rounded-full shadow-lg transition-all ${
                isConnected
                  ? "border border-red-400/50 bg-red-500/90 text-white shadow-[0_0_25px_rgba(239,68,68,0.4)]"
                  : "border border-emerald-400/50 bg-emerald-500/90 text-white shadow-[0_0_25px_rgba(16,185,129,0.3)]"
              }`}
            >
              {isConnected ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
              {isConnected && isListening && !isAudioPlaying && (
                <span className="absolute inset-0 block h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40"></span>
              )}
              {isConnected && thinking && (
                <span className="absolute inset-0 block h-full w-full animate-pulse rounded-full bg-amber-400 opacity-30"></span>
              )}
            </Button>

            {/* Thinking indicator separate from mic if needed */}
            {thinking && !isAudioPlaying && (
              <div className="flex items-center gap-1 text-xs text-amber-400">
                <Loader className="h-3 w-3 animate-spin" />
                Thinking...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
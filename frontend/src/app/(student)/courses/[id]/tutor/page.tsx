/**
 * @file frontend/src/app/(student)/courses/[id]/tutor/page.tsx
 * @description Full‑screen immersive AI tutor – dark, premium layout inspired
 *              by the provided HTML reference. Board as hero, compact transcript,
 *              left PDF sidebar, right insights panel, centred mic with glow.
 * @layer Core Logic / Presentation
 * @dependencies @/store/live-sync.store, @/hooks/use-swarm-stream,
 *              @/queries, lucide-react, @/components/ui/*
 */

"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Mic, MicOff, BookOpen, Loader2,
  PanelLeftOpen, PanelLeftClose, BrainCircuit,
  Wifi, WifiOff, Loader,
  StickyNote, Sparkles, X,
  FileText, Download, ExternalLink,
  Lightbulb, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/ui/file-preview";
import { GenerativeCanvas } from "@/components/ui/generative-canvas";
import { StickyNotes } from "@/components/ui/sticky-notes";
import { useLiveSyncStore } from "@/store/live-sync.store";
import { useSwarmStream } from "@/hooks/use-swarm-stream";
import { useCourseQuery } from "@/queries";

/* ── Voice wave animation component ────────────────────────── */
function VoiceWave() {
  return (
    <div className="flex items-center gap-0.5 h-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="block w-[3px] rounded-full bg-indigo-400 opacity-60 animate-voice-wave"
          style={{
            height: i === 2 ? "16px" : i === 1 || i === 3 ? "10px" : "4px",
            animationDelay: `${i * 0.1}s`,
            animationDuration: "1.2s",
          }}
        />
      ))}
    </div>
  );
}

/* ── Compact chat bubble for the transcript footer ──────────── */
function ChatBubble({
  text,
  isAI,
}: {
  text: string;
  isAI: boolean;
}) {
  return (
    <div className={`flex gap-2.5 items-start animate-fade-in-up ${isAI ? "" : "flex-row-reverse"}`}>
      {isAI && (
        <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
          <BrainCircuit className="h-3.5 w-3.5 text-indigo-400" />
        </div>
      )}
      {!isAI && (
        <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-[10px] font-semibold text-amber-400 font-serif italic">
          U
        </div>
      )}
      <div className={`max-w-[80%] ${!isAI ? "ml-auto" : ""}`}>
        <p className={`text-[13px] leading-relaxed font-light ${
          isAI
            ? "text-slate-200/85"
            : "text-amber-100/85"
        }`}>
          {text}
        </p>
      </div>
    </div>
  );
}

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

  const [pdfVisible, setPdfVisible] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto‑scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Cleanup
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
      <div className="flex h-screen w-full items-center justify-center" style={{ background: "#07090F" }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          <p className="text-sm font-medium text-slate-400">
            Initializing Sovereign Swarm AI...
          </p>
        </div>
      </div>
    );
  }

  const hasBoardContent = !!activeComponent;
  const hasTranscript = transcript && transcript.trim().length > 0;

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden flex flex-col"
      style={{ background: "#07090F", color: "#F0F2F7", fontFamily: "Inter, 'Google Sans Text', ui-sans-serif, system-ui" }}
    >
      {/* ── Embedded keyframes (styled-jsx) ───────────────────── */}
      <style jsx global>{`
        @keyframes ring-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes dot-blink {
          0%,100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes wave-bar {
          0%,100% { transform: scaleY(1); opacity: 0.5; }
          50% { transform: scaleY(1.6); opacity: 1; }
        }
        @keyframes orb-breathe {
          0%,100% { box-shadow: 0 0 0 0 rgba(59,111,255,0.1); }
          50% { box-shadow: 0 0 0 12px rgba(59,111,255,0); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-voice-wave {
          animation: wave-bar 1.2s ease-in-out infinite;
        }
        .animate-ring-pulse {
          animation: ring-pulse 2s ease-out infinite;
        }
        .animate-dot-blink {
          animation: dot-blink 1s ease-in-out infinite;
        }
        .animate-orb-breathe {
          animation: orb-breathe 4s ease-in-out infinite;
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.25s ease-out both;
        }
        /* Thin custom scrollbar */
        .custom-scroll::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12);
          border-radius: 999px;
        }
      `}</style>

      {/* ── Top Nav Bar ──────────────────────────────────────── */}
      <nav
        className="h-[52px] flex items-center justify-between px-5 flex-shrink-0 relative z-50"
        style={{ background: "rgba(7,9,15,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* Left group */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-indigo-500 flex items-center justify-center font-serif italic text-sm text-white">A</div>
            <span className="text-sm font-semibold tracking-wide">ATLAS</span>
          </div>
          <div className="w-px h-4" style={{ background: "rgba(255,255,255,0.12)" }} />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-slate-400"
               style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            {course?.title || "Course"}
          </div>
        </div>

        {/* Centre: mic + status + voice wave */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            isConnected
              ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/25"
              : "bg-rose-400/10 text-rose-400 border border-rose-400/25"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "animate-dot-blink" : ""}`}
                  style={{ background: "currentColor" }} />
            {isConnected ? "Connected" : "Disconnected"}
          </div>

          <button
            onClick={toggleSession}
            className="relative w-[42px] h-[42px] rounded-full border-0 cursor-pointer flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-90"
            style={{
              background: isConnected ? "#F43F5E" : "#3B6FFF",
            }}
            aria-label={isConnected ? "Disconnect microphone" : "Connect microphone"}
          >
            {isConnected ? (
              <MicOff className="h-[18px] w-[18px] text-white stroke-[2]" />
            ) : (
              <Mic className="h-[18px] w-[18px] text-white stroke-[2]" />
            )}
            {isConnected && isListening && !isAudioPlaying && (
              <span className="absolute inset-[-6px] rounded-full border-2 border-rose-400 opacity-0 animate-ring-pulse" />
            )}
          </button>

          {isConnected && <VoiceWave />}
        </div>

        {/* Right group */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPdfVisible(!pdfVisible)}
            className="w-[34px] h-[34px] rounded-xl border flex items-center justify-center transition-colors"
            style={{
              borderColor: "rgba(255,255,255,0.07)",
              background: "rgba(255,255,255,0.04)",
              color: "#8B92A5",
            }}
            title="Toggle source document"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowSticky(!showSticky)}
            className="w-[34px] h-[34px] rounded-xl border flex items-center justify-center transition-colors"
            style={{
              borderColor: "rgba(255,255,255,0.07)",
              background: "rgba(255,255,255,0.04)",
              color: "#8B92A5",
            }}
            title="Learning insights"
          >
            <Lightbulb className="h-4 w-4" />
          </button>
          <div className="w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/25 flex items-center justify-center text-[13px] font-serif italic text-amber-400 cursor-pointer">
            N
          </div>
        </div>
      </nav>

      {/* ── Layout Body ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left sidebar – PDF viewer */}
        <div
          className={`flex-shrink-0 overflow-hidden transition-all duration-400 flex flex-col`}
          style={{
            width: pdfVisible ? "360px" : "0px",
            background: "rgba(13,17,23,0.95)",
            backdropFilter: "blur(24px)",
            borderRight: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="w-[360px] flex-shrink-0 h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <div className="w-[26px] h-[26px] rounded-md bg-indigo-500/15 flex items-center justify-center">
                  <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <span className="truncate">{course?.title || "Source Material"}</span>
              </div>
              <button
                onClick={() => setPdfVisible(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-white/5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-3">
              {dynamicStoragePath ? (
                <FilePreview storagePath={dynamicStoragePath} title={course?.title} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-600 text-[13px]">
                  <div className="w-14 h-[72px] rounded-md border border-white/10 bg-white/[0.02] flex items-center justify-center">
                    <FileText className="h-6 w-6" />
                  </div>
                  <p className="text-slate-400 text-center">Source document renders here.</p>
                  <p className="text-xs text-slate-600">PDF, DOCX, PPTX supported</p>
                  <div className="flex gap-2 mt-2">
                    <button className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-white/10 text-xs text-slate-400 hover:bg-white/5 transition-colors">
                      <ExternalLink className="h-3 w-3" /> Open
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-white/10 text-xs text-slate-400 hover:bg-white/5 transition-colors">
                      <Download className="h-3 w-3" /> Download
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 p-4 gap-3">
          {/* Board – full height, primary visual */}
          <div
            className="flex-1 min-h-0 rounded-3xl border flex flex-col overflow-hidden shadow-lg"
            style={{
              background: "#0D1117",
              borderColor: "rgba(255,255,255,0.07)",
            }}
          >
            {/* Board header */}
            <div
              className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
              style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase text-slate-500">
                <Sparkles className="h-3.5 w-3.5" />
                Live Interactive Board
              </div>
              <div className="flex gap-1">
                <button className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-slate-500 hover:bg-white/5 transition-colors">
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* Board body */}
            <div className="flex-1 overflow-auto custom-scroll">
              {hasBoardContent ? (
                <GenerativeCanvas />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center animate-orb-breathe"
                    style={{ background: "rgba(59,111,255,0.06)", border: "1px solid rgba(59,111,255,0.15)" }}
                  >
                    <BrainCircuit className="h-6 w-6 text-indigo-400/60" />
                  </div>
                  <p className="text-[13px] font-medium text-slate-400/70">Listening and analysing…</p>
                  <p className="text-xs text-slate-600 text-center max-w-[240px]">
                    The interactive board will populate as topics are discussed.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Transcript – 220px fixed footer */}
          <div
            className="h-[220px] flex-shrink-0 rounded-3xl border flex flex-col overflow-hidden shadow-lg"
            style={{
              background: "#0D1117",
              borderColor: "rgba(255,255,255,0.07)",
            }}
          >
            {/* Transcript header */}
            <div
              className="flex items-center justify-between px-5 py-2.5 border-b flex-shrink-0"
              style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase text-slate-500">
                <MessageSquare className="h-3.5 w-3.5" />
                Live Transcript
              </div>
              <div className="flex items-center gap-3">
                {thinking && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-dot-blink" />
                    Thinking
                  </div>
                )}
                {isConnected && <VoiceWave />}
              </div>
            </div>
            {/* Transcript messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 custom-scroll flex flex-col gap-3">
              {hasTranscript ? (
                <>
                  {transcript.split(/(?=ATLAS:)/).map((block, idx) => {
                    const parts = block.match(/^(ATLAS:)?\s*([\s\S]*)/);
                    const isAtlas = parts && parts[1];
                    const text = parts ? parts[2] : block;
                    if (!text || !text.trim()) return null;
                    return (
                      <ChatBubble key={idx} text={text.trim()} isAI={!!isAtlas} />
                    );
                  })}
                  <div ref={transcriptEndRef} />
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-600">
                  <MessageSquare className="h-5 w-5 opacity-40" />
                  <p className="text-xs font-medium text-slate-500">Your live tutor transcript will appear here</p>
                  <p className="text-[11px] text-slate-600">Tap the microphone to start a conversation</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar – Learning Insights */}
        <div
          className="flex-shrink-0 overflow-hidden transition-all duration-400 flex flex-col"
          style={{
            width: showSticky ? "280px" : "0px",
            background: "rgba(13,17,23,0.95)",
            backdropFilter: "blur(24px)",
            borderLeft: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="w-[280px] flex-shrink-0 h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <div className="w-[26px] h-[26px] rounded-md bg-amber-500/10 flex items-center justify-center">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                </div>
                Learning Insights
              </div>
              <button
                onClick={() => setShowSticky(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-white/5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scroll">
              <StickyNotes notes={stickyNotes} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
/**
 * @file frontend/src/hooks/use-swarm-stream.ts
 * @description Bi‑directional WebSocket bridge for Gemini Live API.
 * SOTA UPDATE: Adds thinking state detection.
 * @layer Side Effect
 * @dependencies react, @/store/live-sync.store, @/store/voice-settings.store,
 *              @/hooks/use-mic-capture, @/hooks/use-audio-sync
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { useLiveSyncStore, StickyNote } from "@/store/live-sync.store";
import { useVoiceSettingsStore } from "@/store/voice-settings.store";
import { useAudioSync } from "@/hooks/use-audio-sync";
import { useMicCapture } from "@/hooks/use-mic-capture";

export function useSwarmStream(courseId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const preWarmedContextRef = useRef<string>("");
  const lastAudioTimeRef = useRef<number>(Date.now());
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nextPlayTimeRef = useRef<number>(0);
  const audioChunkCountRef = useRef<number>(0);

  const {
    hydrateUi,
    addStickyNotes,
    enqueueMark,
    setAudioPlaying,
    setThinking,
    appendTranscript,
  } = useLiveSyncStore();
  const { startSync, stopSync } = useAudioSync();

  const clearThinkingTimeout = useCallback(() => {
    if (thinkingTimeoutRef.current !== null) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }
  }, []);

  const scheduleThinking = useCallback(() => {
    clearThinkingTimeout();
    thinkingTimeoutRef.current = setTimeout(() => {
      setThinking(true);
    }, 2000); // 2 seconds of silence → AI is thinking
  }, [clearThinkingTimeout, setThinking]);

  // --- PRE-WARM CONTEXT (unchanged) ---
  useEffect(() => {
    const fetchContext = async () => {
      try {
        const token = localStorage.getItem("atlas_access_token") || "";
        const httpApiUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
        console.log(
          "%c🔥 [Pre-Warm] Fetching AI Context in background...",
          "color: #f59e0b; font-weight: bold;"
        );
        const res = await fetch(`${httpApiUrl}/rag/context/${courseId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          preWarmedContextRef.current = data.context || "";
          console.log(
            "%c✅ [Pre-Warm] Context ready. Zero-latency WebSocket unlocked.",
            "color: #10b981; font-weight: bold;"
          );
        }
      } catch (err) {
        console.error("Failed to pre-warm context:", err);
      }
    };
    if (courseId) fetchContext();
  }, [courseId]);

  // --- UPSTREAM: mic chunks ---
  const handleMicChunk = useCallback(
    (base64: string, mimeType: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "audio_chunk", base64, mimeType })
        );
      }
    },
    []
  );

  const {
    isRecording: isListening,
    startRecording,
    stopRecording,
  } = useMicCapture(handleMicChunk);

  // --- DOWNSTREAM: audio decode & play ---
  const initAudio = useCallback(() => {
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
    }
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    audioCtxRef.current = new AudioContextClass({ sampleRate: 24000 });
    nextPlayTimeRef.current = 0;
    audioChunkCountRef.current = 0;
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  }, []);

  const playRawPcmChunk = async (base64Audio: string) => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      initAudio();
    }
    if (!audioCtxRef.current) return;

    try {
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Data = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }

      const audioBuffer = audioCtxRef.current.createBuffer(
        1,
        float32Data.length,
        24000
      );
      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioCtxRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtxRef.current.destination);

      const currentTime = audioCtxRef.current.currentTime;
      if (nextPlayTimeRef.current < currentTime) {
        nextPlayTimeRef.current = currentTime;
      }

      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += audioBuffer.duration;

      setAudioPlaying(true);
      setThinking(false);               // receiving audio → not thinking
      lastAudioTimeRef.current = Date.now();
      clearThinkingTimeout();            // cancel any scheduled thinking

      startSync(audioCtxRef.current, currentTime);

      source.onended = () => {
        if (
          audioCtxRef.current &&
          audioCtxRef.current.currentTime >= nextPlayTimeRef.current - 0.1
        ) {
          setAudioPlaying(false);
          scheduleThinking();            // audio stopped → might be thinking soon
        }
      };
    } catch (err) {
      console.error("❌ [Audio Pipeline] PCM Decode Error:", err);
    }
  };

  // --- LIFECYCLE ---
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "close" }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    stopRecording();
    stopSync();
    clearThinkingTimeout();
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsConnected(false);
    setAudioPlaying(false);
    setThinking(false);
    console.log(
      "%c🛑 [Orchestrator] Swarm WebSocket Closed",
      "color: #ef4444; font-weight: bold;"
    );
  }, [stopRecording, stopSync, clearThinkingTimeout, setAudioPlaying, setThinking]);

  const connect = useCallback(() => {
    disconnect();
    initAudio();

    const token = localStorage.getItem("atlas_access_token") || "";
    const httpApiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    const wsUrl =
      httpApiUrl.replace(/^http/, "ws") + `/rag/tutor-socket/${courseId}`;

    const currentVoice = useVoiceSettingsStore.getState().voice;

    console.groupCollapsed(
      "%c🚀 [Orchestrator] Initiating Swarm Sequence...",
      "color: #10b981; font-weight: bold; font-size: 1.1em;"
    );
    console.log("Target Node:", wsUrl);
    console.log("Voice:", currentVoice);
    console.groupEnd();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      setIsConnected(true);
      console.log(
        "%c🟢 [Orchestrator] WebSocket Connected. Dispatching Auth Frame.",
        "color: #10b981; font-weight: bold;"
      );

      ws.send(
        JSON.stringify({
          type: "auth",
          token,
          rag_context: preWarmedContextRef.current,
          voice_name: currentVoice,
        })
      );

      await startRecording();
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event_type === "audio_chunk") {
          audioChunkCountRef.current += 1;
          if (audioChunkCountRef.current % 50 === 0) {
            console.log(
              `%c🔊 [Node A] Processed ${audioChunkCountRef.current} PCM Audio Chunks...`,
              "color: #64748b;"
            );
          }
          await playRawPcmChunk(data.payload.base64);
        } else if (data.event_type === "transcript") {
          console.log(
            `%c🗣️ [Node A] Transcript Segment:`,
            "color: #3b82f6; font-weight: bold;",
            data.payload
          );
          appendTranscript(`ATLAS: ${data.payload}\n`);
          // Reset thinking timer on transcript arrival
          clearThinkingTimeout();
          scheduleThinking();
        } else if (data.event_type === "ui_hydration") {
          const { component, props } = data.payload;

          if (component === "StickyNotes") {
            const mastery: string[] = props?.mastery ?? [];
            const weaknesses: string[] = props?.weaknesses ?? [];
            const now = Date.now();

            const notes: StickyNote[] = [
              ...mastery.map((concept, i) => ({
                id: `mastery-${now}-${i}`,
                type: "mastery" as const,
                content: `Mastered: ${concept}`,
                timestamp: now,
              })),
              ...weaknesses.map((concept, i) => ({
                id: `weakness-${now}-${i}`,
                type: "weakness" as const,
                content: `Focus: ${concept}`,
                timestamp: now,
              })),
            ];

            if (notes.length > 0) {
              addStickyNotes(notes);
              console.groupCollapsed(
                "%c🧠 [Node C] Memory Controller Extracted Insights",
                "color: #f59e0b; font-weight: bold;"
              );
              console.table(
                notes.map((n) => ({ type: n.type, content: n.content }))
              );
              console.groupEnd();
            }
          } else {
            console.groupCollapsed(
              "%c🎨 [Node B] Autonomous UI Agent Hydration",
              "color: #a855f7; font-weight: bold;"
            );
            console.log(`Target Component: <${component} />`);
            console.dir(props);
            console.groupEnd();

            hydrateUi(component, props);
          }
        } else if (data.event_type === "mark") {
          enqueueMark(data.payload.name, data.payload.time_ms);
        } else if (data.event_type === "system") {
          if (data.payload === "interrupted") {
            if (audioCtxRef.current) {
              audioCtxRef.current.close();
              audioCtxRef.current = null;
            }
            stopSync();
            setAudioPlaying(false);
            setThinking(false);
            console.log(
              "%c⚡ [Barge-In] User interrupted. Audio flushed.",
              "color: #f59e0b; font-weight: bold;"
            );
          } else {
            console.log(
              `%c⚙️ [System]`,
              "color: #f59e0b; font-weight: bold;",
              data.payload
            );
          }
        } else if (data.event_type === "error") {
          console.error(
            `%c❌ [System Error]`,
            "color: #ef4444; font-weight: bold;",
            data.payload
          );
          setThinking(false);
        }
      } catch (err) {
        console.error(
          "❌ [Swarm Socket] Failed to parse message:",
          event.data
        );
      }
    };

    ws.onerror = (error) => {
      console.error("❌ [Swarm Socket] WebSocket Error:", error);
      disconnect();
    };

    ws.onclose = () => {
      disconnect();
    };
  }, [
    courseId,
    disconnect,
    initAudio,
    startRecording,
    enqueueMark,
    hydrateUi,
    addStickyNotes,
    appendTranscript,
    stopSync,
    setAudioPlaying,
    setThinking,
    clearThinkingTimeout,
    scheduleThinking,
  ]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return { connect, disconnect, isConnected, isListening };
}
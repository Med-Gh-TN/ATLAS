/**
 * @file frontend/src/hooks/use-mic-capture.ts
 * @description Captures raw microphone audio and mathematically encodes it to 16-bit little-endian PCM for the Gemini Live API.
 * @layer Side Effect
 * @dependencies react
 */

import { useState, useRef, useCallback, useEffect } from "react";

export function useMicCapture(onChunk: (base64: string, mimeType: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  
  // Audio routing refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const startRecording = useCallback(async () => {
    try {
      // 1. Request microphone with specific acoustic constraints for Speech-to-Text
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // 2. Initialize Audio Context strictly at 16kHz
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      
      // SOTA FIX: Force the AudioContext to wake up (Bypasses Chrome/Safari Autoplay blocks)
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      // 3. Create the audio routing graph
      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Using ScriptProcessor (4096 buffer size yields chunks every ~256ms at 16kHz)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let chunkCount = 0;

      // 4. The PCM Conversion Engine
      processor.onaudioprocess = (e) => {
        const float32Array = e.inputBuffer.getChannelData(0);
        
        // Google Live API strictly requires raw 16-bit PCM little-endian
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        
        for (let i = 0; i < float32Array.length; i++) {
          // Clamp the audio signal between -1 and 1
          const s = Math.max(-1, Math.min(1, float32Array[i]));
          // Convert Float32 to Int16
          const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
          // Write as little-endian (true)
          view.setInt16(i * 2, int16, true);
        }

        const uint8Array = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)));
        }
        
        const base64 = window.btoa(binary);
        
        // TELEMETRY: Print every 10th chunk to prove the mic is actually sending data
        chunkCount++;
        if (chunkCount % 10 === 0) {
          console.log(`[MicCapture] Pumping audio chunk ${chunkCount}...`);
        }

        // Push to WebSocket hook
        onChunk(base64, "audio/pcm;rate=16000");
      };

      // 5. Connect the graph through a muted GainNode to prevent echo loop
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      setIsRecording(true);
      console.log("[MicCapture] Hardware connected and streaming started.");
    } catch (error) {
      console.error("[MicCapture] Microphone access denied or failed:", error);
      setIsRecording(false);
    }
  }, [onChunk]);

  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    console.log("[MicCapture] Hardware released.");
  },[]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return { isRecording, startRecording, stopRecording };
}
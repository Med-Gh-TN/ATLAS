/**
 * @file frontend/src/hooks/use-audio-sync.ts
 * @description High-performance requestAnimationFrame loop to synchronize Generative UI animations with Web Audio playback.
 * @layer Side Effect
 * @dependencies react, ../store/live-sync.store
 */

import { useEffect, useRef, useCallback } from "react";
import { useLiveSyncStore } from "@/store/live-sync.store";

export function useAudioSync() {
  // We use refs to hold the clock variables to avoid triggering React re-renders.
  const requestRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number | null>(null);

  /**
   * The 60FPS evaluation loop.
   * Runs independently of React's render cycle.
   */
  const evaluatePlayhead = useCallback(() => {
    if (!audioCtxRef.current || startTimeRef.current === null) return;

    // 1. Calculate the exact millisecond offset of the current audio chunk
    const currentAudioTime = audioCtxRef.current.currentTime;
    const playheadMs = (currentAudioTime - startTimeRef.current) * 1000;

    // 2. Fetch the dormant registry imperatively (No React subscriptions triggered here)
    const { metadataQueue, triggerAnimation } = useLiveSyncStore.getState();

    // 3. Mathematical check: Has the playhead crossed any pending SSML marks?
    for (const mark of metadataQueue) {
      if (!mark.executed && playheadMs >= mark.time_ms) {
        // EXACT MATCH TRIGGER: This fires the Zustand action, which then triggers the React render for the animation.
        triggerAnimation(mark.name);
      }
    }

    // 4. Schedule the next frame evaluation
    requestRef.current = requestAnimationFrame(evaluatePlayhead);
  }, []);

  /**
   * Starts the synchronization engine.
   * @param audioCtx The active browser AudioContext playing the chunk.
   * @param audioStartTime The exact AudioContext.currentTime when the chunk began playing.
   */
  const startSync = useCallback(
    (audioCtx: AudioContext, audioStartTime: number) => {
      audioCtxRef.current = audioCtx;
      startTimeRef.current = audioStartTime;

      // Prevent duplicate loops
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
      }

      requestRef.current = requestAnimationFrame(evaluatePlayhead);
    },
    [evaluatePlayhead]
  );

  /**
   * Halts the synchronization engine and cleans up memory.
   */
  const stopSync = useCallback(() => {
    if (requestRef.current !== null) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    audioCtxRef.current = null;
    startTimeRef.current = null;
  }, []);

  // Cleanup on unmount to prevent zombie animation frames (memory leak protection)
  useEffect(() => {
    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  return { startSync, stopSync };
}
import { useState, useEffect, useCallback, useRef } from "react";
import { loadState, saveState, serializeState, deserializeState } from "../lib/statePersistence";
import { getDefaultMixerSettings, getDefaultEffectParameters, getDefaultAudioSettings, getDefaultMidiSettings, getDefaultUISettings } from "../lib/statePersistence";
import { DEFAULT_BPM, DEFAULT_SWING, AUTO_SAVE_INTERVAL_MS } from "../lib/constants";
import { logger } from "../lib/logger";
import type { Sequencer, TBMAudioEngine, Pad } from "../lib/TBMAudioEngine";

const KNOWN_TABS = [
  "sampler", "pianoroll", "session", "library", "song", "macro",
  "plugins", "chains", "drums", "hats", "chords", "mixer", "vinyl",
  "stems", "settings",
] as const;

interface UseAutoSaveOptions {
  sequencer: Sequencer | null;
  engine: TBMAudioEngine | null;
  pads: Pad[];
  projectKey: string;
  activeState: "A" | "B";
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setBpm: (bpm: number) => void;
  updatePad: ((index: number, patch: Partial<Pad>) => void) | null;
  loadSampleToPad: ((index: number, file: File) => Promise<void>) | null;
  onStateLoaded?: () => void;
}

export function useAutoSave(options: UseAutoSaveOptions) {
  const {
    sequencer, pads, projectKey, activeState, activeTab,
    setActiveTab, setBpm, updatePad, loadSampleToPad,
  } = options;

  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const restoredRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const savedState = loadState(true);
      if (savedState) {
        if (savedState.activeTab && (KNOWN_TABS as readonly string[]).includes(savedState.activeTab)) {
          setActiveTab(savedState.activeTab);
        }
        setLastSavedAt(new Date(savedState.timestamp));
      }
    } catch (error) {
      logger.error("Failed to load auto-save state", error as Error);
    }
  }, [setActiveTab]);

  useEffect(() => {
    if (!sequencer || restoredRef.current) return;
    try {
      const savedState = loadState(true);
      if (!savedState) return;
      restoredRef.current = true;

      if (savedState.bpm) setBpm(savedState.bpm);

      if (savedState.sequencerPatterns) {
        for (const [id, pattern] of Object.entries(savedState.sequencerPatterns)) {
          if (Array.isArray(pattern) && pattern.length > 0) {
            sequencer.setPattern(id, pattern);
          }
        }
      }

      if (savedState.pads && updatePad) {
        const deserialized = deserializeState(savedState);
        deserialized.pads.forEach((padUpdate, index) => {
          if (padUpdate) {
            updatePad(index, padUpdate);
            if (padUpdate.sample?.dataUri && padUpdate.sample.dataUri.startsWith("data:")) {
              fetch(padUpdate.sample.dataUri)
                .then((res) => res.blob())
                .then((blob) => {
                  const file = new File([blob], padUpdate.sample!.name || "sample.wav", { type: "audio/wav" });
                  loadSampleToPad?.(index, file).catch((e) => {
                    logger.warn(`Failed to auto-restore saved sample for pad ${index}:`, e);
                  });
                })
                .catch((e) => {
                  logger.warn(`Failed to decode auto-restored sample for pad ${index}:`, e);
                });
            }
          }
        });
      }
      logger.info("Sequencer state restored from auto-save");
    } catch (error) {
      logger.error("Failed to restore auto-save state", error as Error);
    }
  }, [sequencer, setBpm, updatePad, loadSampleToPad]);

  const performAutoSave = useCallback(async () => {
    try {
      const currentBpm = sequencer?.getBpm?.() || DEFAULT_BPM;
      const currentSwing = sequencer?.getState?.().swing ?? DEFAULT_SWING;
      const sequencerPatterns: Record<string, boolean[][]> = {};
      if (sequencer) {
        const pattern = sequencer.getPattern();
        if (pattern) sequencerPatterns["main"] = pattern;
      }
      let pianoRollNotes = {};
      try {
        const saved = localStorage.getItem("tbm_piano_roll_state");
        if (saved) {
          const state = JSON.parse(saved);
          pianoRollNotes = state.sequences || {};
        }
      } catch { /* ignore */ }

      const state = await serializeState(
        pads,
        sequencerPatterns,
        pianoRollNotes,
        { activeTab, projectKey, activeState, bpm: currentBpm, swing: currentSwing },
        getDefaultMixerSettings(),
        getDefaultEffectParameters(),
        { audio: getDefaultAudioSettings(), midi: getDefaultMidiSettings(), ui: getDefaultUISettings() },
      );

      saveState(state, true);
      const now = new Date();
      setLastSavedAt(now);
      setIsAutoSaving(true);
      if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => setIsAutoSaving(false), 1500);
    } catch (error) {
      logger.error("Auto-save failed", error as Error);
    }
  }, [activeTab, projectKey, activeState, pads, sequencer]);

  useEffect(() => {
    const interval = setInterval(performAutoSave, AUTO_SAVE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
    };
  }, [performAutoSave]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  return { isAutoSaving, lastSavedAt };
}

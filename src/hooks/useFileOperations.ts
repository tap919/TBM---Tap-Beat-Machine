import { useCallback } from "react";
import { exportState, saveState, importState, deserializeState, serializeState } from "../lib/statePersistence";
import { getDefaultMixerSettings, getDefaultEffectParameters, getDefaultAudioSettings, getDefaultMidiSettings, getDefaultUISettings } from "../lib/statePersistence";
import { DEFAULT_SWING } from "../lib/constants";
import { logger } from "../lib/logger";
import type { Sequencer, Pad } from "../lib/TBMAudioEngine";

const KNOWN_TABS = [
  "sampler", "pianoroll", "session", "library", "song", "macro",
  "plugins", "chains", "drums", "hats", "chords", "mixer", "vinyl",
  "stems", "settings",
] as const;

interface UseFileOperationsOptions {
  sequencer: Sequencer | null;
  pads: Pad[];
  projectKey: string;
  activeState: "A" | "B";
  activeTab: string;
  setActiveTab: (tab: string) => void;
  updatePad: ((index: number, patch: Partial<Pad>) => void) | null;
  loadSampleToPad: ((index: number, file: File) => Promise<void>) | null;
  pushSnapshot: (snap: { key: string; abState: "A" | "B" }) => void;
}

export function useFileOperations(options: UseFileOperationsOptions) {
  const { sequencer, pads, projectKey, activeState, activeTab, setActiveTab, updatePad, loadSampleToPad, pushSnapshot } = options;

  const handleProjectSave = useCallback(
    async (showNotification: (type: "success" | "error", message: string) => void) => {
      try {
        if (!sequencer) { showNotification("error", "Engine not ready"); return; }
        const currentBpm = sequencer.getBpm();
        const currentSwing = sequencer.getState?.().swing ?? DEFAULT_SWING;
        const pattern = sequencer.getPattern();
        const sequencerPatterns: Record<string, boolean[][]> = pattern ? { main: pattern } : {};
        let pianoRollNotes = {};
        try {
          const saved = localStorage.getItem("tbm_piano_roll_state");
          if (saved) { const state = JSON.parse(saved); pianoRollNotes = state.sequences || {}; }
        } catch { /* ignore */ }

        const state = await serializeState(
          pads, sequencerPatterns, pianoRollNotes,
          { activeTab, projectKey, activeState, bpm: currentBpm, swing: currentSwing },
          getDefaultMixerSettings(), getDefaultEffectParameters(),
          { audio: getDefaultAudioSettings(), midi: getDefaultMidiSettings(), ui: getDefaultUISettings() },
        );
        exportState(state);
        saveState(state, false);
        showNotification("success", "PROJECT SAVED");
      } catch (error) {
        logger.error("Project save failed", error as Error);
        showNotification("error", `Save failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
    [sequencer, projectKey, activeState, pads, activeTab],
  );

  const handleProjectOpen = useCallback(
    async (file: File, showNotification: (type: "success" | "error", message: string) => void) => {
      try {
        const state = await importState(file);
        const { pads: padUpdates, sequencerPatterns, pianoRollNotes, uiState } = deserializeState(state);
        pushSnapshot({ key: uiState.projectKey, abState: uiState.activeState });
        if (uiState.activeTab && (KNOWN_TABS as readonly string[]).includes(uiState.activeTab)) {
          setActiveTab(uiState.activeTab);
        }
        if (sequencer) {
          sequencer.setBpm(uiState.bpm);
          sequencer.setSwing?.(uiState.swing);
          if (sequencerPatterns.main) sequencer.setPattern("main", sequencerPatterns.main);
        }
        if (updatePad) {
          padUpdates.forEach((padUpdate, index) => {
            if (padUpdate) {
              updatePad(index, padUpdate);
              if (padUpdate.sample?.dataUri) {
                fetch(padUpdate.sample.dataUri).then((res) => res.blob()).then((blob) => {
                  const file = new File([blob], padUpdate.sample!.name || "sample.wav", { type: "audio/wav" });
                  loadSampleToPad?.(index, file).catch((e) => logger.warn(`Failed to load saved sample for pad ${index}:`, e));
                }).catch((e) => logger.warn(`Failed to decode saved sample for pad ${index}:`, e));
              }
            }
          });
        }
        if (pianoRollNotes && Object.keys(pianoRollNotes).length > 0) {
          try {
            localStorage.setItem("tbm_piano_roll_state", JSON.stringify({
              sequences: pianoRollNotes, activeSequenceId: 0, mode: "track", version: "1.0.0", timestamp: new Date().toISOString(),
            }));
          } catch { /* ignore */ }
        }
        saveState(state, false);
        showNotification("success", "PROJECT LOADED");
        logger.info("Project loaded", { version: state.version, timestamp: state.timestamp });
      } catch (err) {
        logger.error("Project load failed", err as Error);
        showNotification("error", `Load failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    },
    [sequencer, pushSnapshot, updatePad, loadSampleToPad],
  );

  return { handleProjectSave, handleProjectOpen };
}

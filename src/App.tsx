/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { logger } from "./lib/logger";
import {
  exportState,
  loadState,
  serializeState,
  saveState,
  importState,
  deserializeState,
  getDefaultMixerSettings,
  getDefaultEffectParameters,
  getDefaultAudioSettings,
  getDefaultMidiSettings,
  getDefaultUISettings,
  TBMProjectState,
} from "./lib/statePersistence";
import { HeaderIOMeters, MixerDetailMeters } from "./components/AudioMeters";
import {
  DEFAULT_BPM,
  DEFAULT_SWING,
  AUTO_SAVE_INTERVAL_MS as _AUTO_SAVE_INTERVAL_MS,
  NOTE_NAMES,
} from "./lib/constants";
// ── Eagerly loaded (always visible or lightweight) ──
import { VirtualKeyboard } from "./components/VirtualKeyboard";
import { Sidebar } from "./components/Sidebar";
import { useTBMAudio } from "./contexts/TBMAudioContext";
import { BounceEngine } from "./lib/TBMAudioEngine";
import type { BounceConfig, BounceResult, BounceFormat, Mp3Bitrate } from "./lib/TBMAudioEngine";

import {
  Download,
  X,
  Settings,
  Save,
  FileAudio,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Undo2,
  Redo2,
  RotateCcw,
  ZapOff,
  Activity,
  Music,
  Upload,
  Loader2,
  FilePlus,
  ChevronUp,
  Piano as PianoIcon,
} from "lucide-react";

// ── Lazy loaded (tab-based, only one visible at a time) ──
const WaveformVisualizer = React.lazy(() =>
  import("./components/WaveformVisualizer").then((m) => ({
    default: m.WaveformVisualizer,
  })),
);
const Mixer808 = React.lazy(() =>
  import("./components/Mixer808").then((m) => ({ default: m.Mixer808 })),
);
const FXMacros = React.lazy(() =>
  import("./components/FXMacros").then((m) => ({ default: m.FXMacros })),
);
const ChordBuilder = React.lazy(() =>
  import("./components/ChordBuilder").then((m) => ({
    default: m.ChordBuilder,
  })),
);

const ConsoleMixer = React.lazy(() =>
  import("./components/ConsoleMixer").then((m) => ({ default: m.ConsoleMixer })),
);
const SettingsView = React.lazy(() =>
  import("./components/SettingsView").then((m) => ({
    default: m.SettingsView,
  })),
);
const DrumMachine = React.lazy(() =>
  import("./components/DrumMachine").then((m) => ({ default: m.DrumMachine })),
);
const SpectrumAnalyzer = React.lazy(() =>
  import("./components/SpectrumAnalyzer").then((m) => ({
    default: m.SpectrumAnalyzer,
  })),
);
const HatSequencer = React.lazy(() =>
  import("./components/HatSequencer").then((m) => ({
    default: m.HatSequencer,
  })),
);

const VSTManager = React.lazy(() =>
  import("./components/VSTManager").then((m) => ({ default: m.VSTManager })),
);
const VSTChainManager = React.lazy(() =>
  import("./components/VSTChainManager").then((m) => ({ default: m.VSTChainManager })),
);
const PianoRoll = React.lazy(() =>
  import("./components/PianoRoll").then((m) => ({ default: m.PianoRoll })),
);
const SessionMusician = React.lazy(() =>
  import("./components/SessionMusician").then((m) => ({
    default: m.SessionMusician,
  })),
);
const VinylScratchPro = React.lazy(() =>
  import("./components/VinylScratchPro").then((m) => ({
    default: m.VinylScratchPro,
  })),
);
const StemSeparator = React.lazy(() =>
  import("./components/StemSeparator").then((m) => ({
    default: m.StemSeparator,
  })),
);
const MusicLibrary = React.lazy(() =>
  import("./components/MusicLibrary").then((m) => ({
    default: m.MusicLibrary,
  })),
);
const SongEditor = React.lazy(() =>
  import("./components/SongEditor").then((m) => ({
    default: m.SongEditor,
  })),
);
const MacroControls = React.lazy(() =>
  import("./components/MacroControls").then((m) => ({
    default: m.MacroControls,
  })),
);
const TurntableSampler = React.lazy(() =>
  import("./components/TurntableSampler").then((m) => ({
    default: m.TurntableSampler,
  })),
);

// Gemini Slate 4 DJ controller — eagerly loaded so it initialises MIDI on mount
import { GeminiSlate4Integration } from "./components/GeminiSlate4Integration";

// ── Loading fallback for lazy components ──
function TabSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-neutral-700 border-t-neutral-300 rounded-full animate-spin" />
        <span className="text-[13px] font-mono text-neutral-600 uppercase tracking-wider">
          Loading module...
        </span>
      </div>
    </div>
  );
}

const AUTO_SAVE_INTERVAL_MS = _AUTO_SAVE_INTERVAL_MS;
const KNOWN_TABS = [
  "sampler",
  "pianoroll",
  "session",
  "library",
  "song",
  "macro",
  "plugins",
  "chains",
  "drums",
  "hats",
  "chords",
  "mixer",
  "vinyl",
  "stems",
  "settings",
] as const;

interface FullProjectSnapshot {
  key: string;
  abState: "A" | "B";
  pads?: any[];          // full pad array for restore via setPads
  patterns?: Record<string, boolean[][]>;
  bpm?: number;
  swing?: number;
}

export default function App() {
  const [showExportModal, setShowExportModal] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState("sampler");
  const [isPanic, setIsPanic] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [vinylMode, setVinylMode] = useState<"decks" | "sampler">("decks");
  const [musicDrawerOpen, setMusicDrawerOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(true);
  const [workspaceMode, setWorkspaceMode] = useState<"ideas" | "arranger">("ideas");
  const [macroValues, setMacroValues] = useState<number[]>(Array(8).fill(0.5));
  const [snapshots, setSnapshots] = useState<{ id: string; name: string; values: number[] }[]>(() => {
    try {
      const saved = localStorage.getItem("tbm_macro_snapshots");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [songs, setSongs] = useState<{ id: string; name: string; sections: { id: string; patternIndex: number; repeatCount: number }[]; bpm: number; swing: number }[]>(() => {
    try {
      const saved = localStorage.getItem("tbm_songs");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const {
    audioError,
    resumeAudio,
    engine,
    sequencer,
    pads,
    audioContext,
    updatePad,
    setPads,
    loadSampleToPad,
    loadUrlToDeck,
    detectBpm,
    setDeckBpm,
    setBpm,
    getEngineAnalyser,
    setProjectKey: setContextProjectKey,
  } = useTBMAudio();

  // Real audio analysis — the AnalyserNode is passed down to self-contained
  // meter components (HeaderIOMeters, MixerDetailMeters) so their 30 fps
  // setState updates stay scoped and never re-render App.
  const analyserNode = getEngineAnalyser();

  // ── Deferred restore: apply saved patterns/BPM once the sequencer initializes ──
  const pendingRestoreRef = useRef<TBMProjectState | null>(null);
  const restoredRef = useRef(false);

  // ── External track buffers for VinylScratchPro waveform sync ──
  const [externalBufferA, setExternalBufferA] = useState<AudioBuffer | null>(
    null,
  );
  const [externalBufferB, setExternalBufferB] = useState<AudioBuffer | null>(
    null,
  );
  const [externalNameA, setExternalNameA] = useState<string>("");
  const [externalNameB, setExternalNameB] = useState<string>("");

  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── CPU / RAM meters ──
  const [cpuPct, setCpuPct] = useState(0);
  const [ramStr, setRamStr] = useState("N/A");
  const rafMeterRef = useRef<number | null>(null);
  const lastRafTimeRef = useRef<number>(performance.now());
  // Track last-rendered values to avoid setState on every frame
  const lastCpuRef = useRef<number>(0);
  const lastRamRef = useRef<string>("N/A");

  useEffect(() => {
    const tick = (now: number) => {
      const delta = now - lastRafTimeRef.current;
      lastRafTimeRef.current = now;
      // Express frame delta as % of 10 ms budget (one sequencer step at 100 BPM)
      const nextCpu = Math.min(99, Math.round((delta / 10) * 100) / 10);
      // Only trigger a re-render when the CPU value shifts by more than 0.5 percentage points
      if (Math.abs(nextCpu - lastCpuRef.current) >= 0.5) {
        lastCpuRef.current = nextCpu;
        setCpuPct(nextCpu);
      }
      const mem = (
        performance as unknown as { memory?: { usedJSHeapSize: number } }
      ).memory;
      if (mem) {
        const mb = (mem.usedJSHeapSize / 1048576).toFixed(0);
        const nextRam = `${mb} MB`;
        if (nextRam !== lastRamRef.current) {
          lastRamRef.current = nextRam;
          setRamStr(nextRam);
        }
      }
      rafMeterRef.current = requestAnimationFrame(tick);
    };
    rafMeterRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafMeterRef.current !== null)
        cancelAnimationFrame(rafMeterRef.current);
    };
  }, []);

  // ── A/B Copy: preserve B snapshot ──
  const bSnapshotRef = useRef<{ pattern: boolean[][]; bpm: number } | null>(
    null,
  );

  // ── Bounce / Export state ──
  type BouncePhase = "idle" | "bouncing" | "done" | "error";
  const [bouncePhase, setBouncePhase] = useState<BouncePhase>("idle");
  const [bounceProgress, setBounceProgress] = useState(0);
  const [bounceResults, setBounceResults] = useState<BounceResult[]>([]);
  const [bounceError, setBounceError] = useState<string | null>(null);
  const [bounceBars, setBounceBars] = useState(4);
  const [bounceBpm, setBounceBpm] = useState(DEFAULT_BPM);
  const [bounceBitDepth, setBounceBitDepth] = useState<16 | 24 | 32>(24);
  const [bounceStemMode, setBounceStemMode] = useState(false);
  const [bounceFormat, setBounceFormat] = useState<BounceFormat>("wav");
  const [bounceMp3Kbps, setBounceMp3Kbps] = useState<Mp3Bitrate>(320);
  const [sendingToStudio, setSendingToStudio] = useState(false);

  const keys = NOTE_NAMES;

  // ── Undoable project snapshot — now captures full state (CRIT-03 fix) ──
  const [snapshot, setSnapshot] = useState<FullProjectSnapshot>({
    key: "Cm",
    abState: "A",
    pads: [],
    patterns: {},
    bpm: 120,
    swing: 0,
  });
  const [undoStack, setUndoStack] = useState<FullProjectSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<FullProjectSnapshot[]>([]);

  const projectKey = snapshot.key;
  const activeState = snapshot.abState;

  // ── Refs to avoid stale closures in undo/redo callbacks ──
  const padsRef = useRef(pads);
  padsRef.current = pads;
  const undoPadsRef = useRef(setPads);
  undoPadsRef.current = setPads;
  const undoSeqRef = useRef(sequencer);
  undoSeqRef.current = sequencer;
  const undoSetBpmRef = useRef(setBpm);
  undoSetBpmRef.current = setBpm;

  // ── Sync local projectKey → audio context ──
  useEffect(() => {
    setContextProjectKey(projectKey);
  }, [projectKey, setContextProjectKey]);

  // ── Capture pads + sequencer state by reading refs (always fresh) ──
  const captureFullState = useCallback(
    (current: FullProjectSnapshot): FullProjectSnapshot => {
      const seq = undoSeqRef.current;
      const pattern = seq?.getPattern?.() ?? [];
      const seqState = seq?.getState?.();
      return {
        key: current.key,
        abState: current.abState,
        pads: [...padsRef.current],
        patterns: pattern.length > 0 ? { main: pattern } : {},
        bpm: seq?.getBpm?.() ?? current.bpm,
        swing: seqState?.swing ?? current.swing,
      };
    },
    [],
  );

  // ── Apply full snapshot: pads, patterns, BPM, swing ──
  const applySnapshot = useCallback((s: FullProjectSnapshot) => {
    const seq = undoSeqRef.current;
    if (seq && s.patterns) {
      const p = s.patterns.main ?? [];
      if (p.length > 0) seq.setPattern("main", p);
      if (s.bpm !== undefined) seq.setBpm(s.bpm);
      if (seq.setSwing && s.swing !== undefined) seq.setSwing(s.swing);
    }
    if (s.pads && s.pads.length > 0) {
      const sp = undoPadsRef.current;
      if (sp) sp(s.pads);
    }
    if (s.bpm !== undefined && s.bpm > 0) undoSetBpmRef.current?.(s.bpm);
  }, []);

  const pushSnapshot = useCallback((next: FullProjectSnapshot) => {
    setSnapshot((prev) => {
      const fullPrev = { ...prev, pads: [...padsRef.current] };
      setUndoStack((u) => [fullPrev, ...u].slice(0, 50));
      setRedoStack([]);
      return next;
    });
  }, []);

  const setProjectKey = useCallback(
    (k: string) => {
      setSnapshot((prev) => {
        setUndoStack((u) => [captureFullState(prev), ...u].slice(0, 50));
        setRedoStack([]);
        return { ...prev, key: k };
      });
    },
    [captureFullState],
  );

  const setActiveState = useCallback(
    (s: "A" | "B") => {
      if (s === "B" && bSnapshotRef.current) {
        const snap = bSnapshotRef.current;
        const seq = undoSeqRef.current;
        if (seq) {
          seq.setPattern("main", snap.pattern);
          seq.setBpm(snap.bpm);
        }
        bSnapshotRef.current = null;
      }
      setSnapshot((prev) => {
        setUndoStack((u) => [captureFullState(prev), ...u].slice(0, 50));
        setRedoStack([]);
        return { ...prev, abState: s };
      });
    },
    [captureFullState],
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const top = prev[0];
      const rest = prev.slice(1);
      setSnapshot((current) => {
        setRedoStack((r) => [captureFullState(current), ...r].slice(0, 50));
        return top;
      });
      // Side effects must happen outside the state setter
      setTimeout(() => applySnapshot(top), 0);
      return rest;
    });
  }, [captureFullState, applySnapshot]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const top = prev[0];
      const rest = prev.slice(1);
      setSnapshot((current) => {
        setUndoStack((u) => [captureFullState(current), ...u].slice(0, 50));
        return top;
      });
      setTimeout(() => applySnapshot(top), 0);
      return rest;
    });
  }, [captureFullState, applySnapshot]);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── State persistence: load on mount ──
  useEffect(() => {
    try {
      // Try to load auto-saved state first
      const savedState = loadState(true); // true = auto-save

      if (savedState) {
        // Apply UI state
        if (
          savedState.activeTab &&
          (KNOWN_TABS as readonly string[]).includes(savedState.activeTab)
        ) {
          setActiveTab(savedState.activeTab);
        }
        setSnapshot({
          key: savedState.projectKey || "Cm",
          abState: savedState.activeState || "A",
        });
        setLastSavedAt(new Date(savedState.timestamp));

        // Stash saved state for deferred pattern/BPM restore
        pendingRestoreRef.current = savedState;

        logger.info("Auto-save state loaded", {
          timestamp: savedState.timestamp,
          version: savedState.version,
        });
      }
    } catch (error) {
      logger.error("Failed to load auto-save state", error as Error);
    }
  }, []);

  // ── Deferred restore: apply patterns + BPM once sequencer is ready ──
  useEffect(() => {
    if (!sequencer || restoredRef.current) return;
    const saved = pendingRestoreRef.current;
    if (!saved) return;

    restoredRef.current = true;
    pendingRestoreRef.current = null;

    // Restore BPM
    if (saved.bpm) {
      setBpm(saved.bpm);
    }

    // Restore sequencer patterns
    if (saved.sequencerPatterns) {
      for (const [id, pattern] of Object.entries(saved.sequencerPatterns)) {
        if (Array.isArray(pattern) && pattern.length > 0) {
          sequencer.setPattern(id, pattern);
        }
      }
    }

    // Restore pad updates
    if (saved.pads && updatePad) {
      const deserialized = deserializeState(saved);
      deserialized.pads.forEach((padUpdate, index) => {
        if (padUpdate) {
          updatePad(index, padUpdate);
          
          if (padUpdate.sample?.dataUri) {
            fetch(padUpdate.sample.dataUri)
              .then(res => res.blob())
              .then(blob => {
                const file = new File([blob], padUpdate.sample!.name || "sample.wav", { type: "audio/wav" });
                loadSampleToPad(index, file).catch(e => {
                  logger.warn(`Failed to auto-restore saved sample for pad ${index}:`, e);
                });
              })
              .catch(e => {
                logger.warn(`Failed to decode auto-restored sample for pad ${index}:`, e);
              });
          }
        }
      });
    }

    logger.info("Sequencer state restored from auto-save");
  }, [sequencer, setBpm, updatePad, loadSampleToPad]);

  // ── State persistence: auto-save on interval ──
  const performAutoSave = useCallback(async () => {
    try {
      // Get current BPM and swing from sequencer if available
      const currentBpm = sequencer?.getBpm?.() || DEFAULT_BPM;
      const currentSwing = sequencer?.getState?.().swing ?? DEFAULT_SWING;

      // Get current sequencer patterns
      const sequencerPatterns: Record<string, boolean[][]> = {};
      if (sequencer) {
        const pattern = sequencer.getPattern();
        if (pattern) sequencerPatterns["main"] = pattern;
      }

      // Get piano roll notes from localStorage (PianoRoll component saves its own state)
      let pianoRollNotes = {};
      try {
        const saved = localStorage.getItem("tbm_piano_roll_state");
        if (saved) {
          const state = JSON.parse(saved);
          pianoRollNotes = state.sequences || {};
        }
      } catch (error) {
        console.error("Failed to load piano roll state for auto-save:", error);
      }

      // Serialize current state using shared default helpers
      const state = await serializeState(
        pads,
        sequencerPatterns,
        pianoRollNotes,
        {
          activeTab,
          projectKey,
          activeState,
          bpm: currentBpm,
          swing: currentSwing,
        },
        getDefaultMixerSettings(),
        getDefaultEffectParameters(),
        {
          audio: getDefaultAudioSettings(),
          midi: getDefaultMidiSettings(),
          ui: getDefaultUISettings(),
        },
      );

      // Save state (auto-save mode)
      saveState(state, true);

      const now = new Date();
      setLastSavedAt(now);
      setIsAutoSaving(true);

      if (autoSaveTimerRef.current !== null)
        clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => setIsAutoSaving(false), 1500);
    } catch (error) {
      logger.error("Auto-save failed", error as Error);
    }
  }, [activeTab, projectKey, activeState, pads, sequencer]);

  useEffect(() => {
    const interval = setInterval(performAutoSave, AUTO_SAVE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (autoSaveTimerRef.current !== null)
        clearTimeout(autoSaveTimerRef.current);
    };
  }, [performAutoSave]);

  // Cleanup notification and panic timers on unmount
  useEffect(() => {
    return () => {
      if (notifTimerRef.current !== null) clearTimeout(notifTimerRef.current);
      if (panicTimerRef.current !== null) clearTimeout(panicTimerRef.current);
    };
  }, []);

  const showNotification = useCallback(
    (type: "success" | "error", message: string) => {
      if (notifTimerRef.current !== null) clearTimeout(notifTimerRef.current);
      setNotification({ type, message });
      notifTimerRef.current = setTimeout(() => {
        setNotification(null);
        notifTimerRef.current = null;
      }, 3000);
    },
    [],
  );

  // ── Project save: serialize to .tbm JSON and trigger download ──
  const handleProjectSave = useCallback(async () => {
    try {
      if (!sequencer) {
        showNotification("error", "Engine not ready");
        return;
      }

      // Get current BPM and swing from sequencer if available
      const currentBpm = sequencer.getBpm();
      const currentSwing = sequencer.getState?.().swing ?? DEFAULT_SWING;

      // Get current patterns
      const pattern = sequencer.getPattern();
      const sequencerPatterns: Record<string, boolean[][]> = pattern ? { main: pattern } : {};

      // Get piano roll notes from localStorage
      let pianoRollNotes = {};
      try {
        const saved = localStorage.getItem("tbm_piano_roll_state");
        if (saved) {
          const state = JSON.parse(saved);
          pianoRollNotes = state.sequences || {};
        }
      } catch (error) {
        console.error(
          "Failed to load piano roll state for project save:",
          error,
        );
      }

      // Serialize current state using shared default helpers
      const state = await serializeState(
        pads,
        sequencerPatterns,
        pianoRollNotes,
        {
          activeTab,
          projectKey,
          activeState,
          bpm: currentBpm,
          swing: currentSwing,
        },
        getDefaultMixerSettings(),
        getDefaultEffectParameters(),
        {
          audio: getDefaultAudioSettings(),
          midi: getDefaultMidiSettings(),
          ui: getDefaultUISettings(),
        },
      );

      // Export as file
      exportState(state);

      // Also save to localStorage for recovery
      saveState(state, false);

      showNotification("success", "PROJECT SAVED");
    } catch (error) {
      logger.error("Project save failed", error as Error);
      showNotification(
        "error",
        `Save failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }, [sequencer, projectKey, activeState, pads, activeTab, showNotification]);

  // ── Project open: parse .tbm file and restore state ──
  const handleProjectOpen = useCallback(
    async (file: File) => {
      try {
        // Import state from file
        const state = await importState(file);

        // Deserialize state
        const {
          pads: padUpdates,
          sequencerPatterns,
          pianoRollNotes,
          uiState,
        } = deserializeState(state);

        // Apply UI state
        pushSnapshot({
          key: uiState.projectKey,
          abState: uiState.activeState,
        });
        if (
          uiState.activeTab &&
          (KNOWN_TABS as readonly string[]).includes(uiState.activeTab)
        ) {
          setActiveTab(uiState.activeTab);
        }

        // Apply sequencer settings
        if (sequencer) {
          sequencer.setBpm(uiState.bpm);
          sequencer.setSwing?.(uiState.swing);

          // Apply patterns if available
          if (sequencerPatterns.main) {
            sequencer.setPattern("main", sequencerPatterns.main);
          }
        }

        // Apply pad updates
        if (updatePad) {
          padUpdates.forEach((padUpdate, index) => {
            if (padUpdate) {
              updatePad(index, padUpdate);
              
              // Load saved audio buffer if this is a custom sample with embedded data
              if (padUpdate.sample?.dataUri) {
                fetch(padUpdate.sample.dataUri)
                  .then(res => res.blob())
                  .then(blob => {
                    const file = new File([blob], padUpdate.sample!.name || "sample.wav", { type: "audio/wav" });
                    loadSampleToPad(index, file).catch(e => {
                      logger.warn(`Failed to load saved sample for pad ${index}:`, e);
                    });
                  })
                  .catch(e => {
                    logger.warn(`Failed to decode saved sample for pad ${index}:`, e);
                  });
              }
            }
          });
        }

        // Save piano roll notes to localStorage
        if (pianoRollNotes && Object.keys(pianoRollNotes).length > 0) {
          try {
            const pianoRollState = {
              sequences: pianoRollNotes,
              activeSequenceId: 0,
              mode: "track",
              version: "1.0.0",
              timestamp: new Date().toISOString(),
            };
            localStorage.setItem(
              "tbm_piano_roll_state",
              JSON.stringify(pianoRollState),
            );
          } catch (error) {
            console.error("Failed to save piano roll state:", error);
          }
        }

        // Save loaded state to localStorage for recovery
        saveState(state, false);

        showNotification("success", "PROJECT LOADED");
        logger.info("Project loaded", {
          version: state.version,
          timestamp: state.timestamp,
        });
      } catch (err) {
        logger.error("Project load failed", err as Error);
        showNotification(
          "error",
          `Load failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
    [sequencer, pushSnapshot, updatePad, loadSampleToPad, showNotification],
  );

  // ── Menu dropdown state ──
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (
        fileMenuRef.current &&
        !fileMenuRef.current.contains(e.target as Node)
      )
        setShowFileMenu(false);
      if (
        editMenuRef.current &&
        !editMenuRef.current.contains(e.target as Node)
      )
        setShowEditMenu(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const handlePanic = () => {
    // Stop all audio immediately
    engine?.stopAll();
    sequencer?.stop();
    setIsPanic(true);
    showNotification("error", "AUDIO ENGINE RESET (PANIC)");
    if (panicTimerRef.current !== null) clearTimeout(panicTimerRef.current);
    panicTimerRef.current = setTimeout(() => {
      setIsPanic(false);
      panicTimerRef.current = null;
    }, 1000);
  };

  // ── Sync BPM from sequencer when export modal opens ──
  useEffect(() => {
    if (showExportModal && sequencer) {
      setBounceBpm(sequencer.getBpm());
    }
  }, [showExportModal, sequencer]);

  // Reset bounce state when modal opens
  const openExportModal = useCallback(() => {
    setBouncePhase("idle");
    setBounceProgress(0);
    setBounceResults([]);
    setBounceError(null);
    setSendingToStudio(false);
    setShowExportModal(true);
  }, []);

  // ── Keyboard shortcuts ──
  // Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  // Ctrl+S = save project, Ctrl+E = export/bounce
  // Space = play/stop sequencer (when no input is focused)
  // 1-9 = quick tab switch (when no input is focused)
  useEffect(() => {
    const TAB_HOTKEYS: Record<string, string> = {
      "1": "sampler",
      "2": "drums",
      "3": "hats",
      "4": "pianoroll",
      "5": "chords",
      "6": "mixer",
      "7": "vinyl",
      "8": "library",
      "9": "settings",
    };

    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // ── Ctrl combos (work even when input is focused) ──
      if (ctrl) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
          return;
        }
        if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          handleRedo();
          return;
        }
        if (e.key === "s") {
          e.preventDefault();
          handleProjectSave();
          return;
        }
        if (e.key === "e") {
          e.preventDefault();
          openExportModal();
          return;
        }
        return;
      }

      // ── Non-modifier shortcuts (only when not typing in an input) ──
      if (isInput) return;

      // Space = play/stop sequencer
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (sequencer) {
          const seqState = sequencer.getState();
          if (seqState.isPlaying) {
            sequencer.stop();
          } else {
            if (audioContext?.state === "suspended") {
              audioContext.resume().catch((err: unknown) => {
                logger.warn("Failed to resume AudioContext on spacebar", undefined, err instanceof Error ? err : undefined);
              });
            }
            sequencer.play();
          }
        }
        return;
      }

      // Number keys 1-9 = quick tab switch
      const tab = TAB_HOTKEYS[e.key];
      if (tab) {
        e.preventDefault();
        setActiveTab(tab);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    handleUndo,
    handleRedo,
    handleProjectSave,
    openExportModal,
    sequencer,
    audioContext,
  ]);

  // ── Bounce handler ──
  const handleBounce = useCallback(async () => {
    if (!engine || !sequencer) {
      setBounceError("Audio engine not ready");
      setBouncePhase("error");
      return;
    }

    const pattern = sequencer.getPattern();
    if (!pattern || pattern.length === 0) {
      setBounceError(
        "No pattern loaded — open the Drums tab and create a pattern first",
      );
      setBouncePhase("error");
      return;
    }

    const samples = engine.getSamples();
    if (samples.size === 0) {
      setBounceError("No samples loaded — load samples into pads first");
      setBouncePhase("error");
      return;
    }

    setBouncePhase("bouncing");
    setBounceProgress(0);
    setBounceError(null);
    setBounceResults([]);

    try {
      const bounceEngine = new BounceEngine(samples);
      const baseConfig: BounceConfig = {
        bars: bounceBars,
        bpm: bounceBpm,
        sampleRate: 48000,
        bitDepth: bounceBitDepth,
        channels: 2,
        format: bounceFormat,
        mp3Kbps: bounceMp3Kbps,
      };

      if (bounceStemMode) {
        // Default stem groups: kicks (0-3), snares (4-7), hats (8-11), other (12-15)
        const stemConfigs = [
          { name: "kicks", padIndices: [0, 1, 2, 3] },
          { name: "snares", padIndices: [4, 5, 6, 7] },
          { name: "hats", padIndices: [8, 9, 10, 11] },
          { name: "perc", padIndices: [12, 13, 14, 15] },
        ];
        const results = await bounceEngine.renderStems(
          pads,
          pattern,
          stemConfigs,
          baseConfig,
          (_stemIdx, _stemName, progress) => {
            // Weight each stem equally
            const overallProgress = (_stemIdx + progress) / stemConfigs.length;
            setBounceProgress(overallProgress);
          },
        );
        setBounceResults(results);
      } else {
        const result = await bounceEngine.render(
          pads,
          pattern,
          baseConfig,
          (progress) => setBounceProgress(progress),
        );
        setBounceResults([result]);
      }

      setBouncePhase("done");
      showNotification("success", "BOUNCE COMPLETE");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unknown error during bounce";
      setBounceError(msg);
      setBouncePhase("error");
      showNotification("error", "BOUNCE FAILED");
    }
  }, [
    engine,
    sequencer,
    pads,
    bounceBars,
    bounceBpm,
    bounceBitDepth,
    bounceStemMode,
    bounceFormat,
    bounceMp3Kbps,
    showNotification,
  ]);

  // ── Download a bounced file (WAV or MP3) ──
  const downloadBounce = useCallback(
    (result: BounceResult) => {
      const ismp3 = result.format === "mp3" && result.mp3 !== null;
      const blob = ismp3 ? result.mp3! : result.wav;
      const ext = ismp3 ? "mp3" : "wav";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tbm_${result.stemName}_${bounceBars}bar_${bounceBpm}bpm.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [bounceBars, bounceBpm],
  );

  // ── Send bounced results to Studio 48 via /api/export ──
  const sendToStudio48 = useCallback(async () => {
    if (bounceResults.length === 0) return;

    setSendingToStudio(true);
    try {
      const formData = new FormData();
      bounceResults.forEach((result) => {
        const ismp3 = result.format === "mp3" && result.mp3 !== null;
        const blob = ismp3 ? result.mp3! : result.wav;
        const ext = ismp3 ? "mp3" : "wav";
        const mimeType = ismp3 ? "audio/mpeg" : "audio/wav";
        const filename = `tbm_${result.stemName}_${bounceBars}bar_${bounceBpm}bpm.${ext}`;
        formData.append(
          "stems",
          new File([blob], filename, { type: mimeType }),
        );
      });

      formData.append(
        "metadata",
        JSON.stringify({
          source: "tbm",
          bpm: bounceBpm,
          bars: bounceBars,
          format: bounceFormat,
          mp3Kbps: bounceFormat === "mp3" ? bounceMp3Kbps : undefined,
          bitDepth: bounceFormat === "wav" ? bounceBitDepth : undefined,
          sampleRate: 48000,
          stems: bounceResults.map((r) => ({
            name: r.stemName,
            format: r.format,
            durationSeconds: r.durationSeconds,
            peakAmplitude: r.peakAmplitude,
            rmsDbfs: r.rmsDbfs,
          })),
        }),
      );

      // POST to local TBM export endpoint (which writes to shared audio directory)
      const res = await fetch("/api/export", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Export failed: ${res.status} ${errText}`);
      }

      showNotification("success", "SENT TO STUDIO 48");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to send to Studio 48";
      showNotification("error", msg);
    } finally {
      setSendingToStudio(false);
    }
  }, [bounceResults, bounceBars, bounceBpm, bounceBitDepth, bounceFormat, bounceMp3Kbps, showNotification]);

  // ── Shared deck-load handlers (used by MusicLibrary in both Library & Vinyl tabs) ──
  const handleLoadDeckA = useCallback(
    async (url: string, name: string) => {
      await resumeAudio();
      try {
        const buffer = await loadUrlToDeck("A", url);
        if (buffer) {
          setExternalBufferA(buffer);
          setExternalNameA(name);
          const bpm = detectBpm(buffer);
          if (bpm > 0) setDeckBpm("A", bpm);
        }
        showNotification("success", `Deck A: ${name}`);
      } catch {
        showNotification("error", "Failed to load track to Deck A");
      }
    },
    [resumeAudio, loadUrlToDeck, detectBpm, setDeckBpm, showNotification],
  );

  const handleLoadDeckB = useCallback(
    async (url: string, name: string) => {
      await resumeAudio();
      try {
        const buffer = await loadUrlToDeck("B", url);
        if (buffer) {
          setExternalBufferB(buffer);
          setExternalNameB(name);
          const bpm = detectBpm(buffer);
          if (bpm > 0) setDeckBpm("B", bpm);
        }
        showNotification("success", `Deck B: ${name}`);
      } catch {
        showNotification("error", "Failed to load track to Deck B");
      }
    },
    [resumeAudio, loadUrlToDeck, detectBpm, setDeckBpm, showNotification],
  );

  const handleMacroChange = useCallback((index: number, value: number) => {
    setMacroValues(prev => { const next = [...prev]; next[index] = value; return next; });
  }, []);

  const handleSaveSnapshot = useCallback((name: string) => {
    const snap: { id: string; name: string; values: number[] } = {
      id: `snap-${Date.now()}`,
      name,
      values: [...macroValues],
    };
    setSnapshots(prev => {
      const next = [...prev, snap];
      try { localStorage.setItem("tbm_macro_snapshots", JSON.stringify(next)); } catch {}
      return next;
    });
  }, [macroValues]);

  const handleLoadSnapshot = useCallback((id: string) => {
    const snap = snapshots.find(s => s.id === id);
    if (snap) {
      setMacroValues([...snap.values]);
      snap.values.forEach((v, i) => handleMacroChange(i, v));
    }
  }, [snapshots, handleMacroChange]);

  const handleMorphToSnapshot = useCallback((id: string, duration: number) => {
    const snap = snapshots.find(s => s.id === id);
    if (!snap) return;
    const startValues = [...macroValues];
    const targetValues = snap.values;
    const startTime = performance.now();
    const morph = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const t = Math.min(1, elapsed / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const newValues = startValues.map((sv, i) => sv + (targetValues[i] - sv) * eased);
      setMacroValues(newValues);
      if (t < 1) requestAnimationFrame(morph);
    };
    requestAnimationFrame(morph);
  }, [macroValues, snapshots]);

  const handleSaveSong = useCallback((song: any) => {
    setSongs(prev => {
      const existing = prev.findIndex(s => s.id === song.id);
      let next: any[];
      if (existing >= 0) {
        next = [...prev];
        next[existing] = song;
      } else {
        next = [...prev, song];
      }
      try { localStorage.setItem("tbm_songs", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleDeleteSong = useCallback((id: string) => {
    setSongs(prev => {
      const next = prev.filter(s => s.id !== id);
      try { localStorage.setItem("tbm_songs", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handlePlaySection = useCallback((section: { id: string; patternIndex: number; repeatCount: number }) => {
    if (sequencer) {
      sequencer.stop();
      sequencer.play();
    }
  }, [sequencer]);

  const handlePlaySong = useCallback((song: any) => {
    if (sequencer && song.sections.length > 0) {
      sequencer.stop();
      sequencer.play();
    }
  }, [sequencer]);

  const patterns = [
    { id: "main", name: "Pattern A" },
    { id: "pattern-1", name: "Pattern B" },
    { id: "pattern-2", name: "Pattern C" },
    { id: "pattern-3", name: "Pattern D" },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "sampler":
        return (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Top: Waveform — main focus area for sample editing */}
            <div className="h-[55%] border-b border-border-main bg-bg-main/30 p-5 min-h-0">
              <WaveformVisualizer />
            </div>
            {/* Bottom: 808 Engine + FX side-by-side — sound shaping controls */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              <div className="w-1/2 border-r border-border-main p-5 overflow-y-auto custom-scrollbar">
                <Mixer808 />
              </div>
              <div className="w-1/2 p-5 overflow-y-auto custom-scrollbar">
                <FXMacros />
              </div>
            </div>
          </div>
        );
      case "library":
        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0">
              <MusicLibrary
                onLoadDeckA={handleLoadDeckA}
                onLoadDeckB={handleLoadDeckB}
              />
            </div>
          </div>
        );
      case "plugins":
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <VSTManager />
          </div>
        );
      case "chains":
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <VSTChainManager />
          </div>
        );
      case "drums":
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <DrumMachine />
          </div>
        );
      case "hats":
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <HatSequencer />
          </div>
        );
      case "chords":
        return (
          <div className="flex-1 p-5 overflow-y-auto custom-scrollbar">
            <ChordBuilder />
          </div>
        );
      case "mixer":
        return (
          <div className="flex-1 flex flex-col gap-2 overflow-hidden p-3">
            {/* SSL/Neve-style console mixer — full width channel strips */}
            <div className="flex-1 bg-neutral-950/80 glass rounded-2xl border border-neutral-800/60 panel-inset overflow-hidden min-h-0">
              <ConsoleMixer />
            </div>
            {/* Detailed meters + Spectrum — compact footer */}
            <div className="flex gap-2 shrink-0" style={{ height: 120 }}>
              <div className="flex-1 bg-bg-surface/60 rounded-xl border border-border-main p-3 overflow-hidden">
                <MixerDetailMeters analyserNode={analyserNode} />
              </div>
              <div className="flex-1 bg-bg-main/60 rounded-xl border border-border-main p-3 overflow-hidden">
                <SpectrumAnalyzer />
              </div>
            </div>
          </div>
        );
      case "pianoroll":
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <PianoRoll />
          </div>
        );
      case "session":
        return (
          <div className="flex-1 p-5 overflow-y-auto custom-scrollbar">
            <SessionMusician />
          </div>
        );
      case "vinyl":
        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mode selector bar */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-surface border-b border-border-main shrink-0">
              <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider mr-1">
                Mode
              </span>
              <button
                onClick={() => setVinylMode("decks")}
                className={`px-3 py-1 rounded-md text-[13px] font-bold uppercase tracking-wider transition-all ${
                  vinylMode === "decks"
                    ? "bg-brand/15 text-brand border border-brand/40"
                    : "text-neutral-500 hover:text-neutral-300 border border-transparent hover:border-neutral-700"
                }`}
              >
                DJ Decks
              </button>
              <button
                onClick={() => setVinylMode("sampler")}
                className={`px-3 py-1 rounded-md text-[13px] font-bold uppercase tracking-wider transition-all ${
                  vinylMode === "sampler"
                    ? "bg-brand/15 text-brand border border-brand/40"
                    : "text-neutral-500 hover:text-neutral-300 border border-transparent hover:border-neutral-700"
                }`}
              >
                TT Sampler
              </button>
            </div>

            {vinylMode === "decks" ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* DJ Decks - takes all available space */}
                <div className="flex-1 min-h-0 p-3 overflow-hidden">
                  <VinylScratchPro
                    onSendToSampleEditor={() => {
                      setActiveTab("sampler");
                      showNotification(
                        "success",
                        "Sample sent to Sample Editor",
                      );
                    }}
                    externalBufferA={externalBufferA}
                    externalBufferB={externalBufferB}
                    externalNameA={externalNameA}
                    externalNameB={externalNameB}
                  />
                </div>
                {/* Music Library - collapsible drawer */}
                <div className={`border-t border-neutral-800 shrink-0 transition-all duration-300 ease-in-out ${musicDrawerOpen ? 'h-80' : 'h-0'} overflow-hidden`}>
                  <MusicLibrary
                    onLoadDeckA={handleLoadDeckA}
                    onLoadDeckB={handleLoadDeckB}
                  />
                </div>
                {/* Drawer toggle tab */}
                <button
                  onClick={() => setMusicDrawerOpen(!musicDrawerOpen)}
                  className="flex items-center justify-center gap-2 px-4 py-1 bg-neutral-900 hover:bg-neutral-800 border-t border-neutral-800 text-neutral-500 hover:text-neutral-300 transition-all shrink-0 cursor-pointer"
                >
                  {musicDrawerOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {musicDrawerOpen ? 'Hide' : 'Show'} Music Library
                  </span>
                  {musicDrawerOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <TurntableSampler onGoToDrums={() => setActiveTab('drums')} />
              </div>
            )}
          </div>
        );
      case "song":
        return (
          <div className="flex-1 overflow-hidden">
            <SongEditor
              patterns={patterns}
              songs={songs}
              onSaveSong={handleSaveSong}
              onDeleteSong={handleDeleteSong}
              onPlaySection={handlePlaySection}
              onPlaySong={handlePlaySong}
              onStop={() => sequencer?.stop()}
              onExport={() => openExportModal()}
              isPlaying={sequencer?.getState()?.isPlaying ?? false}
            />
          </div>
        );
      case "macro":
        return (
          <div className="flex-1 overflow-hidden">
            <MacroControls
              onMacroChange={handleMacroChange}
              snapshots={snapshots}
              onSaveSnapshot={handleSaveSnapshot}
              onLoadSnapshot={handleLoadSnapshot}
              onMorphToSnapshot={handleMorphToSnapshot}
            />
          </div>
        );
      case "stems":
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <StemSeparator />
          </div>
        );
      case "settings":
        return (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <SettingsView />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary
      componentName="App"
      onError={(error, errorInfo) => {
        logger.critical("App crashed", error, {
          componentStack: errorInfo.componentStack,
          activeTab,
          audioError,
          isPanic,
        });
      }}
    >
      <div
        className={`h-full flex flex-col bg-bg-main font-sans text-text-main overflow-hidden transition-all duration-300 ${isPanic ? "opacity-60 grayscale" : ""}`}
      >
        {/* ── Audio Error Banner ────────────────────────────────────────── */}
        {audioError && (
          <div className="bg-red-950/90 border-b border-red-700/60 px-4 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-red-400" />
              <span className="text-sm font-bold text-red-300 uppercase tracking-wider">
                Audio Engine Error: {audioError}
              </span>
            </div>
            <button
              onClick={() => resumeAudio()}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-[13px] font-bold uppercase rounded transition-colors"
            >
              Resume Audio
            </button>
          </div>
        )}

        {/* ── Unified Header Bar ──────────────────────────────────────── */}
        <div className="h-10 bg-bg-surface border-b border-border-main flex items-center px-4 justify-between shrink-0 relative edge-glow-bottom">
          {/* Left: Branding + Menus + Production Controls */}
          <div className="flex items-center gap-2.5">
            {/* Compact Logo */}
            <div className="flex items-center gap-2 mr-1">
              <div
                className="relative w-7 h-7 flex items-center justify-center rounded-md border border-brand/30 overflow-hidden shadow-[0_0_10px_var(--brand-primary-glow)]"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(var(--brand-primary-rgb, 255,199,44), 0.15), rgba(var(--brand-primary-rgb, 255,199,44), 0.04))",
                }}
              >
                <span
                  className="text-[11px] font-black text-brand select-none leading-none"
                  style={{ textShadow: "0 0 8px var(--brand-primary-glow)" }}
                >
                  T
                </span>
              </div>
              <h1 className="text-[13px] font-black tracking-[0.18em] text-neutral-100 uppercase select-none">
                TBM
                <span
                  className="text-brand"
                  style={{ textShadow: "0 0 10px var(--brand-primary-glow)" }}
                >
                  _
                </span>
              </h1>
            </div>

            <div className="h-4 w-px bg-border-main"></div>

            {/* File menu */}
            <div className="relative" ref={fileMenuRef}>
              <button
                onClick={() => {
                  setShowFileMenu((v) => !v);
                  setShowEditMenu(false);
                }}
                className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-200 flex items-center gap-1 transition-colors px-1"
              >
                File <ChevronDown size={8} />
              </button>
              {showFileMenu && (
                <div className="absolute left-0 top-full mt-1 w-44 bg-bg-surface border border-border-main rounded-xl shadow-2xl z-50 p-1 flex flex-col gap-0.5">
                  <button
                    onClick={() => {
                      setShowFileMenu(false);
                      if (
                        !window.confirm(
                          "Create a new project? Any unsaved changes will be lost.",
                        )
                      )
                        return;
                      sequencer?.stop();
                      engine?.stopAll();
                      pushSnapshot({ key: "Cm", abState: "A" });
                      setActiveTab("sampler");
                      setUndoStack([]);
                      setRedoStack([]);
                      showNotification("success", "NEW PROJECT");
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow transition-colors"
                  >
                    <FilePlus size={12} className="text-neutral-500" /> New
                    Project
                  </button>
                  <button
                    onClick={() => {
                      setShowFileMenu(false);
                      handleProjectSave();
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow transition-colors"
                  >
                    <Save size={12} className="text-neutral-500" /> Save .tbm
                  </button>
                  <button
                    onClick={() => {
                      setShowFileMenu(false);
                      openExportModal();
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow transition-colors"
                  >
                    <FileAudio size={12} className="text-neutral-500" /> Export
                    WAV…
                  </button>
                </div>
              )}
            </div>

            {/* Edit menu */}
            <div className="relative" ref={editMenuRef}>
              <button
                onClick={() => {
                  setShowEditMenu((v) => !v);
                  setShowFileMenu(false);
                }}
                className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-200 flex items-center gap-1 transition-colors px-1"
              >
                Edit <ChevronDown size={8} />
              </button>
              {showEditMenu && (
                <div className="absolute left-0 top-full mt-1 w-44 bg-bg-surface border border-border-main rounded-xl shadow-2xl z-50 p-1 flex flex-col gap-0.5">
                  <button
                    onClick={() => {
                      setShowEditMenu(false);
                      handleUndo();
                    }}
                    disabled={undoStack.length === 0}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Undo2 size={12} className="text-neutral-500" /> Undo{" "}
                    <span className="ml-auto text-neutral-600">Ctrl+Z</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowEditMenu(false);
                      handleRedo();
                    }}
                    disabled={redoStack.length === 0}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Redo2 size={12} className="text-neutral-500" /> Redo{" "}
                    <span className="ml-auto text-neutral-600">Ctrl+Y</span>
                  </button>
                  <div className="h-px bg-border-main my-0.5" />
                  <button
                    onClick={() => {
                      setShowEditMenu(false);
                      setActiveTab("settings");
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow transition-colors"
                  >
                    <Settings size={12} className="text-neutral-500" />{" "}
                    Preferences
                  </button>
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-border-main"></div>

            {/* Undo / Redo */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className={`p-1 rounded transition-all ${undoStack.length > 0 ? "text-neutral-400 hover:text-neutral-200 hover:bg-bg-main/80" : "text-neutral-700 cursor-not-allowed"}`}
                title={`Undo${undoStack.length > 0 ? ` (${undoStack.length})` : ""} · Ctrl+Z`}
              >
                <Undo2 size={12} />
              </button>
              <button
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className={`p-1 rounded transition-all ${redoStack.length > 0 ? "text-neutral-400 hover:text-neutral-200 hover:bg-bg-main/80" : "text-neutral-700 cursor-not-allowed"}`}
                title={`Redo${redoStack.length > 0 ? ` (${redoStack.length})` : ""} · Ctrl+Y`}
              >
                <Redo2 size={12} />
              </button>
            </div>

            <div className="h-4 w-px bg-border-main"></div>

            {/* Key selector */}
            <div className="flex items-center gap-1.5 bg-bg-main/60 rounded-md px-2 py-0.5 border border-border-main group hover:border-brand/50 transition-all cursor-pointer">
              <Music size={9} className="text-brand" />
              <select
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-brand outline-none appearance-none cursor-pointer"
              >
                {keys.map((k) => (
                  <React.Fragment key={k}>
                    <option value={`${k}`}>{k} Maj</option>
                    <option value={`${k}m`}>{k} Min</option>
                  </React.Fragment>
                ))}
              </select>
              <ChevronDown
                size={8}
                className="text-neutral-600 group-hover:text-brand transition-colors"
              />
            </div>

            {/* A/B State */}
            <div className="flex items-center gap-0.5 bg-bg-main/60 rounded-md px-1 py-0.5 border border-border-main">
              <button
                onClick={() => setActiveState("A")}
                className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${activeState === "A" ? "bg-brand text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                A
              </button>
              <button
                onClick={() => setActiveState("B")}
                className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${activeState === "B" ? "bg-brand text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                B
              </button>
              <button
                onClick={() => {
                  if (sequencer) {
                    bSnapshotRef.current = {
                      pattern: sequencer.getPattern() ?? [],
                      bpm: sequencer.getBpm(),
                    };
                  }
                  pushSnapshot({ ...snapshot, abState: "B" });
                  showNotification("success", "A → B COPIED");
                }}
                className="ml-0.5 p-0.5 text-neutral-600 hover:text-neutral-300 transition-colors"
                title="Copy A to B"
              >
                <RotateCcw size={9} />
              </button>
            </div>

            <div className="h-4 w-px bg-border-main"></div>

            {/* I/O meters */}
            <HeaderIOMeters analyserNode={analyserNode} />
          </div>

          {/* Right: Status + Actions */}
          <div className="flex items-center gap-3">
            {/* Workspace Toggle */}
            <div className="flex items-center gap-0.5 bg-bg-main/60 rounded-md px-1 py-0.5 border border-border-main">
              <button
                onClick={() => setWorkspaceMode("ideas")}
                className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${workspaceMode === "ideas" ? "bg-brand text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                Ideas
              </button>
              <button
                onClick={() => setWorkspaceMode("arranger")}
                className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${workspaceMode === "arranger" ? "bg-brand text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                Arranger
              </button>
            </div>

            <div className="h-4 w-px bg-border-main"></div>

            {/* Auto-save indicator */}
            <div
              className={`flex items-center gap-1.5 transition-all duration-500 ${isAutoSaving ? "opacity-100" : "opacity-25"}`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAutoSaving ? "bg-indicator animate-pulse" : "bg-neutral-500"}`}
              ></div>
              <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                {isAutoSaving
                  ? "Saving…"
                  : lastSavedAt
                    ? `${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Auto-Save"}
              </span>
            </div>

            {/* Performance meters */}
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span
                className="flex items-center gap-1 text-indicator"
                title="Frame budget usage (% of 10 ms target)"
              >
                <Activity size={9} /> {cpuPct.toFixed(0)}%
              </span>
              <span className="text-blue-400">{ramStr}</span>
            </div>

            <div className="h-4 w-px bg-border-main"></div>

            <button
              onClick={handlePanic}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-main/60 hover:bg-red-950/60 text-neutral-500 hover:text-red-400 transition-all border border-border-main hover:border-red-800/60 hover:shadow-[0_0_12px_rgba(239,68,68,0.15)] text-[11px] font-bold uppercase tracking-wider"
              title="Panic – Kill all audio"
            >
              <ZapOff size={12} /> Panic
            </button>

            <button
              onClick={openExportModal}
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-brand hover:opacity-90 active:scale-95 text-white px-3 py-1 rounded-md shadow-lg shadow-brand/20 hover:shadow-brand/30 transition-all"
            >
              <Download size={12} />
              Export
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`p-1.5 rounded-md transition-all ${activeTab === "settings" ? "bg-brand/15 text-brand glow-brand" : "bg-bg-main/60 text-neutral-500 hover:text-neutral-300 border border-border-main"}`}
              title="Settings"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {/* ── Main Area ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {workspaceMode === "ideas" && activeTab !== "settings" && (
            <Sidebar
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onSave={handleProjectSave}
              onOpen={handleProjectOpen}
            />
          )}
          <Suspense fallback={<TabSpinner />}>
            {workspaceMode === "arranger" ? (
              <SongEditor
                patterns={patterns}
                songs={songs}
                onSaveSong={handleSaveSong}
                onDeleteSong={handleDeleteSong}
                onPlaySection={handlePlaySection}
                onPlaySong={handlePlaySong}
                onStop={() => sequencer?.stop()}
                onExport={() => openExportModal()}
                isPlaying={sequencer?.getState()?.isPlaying ?? false}
              />
            ) : (
              renderContent()
            )}
          </Suspense>
        </div>

        {/* ── Virtual Keyboard (collapsible) ──────────────────────────────── */}
        {(() => {
          // Auto-hide on non-instrument tabs; still manually toggleable
          const instrumentTabs = [
            "sampler",
            "pianoroll",
            "drums",
            "hats",
            "chords",
            "session",
          ];
          const isInstrumentTab = instrumentTabs.includes(activeTab);
          const shouldShow = isInstrumentTab && keyboardVisible;

          return (
            <div className="shrink-0 border-t border-border-main">
              {/* Toggle bar — always visible */}
              <button
                onClick={() => setKeyboardVisible((v) => !v)}
                className="w-full h-5 bg-bg-surface hover:bg-bg-surface/80 flex items-center justify-center gap-1.5 transition-colors group"
                title={shouldShow ? "Hide keyboard" : "Show keyboard"}
              >
                <PianoIcon
                  size={9}
                  className="text-neutral-600 group-hover:text-neutral-400"
                />
                <span className="text-xs font-bold text-neutral-600 group-hover:text-neutral-400 uppercase tracking-wider">
                  {shouldShow ? "Hide" : "Show"} Keyboard
                </span>
                {shouldShow ? (
                  <ChevronDown
                    size={9}
                    className="text-neutral-600 group-hover:text-neutral-400"
                  />
                ) : (
                  <ChevronUp
                    size={9}
                    className="text-neutral-600 group-hover:text-neutral-400"
                  />
                )}
              </button>
              {/* Keyboard panel */}
              {shouldShow && (
                <div className="h-32 bg-bg-main px-3 py-2">
                  <VirtualKeyboard />
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Status / Info Bar ─────────────────────────────────────────── */}
        <div className="relative shrink-0">
          <div className="separator-glow"></div>
          <div className="h-6 bg-bg-surface border-t border-border-main flex items-center px-4 gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-indicator dot-glow pulse-slow"></div>
            <span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">
              Audio Engine: Web Audio @{" "}
              {audioContext
                ? `${(audioContext.sampleRate / 1000).toFixed(1)} kHz`
                : "44.1 kHz"}{" "}
              · 32-bit float
            </span>
            <div className="flex-1"></div>
            <span className="text-xs font-mono text-neutral-700 uppercase tracking-wider">
              Hover a control for details
            </span>
          </div>
        </div>

        {/* ── Notifications ─────────────────────────────────────────────── */}
        {notification && (
          <div className="absolute bottom-24 right-6 z-100 animate-in slide-in-from-right-8">
            <div
              className={`relative flex items-center gap-3 px-5 py-3 rounded-xl border shadow-2xl backdrop-blur-sm stripe-left ${
                notification.type === "success"
                  ? "bg-emerald-950/90 border-emerald-700/60 text-emerald-300 shadow-emerald-900/30"
                  : "bg-red-950/90 border-red-700/60 text-red-300 shadow-red-900/30"
              }`}
            >
              {notification.type === "success" ? (
                <CheckCircle2 size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span className="text-sm font-bold uppercase tracking-widest">
                {notification.message}
              </span>
            </div>
          </div>
        )}

        {/* ── Export / Bounce Modal ─────────────────────────────────────── */}
        {showExportModal && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-8">
            <div className="bg-bg-surface border border-border-main rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] panel-inset">
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border-main bg-bg-main/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand/15 border border-brand/30 flex items-center justify-center">
                    <Download size={15} className="text-brand" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                      Audio Bounce
                    </h2>
                    <p className="text-[13px] text-neutral-500 font-mono uppercase">
                      Offline render · {bounceFormat === "mp3" ? `MP3 ${bounceMp3Kbps} kbps` : "WAV 48 kHz · BWF"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-bg-main/60 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
                {/* ── Config Section ── */}
                {bouncePhase === "idle" && (
                  <>
                    {/* BPM & Bars */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">
                          BPM
                        </label>
                        <input
                          type="number"
                          min={20}
                          max={300}
                          value={bounceBpm}
                          onChange={(e) =>
                            setBounceBpm(
                              Math.max(
                                20,
                                Math.min(300, Number(e.target.value)),
                              ),
                            )
                          }
                          className="w-full bg-bg-main border border-border-main rounded-lg px-3 py-2 text-sm font-mono text-neutral-200 outline-none focus:border-brand/60 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">
                          Bars
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={32}
                          value={bounceBars}
                          onChange={(e) =>
                            setBounceBars(
                              Math.max(1, Math.min(32, Number(e.target.value))),
                            )
                          }
                          className="w-full bg-bg-main border border-border-main rounded-lg px-3 py-2 text-sm font-mono text-neutral-200 outline-none focus:border-brand/60 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Bit Depth (only shown for WAV) */}
                    {bounceFormat === "wav" && (
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">
                        Bit Depth
                      </label>
                      <div className="flex gap-2">
                        {([16, 24, 32] as const).map((bd) => (
                          <button
                            key={bd}
                            onClick={() => setBounceBitDepth(bd)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                              bounceBitDepth === bd
                                ? "bg-brand/15 border-brand/50 text-brand"
                                : "bg-bg-main border-border-main text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
                            }`}
                          >
                            {bd}-bit{bd === 32 ? " float" : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                    )}

                    {/* Export Format */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">
                        Format
                      </label>
                      <div className="flex gap-2">
                        {(["wav", "mp3"] as const).map((fmt) => (
                          <button
                            key={fmt}
                            onClick={() => setBounceFormat(fmt)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                              bounceFormat === fmt
                                ? "bg-brand/15 border-brand/50 text-brand"
                                : "bg-bg-main border-border-main text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
                            }`}
                          >
                            {fmt === "wav" ? "WAV" : "MP3"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* MP3 Bitrate (only shown for MP3) */}
                    {bounceFormat === "mp3" && (
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">
                        Bitrate
                      </label>
                      <div className="flex gap-2">
                        {([128, 192, 256, 320] as const).map((br) => (
                          <button
                            key={br}
                            onClick={() => setBounceMp3Kbps(br)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                              bounceMp3Kbps === br
                                ? "bg-brand/15 border-brand/50 text-brand"
                                : "bg-bg-main border-border-main text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
                            }`}
                          >
                            {br}k
                          </button>
                        ))}
                      </div>
                    </div>
                    )}

                    {/* Stem mode toggle */}
                    <div className="flex items-center justify-between bg-bg-main/50 rounded-xl border border-border-main p-4">
                      <div>
                        <div className="text-sm font-bold uppercase tracking-wider text-neutral-300">
                          Stem Export
                        </div>
                        <div className="text-[13px] text-neutral-500 font-mono mt-0.5">
                          {bounceStemMode
                            ? "Kicks · Snares · Hats · Perc (4 stems)"
                            : "Single full mix bounce"}
                        </div>
                      </div>
                      <button
                        onClick={() => setBounceStemMode(!bounceStemMode)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${bounceStemMode ? "bg-brand" : "bg-neutral-700"}`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${bounceStemMode ? "translate-x-5" : "translate-x-0.5"}`}
                        />
                      </button>
                    </div>

                    {/* Duration preview */}
                    <div className="text-[13px] font-mono text-neutral-500 text-center">
                      Duration: {((bounceBars * 4 * 60) / bounceBpm).toFixed(2)}
                      s · {bounceBars * 16} steps · {bounceFormat === "mp3" ? `MP3 ${bounceMp3Kbps} kbps` : `WAV 48 kHz ${bounceBitDepth}-bit`}
                    </div>

                    {/* Bounce button */}
                    <button
                      onClick={handleBounce}
                      className="w-full py-3 rounded-xl bg-brand hover:opacity-90 active:scale-[0.98] text-white text-sm font-bold uppercase tracking-widest shadow-lg shadow-brand/20 transition-all flex items-center justify-center gap-2"
                    >
                      <FileAudio size={16} />
                      Bounce to {bounceFormat === "mp3" ? "MP3" : "WAV"}
                    </button>
                  </>
                )}

                {/* ── Bouncing in progress ── */}
                {bouncePhase === "bouncing" && (
                  <div className="space-y-4 py-8">
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 size={20} className="text-brand animate-spin" />
                      <span className="text-sm font-bold uppercase tracking-widest text-neutral-300">
                        Rendering offline...
                      </span>
                    </div>
                    <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-brand rounded-full transition-all duration-200"
                        style={{
                          width: `${Math.round(bounceProgress * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-center text-[13px] font-mono text-neutral-500">
                      {Math.round(bounceProgress * 100)}%
                    </div>
                  </div>
                )}

                {/* ── Error state ── */}
                {bouncePhase === "error" && (
                  <div className="space-y-4 py-4">
                    <div className="flex items-center gap-3 bg-red-950/40 border border-red-700/40 rounded-xl p-4">
                      <AlertCircle
                        size={18}
                        className="text-red-400 shrink-0"
                      />
                      <div className="text-sm text-red-300">{bounceError}</div>
                    </div>
                    <button
                      onClick={() => setBouncePhase("idle")}
                      className="w-full py-2 rounded-lg border border-border-main text-neutral-400 hover:text-neutral-200 text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                      Back to Config
                    </button>
                  </div>
                )}

                {/* ── Results ── */}
                {bouncePhase === "done" && bounceResults.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 size={16} />
                      <span className="text-sm font-bold uppercase tracking-widest">
                        Bounce Complete
                      </span>
                    </div>

                    {/* Stem result cards */}
                    <div className="space-y-2">
                      {bounceResults.map((result, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-bg-main/50 rounded-xl border border-border-main p-4"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <FileAudio
                              size={16}
                              className="text-brand shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-bold uppercase tracking-wider text-neutral-200 truncate">
                                {result.stemName}
                              </div>
                              <div className="text-[13px] font-mono text-neutral-500">
                                {result.durationSeconds.toFixed(2)}s · Peak{" "}
                                {(result.peakAmplitude * 100).toFixed(1)}% · RMS{" "}
                                {result.rmsDbfs === -Infinity
                                  ? "-inf"
                                  : result.rmsDbfs.toFixed(1)}{" "}
                                dBFS
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => downloadBounce(result)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-main border border-border-main text-neutral-400 hover:text-white hover:border-brand/50 transition-all text-[13px] font-bold uppercase tracking-wider shrink-0"
                          >
                            <Download size={12} />
                            {result.format === "mp3" && result.mp3 ? "MP3" : "WAV"}
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Download all + Send to Studio 48 */}
                    <div className="flex gap-3">
                      {bounceResults.length > 1 && (
                        <button
                          onClick={() => {
                            // Stagger downloads to avoid browser popup-blocker
                            bounceResults.forEach((r, idx) =>
                              setTimeout(() => downloadBounce(r), idx * 300)
                            );
                          }}
                          className="flex-1 py-2.5 rounded-xl border border-border-main text-neutral-300 hover:text-white hover:border-brand/50 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                        >
                          <Download size={14} />
                          Download All
                        </button>
                      )}
                      <button
                        onClick={sendToStudio48}
                        disabled={sendingToStudio}
                        className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                      >
                        {sendingToStudio ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />{" "}
                            Sending...
                          </>
                        ) : (
                          <>
                            <Upload size={14} /> Send to Studio 48
                          </>
                        )}
                      </button>
                    </div>

                    {/* Bounce again */}
                    <button
                      onClick={() => setBouncePhase("idle")}
                      className="w-full py-2 rounded-lg border border-border-main text-neutral-500 hover:text-neutral-300 text-[13px] font-bold uppercase tracking-wider transition-colors"
                    >
                      Bounce Again
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Gemini Slate 4 — app-wide MIDI controller integration (floating badge) */}
      <GeminiSlate4Integration />
    </ErrorBoundary>
  );
}

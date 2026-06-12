import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { useTBMAudio } from "../contexts/TBMAudioContext";
import type { ScratchEvent, CrossfaderCurve } from "../lib/TBMAudioEngine";
import {
  Disc3,
  Shuffle,
  Play,
  Circle,
  Zap,
  Sliders,
  Music,
  ListMusic,
  ArrowRight,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Lock,
  Unlock,
  SkipBack,
  RefreshCw,
  Keyboard,
  GitBranch,
  Send,
} from "lucide-react";
import { Knob } from "./Knob";
import { DEFAULT_BPM } from "../lib/constants";
import { useController } from "./ControllerPanel";
import { VinylDeck } from "./VinylDeck";
import { CrossfaderSection } from "./CrossfaderSection";
import { TransportSection } from "./TransportSection";
import { TurntableEmulationSection } from "./TurntableEmulationSection";
import { SonicFXSection } from "./SonicFXSection";
import { MiniMixerSection } from "./MiniMixerSection";
import { QuickActionsSection } from "./QuickActionsSection";
import { StatusSection } from "./StatusSection";

type ScratchStyle = {
  id: string;
  name: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  description: string;
};

type EditorEvent = {
  id: string;
  type:
    | "forward"
    | "backward"
    | "fader_open"
    | "fader_close"
    | "hold"
    | "chirp"
    | "tear"
    | "stutter"
    | "one_shot";
  startBeat: number;
  durationBeats: number;
  speedMultiplier: number;
  faderPosition: number;
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  forward: "bg-indicator/20 text-indicator border-indicator/40",
  backward: "bg-red-500/20 text-red-400 border-red-500/40",
  fader_open: "bg-brand/20 text-brand border-brand/40",
  fader_close: "bg-neutral-600/30 text-neutral-400 border-neutral-600/40",
  hold: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  chirp: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  tear: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  stutter: "bg-pink-500/20 text-pink-400 border-pink-500/40",
  one_shot: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
};

const scratchStyles: ScratchStyle[] = [
  {
    id: "baby",
    name: "Baby Scratch",
    difficulty: "beginner",
    description: "Classic simple back-and-forth. No fader.",
  },
  {
    id: "chirp",
    name: "Chirp Scratch",
    difficulty: "intermediate",
    description: "Fast forward motion with fader cut.",
  },
  {
    id: "transformer",
    name: "Transformer",
    difficulty: "intermediate",
    description: "Steady motion; fader stutters on/off.",
  },
  {
    id: "tear",
    name: "Tear Scratch",
    difficulty: "intermediate",
    description: "Aggressive rip forward with fader.",
  },
  {
    id: "flare",
    name: "Flare Scratch",
    difficulty: "advanced",
    description: "Forward with fader cuts mid-motion.",
  },
  {
    id: "crab",
    name: "Crab Scratch",
    difficulty: "advanced",
    description: "Multi-finger rapid stutter technique.",
  },
  {
    id: "hookScratch",
    name: "Hook Scratch",
    difficulty: "intermediate",
    description: "Musical rhythmic chopped stabs and chirps.",
  },
  {
    id: "soulScratch",
    name: "Soul Scratch",
    difficulty: "intermediate",
    description: "Laid-back, funky groovy vocal stabs.",
  },
];

const builtInSamples = [
  { id: "ah_yeah1", name: "Ah Yeah!", category: "vocal" },
  { id: "ah_yeah2", name: "Ah Yeah! 2", category: "vocal" },
  { id: "fresh", name: "Fresh", category: "vocal" },
  { id: "yeah_boy", name: "Yeah Boy", category: "vocal" },
  { id: "one_two", name: "One Two", category: "vocal" },
  { id: "what", name: "What?!", category: "vocal" },
  { id: "baby_base", name: "Baby Scratch Base", category: "scratch" },
];

const STYLE_WEIGHTS: Record<string, number> = {
  baby: 0.15,
  chirp: 0.2,
  transformer: 0.1,
  tear: 0.15,
  flare: 0.1,
  crab: 0.05,
  hookScratch: 0.15,
  soulScratch: 0.1,
};

/** Pick a style ID via weighted random selection */
function pickWeightedRandomStyle(): string {
  const entries = Object.entries(STYLE_WEIGHTS);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * totalWeight;
  for (const [id, w] of entries) {
    r -= w;
    if (r <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

const difficultyColors: Record<string, string> = {
  beginner: "text-indicator border-indicator/30 bg-indicator/10",
  intermediate: "text-brand border-brand/30 bg-brand/10",
  advanced: "text-red-400 border-red-500/30 bg-red-500/10",
};

// ── Helper: extract waveform display data from an AudioBuffer ──
function extractWaveformFromBuffer(
  buffer: AudioBuffer | null,
  barCount: number = 120,
): number[] {
  if (!buffer) {
    // Fallback procedural waveform when no buffer loaded
    return Array.from({ length: barCount }, (_, i) =>
      Math.abs(
        Math.sin(i * 0.15) * 0.3 +
          (Math.sin(i * 0.73) * 0.5 + 0.5) * 0.4 +
          0.15,
      ),
    );
  }
  const data = buffer.getChannelData(0);
  const samplesPerBar = Math.floor(data.length / barCount);
  const result: number[] = [];
  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    const offset = i * samplesPerBar;
    const end = Math.min(offset + samplesPerBar, data.length);
    for (let j = offset; j < end; j++) {
      sum += Math.abs(data[j]);
    }
    // Normalize: peak amplitude → 0-1 range, with a minimum floor for visibility
    result.push(Math.min(1, (sum / (end - offset)) * 3 + 0.05));
  }
  return result;
}

// ── Helper: convert EditorEvents to ScratchEvents for the engine ──
function editorEventsToScratchEvents(events: EditorEvent[]): ScratchEvent[] {
  return events.map((ev) => ({
    type: ev.type,
    startBeat: ev.startBeat,
    durationBeats: ev.durationBeats,
    speedMultiplier: ev.speedMultiplier,
    faderPosition: ev.faderPosition,
  }));
}

// Built-in sample loading uses a hidden file input — no static URL base required.
// sampleUrl is kept as a no-op shim so any remaining call sites compile cleanly.

interface VinylScratchProProps {
  onSendToSampleEditor?: () => void;
  /** AudioBuffer loaded externally (e.g. from MusicLibrary) — triggers waveform update for Deck A */
  externalBufferA?: AudioBuffer | null;
  /** AudioBuffer loaded externally (e.g. from MusicLibrary) — triggers waveform update for Deck B */
  externalBufferB?: AudioBuffer | null;
  /** Track name loaded externally into Deck A */
  externalNameA?: string;
  /** Track name loaded externally into Deck B */
  externalNameB?: string;
}

export function VinylScratchPro({
  onSendToSampleEditor,
  externalBufferA,
  externalBufferB,
  externalNameA,
  externalNameB,
}: VinylScratchProProps) {
  // ── DJ Engine context ──
  const {
    djEngine,
    loadFileToDeck,
    djPlay,
    djPause,
    djStop,
    getDeckState,
    setCrossfaderPosition,
    setCrossfaderCurve,
    setDeckVolume,
    setDeckEQ,
    setDeckBpm,
    setDeckPlaybackRate,
    startScratch,
    endScratch,
    processScratch,
    setVinylConfig,
    setDeckEffect,
    setDeckEffectEnabled,
    setDeckEffectWetDry,
    enableSync,
    disableSync,
    renderAutoScratch,
    detectBpm,
    setDJMasterVolume,
    setDeckCuePoint,
    jumpToDeckCue,
    setDeckLoop,
    clearDeckLoop,
    resumeAudio,
  } = useTBMAudio();

  // ── Gemini Slate 4 controller detection ──
  const { controllerDetected: slate4Detected, isInitialized: slate4Ready } = useController();
  // Track whether user has manually overridden the auto-switch
  const userOverrodeSlate4Ref = useRef(false);

  // ── Refs for loaded AudioBuffers (for waveform display + auto-scratch source) ──
  const deckABufferRef = useRef<AudioBuffer | null>(null);
  // Preserves the original (unrendered) Deck A buffer so editor previews always
  // render from the source, not from a previously-rendered scratch output.
  const deckAOriginalBufferRef = useRef<AudioBuffer | null>(null);
  const deckBBufferRef = useRef<AudioBuffer | null>(null);
  // Rendered auto-scratch output buffer (for playback after render)
  const autoScratchOutputRef = useRef<AudioBuffer | null>(null);
  // Editor preview rendered buffer
  const editorPreviewBufferRef = useRef<AudioBuffer | null>(null);
  // For rAF-based deck state polling
  const deckStateRafRef = useRef<ReturnType<
    typeof requestAnimationFrame
  > | null>(null);

  // ── MediaRecorder for DJ master output capture ──
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const [activeMode, setActiveMode] = useState<
    "auto" | "live" | "editor" | "turntable" | "minorvdj"
  >("minorvdj");
  const [selectedStyle, setSelectedStyle] = useState("baby");
  const [selectedSample, setSelectedSample] = useState("ah_yeah1");
  const [intensity, setIntensity] = useState<"low" | "medium" | "high">(
    "medium",
  );
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Vinyl simulation params
  const [inertia, setInertia] = useState(72);
  const [friction, setFriction] = useState(85);
  const [vinylNoise, setVinylNoise] = useState(30);
  const [pitchDrift, setPitchDrift] = useState(15);
  const [sampleThroughTurntable, setSampleThroughTurntable] = useState(true);
  const [drive, setDrive] = useState(38);
  const [wear, setWear] = useState(22);
  const [crackle, setCrackle] = useState(28);

  // Fader
  const [faderPosition, setFaderPosition] = useState(100);
  const [faderCurve, setFaderCurve] = useState("exponential");

  // Effects (Deck A)
  const [echoWet, setEchoWet] = useState(30);
  const [reverbWet, setReverbWet] = useState(15);
  const [lofiTone, setLofiTone] = useState(40);

  // Effects (Deck B)
  const [deckBEchoWet, setDeckBEchoWet] = useState(0);
  const [deckBReverbWet, setDeckBReverbWet] = useState(0);
  const [deckBLofiTone, setDeckBLofiTone] = useState(0);
  const [deckBDrive, setDeckBDrive] = useState(0);

  // Vinyl simulation (Deck B)
  const [deckBInertia] = useState(72);
  const [deckBFriction] = useState(85);
  const [deckBVinylNoise, setDeckBVinylNoise] = useState(0);
  const [deckBPitchDrift, setDeckBPitchDrift] = useState(0);
  const [deckBWear, setDeckBWear] = useState(0);
  const [deckBCrackle, setDeckBCrackle] = useState(0);

  // Minimal mixer
  const [deckALevel, setDeckALevel] = useState(72);
  const [deckBLevel, setDeckBLevel] = useState(68);
  const [masterLevel, setMasterLevel] = useState(85);

  // MinorVDJ
  const [autoDj, setAutoDj] = useState(false);
  const [playlistCursor, setPlaylistCursor] = useState(0);
  const playlist = useMemo(
    () => ["ah_yeah1", "fresh", "yeah_boy", "one_two", "what", "baby_base"],
    [],
  );

  // ── AUTO MODE extras ──────────────────────────────────────────────
  const [autoLength, setAutoLength] = useState<
    "short_stab" | "1_bar" | "2_bars" | "4_bars" | "full_hook"
  >("2_bars");
  const [addSignatureFX, setAddSignatureFX] = useState(true);
  const [autoQuantize, setAutoQuantize] = useState(true);
  const [swingAmount, setSwingAmount] = useState(0); // 0-100
  const [targetTransients, setTargetTransients] = useState(true);
  const [autoProgress, setAutoProgress] = useState<number | null>(null); // 0-100 or null

  // ── LIVE MODE ─────────────────────────────────────────────────────
  const [liveVelocity, setLiveVelocity] = useState(0); // -4 to 4
  const [liveDirection, setLiveDirection] = useState<
    "forward" | "reverse" | "stopped"
  >("stopped");
  const [liveFaderOpen, setLiveFaderOpen] = useState(false);
  const [liveDragActive, setLiveDragActive] = useState(false);
  const liveDragStartX = useRef(0);
  const livePlayheadPosRef = useRef(50);

  // ── EDITOR MODE ───────────────────────────────────────────────────
  const [editorEvents, setEditorEvents] = useState<EditorEvent[]>([
    {
      id: "e1",
      type: "forward",
      startBeat: 0.0,
      durationBeats: 0.5,
      speedMultiplier: 1.0,
      faderPosition: 1.0,
    },
    {
      id: "e2",
      type: "backward",
      startBeat: 0.5,
      durationBeats: 0.5,
      speedMultiplier: 1.0,
      faderPosition: 1.0,
    },
    {
      id: "e3",
      type: "fader_open",
      startBeat: 1.0,
      durationBeats: 0.25,
      speedMultiplier: 1.8,
      faderPosition: 1.0,
    },
    {
      id: "e4",
      type: "chirp",
      startBeat: 1.25,
      durationBeats: 0.25,
      speedMultiplier: 2.0,
      faderPosition: 0.8,
    },
  ]);
  const [gridResolution, setGridResolution] = useState<"8n" | "16n" | "32n">(
    "16n",
  );
  const [patternLengthBars, setPatternLengthBars] = useState(2);
  const [patternName, setPatternName] = useState("My Pattern");
  const [editorPreviewPlaying, setEditorPreviewPlaying] = useState(false);
  const [editorRecording, setEditorRecording] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // ── Editor undo / redo stacks ──
  const editorUndoStack = useRef<EditorEvent[][]>([]);
  const editorRedoStack = useRef<EditorEvent[][]>([]);

  /** Push current events onto undo stack, clear redo, then apply setter */
  const pushEditorUndo = useCallback(
    (next: EditorEvent[] | ((prev: EditorEvent[]) => EditorEvent[])) => {
      setEditorEvents((prev) => {
        editorUndoStack.current.push(prev);
        editorRedoStack.current = [];
        // keep stack bounded
        if (editorUndoStack.current.length > 60)
          editorUndoStack.current.shift();
        return typeof next === "function" ? next(prev) : next;
      });
    },
    [],
  );

  const editorUndo = useCallback(() => {
    if (editorUndoStack.current.length === 0) return;
    setEditorEvents((prev) => {
      editorRedoStack.current.push(prev);
      return editorUndoStack.current.pop()!;
    });
  }, []);

  const editorRedo = useCallback(() => {
    if (editorRedoStack.current.length === 0) return;
    setEditorEvents((prev) => {
      editorUndoStack.current.push(prev);
      return editorRedoStack.current.pop()!;
    });
  }, []);

  // ── TURNTABLE MODE ────────────────────────────────────────────────
  const [vinylRpm, setVinylRpm] = useState(33.3);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [keyLock, setKeyLock] = useState(false);
  const [speedMult, setSpeedMult] = useState(1.0);
  // platAngle is driven purely through refs + direct DOM for performance
  const platAnimRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(
    null,
  );
  const platterDomRef = useRef<HTMLDivElement>(null);
  const platterAngleTextRef = useRef<HTMLSpanElement>(null);

  // ── MINORVDJ DUAL DECK ────────────────────────────────────────────
  const [deckBSample, setDeckBSample] = useState("fresh");
  const [deckABpm, setDeckABpm] = useState(128);
  const [deckBBpm, setDeckBBpm] = useState(128);
  const [deckAPlaying, setDeckAPlaying] = useState(false);
  const [deckBPlaying, setDeckBPlaying] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [deckACuePoint, setDeckACuePoint] = useState(0);
  const [deckBCuePoint, setDeckBCuePoint] = useState(0);
  const [deckAHotCues, setDeckAHotCues] = useState<number[]>([0, 0, 0, 0]);
  const [deckBHotCues, setDeckBHotCues] = useState<number[]>([0, 0, 0, 0]);
  const [deckALoopStart, setDeckALoopStart] = useState<number | null>(null);
  const [deckALoopEnd, setDeckALoopEnd] = useState<number | null>(null);
  const [deckBLoopStart, setDeckBLoopStart] = useState<number | null>(null);
  const [deckBLoopEnd, setDeckBLoopEnd] = useState<number | null>(null);

  // ── Per-deck EQ (Lo/Mid/Hi): 0-100 knob range, mapped to -1..1 gain in engine ──
  const [deckAEqLow, setDeckAEqLow] = useState(50);
  const [deckAEqMid, setDeckAEqMid] = useState(50);
  const [deckAEqHigh, setDeckAEqHigh] = useState(50);
  const [deckBEqLow, setDeckBEqLow] = useState(50);
  const [deckBEqMid, setDeckBEqMid] = useState(50);
  const [deckBEqHigh, setDeckBEqHigh] = useState(50);

  const [isDragging, setIsDragging] = useState(false);

  // ── Inline notification (replaces alert() calls) ──
  const [vspNotification, setVspNotification] = useState<string | null>(null);
  const vspNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showVspNotification = useCallback((msg: string) => {
    if (vspNotifTimerRef.current !== null)
      clearTimeout(vspNotifTimerRef.current);
    setVspNotification(msg);
    vspNotifTimerRef.current = setTimeout(() => {
      setVspNotification(null);
      vspNotifTimerRef.current = null;
    }, 3000);
  }, []);

  // ── Hidden file input for built-in sample loading ──
  const builtInSampleFileRef = useRef<HTMLInputElement>(null);
  const pendingSampleDeckRef = useRef<"A" | "B">("A");

  const currentStyle = scratchStyles.find((s) => s.id === selectedStyle);
  const currentSample = builtInSamples.find((s) => s.id === selectedSample);

  // Waveform data derived from real AudioBuffers when available, procedural fallback otherwise
  const [deckABufferVersion, setDeckABufferVersion] = useState(0);
  const [deckBBufferVersion, setDeckBBufferVersion] = useState(0);

  const waveformData = useMemo(
    () => extractWaveformFromBuffer(deckABufferRef.current, 120),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckABufferVersion],
  );

  const waveformDataB = useMemo(
    () => extractWaveformFromBuffer(deckBBufferRef.current, 120),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckBBufferVersion],
  );

  // ── Auto-switch to MinorVDJ (DJ decks) when Gemini Slate 4 is detected ──
  useEffect(() => {
    if (slate4Detected && slate4Ready && !userOverrodeSlate4Ref.current) {
      // Slate 4 just connected — switch to DJ decks mode automatically
      setActiveMode("minorvdj");
    }
  }, [slate4Detected, slate4Ready]);

  // Track manual mode changes so we don't override user's choice
  const handleModeChange = useCallback(
    (mode: "auto" | "live" | "editor" | "turntable" | "minorvdj") => {
      if (slate4Detected) {
        userOverrodeSlate4Ref.current = true;
      }
      setActiveMode(mode);
    },
    [slate4Detected],
  );

  // ── Sync externally-loaded AudioBuffers (e.g. from MusicLibrary) into waveform display ──
  useEffect(() => {
    if (externalBufferA && externalBufferA !== deckABufferRef.current) {
      deckABufferRef.current = externalBufferA;
      deckAOriginalBufferRef.current = externalBufferA;
      setDeckABufferVersion((v) => v + 1);
      if (externalNameA) {
        setSelectedSample(externalNameA);
      }
      // Auto-detect BPM from the externally loaded buffer
      const detected = detectBpm(externalBufferA);
      if (detected > 0) {
        setBpm(detected);
        setDeckABpm(detected);
        setDeckBpm("A", detected);
      }
    }
  }, [externalBufferA, externalNameA, detectBpm, setDeckBpm]);

  useEffect(() => {
    if (externalBufferB && externalBufferB !== deckBBufferRef.current) {
      deckBBufferRef.current = externalBufferB;
      setDeckBBufferVersion((v) => v + 1);
      if (externalNameB) {
        setDeckBSample(externalNameB);
      }
      const detected = detectBpm(externalBufferB);
      if (detected > 0) {
        setDeckBBpm(detected);
        setDeckBpm("B", detected);
      }
    }
  }, [externalBufferB, externalNameB, detectBpm, setDeckBpm]);

  const autoScratchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (autoScratchTimer.current !== null)
        clearTimeout(autoScratchTimer.current);
      if (autoProgressTimer.current !== null)
        clearInterval(autoProgressTimer.current);
      if (platAnimRef.current !== null)
        cancelAnimationFrame(platAnimRef.current);
      if (deckStateRafRef.current !== null)
        cancelAnimationFrame(deckStateRafRef.current);
      if (vspNotifTimerRef.current !== null)
        clearTimeout(vspNotifTimerRef.current);
      if (syncTimeoutRef.current !== null) clearTimeout(syncTimeoutRef.current);
      // Stop any in-progress recording on unmount
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      recStreamDestRef.current = null;
    };
  }, []);

  // ── Toggle DJ master recording (MediaRecorder → downloadable file) ──
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      // ── STOP recording ──
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    // ── START recording ──
    if (!djEngine) {
      showVspNotification("DJ engine not ready — cannot record");
      return;
    }

    const ctx = djEngine.getContext();
    if (!ctx || ctx.state === "closed") {
      showVspNotification("AudioContext unavailable");
      return;
    }

    // Create a MediaStreamDestination tapped from the DJ master gain
    const dest = ctx.createMediaStreamDestination();
    const masterGain = djEngine.getMasterGain();
    masterGain.connect(dest);
    recStreamDestRef.current = dest;

    // Determine supported MIME type
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

    const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : undefined);
    recordedChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      // Disconnect the tap so it doesn't keep routing
      try { masterGain.disconnect(dest); } catch (_) { /* already disconnected */ }

      if (recordedChunksRef.current.length === 0) {
        showVspNotification("Recording was empty — nothing captured");
        return;
      }

      const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.download = `DJ-Recording-${timestamp}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showVspNotification("Recording saved!");
    };

    recorder.onerror = () => {
      showVspNotification("Recording error occurred");
      setIsRecording(false);
    };

    recorder.start(100); // collect data every 100ms
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    showVspNotification("Recording started — DJ master output is being captured");
  }, [isRecording, djEngine, showVspNotification]);

  // Auto-DJ playlist advance — also load track into Deck A via engine
  useEffect(() => {
    if (!autoDj || activeMode !== "minorvdj") return;

    let animationFrameId: number;
    let lastUpdateTime = 0;
    const beatIntervalMs = (60 / Math.max(1, bpm)) * 4 * 1000; // 16th note interval

    const updatePlaylist = (timestamp: number) => {
      if (lastUpdateTime === 0) {
        lastUpdateTime = timestamp;
      }

      const elapsed = timestamp - lastUpdateTime;
      if (elapsed >= beatIntervalMs) {
        setPlaylistCursor((prev) => (prev + 1) % playlist.length);
        setSelectedSample((prev) => {
          const currentIndex = playlist.indexOf(prev);
          const nextIndex = (currentIndex + 1) % playlist.length;
          return playlist[nextIndex];
        });
        lastUpdateTime = timestamp;
      }

      animationFrameId = requestAnimationFrame(updatePlaylist);
    };

    animationFrameId = requestAnimationFrame(updatePlaylist);
    return () => cancelAnimationFrame(animationFrameId);
  }, [activeMode, autoDj, bpm, playlist]);

  // Turntable platter animation
  const platAngleRef = useRef(0);
  useEffect(() => {
    if (platAnimRef.current !== null) cancelAnimationFrame(platAnimRef.current);
    if (activeMode !== "turntable" || !isPlaying) return;

    let lastTime = performance.now();
    const step = (now: number) => {
      const delta = (now - lastTime) / 1000; // seconds
      lastTime = now;
      // Update the platter angle in a ref to avoid triggering React re-renders on every frame
      platAngleRef.current =
        (platAngleRef.current + (vinylRpm / 60) * speedMult * 360 * delta) %
        360;
      // Direct DOM updates — no React re-render
      if (platterDomRef.current) {
        platterDomRef.current.style.transform = `rotate(${platAngleRef.current}deg)`;
      }
      if (platterAngleTextRef.current) {
        platterAngleTextRef.current.textContent = `${Math.round(platAngleRef.current)}°`;
      }
      platAnimRef.current = requestAnimationFrame(step);
    };

    platAnimRef.current = requestAnimationFrame(step);

    return () => {
      if (platAnimRef.current !== null)
        cancelAnimationFrame(platAnimRef.current);
    };
  }, [activeMode, isPlaying, vinylRpm, speedMult]);

  // ── handleAutoScratch: render scratch pattern via DJEngine's AutoScratchRenderer ──
  const handleAutoScratch = useCallback(async () => {
    // Build scratch events from the selected style preset
    const stylePatterns: Record<string, ScratchEvent[]> = {
      baby: [
        {
          type: "forward",
          startBeat: 0.0,
          durationBeats: 0.5,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
        {
          type: "backward",
          startBeat: 0.5,
          durationBeats: 0.5,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
      ],
      chirp: [
        {
          type: "forward",
          startBeat: 0.0,
          durationBeats: 0.5,
          speedMultiplier: 1.8,
          faderPosition: 0.0,
        },
        {
          type: "fader_open",
          startBeat: 0.15,
          durationBeats: 0.2,
          speedMultiplier: 1.8,
          faderPosition: 1.0,
        },
        {
          type: "fader_close",
          startBeat: 0.35,
          durationBeats: 0.25,
          speedMultiplier: 1.8,
          faderPosition: 0.0,
        },
        {
          type: "backward",
          startBeat: 0.5,
          durationBeats: 0.5,
          speedMultiplier: 1.0,
          faderPosition: 0.0,
        },
      ],
      transformer: [
        {
          type: "forward",
          startBeat: 0.0,
          durationBeats: 1.0,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
        {
          type: "stutter",
          startBeat: 0.0,
          durationBeats: 1.0,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
          stutterOverride: { enabled: true, rate: "16n", dutyPercent: 50 },
        },
        {
          type: "backward",
          startBeat: 1.0,
          durationBeats: 1.0,
          speedMultiplier: 1.0,
          faderPosition: 0.0,
        },
      ],
      tear: [
        {
          type: "forward",
          startBeat: 0.0,
          durationBeats: 0.25,
          speedMultiplier: 2.5,
          faderPosition: 1.0,
        },
        {
          type: "hold",
          startBeat: 0.25,
          durationBeats: 0.15,
          speedMultiplier: 0.0,
          faderPosition: 1.0,
        },
        {
          type: "forward",
          startBeat: 0.4,
          durationBeats: 0.3,
          speedMultiplier: 1.2,
          faderPosition: 1.0,
        },
        {
          type: "backward",
          startBeat: 0.7,
          durationBeats: 0.3,
          speedMultiplier: 1.5,
          faderPosition: 0.8,
        },
      ],
      flare: [
        {
          type: "forward",
          startBeat: 0.0,
          durationBeats: 0.2,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
        {
          type: "fader_close",
          startBeat: 0.2,
          durationBeats: 0.05,
          speedMultiplier: 1.0,
          faderPosition: 0.0,
        },
        {
          type: "forward",
          startBeat: 0.25,
          durationBeats: 0.2,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
        {
          type: "fader_close",
          startBeat: 0.45,
          durationBeats: 0.05,
          speedMultiplier: 1.0,
          faderPosition: 0.0,
        },
        {
          type: "backward",
          startBeat: 0.5,
          durationBeats: 0.5,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
      ],
      crab: [
        {
          type: "forward",
          startBeat: 0.0,
          durationBeats: 0.125,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
        {
          type: "forward",
          startBeat: 0.125,
          durationBeats: 0.125,
          speedMultiplier: 1.0,
          faderPosition: 0.0,
        },
        {
          type: "forward",
          startBeat: 0.25,
          durationBeats: 0.125,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
        {
          type: "forward",
          startBeat: 0.375,
          durationBeats: 0.125,
          speedMultiplier: 1.0,
          faderPosition: 0.0,
        },
        {
          type: "forward",
          startBeat: 0.5,
          durationBeats: 0.125,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
        {
          type: "forward",
          startBeat: 0.625,
          durationBeats: 0.125,
          speedMultiplier: 1.0,
          faderPosition: 0.0,
        },
        {
          type: "forward",
          startBeat: 0.75,
          durationBeats: 0.25,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
      ],
      hookScratch: [
        {
          type: "forward",
          startBeat: 0.0,
          durationBeats: 0.25,
          speedMultiplier: 1.5,
          faderPosition: 1.0,
        },
        {
          type: "fader_close",
          startBeat: 0.25,
          durationBeats: 0.25,
          speedMultiplier: 1.5,
          faderPosition: 0.0,
        },
        {
          type: "chirp",
          startBeat: 0.5,
          durationBeats: 0.25,
          speedMultiplier: 2.0,
          faderPosition: 0.8,
        },
        {
          type: "backward",
          startBeat: 0.75,
          durationBeats: 0.25,
          speedMultiplier: 1.0,
          faderPosition: 1.0,
        },
      ],
      soulScratch: [
        {
          type: "forward",
          startBeat: 0.0,
          durationBeats: 0.75,
          speedMultiplier: 0.7,
          faderPosition: 1.0,
        },
        {
          type: "backward",
          startBeat: 0.75,
          durationBeats: 0.5,
          speedMultiplier: 0.5,
          faderPosition: 0.9,
        },
        {
          type: "forward",
          startBeat: 1.25,
          durationBeats: 0.75,
          speedMultiplier: 0.8,
          faderPosition: 1.0,
        },
      ],
    };

    // Determine how many bars of the pattern to repeat for the chosen length
    const barsForLength: Record<string, number> = {
      short_stab: 0.5,
      "1_bar": 1,
      "2_bars": 2,
      "4_bars": 4,
      full_hook: 6,
    };
    const targetBars = barsForLength[autoLength] ?? 2;
    const baseEvents = stylePatterns[selectedStyle] ?? stylePatterns.baby;

    // Find the length of one pattern cycle in beats
    let patternEndBeat = 0;
    for (const ev of baseEvents) {
      patternEndBeat = Math.max(
        patternEndBeat,
        ev.startBeat + ev.durationBeats,
      );
    }
    if (patternEndBeat <= 0) patternEndBeat = 1;

    // Tile the pattern to fill targetBars * 4 beats
    const totalTargetBeats = targetBars * 4;
    const events: ScratchEvent[] = [];
    let offset = 0;
    while (offset < totalTargetBeats) {
      for (const ev of baseEvents) {
        if (offset + ev.startBeat >= totalTargetBeats) break;
        events.push({
          ...ev,
          startBeat: offset + ev.startBeat,
          durationBeats: Math.min(
            ev.durationBeats,
            totalTargetBeats - (offset + ev.startBeat),
          ),
        });
      }
      offset += patternEndBeat;
    }

    // ── autoQuantize: snap event start beats to nearest grid subdivision ──
    if (autoQuantize) {
      const gridMap: Record<string, number> = { "8n": 0.5, "16n": 0.25, "32n": 0.125 };
      const gridSize = gridMap[gridResolution] ?? 0.25;
      for (const ev of events) {
        ev.startBeat = Math.round(ev.startBeat / gridSize) * gridSize;
      }
    }

    // ── targetTransients: shift events toward detected transient peaks ──
    if (targetTransients) {
      const sourceForTransients = deckAOriginalBufferRef.current ?? deckABufferRef.current;
      if (sourceForTransients) {
        // Simple energy-based transient detection: find peaks in short windows
        const data = sourceForTransients.getChannelData(0);
        const sr = sourceForTransients.sampleRate;
        const beatDurationS = 60 / Math.max(1, bpm);
        const windowSamples = Math.floor(sr * beatDurationS * 0.125); // 32nd note windows
        const transientBeats: number[] = [];
        let prevEnergy = 0;
        for (let i = 0; i < data.length; i += windowSamples) {
          let energy = 0;
          const end = Math.min(i + windowSamples, data.length);
          for (let j = i; j < end; j++) energy += data[j] * data[j];
          energy /= (end - i);
          // Onset = sudden energy increase
          if (energy > prevEnergy * 2.5 && energy > 0.001) {
            transientBeats.push((i / sr) / beatDurationS);
          }
          prevEnergy = energy;
        }
        // For each event, snap to the nearest transient if one is within 0.5 beats
        if (transientBeats.length > 0) {
          for (const ev of events) {
            let nearest = transientBeats[0];
            let nearestDist = Math.abs(ev.startBeat - nearest);
            for (const tb of transientBeats) {
              const dist = Math.abs(ev.startBeat - tb);
              if (dist < nearestDist) {
                nearest = tb;
                nearestDist = dist;
              }
            }
            if (nearestDist < 0.5) {
              ev.startBeat = nearest;
            }
          }
        }
      }
    }

    // Get source buffer from Deck A — prefer the original buffer so that
    // handleAutoScratch doesn't accidentally use a rendered preview output
    // that may have overwritten deckABufferRef.current (Bug 6 audit fix).
    const sourceBuffer = deckAOriginalBufferRef.current ?? deckABufferRef.current;
    if (!sourceBuffer) {
      // No buffer loaded — run the fake timer fallback for visual feedback
      const lengthMs: Record<string, number> = {
        short_stab: 800,
        "1_bar": 2000,
        "2_bars": 4000,
        "4_bars": 8000,
        full_hook: 12000,
      };
      const duration = lengthMs[autoLength] ?? 2000;
      setIsPlaying(true);
      setAutoProgress(0);
      if (autoScratchTimer.current !== null)
        clearTimeout(autoScratchTimer.current);
      if (autoProgressTimer.current !== null)
        clearInterval(autoProgressTimer.current);
      const start = Date.now();
      autoProgressTimer.current = setInterval(() => {
        const pct = Math.min(100, ((Date.now() - start) / duration) * 100);
        setAutoProgress(pct);
        if (pct >= 100) {
          if (autoProgressTimer.current !== null)
            clearInterval(autoProgressTimer.current);
          setAutoProgress(null);
        }
      }, 50);
      autoScratchTimer.current = setTimeout(() => {
        setIsPlaying(false);
        setAutoProgress(null);
      }, duration);
      return;
    }

    // Real engine render
    setIsPlaying(true);
    setAutoProgress(0);
    if (autoScratchTimer.current !== null)
      clearTimeout(autoScratchTimer.current);
    if (autoProgressTimer.current !== null)
      clearInterval(autoProgressTimer.current);

    // Start progress animation
    const estimatedDurationMs =
      ((totalTargetBeats * 60) / Math.max(1, bpm)) * 1000;
    const startTime = Date.now();
    autoProgressTimer.current = setInterval(() => {
      const pct = Math.min(
        95,
        ((Date.now() - startTime) / estimatedDurationMs) * 100,
      );
      setAutoProgress(pct);
    }, 50);

    try {
      await resumeAudio();
      const outputBuffer = await renderAutoScratch(
        sourceBuffer,
        events,
        bpm,
        intensity,
        swingAmount,
      );
      autoScratchOutputRef.current = outputBuffer;

      // Play the rendered buffer through Deck A
      if (outputBuffer && djEngine) {
        djEngine.deckA.loadBuffer(outputBuffer);
        deckABufferRef.current = outputBuffer;
        setDeckABufferVersion((v) => v + 1);

        // ── sampleThroughTurntable: route playback through vinyl simulation ──
        if (sampleThroughTurntable) {
          setVinylConfig("A", {
            inertia: inertia / 100,
            friction: friction / 100,
            noiseLevel: vinylNoise / 100,
            pitchDrift: (pitchDrift / 100) * 0.01,
            drive: drive / 100,
            wear: wear / 100,
            crackleRate: crackle / 100,
          });
        } else {
          // Bypass vinyl sim by zeroing noise/drift/crackle
          setVinylConfig("A", {
            inertia: 0.72,
            friction: 0.85,
            noiseLevel: 0,
            pitchDrift: 0,
            drive: 0,
            wear: 0,
            crackleRate: 0,
          });
        }

        // ── addSignatureFX: apply echo + lo-fi coloring to rendered output ──
        if (addSignatureFX) {
          // Enable a subtle echo (slot 0) and a touch of lo-fi (slot 2) for "signature" flavor
          setDeckEffect("A", 0, "echo", { delayMs: 90, feedback: 0.2 });
          setDeckEffectEnabled("A", 0, true);
          setDeckEffectWetDry("A", 0, 0.15);
          setDeckEffect("A", 2, "bitcrusher", { bits: 14, sampleRateReduction: 0.9 });
          setDeckEffectEnabled("A", 2, true);
          setDeckEffectWetDry("A", 2, 0.08);
        }

        djEngine.deckA.play();
      }
    } catch (err) {
      console.error("[VinylScratchPro] Auto-scratch render failed:", err);
    } finally {
      if (autoProgressTimer.current !== null)
        clearInterval(autoProgressTimer.current);
      setAutoProgress(100);
      // Brief flash of 100% then clear
      autoScratchTimer.current = setTimeout(() => {
        setIsPlaying(false);
        setAutoProgress(null);
      }, 300);
    }
  }, [
    autoLength,
    selectedStyle,
    bpm,
    intensity,
    swingAmount,
    autoQuantize,
    gridResolution,
    targetTransients,
    addSignatureFX,
    sampleThroughTurntable,
    inertia,
    friction,
    vinylNoise,
    pitchDrift,
    drive,
    wear,
    crackle,
    renderAutoScratch,
    djEngine,
    resumeAudio,
    setVinylConfig,
    setDeckEffect,
    setDeckEffectEnabled,
    setDeckEffectWetDry,
  ]);

  // ── Live mode: mouse drag → real scratch engine ──
  const liveDragLastTimeRef = useRef(0);

  const handleLiveDragStart = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      setLiveDragActive(true);
      liveDragStartX.current = e.clientX;
      liveDragLastTimeRef.current = performance.now();
      setLiveFaderOpen(true);
      // Start scratch mode on Deck A
      startScratch("A");
      resumeAudio();
      // Ensure deck A is playing so the source node exists for scratch
      if (deckABufferRef.current) {
        djPlay("A");
      }
    },
    [startScratch, resumeAudio, djPlay, deckABufferRef],
  );

  const handleLiveDragMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!e.buttons) return;
      const now = performance.now();
      const dt = Math.max(0.001, (now - liveDragLastTimeRef.current) / 1000);
      liveDragLastTimeRef.current = now;

      const delta = e.clientX - liveDragStartX.current;
      const velocity = Math.max(-4, Math.min(4, delta * 0.04));
      setLiveVelocity(velocity);
      setLiveDirection(
        velocity > 0.05 ? "forward" : velocity < -0.05 ? "reverse" : "stopped",
      );
      livePlayheadPosRef.current = Math.max(
        0,
        Math.min(100, livePlayheadPosRef.current + velocity * 0.5),
      );
      if (livePlayheadRef.current) {
        livePlayheadRef.current.setAttribute(
          "x1",
          `${livePlayheadPosRef.current}%`,
        );
        livePlayheadRef.current.setAttribute(
          "x2",
          `${livePlayheadPosRef.current}%`,
        );
      }
      liveDragStartX.current = e.clientX;

      // Feed the scratch engine with the position measurement
      // Convert pixel delta to a scratch position measurement (scaled to intervals)
      processScratch("A", delta * 0.5, dt);
    },
    [processScratch],
  );

  const handleLiveDragEnd = useCallback(() => {
    setLiveDragActive(false);
    setLiveVelocity(0);
    setLiveDirection("stopped");
    setLiveFaderOpen(false);
    // End scratch mode — deck resumes normal playback
    endScratch("A");
  }, [endScratch]);

  const editorEventCounter = useRef(10);

  // Editor mode helpers (wired to undo stack)
  const addEditorEvent = useCallback(() => {
    editorEventCounter.current += 1;
    const newEvent: EditorEvent = {
      id: `e${editorEventCounter.current}`,
      type: "forward",
      startBeat: editorEvents.length * 0.5,
      durationBeats: 0.5,
      speedMultiplier: 1.0,
      faderPosition: 1.0,
    };
    pushEditorUndo((prev) =>
      [...prev, newEvent].sort((a, b) => a.startBeat - b.startBeat),
    );
    setSelectedEventId(newEvent.id);
  }, [editorEvents, pushEditorUndo]);

  const deleteEditorEvent = useCallback(
    (id: string) => {
      pushEditorUndo((prev) => prev.filter((e) => e.id !== id));
      setSelectedEventId((prev) => (prev === id ? null : prev));
    },
    [pushEditorUndo],
  );

  const updateEditorEvent = useCallback(
    (id: string, changes: Partial<EditorEvent>) => {
      pushEditorUndo((prev) =>
        prev
          .map((e) => (e.id === id ? { ...e, ...changes } : e))
          .sort((a, b) => a.startBeat - b.startBeat),
      );
    },
    [pushEditorUndo],
  );

  const loadStyleToEditor = useCallback(
    (styleId: string) => {
      const stylePatterns: Record<string, EditorEvent[]> = {
        baby: [
          {
            id: "b1",
            type: "forward",
            startBeat: 0.0,
            durationBeats: 0.5,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
          {
            id: "b2",
            type: "backward",
            startBeat: 0.5,
            durationBeats: 0.5,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
        ],
        chirp: [
          {
            id: "c1",
            type: "forward",
            startBeat: 0.0,
            durationBeats: 0.5,
            speedMultiplier: 1.8,
            faderPosition: 0.0,
          },
          {
            id: "c2",
            type: "fader_open",
            startBeat: 0.15,
            durationBeats: 0.2,
            speedMultiplier: 1.8,
            faderPosition: 1.0,
          },
          {
            id: "c3",
            type: "fader_close",
            startBeat: 0.35,
            durationBeats: 0.25,
            speedMultiplier: 1.8,
            faderPosition: 0.0,
          },
          {
            id: "c4",
            type: "backward",
            startBeat: 0.5,
            durationBeats: 0.5,
            speedMultiplier: 1.0,
            faderPosition: 0.0,
          },
        ],
        transformer: [
          {
            id: "t1",
            type: "forward",
            startBeat: 0.0,
            durationBeats: 1.0,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
          {
            id: "t2",
            type: "stutter",
            startBeat: 0.0,
            durationBeats: 1.0,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
          {
            id: "t3",
            type: "backward",
            startBeat: 1.0,
            durationBeats: 1.0,
            speedMultiplier: 1.0,
            faderPosition: 0.0,
          },
        ],
        tear: [
          {
            id: "te1",
            type: "forward",
            startBeat: 0.0,
            durationBeats: 0.25,
            speedMultiplier: 2.5,
            faderPosition: 1.0,
          },
          {
            id: "te2",
            type: "hold",
            startBeat: 0.25,
            durationBeats: 0.15,
            speedMultiplier: 0.0,
            faderPosition: 1.0,
          },
          {
            id: "te3",
            type: "forward",
            startBeat: 0.4,
            durationBeats: 0.3,
            speedMultiplier: 1.2,
            faderPosition: 1.0,
          },
          {
            id: "te4",
            type: "backward",
            startBeat: 0.7,
            durationBeats: 0.3,
            speedMultiplier: 1.5,
            faderPosition: 0.8,
          },
        ],
        flare: [
          {
            id: "fl1",
            type: "forward",
            startBeat: 0.0,
            durationBeats: 0.2,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
          {
            id: "fl2",
            type: "fader_close",
            startBeat: 0.2,
            durationBeats: 0.05,
            speedMultiplier: 1.0,
            faderPosition: 0.0,
          },
          {
            id: "fl3",
            type: "forward",
            startBeat: 0.25,
            durationBeats: 0.2,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
          {
            id: "fl4",
            type: "fader_close",
            startBeat: 0.45,
            durationBeats: 0.05,
            speedMultiplier: 1.0,
            faderPosition: 0.0,
          },
          {
            id: "fl5",
            type: "backward",
            startBeat: 0.5,
            durationBeats: 0.5,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
        ],
        crab: [
          {
            id: "cr1",
            type: "forward",
            startBeat: 0.0,
            durationBeats: 0.125,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
          {
            id: "cr2",
            type: "forward",
            startBeat: 0.125,
            durationBeats: 0.125,
            speedMultiplier: 1.0,
            faderPosition: 0.0,
          },
          {
            id: "cr3",
            type: "forward",
            startBeat: 0.25,
            durationBeats: 0.125,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
          {
            id: "cr4",
            type: "forward",
            startBeat: 0.375,
            durationBeats: 0.125,
            speedMultiplier: 1.0,
            faderPosition: 0.0,
          },
          {
            id: "cr5",
            type: "forward",
            startBeat: 0.5,
            durationBeats: 0.125,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
          {
            id: "cr6",
            type: "forward",
            startBeat: 0.625,
            durationBeats: 0.125,
            speedMultiplier: 1.0,
            faderPosition: 0.0,
          },
          {
            id: "cr7",
            type: "forward",
            startBeat: 0.75,
            durationBeats: 0.25,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
        ],
        hookScratch: [
          {
            id: "hs1",
            type: "forward",
            startBeat: 0.0,
            durationBeats: 0.25,
            speedMultiplier: 1.5,
            faderPosition: 1.0,
          },
          {
            id: "hs2",
            type: "fader_close",
            startBeat: 0.25,
            durationBeats: 0.25,
            speedMultiplier: 1.5,
            faderPosition: 0.0,
          },
          {
            id: "hs3",
            type: "chirp",
            startBeat: 0.5,
            durationBeats: 0.25,
            speedMultiplier: 2.0,
            faderPosition: 0.8,
          },
          {
            id: "hs4",
            type: "backward",
            startBeat: 0.75,
            durationBeats: 0.25,
            speedMultiplier: 1.0,
            faderPosition: 1.0,
          },
        ],
        soulScratch: [
          {
            id: "ss1",
            type: "forward",
            startBeat: 0.0,
            durationBeats: 0.75,
            speedMultiplier: 0.7,
            faderPosition: 1.0,
          },
          {
            id: "ss2",
            type: "backward",
            startBeat: 0.75,
            durationBeats: 0.5,
            speedMultiplier: 0.5,
            faderPosition: 0.9,
          },
          {
            id: "ss3",
            type: "forward",
            startBeat: 1.25,
            durationBeats: 0.75,
            speedMultiplier: 0.8,
            faderPosition: 1.0,
          },
        ],
      };
      const events = stylePatterns[styleId];
      if (events) {
        pushEditorUndo(
          events.map((e, idx) => ({ ...e, id: `${e.id}_${idx}` })),
        );
        setPatternName(
          scratchStyles.find((s) => s.id === styleId)?.name ?? "Pattern",
        );
      }
    },
    [pushEditorUndo],
  );

  const syncTimeoutRef = useRef<number | null>(null);

  // MinorVDJ sync — wire to real DJ engine sync
  const handleSync = useCallback(() => {
    setSyncEnabled(true);
    setDeckBBpm(deckABpm);
    // Wire to real engine sync
    setDeckBpm("A", deckABpm);
    setDeckBpm("B", deckABpm);
    enableSync("A");

    if (syncTimeoutRef.current !== null) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = window.setTimeout(() => {
      setSyncEnabled(false);
      disableSync();
      syncTimeoutRef.current = null;
    }, 500);
  }, [deckABpm, setDeckBpm, enableSync, disableSync]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current !== null) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);
  // ══════════════════════════════════════════════════════════════════════
  // Audio Engine Sync Effects — wire UI state to DJEngine
  // ══════════════════════════════════════════════════════════════════════

  // ── File drop handler: load dropped audio files into Deck A or B based on drop position ──
  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f instanceof File && f.type.startsWith("audio/"),
      ) as File[];
      if (files.length === 0) return;

      // Determine which deck to load into based on drop position
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const deck = dropX < rect.width / 2 ? "A" : "B";

      await resumeAudio();
      const file = files[0];
      const buffer = await loadFileToDeck(deck, file);

      if (buffer) {
        if (deck === "A") {
          deckABufferRef.current = buffer;
          deckAOriginalBufferRef.current = buffer;
          setDeckABufferVersion((v) => v + 1);
          setSelectedSample(file.name.replace(/\.[^/.]+$/, ""));
        } else {
          deckBBufferRef.current = buffer;
          setDeckBBufferVersion((v) => v + 1);
          setDeckBSample(file.name.replace(/\.[^/.]+$/, ""));
        }

        // Auto-detect BPM from the loaded file
        const detected = detectBpm(buffer);
        if (detected > 0) {
          if (deck === "A") {
            setBpm(detected);
            setDeckABpm(detected);
          } else {
            setDeckBBpm(detected);
          }
          setDeckBpm(deck, detected);
        }

        showVspNotification(`Loaded "${file.name}" into Deck ${deck}`);
      }
    },
    [loadFileToDeck, resumeAudio, detectBpm, setDeckBpm, showVspNotification],
  );

  // ── Load a built-in sample into Deck A by URL ──
  const loadSampleToDeckA = useCallback((sampleId: string) => {
    setSelectedSample(sampleId);

    // Show user-friendly notification and trigger file picker
    const sampleName =
      builtInSamples.find((s) => s.id === sampleId)?.name || sampleId;
    showVspNotification(`Select "${sampleName}" audio file for Deck A`);

    // Trigger file picker for manual loading
    pendingSampleDeckRef.current = "A";
    builtInSampleFileRef.current?.click();

    // Update UI state even though we can't load the audio
    setDeckABufferVersion((v) => v + 1); // Force UI update
  }, []);

  // ── Load a built-in sample into Deck B by URL ──
  const loadSampleToDeckB = useCallback((sampleId: string) => {
    setDeckBSample(sampleId);

    // Show user-friendly notification and trigger file picker
    const sampleName =
      builtInSamples.find((s) => s.id === sampleId)?.name || sampleId;
    showVspNotification(`Select "${sampleName}" audio file for Deck B`);

    // Trigger file picker for manual loading
    pendingSampleDeckRef.current = "B";
    builtInSampleFileRef.current?.click();

    // Update UI state even though we can't load the audio
    setDeckBBufferVersion((v) => v + 1); // Force UI update
  }, []);

  // ── Mixer levels → engine (crossfader position, curve, deck volumes, master) ──
  useEffect(() => {
    const curveMap: Record<string, CrossfaderCurve> = {
      linear: "linear",
      exponential: "exponential",
      s_curve: "s_curve",
      hard_cut: "hard_cut",
    };
    setCrossfaderPosition(faderPosition / 100);
    setCrossfaderCurve(curveMap[faderCurve] ?? "exponential");
    setDeckVolume("A", deckALevel / 100);
    setDeckVolume("B", deckBLevel / 100);
    setDJMasterVolume(masterLevel / 100);
  }, [
    faderPosition,
    faderCurve,
    deckALevel,
    deckBLevel,
    masterLevel,
    setCrossfaderPosition,
    setCrossfaderCurve,
    setDeckVolume,
    setDJMasterVolume,
  ]);

  // ── BPM → engine decks ──
  useEffect(() => {
    setDeckBpm("A", deckABpm);
    setDeckBpm("B", deckBBpm);
  }, [deckABpm, deckBBpm, setDeckBpm]);

  // ── EQ → engine decks (maps 0-100 knob to gain: 0 = -1, 50 = 0, 100 = +1) ──
  useEffect(() => {
    const mapEq = (v: number) => (v - 50) / 50; // 0..100 → -1..+1
    setDeckEQ("A", mapEq(deckAEqLow), mapEq(deckAEqMid), mapEq(deckAEqHigh));
  }, [deckAEqLow, deckAEqMid, deckAEqHigh, setDeckEQ]);

  useEffect(() => {
    const mapEq = (v: number) => (v - 50) / 50;
    setDeckEQ("B", mapEq(deckBEqLow), mapEq(deckBEqMid), mapEq(deckBEqHigh));
  }, [deckBEqLow, deckBEqMid, deckBEqHigh, setDeckEQ]);

  // ── Vinyl simulation params → engine (Deck A) ──
  useEffect(() => {
    setVinylConfig("A", {
      inertia: inertia / 100,
      friction: friction / 100,
      noiseLevel: vinylNoise / 100,
      pitchDrift: (pitchDrift / 100) * 0.01, // Map 0-100 knob to 0-0.01 drift range
      drive: drive / 100,
      wear: wear / 100,
      crackleRate: crackle / 100,
    });
  }, [
    inertia,
    friction,
    vinylNoise,
    pitchDrift,
    drive,
    wear,
    crackle,
    setVinylConfig,
  ]);

  // ── Effects chain → engine (echo, reverb, lo-fi, drive) ──
  useEffect(() => {
    // Echo on slot 0
    if (echoWet > 0) {
      setDeckEffect("A", 0, "echo", { delayMs: 125, feedback: 0.35 });
      setDeckEffectEnabled("A", 0, true);
      setDeckEffectWetDry("A", 0, echoWet / 100);
    } else {
      setDeckEffectEnabled("A", 0, false);
    }
    // Reverb on slot 1
    if (reverbWet > 0) {
      setDeckEffect("A", 1, "reverb", { roomSize: 0.3, damping: 0.5 });
      setDeckEffectEnabled("A", 1, true);
      setDeckEffectWetDry("A", 1, reverbWet / 100);
    } else {
      setDeckEffectEnabled("A", 1, false);
    }
    // Lo-Fi (bitcrusher) on slot 2
    if (lofiTone > 0) {
      setDeckEffect("A", 2, "bitcrusher", {
        bits: Math.max(4, 16 - (lofiTone / 100) * 12),
        sampleRateReduction: 1 - (lofiTone / 100) * 0.7,
      });
      setDeckEffectEnabled("A", 2, true);
      setDeckEffectWetDry("A", 2, lofiTone / 100);
    } else {
      setDeckEffectEnabled("A", 2, false);
    }
    // Drive (distortion) on slot 3
    if (drive > 0) {
      setDeckEffect("A", 3, "distortion", {
        drive: (drive / 100) * 3,
        tone: 0.6,
      });
      setDeckEffectEnabled("A", 3, true);
      setDeckEffectWetDry("A", 3, Math.min(1, drive / 80));
    } else {
      setDeckEffectEnabled("A", 3, false);
    }
  }, [
    echoWet,
    reverbWet,
    lofiTone,
    drive,
    setDeckEffect,
    setDeckEffectEnabled,
    setDeckEffectWetDry,
  ]);

  // ── Vinyl simulation params → engine (Deck B) ──
  useEffect(() => {
    setVinylConfig("B", {
      inertia: deckBInertia / 100,
      friction: deckBFriction / 100,
      noiseLevel: deckBVinylNoise / 100,
      pitchDrift: (deckBPitchDrift / 100) * 0.01,
      drive: deckBDrive / 100,
      wear: deckBWear / 100,
      crackleRate: deckBCrackle / 100,
    });
  }, [
    deckBInertia,
    deckBFriction,
    deckBVinylNoise,
    deckBPitchDrift,
    deckBDrive,
    deckBWear,
    deckBCrackle,
    setVinylConfig,
  ]);

  // ── Effects chain → engine Deck B (echo, reverb, lo-fi, drive) ──
  useEffect(() => {
    // Echo on slot 0
    if (deckBEchoWet > 0) {
      setDeckEffect("B", 0, "echo", { delayMs: 125, feedback: 0.35 });
      setDeckEffectEnabled("B", 0, true);
      setDeckEffectWetDry("B", 0, deckBEchoWet / 100);
    } else {
      setDeckEffectEnabled("B", 0, false);
    }
    // Reverb on slot 1
    if (deckBReverbWet > 0) {
      setDeckEffect("B", 1, "reverb", { roomSize: 0.3, damping: 0.5 });
      setDeckEffectEnabled("B", 1, true);
      setDeckEffectWetDry("B", 1, deckBReverbWet / 100);
    } else {
      setDeckEffectEnabled("B", 1, false);
    }
    // Lo-Fi (bitcrusher) on slot 2
    if (deckBLofiTone > 0) {
      setDeckEffect("B", 2, "bitcrusher", {
        bits: Math.max(4, 16 - (deckBLofiTone / 100) * 12),
        sampleRateReduction: 1 - (deckBLofiTone / 100) * 0.7,
      });
      setDeckEffectEnabled("B", 2, true);
      setDeckEffectWetDry("B", 2, deckBLofiTone / 100);
    } else {
      setDeckEffectEnabled("B", 2, false);
    }
    // Drive (distortion) on slot 3
    if (deckBDrive > 0) {
      setDeckEffect("B", 3, "distortion", {
        drive: (deckBDrive / 100) * 3,
        tone: 0.6,
      });
      setDeckEffectEnabled("B", 3, true);
      setDeckEffectWetDry("B", 3, Math.min(1, deckBDrive / 80));
    } else {
      setDeckEffectEnabled("B", 3, false);
    }
  }, [
    deckBEchoWet,
    deckBReverbWet,
    deckBLofiTone,
    deckBDrive,
    setDeckEffect,
    setDeckEffectEnabled,
    setDeckEffectWetDry,
  ]);

  // ── Turntable mode: playback rate from RPM + speed + pitch ──
  useEffect(() => {
    if (activeMode !== "turntable") return;
    // Base rate: RPM relative to 33.3, times speed multiplier
    const rpmRate = vinylRpm / 33.3;
    // Pitch: semitones to rate multiplier (2^(semitones/12))
    const pitchRate = keyLock ? 1 : Math.pow(2, pitchSemitones / 12);
    const finalRate = rpmRate * speedMult * pitchRate;
    setDeckPlaybackRate("A", finalRate);
  }, [
    activeMode,
    vinylRpm,
    speedMult,
    pitchSemitones,
    keyLock,
    setDeckPlaybackRate,
  ]);

  // ── Play/pause → engine decks (all modes) ──
  useEffect(() => {
    if (activeMode === "turntable") {
      if (isPlaying) {
        resumeAudio();
        djPlay("A");
      } else {
        djPause("A");
      }
    }
  }, [activeMode, isPlaying, djPlay, djPause, resumeAudio]);

  useEffect(() => {
    if (activeMode !== "minorvdj") return;
    if (deckAPlaying) {
      resumeAudio();
      djPlay("A");
    } else {
      djPause("A");
    }
    if (deckBPlaying) {
      resumeAudio();
      djPlay("B");
    } else {
      djPause("B");
    }
  }, [activeMode, deckAPlaying, deckBPlaying, djPlay, djPause, resumeAudio]);

  // ── Editor mode: preview toggle ──
  const handleEditorPreviewToggle = useCallback(async () => {
    if (editorPreviewPlaying) {
      // Stop preview
      djStop("A");
      setEditorPreviewPlaying(false);
      return;
    }

    // Always render from the original loaded buffer, not from a prior preview render.
    const sourceBuffer = deckAOriginalBufferRef.current ?? deckABufferRef.current;
    if (!sourceBuffer) {
      // No buffer — just toggle the visual state
      setEditorPreviewPlaying((p) => !p);
      return;
    }

    setEditorPreviewPlaying(true);
    await resumeAudio();
    const scratchEvents = editorEventsToScratchEvents(editorEvents);
    try {
      const outputBuffer = await renderAutoScratch(
        sourceBuffer,
        scratchEvents,
        bpm,
        intensity,
      );
      if (outputBuffer && djEngine) {
        editorPreviewBufferRef.current = outputBuffer;
        djEngine.deckA.loadBuffer(outputBuffer);
        deckABufferRef.current = outputBuffer;
        setDeckABufferVersion((v) => v + 1);
        djEngine.deckA.play();
        // Auto-stop when playback finishes
        const durationMs = outputBuffer.duration * 1000;
        autoScratchTimer.current = setTimeout(() => {
          setEditorPreviewPlaying(false);
        }, durationMs + 50);
      }
    } catch (err) {
      console.error("[VinylScratchPro] Editor preview render failed:", err);
      setEditorPreviewPlaying(false);
    }
  }, [
    editorPreviewPlaying,
    editorEvents,
    bpm,
    intensity,
    djEngine,
    djStop,
    renderAutoScratch,
    resumeAudio,
  ]);

  // ── Deck state polling for real-time playhead position + audio stats ──
  const deckAPositionRef = useRef(0);
  const deckBPositionRef = useRef(0);
  const deckAPlayheadRef = useRef<SVGLineElement>(null);
  const deckBPlayheadRef = useRef<SVGLineElement>(null);
  const autoPlayheadRef = useRef<SVGLineElement>(null);
  const livePlayheadRef = useRef<SVGLineElement>(null);
  const [audioLatencyMs, setAudioLatencyMs] = useState(0);
  const [audioCpuPercent, setAudioCpuPercent] = useState(0);

  useEffect(() => {
    let active = true;
    let frameCount = 0;
    const poll = () => {
      if (!active) return;
      const stateA = getDeckState("A");
      const stateB = getDeckState("B");
      if (stateA && stateA.duration > 0) {
        const posA = (stateA.position / stateA.duration) * 100;
        deckAPositionRef.current = posA;
        if (deckAPlayheadRef.current) {
          deckAPlayheadRef.current.setAttribute("x1", `${posA}%`);
          deckAPlayheadRef.current.setAttribute("x2", `${posA}%`);
        }
        if (autoPlayheadRef.current) {
          autoPlayheadRef.current.setAttribute("x1", `${posA}%`);
          autoPlayheadRef.current.setAttribute("x2", `${posA}%`);
        }
        if (livePlayheadRef.current) {
          livePlayheadRef.current.setAttribute("x1", `${posA}%`);
          livePlayheadRef.current.setAttribute("x2", `${posA}%`);
        }
      }
      if (stateB && stateB.duration > 0) {
        const posB = (stateB.position / stateB.duration) * 100;
        deckBPositionRef.current = posB;
        if (deckBPlayheadRef.current) {
          deckBPlayheadRef.current.setAttribute("x1", `${posB}%`);
          deckBPlayheadRef.current.setAttribute("x2", `${posB}%`);
        }
      }
      // Read AudioContext stats every ~30 frames (~0.5s at 60fps) to avoid churn
      frameCount++;
      if (frameCount % 30 === 0 && djEngine) {
        const ctx = djEngine.context;
        if (ctx) {
          // baseLatency is output latency in seconds (Chrome/Firefox)
          const latency =
            ((ctx as any).baseLatency ?? 0) + ((ctx as any).outputLatency ?? 0);
          setAudioLatencyMs(Math.round(latency * 1000));

          // Simulate CPU usage based on active nodes and processing
          let cpuEstimate = 0;
          if (deckAPlaying || deckBPlaying) cpuEstimate += 30;
          if (echoWet > 0 || reverbWet > 0) cpuEstimate += 20;
          if (drive > 0 || lofiTone > 0) cpuEstimate += 15;
          if (deckAPlaying && deckBPlaying) cpuEstimate += 10;
          setAudioCpuPercent(Math.min(100, cpuEstimate));
        }
      }
      deckStateRafRef.current = requestAnimationFrame(poll);
    };
    deckStateRafRef.current = requestAnimationFrame(poll);
    return () => {
      active = false;
      if (deckStateRafRef.current !== null)
        cancelAnimationFrame(deckStateRafRef.current);
    };
  }, [getDeckState, djEngine]);

  // ── Editor recording: click on grid to stamp events at clicked beat position ──
  const handleGridRecordClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editorRecording) return;
      const beats = patternLengthBars * 4;
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const beatPos = relX * beats;

      // Snap to grid resolution
      const divPerBeat: Record<string, number> = {
        "8n": 2,
        "16n": 4,
        "32n": 8,
      };
      const snap = 1 / (divPerBeat[gridResolution] ?? 4);
      const snapped = Math.round(beatPos / snap) * snap;
      const startBeat = Math.max(0, Math.min(beats - snap, snapped));

      editorEventCounter.current += 1;
      const newEvent: EditorEvent = {
        id: `rec_${editorEventCounter.current}`,
        type: "forward",
        startBeat,
        durationBeats: snap,
        speedMultiplier: 1.0,
        faderPosition: 1.0,
      };
      pushEditorUndo((prev) =>
        [...prev, newEvent].sort((a, b) => a.startBeat - b.startBeat),
      );
      setSelectedEventId(newEvent.id);
    },
    [editorRecording, patternLengthBars, gridResolution, pushEditorUndo],
  );

  // ══════════════════════════════════════════════════════════════════════
  // Quick Actions — Export Clip, Save Preset, Export MIDI
  // ══════════════════════════════════════════════════════════════════════

  /** Export the last rendered scratch buffer (auto-scratch or editor preview) as a WAV file */
  const handleExportClip = useCallback(() => {
    const buffer =
      autoScratchOutputRef.current ?? editorPreviewBufferRef.current;
    if (!buffer) {
      showVspNotification(
        "No rendered audio to export. Run auto-scratch or preview an editor pattern first.",
      );
      return;
    }
    // Interleave channels into 16-bit PCM WAV
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const dataLength = length * numChannels * 2; // 16-bit = 2 bytes per sample
    const headerSize = 44;
    const arrayBuffer = new ArrayBuffer(headerSize + dataLength);
    const view = new DataView(arrayBuffer);

    // RIFF header
    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++)
        view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
    view.setUint16(32, numChannels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeStr(36, "data");
    view.setUint32(40, dataLength, true);

    // Interleave channel data
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++)
      channels.push(buffer.getChannelData(ch));
    let offset = headerSize;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(
          offset,
          sample < 0 ? sample * 0x8000 : sample * 0x7fff,
          true,
        );
        offset += 2;
      }
    }

    const blob = new Blob([arrayBuffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patternName.replace(/\s+/g, "_")}_scratch.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }, [patternName]);

  /** Save editor pattern + settings as a JSON preset in localStorage */
  const handleSavePreset = useCallback(() => {
    const preset = {
      name: patternName,
      style: selectedStyle,
      sample: selectedSample,
      bpm,
      intensity,
      swingAmount,
      gridResolution,
      patternLengthBars,
      events: editorEvents,
      vinyl: { vinylNoise, pitchDrift, drive, wear, crackle },
      savedAt: new Date().toISOString(),
    };
    // Store in localStorage array
    const stored = localStorage.getItem("vsp_presets");
    const presets: unknown[] = stored ? JSON.parse(stored) : [];
    presets.push(preset);
    localStorage.setItem("vsp_presets", JSON.stringify(presets));
    showVspNotification(
      `Preset "${patternName}" saved. (${presets.length} total)`,
    );
  }, [
    patternName,
    selectedStyle,
    selectedSample,
    bpm,
    intensity,
    swingAmount,
    gridResolution,
    patternLengthBars,
    editorEvents,
    vinylNoise,
    pitchDrift,
    drive,
    wear,
    crackle,
  ]);

  /** Export editor events as a simple MIDI file (Type 0, single track) */
  const handleExportMidi = useCallback(() => {
    if (editorEvents.length === 0) {
      showVspNotification("No editor events to export.");
      return;
    }
    const ticksPerBeat = 480;

    // Build MIDI track bytes: tempo meta + note events
    const trackBytes: number[] = [];

    // Helper: variable-length quantity
    const vlq = (val: number): number[] => {
      const bytes: number[] = [];
      bytes.unshift(val & 0x7f);
      val >>= 7;
      while (val > 0) {
        bytes.unshift((val & 0x7f) | 0x80);
        val >>= 7;
      }
      return bytes;
    };

    // Tempo meta event (at tick 0)
    const microsecondsPerBeat = Math.round(60_000_000 / bpm);
    trackBytes.push(0x00); // delta time
    trackBytes.push(0xff, 0x51, 0x03); // meta tempo
    trackBytes.push(
      (microsecondsPerBeat >> 16) & 0xff,
      (microsecondsPerBeat >> 8) & 0xff,
      microsecondsPerBeat & 0xff,
    );

    // Track name
    const nameBytes = Array.from(new TextEncoder().encode(patternName));
    trackBytes.push(0x00, 0xff, 0x03, nameBytes.length, ...nameBytes);

    // Convert editor events to note on/off pairs
    // Map event types to MIDI notes: forward=C4(60), backward=D4(62), chirp=E4(64), etc.
    const typeToNote: Record<string, number> = {
      forward: 60,
      backward: 62,
      fader_open: 64,
      fader_close: 65,
      hold: 67,
      chirp: 69,
      tear: 71,
      stutter: 72,
      one_shot: 74,
    };

    // Sort by startBeat and build absolute-tick events
    const sorted = [...editorEvents].sort((a, b) => a.startBeat - b.startBeat);
    const absEvents: { tick: number; bytes: number[] }[] = [];
    for (const ev of sorted) {
      const note = typeToNote[ev.type] ?? 60;
      const velocity = Math.min(
        127,
        Math.max(1, Math.round(ev.speedMultiplier * 64)),
      );
      const startTick = Math.round(ev.startBeat * ticksPerBeat);
      const endTick = Math.round(
        (ev.startBeat + ev.durationBeats) * ticksPerBeat,
      );
      absEvents.push({ tick: startTick, bytes: [0x90, note, velocity] }); // note on
      absEvents.push({ tick: endTick, bytes: [0x80, note, 0] }); // note off
    }

    // Sort by tick and convert to delta times
    absEvents.sort((a, b) => a.tick - b.tick);
    let lastTick = 0;
    for (const ev of absEvents) {
      const delta = ev.tick - lastTick;
      trackBytes.push(...vlq(delta), ...ev.bytes);
      lastTick = ev.tick;
    }

    // End of track
    trackBytes.push(0x00, 0xff, 0x2f, 0x00);

    // Build full MIDI file (Type 0)
    const header = [
      0x4d,
      0x54,
      0x68,
      0x64, // MThd
      0x00,
      0x00,
      0x00,
      0x06, // header length
      0x00,
      0x00, // type 0
      0x00,
      0x01, // 1 track
      (ticksPerBeat >> 8) & 0xff,
      ticksPerBeat & 0xff, // ticks per quarter
    ];

    const trackHeader = [
      0x4d,
      0x54,
      0x72,
      0x6b, // MTrk
      (trackBytes.length >> 24) & 0xff,
      (trackBytes.length >> 16) & 0xff,
      (trackBytes.length >> 8) & 0xff,
      trackBytes.length & 0xff,
    ];

    const midiData = new Uint8Array([...header, ...trackHeader, ...trackBytes]);
    const blob = new Blob([midiData], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patternName.replace(/\s+/g, "_")}_scratch.mid`;
    a.click();
    URL.revokeObjectURL(url);
  }, [editorEvents, bpm, patternName]);

  // ══════════════════════════════════════════════════════════════════════
  // Keyboard Shortcuts - Enhanced for DJ Workflow
  // ══════════════════════════════════════════════════════════════════════
  const kbScratchActiveRef = useRef(false);

  // Store the latest handlers in refs so the keydown/keyup listeners don't
  // need to be re-attached every time a dependency changes.
  const kbHandleKeyDownRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const kbHandleKeyUpRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // This effect updates the ref on every render — cheap, no DOM teardown
  useEffect(() => {
    kbHandleKeyDownRef.current = (e: KeyboardEvent) => {
      // Ignore when typing in an input / textarea / select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // ── DJ PERFORMANCE SHORTCUTS (MinorVDJ Mode) ──
      if (activeMode === "minorvdj") {
        // Space — toggle Deck A play/pause
        if (e.key === " " || e.code === "Space") {
          e.preventDefault();
          setDeckAPlaying((p) => !p);
          return;
        }

        // S — toggle Deck B play/pause
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          setDeckBPlaying((p) => !p);
          return;
        }

        // C — cue Deck A (jump to cue point)
        if (e.key === "c" || e.key === "C") {
          e.preventDefault();
          if (deckACuePoint > 0) {
            jumpToDeckCue("A", 0);
          }
          return;
        }

        // V — cue Deck B (jump to cue point)
        if (e.key === "v" || e.key === "V") {
          e.preventDefault();
          if (deckBCuePoint > 0) {
            jumpToDeckCue("B", 0);
          }
          return;
        }

        // Shift+Q/W/E/R — SET hot cues for Deck A (must be checked BEFORE non-shift handlers)
        if (e.shiftKey && (e.key === "q" || e.key === "Q")) {
          e.preventDefault();
          const position = deckAPositionRef.current;
          setDeckAHotCues((prev) => [position, prev[1], prev[2], prev[3]]);
          showVspNotification(
            `Deck A Hot Cue 1 set at ${Math.round(position)}%`,
          );
          return;
        }
        if (e.shiftKey && (e.key === "w" || e.key === "W")) {
          e.preventDefault();
          const position = deckAPositionRef.current;
          setDeckAHotCues((prev) => [prev[0], position, prev[2], prev[3]]);
          showVspNotification(
            `Deck A Hot Cue 2 set at ${Math.round(position)}%`,
          );
          return;
        }
        if (e.shiftKey && (e.key === "e" || e.key === "E")) {
          e.preventDefault();
          const position = deckAPositionRef.current;
          setDeckAHotCues((prev) => [prev[0], prev[1], position, prev[3]]);
          showVspNotification(
            `Deck A Hot Cue 3 set at ${Math.round(position)}%`,
          );
          return;
        }
        if (e.shiftKey && (e.key === "r" || e.key === "R")) {
          e.preventDefault();
          const position = deckAPositionRef.current;
          setDeckAHotCues((prev) => [prev[0], prev[1], prev[2], position]);
          showVspNotification(
            `Deck A Hot Cue 4 set at ${Math.round(position)}%`,
          );
          return;
        }

        // Shift+U/I/O/P — SET hot cues for Deck B
        if (e.shiftKey && (e.key === "u" || e.key === "U")) {
          e.preventDefault();
          const position = deckBPositionRef.current;
          setDeckBHotCues((prev) => [position, prev[1], prev[2], prev[3]]);
          showVspNotification(
            `Deck B Hot Cue 1 set at ${Math.round(position)}%`,
          );
          return;
        }
        if (e.shiftKey && (e.key === "i" || e.key === "I")) {
          e.preventDefault();
          const position = deckBPositionRef.current;
          setDeckBHotCues((prev) => [prev[0], position, prev[2], prev[3]]);
          showVspNotification(
            `Deck B Hot Cue 2 set at ${Math.round(position)}%`,
          );
          return;
        }
        if (e.shiftKey && (e.key === "o" || e.key === "O")) {
          e.preventDefault();
          const position = deckBPositionRef.current;
          setDeckBHotCues((prev) => [prev[0], prev[1], position, prev[3]]);
          showVspNotification(
            `Deck B Hot Cue 3 set at ${Math.round(position)}%`,
          );
          return;
        }
        if (e.shiftKey && (e.key === "p" || e.key === "P")) {
          e.preventDefault();
          const position = deckBPositionRef.current;
          setDeckBHotCues((prev) => [prev[0], prev[1], prev[2], position]);
          showVspNotification(
            `Deck B Hot Cue 4 set at ${Math.round(position)}%`,
          );
          return;
        }

        // Hot Cues 1-4 for Deck A (Q,W,E,R) — JUMP to saved cue
        if (e.key === "q" || e.key === "Q") {
          e.preventDefault();
          if (deckAHotCues[0] > 0) {
            const buf = deckABufferRef.current;
            const timeSec = buf ? (deckAHotCues[0] / 100) * buf.duration : 0;
            setDeckCuePoint("A", timeSec);
            jumpToDeckCue("A", 0);
          }
          return;
        }
        if (e.key === "w" || e.key === "W") {
          e.preventDefault();
          if (deckAHotCues[1] > 0) {
            const buf = deckABufferRef.current;
            const timeSec = buf ? (deckAHotCues[1] / 100) * buf.duration : 0;
            setDeckCuePoint("A", timeSec);
            jumpToDeckCue("A", 0);
          }
          return;
        }
        if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          if (deckAHotCues[2] > 0) {
            const buf = deckABufferRef.current;
            const timeSec = buf ? (deckAHotCues[2] / 100) * buf.duration : 0;
            setDeckCuePoint("A", timeSec);
            jumpToDeckCue("A", 0);
          }
          return;
        }
        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          if (deckAHotCues[3] > 0) {
            const buf = deckABufferRef.current;
            const timeSec = buf ? (deckAHotCues[3] / 100) * buf.duration : 0;
            setDeckCuePoint("A", timeSec);
            jumpToDeckCue("A", 0);
          }
          return;
        }

        // Hot Cues 1-4 for Deck B (U,I,O,P) — JUMP to saved cue
        if (e.key === "u" || e.key === "U") {
          e.preventDefault();
          if (deckBHotCues[0] > 0) {
            const buf = deckBBufferRef.current;
            const timeSec = buf ? (deckBHotCues[0] / 100) * buf.duration : 0;
            setDeckCuePoint("B", timeSec);
            jumpToDeckCue("B", 0);
          }
          return;
        }
        if (e.key === "i" || e.key === "I") {
          e.preventDefault();
          if (deckBHotCues[1] > 0) {
            const buf = deckBBufferRef.current;
            const timeSec = buf ? (deckBHotCues[1] / 100) * buf.duration : 0;
            setDeckCuePoint("B", timeSec);
            jumpToDeckCue("B", 0);
          }
          return;
        }
        if (e.key === "o" || e.key === "O") {
          e.preventDefault();
          if (deckBHotCues[2] > 0) {
            const buf = deckBBufferRef.current;
            const timeSec = buf ? (deckBHotCues[2] / 100) * buf.duration : 0;
            setDeckCuePoint("B", timeSec);
            jumpToDeckCue("B", 0);
          }
          return;
        }
        if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          if (deckBHotCues[3] > 0) {
            const buf = deckBBufferRef.current;
            const timeSec = buf ? (deckBHotCues[3] / 100) * buf.duration : 0;
            setDeckCuePoint("B", timeSec);
            jumpToDeckCue("B", 0);
          }
          return;
        }

        // L — toggle loop for Deck A
        if (e.key === "l" || e.key === "L") {
          e.preventDefault();
          if (deckALoopStart !== null && deckALoopEnd !== null) {
            clearDeckLoop("A");
            setDeckALoopStart(null);
            setDeckALoopEnd(null);
            showVspNotification("Deck A loop cleared");
          } else {
            const buf = deckABufferRef.current;
            if (buf) {
              const start = (deckAPositionRef.current / 100) * buf.duration;
              const end = Math.min(start + 1, buf.duration); // 1 second loop
              setDeckLoop("A", start, end);
              setDeckALoopStart(start);
              setDeckALoopEnd(end);
              showVspNotification(
                `Deck A loop set: ${start.toFixed(1)}s - ${end.toFixed(1)}s`,
              );
            }
          }
          return;
        }

        // ; — toggle loop for Deck B
        if (e.key === ";" || e.key === ":") {
          e.preventDefault();
          if (deckBLoopStart !== null && deckBLoopEnd !== null) {
            clearDeckLoop("B");
            setDeckBLoopStart(null);
            setDeckBLoopEnd(null);
            showVspNotification("Deck B loop cleared");
          } else {
            const buf = deckBBufferRef.current;
            if (buf) {
              const start = (deckBPositionRef.current / 100) * buf.duration;
              const end = Math.min(start + 1, buf.duration);
              setDeckLoop("B", start, end);
              setDeckBLoopStart(start);
              setDeckBLoopEnd(end);
              showVspNotification(
                `Deck B loop set: ${start.toFixed(1)}s - ${end.toFixed(1)}s`,
              );
            }
          }
          return;
        }

        // Y — sync BPM
        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          handleSync();
          return;
        }

        // T — toggle auto DJ
        if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          setAutoDj((d) => !d);
          return;
        }
      }

      // ── GLOBAL SHORTCUTS (All Modes) ──
      // Ctrl+Z / Ctrl+Y — undo / redo (editor mode)
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        editorUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        editorRedo();
        return;
      }

      // ── 1–8 — load scratch style preset into editor ──
      const numKey = parseInt(e.key, 10);
      if (numKey >= 1 && numKey <= 8 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const style = scratchStyles[numKey - 1];
        if (style) {
          loadStyleToEditor(style.id);
          setSelectedStyle(style.id);
        }
        return;
      }

      // ── Space — play / pause (mode-dependent) ──
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (activeMode === "auto") {
          handleAutoScratch();
        } else if (activeMode === "editor") {
          handleEditorPreviewToggle();
        } else if (activeMode === "turntable") {
          setIsPlaying((p) => !p);
        } else if (activeMode === "live") {
          // Toggle deck A play/pause directly
          resumeAudio();
          if (deckABufferRef.current) {
            // Simple toggle — check velocity to know if "playing"
            if (liveDirection === "stopped") {
              djPlay("A");
              setLiveDirection("forward");
            } else {
              djPause("A");
              setLiveDirection("stopped");
            }
          }
        }
        return;
      }

      // ── Live / turntable mode shortcuts ──

      // ← → — scratch ±1× (Shift for ±2×)
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const multiplier = e.shiftKey ? 2 : 1;
        const direction = e.key === "ArrowRight" ? 1 : -1;
        const scratchDelta = direction * multiplier * 40; // pixel-equivalent delta

        if (!kbScratchActiveRef.current) {
          kbScratchActiveRef.current = true;
          resumeAudio();
          startScratch("A");
          if (deckABufferRef.current) djPlay("A");
        }
        processScratch("A", scratchDelta, 0.016);

        const velocity = direction * multiplier;
        setLiveVelocity(velocity);
        setLiveDirection(velocity > 0 ? "forward" : "reverse");
        livePlayheadPosRef.current = Math.max(
          0,
          Math.min(100, livePlayheadPosRef.current + velocity * 0.5),
        );
        if (livePlayheadRef.current) {
          livePlayheadRef.current.setAttribute(
            "x1",
            `${livePlayheadPosRef.current}%`,
          );
          livePlayheadRef.current.setAttribute(
            "x2",
            `${livePlayheadPosRef.current}%`,
          );
        }
        setLiveFaderOpen(true);
        return;
      }

      // ↑ ↓ — speed ±0.25×
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSpeedMult((prev) => Math.min(4.0, +(prev + 0.25).toFixed(2)));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSpeedMult((prev) => Math.max(0.25, +(prev - 0.25).toFixed(2)));
        return;
      }

      // R — toggle reverse (live mode only)
      if (e.key === "r" || e.key === "R") {
        if (e.ctrlKey || e.metaKey) return; // don't intercept browser refresh
        if (activeMode === "live") {
          setLiveDirection((prev) =>
            prev === "reverse" ? "forward" : "reverse",
          );
        }
        return;
      }

      // F (hold) — fader open (live mode only)
      if (e.key === "f" || e.key === "F") {
        if (e.ctrlKey || e.metaKey) return; // don't intercept browser find
        if (!e.repeat && activeMode === "live") {
          setLiveFaderOpen(true);
        }
        return;
      }
    };

    kbHandleKeyUpRef.current = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // End keyboard scratch on arrow key release
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (kbScratchActiveRef.current) {
          kbScratchActiveRef.current = false;
          endScratch("A");
          setLiveVelocity(0);
          setLiveDirection("stopped");
          setLiveFaderOpen(false);
        }
        return;
      }

      // F release — fader close (live mode only)
      if (e.key === "f" || e.key === "F") {
        if (!e.ctrlKey && !e.metaKey && activeMode === "live") {
          setLiveFaderOpen(false);
        }
        return;
      }
    };
  }); // no deps — runs every render to keep refs up-to-date (very cheap, no DOM work)

  // Attach stable listeners once — they delegate to the latest handler via refs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => kbHandleKeyDownRef.current(e);
    const onKeyUp = (e: KeyboardEvent) => kbHandleKeyUpRef.current(e);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Grid columns from patternLengthBars + resolution
  const gridDivisions = useMemo(() => {
    const divPerBeat: Record<string, number> = { "8n": 2, "16n": 4, "32n": 8 };
    return patternLengthBars * 4 * (divPerBeat[gridResolution] ?? 4);
  }, [patternLengthBars, gridResolution]);

  const totalBeats = patternLengthBars * 4;

  return (
    <>
      <div className="h-full flex flex-col gap-4">
        {/* Header */}
        <div className="flex justify-between items-center bg-bg-surface p-4 rounded-xl border border-border-main shadow-lg relative edge-glow-bottom">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-brand/20 rounded-lg flex items-center justify-center border border-brand/30">
              <Disc3 className="text-brand" size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest">
                Vinyl Scratch Pro
              </h2>
              <p className="text-[13px] text-neutral-500 font-mono uppercase">
                Engine: VSP v2.0.0 · Scratch System
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Mode selector */}
            <div className="flex items-center gap-0.5 bg-bg-main/60 rounded-lg px-1 py-0.5 border border-border-main">
              {(
                ["auto", "live", "editor", "turntable", "minorvdj"] as const
              ).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  className={`px-3 py-1 rounded-md text-[13px] font-bold uppercase transition-all ${
                    activeMode === mode
                      ? "bg-brand text-white shadow-sm shadow-brand/30"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            {/* Slate 4 indicator */}
            {slate4Detected && (
              <div className="flex items-center gap-1.5 bg-green-900/30 px-2.5 py-1 rounded-lg border border-green-600/40">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-bold text-green-400 uppercase tracking-wider">
                  Slate 4
                </span>
              </div>
            )}
            {/* BPM */}
            <div className="flex items-center gap-2 bg-bg-main/60 px-3 py-1.5 rounded-lg border border-border-main">
              <span className="text-[13px] font-mono text-neutral-600 uppercase">
                BPM
              </span>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value) || 90)}
                className="w-12 bg-transparent text-brand font-bold text-sm outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left Column: Vinyl Platter + Fader */}
          <div className="w-72 flex flex-col gap-4 shrink-0">
            <VinylDeck
              isPlaying={isPlaying}
              activeMode={activeMode}
              isDragging={isDragging}
              selectedSample={selectedSample}
              liveDirection={liveDirection}
              platAngleRef={platAngleRef}
              platterDomRef={platterDomRef}
              vinylRpm={vinylRpm}
              speedMult={speedMult}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
            />

            <CrossfaderSection
              faderPosition={faderPosition}
              faderCurve={faderCurve}
              onFaderChange={setFaderPosition}
              onCurveChange={setFaderCurve}
            />

            <TransportSection
              isPlaying={isPlaying}
              isRecording={isRecording}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
              onStop={() => { setIsPlaying(false); if (isRecording) toggleRecording(); }}
              onToggleRecording={toggleRecording}
              onAutoScratch={handleAutoScratch}
            />
          </div>

          {/* Center Column: Mode-specific content */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {/* ── AUTO MODE ── */}
            {activeMode === "auto" && (
              <>
                {/* Scratch Style Presets */}
                <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shuffle size={14} className="text-brand" />
                      <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
                        Scratch Styles
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={intensity}
                        onChange={(e) =>
                          setIntensity(
                            e.target.value as "low" | "medium" | "high",
                          )
                        }
                        className="bg-bg-main border border-border-main text-xs text-neutral-400 rounded px-2 py-1 outline-none"
                      >
                        <option value="low">Low Intensity</option>
                        <option value="medium">Medium</option>
                        <option value="high">High Intensity</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {scratchStyles.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.id)}
                        className={`flex flex-col gap-1.5 p-3 rounded-lg border transition-all text-left ${
                          selectedStyle === style.id
                            ? "bg-brand/10 border-brand shadow-lg shadow-brand/5"
                            : "bg-bg-main/50 border-border-main hover:border-neutral-600"
                        }`}
                      >
                        <span
                          className={`text-[13px] font-bold uppercase ${selectedStyle === style.id ? "text-brand" : "text-neutral-300"}`}
                        >
                          {style.name}
                        </span>
                        <span
                          className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded border w-fit ${difficultyColors[style.difficulty]}`}
                        >
                          {style.difficulty}
                        </span>
                        <span className="text-xs text-neutral-500 leading-tight">
                          {style.description}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setSelectedStyle(pickWeightedRandomStyle())}
                    className="w-full py-1.5 bg-brand/10 text-brand text-xs font-bold uppercase rounded-lg border border-brand/30 hover:bg-brand/20 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Shuffle size={11} /> Random Style
                  </button>
                </div>

                {/* Auto-Scratch Settings + Sample */}
                <div className="flex-1 bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3 min-h-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap size={14} className="text-brand" />
                      <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
                        Auto-Scratch Settings
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedSample}
                        onChange={(e) => loadSampleToDeckA(e.target.value)}
                        className="bg-bg-main border border-border-main text-[13px] text-neutral-300 rounded-lg px-3 py-1.5 outline-none focus:border-brand transition-colors"
                      >
                        {builtInSamples.map((sample) => (
                          <option key={sample.id} value={sample.id}>
                            {sample.name} ({sample.category})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Length + options row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                        Clip Length
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            "short_stab",
                            "1_bar",
                            "2_bars",
                            "4_bars",
                            "full_hook",
                          ] as const
                        ).map((len) => (
                          <button
                            key={len}
                            onClick={() => setAutoLength(len)}
                            className={`px-2 py-1 rounded text-xs font-bold uppercase border transition-all ${
                              autoLength === len
                                ? "bg-brand text-white border-brand"
                                : "bg-bg-main text-neutral-500 border-border-main hover:border-neutral-500"
                            }`}
                          >
                            {len.replace(/_/g, " ")}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                        Options
                      </span>
                      <label className="flex items-center gap-2 text-xs font-mono text-neutral-400 uppercase cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addSignatureFX}
                          onChange={(e) => setAddSignatureFX(e.target.checked)}
                          className="accent-brand"
                        />
                        Add Signature FX
                      </label>
                      <label className="flex items-center gap-2 text-xs font-mono text-neutral-400 uppercase cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoQuantize}
                          onChange={(e) => setAutoQuantize(e.target.checked)}
                          className="accent-brand"
                        />
                        Auto-Quantize
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-neutral-400 uppercase whitespace-nowrap">
                          Swing {swingAmount}%
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={swingAmount}
                          onChange={(e) =>
                            setSwingAmount(Number(e.target.value))
                          }
                          className="flex-1 h-1 accent-brand"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs font-mono text-neutral-400 uppercase cursor-pointer">
                        <input
                          type="checkbox"
                          checked={targetTransients}
                          onChange={(e) =>
                            setTargetTransients(e.target.checked)
                          }
                          className="accent-brand"
                        />
                        Target Transients
                      </label>
                      <label className="flex items-center gap-2 text-xs font-mono text-neutral-400 uppercase cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sampleThroughTurntable}
                          onChange={(e) =>
                            setSampleThroughTurntable(e.target.checked)
                          }
                          className="accent-brand"
                        />
                        Through Turntable
                      </label>
                    </div>
                  </div>

                  {/* Waveform with progress */}
                  <div className="flex-1 relative rounded-lg border border-border-main bg-bg-main/50 overflow-hidden min-h-20">
                    <svg
                      className="absolute inset-0 w-full h-full"
                      preserveAspectRatio="none"
                    >
                      <rect
                        x="10%"
                        y="0"
                        width="30%"
                        height="100%"
                        fill="var(--brand-primary)"
                        opacity="0.06"
                      />
                      <line
                        x1="10%"
                        y1="0"
                        x2="10%"
                        y2="100%"
                        stroke="var(--brand-primary)"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                        opacity="0.4"
                      />
                      <line
                        x1="40%"
                        y1="0"
                        x2="40%"
                        y2="100%"
                        stroke="var(--brand-primary)"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                        opacity="0.4"
                      />
                      <g fill="var(--brand-primary)" opacity="0.7">
                        {waveformData.map((val, i) => (
                          <rect
                            key={i}
                            x={`${(i / 120) * 100}%`}
                            y={`${50 - val * 42}%`}
                            width="0.7%"
                            height={`${val * 84}%`}
                            rx="1"
                          />
                        ))}
                      </g>
                      {autoProgress !== null && (
                        <rect
                          x="0"
                          y="0"
                          width={`${autoProgress}%`}
                          height="100%"
                          fill="var(--indicator)"
                          opacity="0.08"
                        />
                      )}
                      {(isPlaying || autoProgress !== null) && (
                        <line
                          ref={autoPlayheadRef}
                          x1={`${autoProgress !== null ? autoProgress : deckAPositionRef.current}%`}
                          y1="0"
                          x2={`${autoProgress !== null ? autoProgress : deckAPositionRef.current}%`}
                          y2="100%"
                          stroke="var(--indicator)"
                          strokeWidth="2"
                          opacity="0.9"
                        />
                      )}
                    </svg>
                    <div className="absolute bottom-1 left-[10%] text-[7px] font-mono text-brand/60 uppercase">
                      Loop Start
                    </div>
                    <div className="absolute bottom-1 left-[35%] text-[7px] font-mono text-brand/60 uppercase">
                      Loop End
                    </div>
                    {autoProgress !== null && (
                      <div className="absolute top-1 right-2 text-xs font-mono text-indicator uppercase">
                        Rendering {Math.round(autoProgress)}%
                      </div>
                    )}
                  </div>

                  {currentStyle && (
                    <div className="flex items-center gap-4 px-3 py-2 bg-bg-main/60 rounded-lg border border-border-main">
                      <div className="flex items-center gap-2">
                        <Disc3 size={12} className="text-brand" />
                        <span className="text-[13px] font-bold text-neutral-300 uppercase">
                          {currentStyle.name}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500">·</span>
                      <span className="text-xs text-neutral-500">
                        {currentStyle.description}
                      </span>
                      <span className="ml-auto text-xs font-mono text-neutral-600 uppercase">
                        Sample: {currentSample?.name}
                      </span>
                      {sampleThroughTurntable && (
                        <span className="text-xs font-mono text-indicator uppercase">
                          Turntable ON
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── LIVE MODE ── */}
            {activeMode === "live" && (
              <>
                {/* Velocity / Direction meter */}
                <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowRight size={14} className="text-brand" />
                      <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
                        Live Scratch
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-bold uppercase px-2 py-0.5 rounded border ${
                          liveDirection === "forward"
                            ? "text-indicator border-indicator/40 bg-indicator/10"
                            : liveDirection === "reverse"
                              ? "text-red-400 border-red-500/40 bg-red-500/10"
                              : "text-neutral-500 border-border-main bg-bg-main"
                        }`}
                      >
                        {liveDirection}
                      </span>
                      <span
                        className={`text-xs font-bold uppercase px-2 py-0.5 rounded border ${
                          liveFaderOpen
                            ? "text-brand border-brand/40 bg-brand/10"
                            : "text-neutral-600 border-border-main bg-bg-main"
                        }`}
                      >
                        Fader {liveFaderOpen ? "Open" : "Closed"}
                      </span>
                    </div>
                  </div>

                  {/* Velocity bar */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-neutral-600 w-12 text-right">
                      -4×
                    </span>
                    <div className="flex-1 h-4 bg-bg-main rounded-full overflow-hidden border border-border-main relative">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-600"></div>
                      <div
                        className={`absolute top-0 bottom-0 transition-all rounded-full ${liveVelocity >= 0 ? "bg-indicator left-1/2" : "bg-red-500 right-1/2"}`}
                        style={{
                          width: `${(Math.abs(liveVelocity) / 4) * 50}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono text-neutral-600 w-8">
                      +4×
                    </span>
                    <span
                      className={`text-xs font-mono font-bold w-10 ${liveVelocity > 0 ? "text-indicator" : liveVelocity < 0 ? "text-red-400" : "text-neutral-600"}`}
                    >
                      {liveVelocity > 0 ? "+" : ""}
                      {liveVelocity.toFixed(2)}×
                    </span>
                  </div>

                  {/* Sample selector */}
                  <div className="flex items-center gap-2">
                    <Music size={12} className="text-brand" />
                    <span className="text-xs font-mono text-neutral-500 uppercase">
                      Sample
                    </span>
                    <select
                      value={selectedSample}
                      onChange={(e) => loadSampleToDeckA(e.target.value)}
                      className="flex-1 bg-bg-main border border-border-main text-[13px] text-neutral-300 rounded-lg px-2 py-1 outline-none focus:border-brand"
                    >
                      {builtInSamples.map((sample) => (
                        <option key={sample.id} value={sample.id}>
                          {sample.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Interactive Waveform – drag to scratch */}
                <div className="flex-1 bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3 min-h-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
                      Drag Waveform to Scratch
                    </span>
                    <span className="text-xs font-mono text-neutral-600">
                      Sensitivity: 0.04×
                    </span>
                  </div>
                  <div className="flex-1 relative rounded-lg border border-border-main overflow-hidden min-h-30 cursor-ew-resize select-none">
                    <svg
                      className="absolute inset-0 w-full h-full"
                      preserveAspectRatio="none"
                      onMouseDown={handleLiveDragStart}
                      onMouseMove={handleLiveDragMove}
                      onMouseUp={handleLiveDragEnd}
                      onMouseLeave={handleLiveDragEnd}
                    >
                      {/* Background */}
                      <rect
                        x="0"
                        y="0"
                        width="100%"
                        height="100%"
                        fill="transparent"
                      />
                      {/* Waveform */}
                      <g
                        fill="var(--brand-primary)"
                        opacity={liveFaderOpen ? 0.9 : 0.5}
                      >
                        {waveformData.map((val, i) => (
                          <rect
                            key={i}
                            x={`${(i / 120) * 100}%`}
                            y={`${50 - val * 42}%`}
                            width="0.7%"
                            height={`${val * 84}%`}
                            rx="1"
                          />
                        ))}
                      </g>
                      {/* Playhead */}
                      <line
                        ref={livePlayheadRef}
                        x1={`${livePlayheadPosRef.current}%`}
                        y1="0"
                        x2={`${livePlayheadPosRef.current}%`}
                        y2="100%"
                        stroke="var(--indicator)"
                        strokeWidth="2"
                        opacity="0.9"
                      />
                      {/* Fader gate overlay */}
                      {!liveFaderOpen && (
                        <rect
                          x="0"
                          y="0"
                          width="100%"
                          height="100%"
                          fill="black"
                          opacity="0.35"
                        />
                      )}
                    </svg>
                    {!liveDragActive && liveDirection === "stopped" && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-[13px] font-bold text-neutral-600 uppercase tracking-widest">
                          ← Drag to Scratch →
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Keyboard shortcuts reference */}
                  <div className="bg-bg-main/60 rounded-lg border border-border-main p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Keyboard size={11} className="text-neutral-500" />
                      <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                        Keyboard Shortcuts
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-xs font-mono">
                      {[
                            ["Space", "Play/Pause"],
                            ["← →", "Scratch ±1×"],
                            ["Shift ← →", "Scratch ±2×"],
                            ["↑ ↓", "Speed ±0.25×"],
                            ["R", "Toggle Reverse"],
                            ["F (hold)", "Fader Open"],
                            ["1–8", "Load Preset"],
                            ["Ctrl+Z", "Undo"],
                            ["Ctrl+Y", "Redo"],
                          ].map(([key, action]) => (
                            <div
                              key={key}
                              className="flex items-center gap-1.5"
                            >
                              <span className="px-1.5 py-0.5 bg-bg-surface border border-border-main rounded text-neutral-300 font-bold whitespace-nowrap">
                                {key}
                              </span>
                              <span className="text-neutral-500">{action}</span>
                            </div>
                          ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── EDITOR MODE ── */}
            {activeMode === "editor" && (
              <>
                {/* Editor toolbar */}
                <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <GitBranch size={14} className="text-brand" />
                      <input
                        value={patternName}
                        onChange={(e) => setPatternName(e.target.value)}
                        className="bg-bg-main border border-border-main text-neutral-200 text-xs font-bold px-2 py-1 rounded-lg outline-none focus:border-brand w-32"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-neutral-500 uppercase">
                        Grid
                      </span>
                      {(["8n", "16n", "32n"] as const).map((g) => (
                        <button
                          key={g}
                          onClick={() => setGridResolution(g)}
                          className={`px-2 py-0.5 rounded text-xs font-bold uppercase border transition-all ${
                            gridResolution === g
                              ? "bg-brand text-white border-brand"
                              : "bg-bg-main text-neutral-500 border-border-main"
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-neutral-500 uppercase">
                        Bars
                      </span>
                      <button
                        onClick={() =>
                          setPatternLengthBars((b) => Math.max(1, b - 1))
                        }
                        className="p-0.5 rounded bg-bg-main border border-border-main hover:border-neutral-500 text-neutral-400"
                      >
                        <ChevronDown size={12} />
                      </button>
                      <span className="text-[13px] font-bold text-neutral-300 w-4 text-center">
                        {patternLengthBars}
                      </span>
                      <button
                        onClick={() =>
                          setPatternLengthBars((b) => Math.min(8, b + 1))
                        }
                        className="p-0.5 rounded bg-bg-main border border-border-main hover:border-neutral-500 text-neutral-400"
                      >
                        <ChevronUp size={12} />
                      </button>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs font-mono text-neutral-500 uppercase">
                        Template
                      </span>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            loadStyleToEditor(e.target.value);
                            e.target.value = "";
                          }
                        }}
                        className="bg-bg-main border border-border-main text-xs text-neutral-400 rounded px-2 py-1 outline-none"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Load style…
                        </option>
                        {scratchStyles.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleEditorPreviewToggle}
                        className={`p-1.5 rounded-lg border transition-all ${editorPreviewPlaying ? "bg-indicator/20 text-indicator border-indicator/50" : "bg-bg-main text-neutral-400 border-border-main hover:text-white"}`}
                      >
                        <Play
                          size={13}
                          fill={editorPreviewPlaying ? "currentColor" : "none"}
                        />
                      </button>
                      <button
                        onClick={() => setEditorRecording((r) => !r)}
                        className={`p-1.5 rounded-lg border transition-all ${editorRecording ? "bg-red-600/20 text-red-400 border-red-500/50 animate-pulse" : "bg-bg-main text-neutral-400 border-border-main hover:text-red-400"}`}
                      >
                        <Circle
                          size={13}
                          fill={editorRecording ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pattern Grid */}
                <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-2">
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                    Pattern Grid — {patternLengthBars} bar
                    {patternLengthBars > 1 ? "s" : ""} @ {gridResolution}
                  </span>
                  <div className="relative overflow-x-auto">
                    <div
                      className={`relative h-14 bg-bg-main rounded-lg border overflow-hidden ${editorRecording ? "border-red-500/50 cursor-crosshair" : "border-border-main"}`}
                      style={{ minWidth: `${gridDivisions * 14}px` }}
                      onClick={handleGridRecordClick}
                    >
                      {/* Grid lines */}
                      {Array.from({ length: gridDivisions + 1 }, (_, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 w-px"
                          style={{
                            left: `${(i / gridDivisions) * 100}%`,
                            background:
                              i % (gridDivisions / totalBeats) === 0
                                ? "rgba(255,199,44,0.3)"
                                : "rgba(255,255,255,0.05)",
                          }}
                        />
                      ))}
                      {/* Beat labels */}
                      {Array.from({ length: totalBeats + 1 }, (_, i) => (
                        <div
                          key={i}
                          className="absolute top-0.5 text-[7px] font-mono text-brand/50"
                          style={{
                            left: `${(i / totalBeats) * 100}%`,
                            transform: "translateX(-50%)",
                          }}
                        >
                          {i > 0 ? i : ""}
                        </div>
                      ))}
                      {/* Events on grid */}
                      {editorEvents.map((ev) => {
                        const left = (ev.startBeat / totalBeats) * 100;
                        const width = (ev.durationBeats / totalBeats) * 100;
                        return (
                          <div
                            key={ev.id}
                            onClick={() =>
                              setSelectedEventId(
                                ev.id === selectedEventId ? null : ev.id,
                              )
                            }
                            className={`absolute top-5 h-6 rounded cursor-pointer border text-[7px] font-bold uppercase flex items-center justify-center truncate transition-all ${
                              EVENT_TYPE_COLORS[ev.type] ??
                              "bg-neutral-700 text-neutral-300 border-neutral-600"
                            } ${ev.id === selectedEventId ? "ring-1 ring-white/40" : "opacity-80 hover:opacity-100"}`}
                            style={{
                              left: `${Math.max(0, left)}%`,
                              width: `${Math.max(2, width)}%`,
                            }}
                          >
                            {ev.type.replace(/_/g, "·")}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Event List */}
                <div className="flex-1 bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3 min-h-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                      Events ({editorEvents.length})
                    </span>
                    <button
                      onClick={addEditorEvent}
                      className="flex items-center gap-1.5 px-3 py-1 bg-brand/10 text-brand text-xs font-bold uppercase rounded-lg border border-brand/30 hover:bg-brand/20 transition-all"
                    >
                      <Plus size={11} /> Add Event
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
                    {editorEvents.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() =>
                          setSelectedEventId(
                            ev.id === selectedEventId ? null : ev.id,
                          )
                        }
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                          ev.id === selectedEventId
                            ? "bg-brand/5 border-brand/40"
                            : "bg-bg-main/50 border-border-main hover:border-neutral-600"
                        }`}
                      >
                        <span
                          className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded border w-20 text-center ${EVENT_TYPE_COLORS[ev.type] ?? ""}`}
                        >
                          {ev.type.replace(/_/g, " ")}
                        </span>
                        <div className="flex items-center gap-3 flex-1 text-xs font-mono text-neutral-400">
                          <span>
                            Beat{" "}
                            <span className="text-neutral-200">
                              {ev.startBeat.toFixed(2)}
                            </span>
                          </span>
                          <span>
                            Dur{" "}
                            <span className="text-neutral-200">
                              {ev.durationBeats.toFixed(2)}
                            </span>
                          </span>
                          <span>
                            Speed{" "}
                            <span className="text-neutral-200">
                              {ev.speedMultiplier.toFixed(1)}×
                            </span>
                          </span>
                          <span>
                            Fdr{" "}
                            <span className="text-neutral-200">
                              {Math.round(ev.faderPosition * 100)}%
                            </span>
                          </span>
                        </div>
                        {ev.id === selectedEventId && (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={ev.type}
                              onChange={(e) =>
                                updateEditorEvent(ev.id, {
                                  type: e.target.value as EditorEvent["type"],
                                })
                              }
                              className="bg-bg-surface border border-border-main text-xs text-neutral-300 rounded px-1 py-0.5 outline-none"
                            >
                              {[
                                "forward",
                                "backward",
                                "fader_open",
                                "fader_close",
                                "hold",
                                "chirp",
                                "tear",
                                "stutter",
                                "one_shot",
                              ].map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              value={ev.startBeat}
                              onChange={(e) =>
                                updateEditorEvent(ev.id, {
                                  startBeat: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="w-12 bg-bg-surface border border-border-main text-xs text-neutral-300 rounded px-1 py-0.5 outline-none text-center"
                              title="Start Beat"
                            />
                            <input
                              type="number"
                              step="0.25"
                              min="0.25"
                              value={ev.durationBeats}
                              onChange={(e) =>
                                updateEditorEvent(ev.id, {
                                  durationBeats:
                                    parseFloat(e.target.value) || 0.25,
                                })
                              }
                              className="w-12 bg-bg-surface border border-border-main text-xs text-neutral-300 rounded px-1 py-0.5 outline-none text-center"
                              title="Duration Beats"
                            />
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteEditorEvent(ev.id);
                          }}
                          className="p-1 text-neutral-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                    {editorEvents.length === 0 && (
                      <div className="flex-1 flex items-center justify-center text-[13px] text-neutral-600 uppercase tracking-widest">
                        No events — add one or load a template
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── TURNTABLE MODE ── */}
            {activeMode === "turntable" && (
              <>
                {/* RPM + Pitch + Key Lock */}
                <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-4 vignette">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Disc3 size={14} className="text-brand" />
                      <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
                        Turntable Controls
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsPlaying((p) => !p)}
                        className={`px-3 py-1.5 rounded-lg text-[13px] font-bold uppercase border transition-all flex items-center gap-1.5 ${
                          isPlaying
                            ? "bg-indicator/20 text-indicator border-indicator/50"
                            : "bg-bg-main text-neutral-400 border-border-main hover:text-white"
                        }`}
                      >
                        <Play
                          size={12}
                          fill={isPlaying ? "currentColor" : "none"}
                        />{" "}
                        {isPlaying ? "Spinning" : "Stopped"}
                      </button>
                    </div>
                  </div>

                  {/* RPM selector */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-mono text-neutral-500 uppercase">
                      RPM
                    </span>
                    <div className="flex items-center gap-2">
                      {[33.3, 45, 78].map((rpm) => (
                        <button
                          key={rpm}
                          onClick={() => setVinylRpm(rpm)}
                          className={`flex-1 py-2 rounded-lg text-[13px] font-bold uppercase border transition-all ${
                            vinylRpm === rpm
                              ? "bg-brand/20 text-brand border-brand/50 shadow-lg shadow-brand/10"
                              : "bg-bg-main text-neutral-500 border-border-main hover:border-neutral-500"
                          }`}
                        >
                          {rpm}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Speed multiplier */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-neutral-500 uppercase">
                        Speed
                      </span>
                      <span className="text-xs font-bold text-brand font-mono">
                        {speedMult.toFixed(2)}×
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.25"
                      max="4"
                      step="0.05"
                      value={speedMult}
                      onChange={(e) => setSpeedMult(parseFloat(e.target.value))}
                      className="w-full h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-brand"
                    />
                    <div className="flex justify-between text-xs font-mono text-neutral-600">
                      <span>0.25×</span>
                      <button
                        onClick={() => setSpeedMult(1.0)}
                        className="text-brand hover:text-white transition-colors"
                      >
                        Reset 1×
                      </button>
                      <span>4×</span>
                    </div>
                  </div>

                  {/* Pitch slider */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-neutral-500 uppercase">
                        Pitch
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold font-mono ${pitchSemitones > 0 ? "text-indicator" : pitchSemitones < 0 ? "text-red-400" : "text-neutral-500"}`}
                        >
                          {pitchSemitones > 0 ? "+" : ""}
                          {pitchSemitones} st
                        </span>
                        <button
                          onClick={() => setKeyLock((k) => !k)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase border transition-all ${
                            keyLock
                              ? "bg-brand/20 text-brand border-brand/50"
                              : "bg-bg-main text-neutral-500 border-border-main hover:border-neutral-500"
                          }`}
                        >
                          {keyLock ? <Lock size={9} /> : <Unlock size={9} />}
                          Key Lock
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={pitchSemitones}
                      onChange={(e) =>
                        setPitchSemitones(parseInt(e.target.value))
                      }
                      className="w-full h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-brand"
                    />
                    <div className="flex justify-between text-xs font-mono text-neutral-600">
                      <span>-12 st</span>
                      <button
                        onClick={() => setPitchSemitones(0)}
                        className="text-brand hover:text-white transition-colors"
                      >
                        Center
                      </button>
                      <span>+12 st</span>
                    </div>
                  </div>
                </div>

                {/* Waveform + sample for turntable */}
                <div className="flex-1 bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3 min-h-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Music size={14} className="text-brand" />
                      <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
                        Loaded Sample
                      </span>
                    </div>
                    <select
                      value={selectedSample}
                      onChange={(e) => loadSampleToDeckA(e.target.value)}
                      className="bg-bg-main border border-border-main text-[13px] text-neutral-300 rounded-lg px-3 py-1.5 outline-none focus:border-brand"
                    >
                      {builtInSamples.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 relative rounded-lg border border-border-main bg-bg-main/50 overflow-hidden min-h-20">
                    <svg
                      className="absolute inset-0 w-full h-full"
                      preserveAspectRatio="none"
                    >
                      <g fill="var(--brand-primary)" opacity="0.7">
                        {waveformData.map((val, i) => (
                          <rect
                            key={i}
                            x={`${(i / 120) * 100}%`}
                            y={`${50 - val * 42}%`}
                            width="0.7%"
                            height={`${val * 84}%`}
                            rx="1"
                          />
                        ))}
                      </g>
                      {isPlaying && (
                        <line
                          ref={livePlayheadRef}
                          x1={`${deckAPositionRef.current}%`}
                          y1="0"
                          x2={`${deckAPositionRef.current}%`}
                          y2="100%"
                          stroke="var(--indicator)"
                          strokeWidth="2"
                          opacity="0.9"
                        />
                      )}
                    </svg>
                  </div>

                  {/* Turntable status */}
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                      <span className="text-neutral-600 uppercase">RPM</span>
                      <span className="text-brand font-bold">{vinylRpm}</span>
                    </div>
                    <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                      <span className="text-neutral-600 uppercase">Pitch</span>
                      <span
                        className={`font-bold ${pitchSemitones !== 0 ? "text-indicator" : "text-neutral-400"}`}
                      >
                        {pitchSemitones > 0 ? "+" : ""}
                        {pitchSemitones} st
                      </span>
                    </div>
                    <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                      <span className="text-neutral-600 uppercase">
                        Key Lock
                      </span>
                      <span
                        className={`font-bold ${keyLock ? "text-brand" : "text-neutral-600"}`}
                      >
                        {keyLock ? "ON" : "OFF"}
                      </span>
                    </div>
                    <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                      <span className="text-neutral-600 uppercase">Speed</span>
                      <span className="text-brand font-bold">
                        {speedMult.toFixed(2)}×
                      </span>
                    </div>
                    <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                      <span className="text-neutral-600 uppercase">
                        Platter °
                      </span>
                      <span ref={platterAngleTextRef} className="text-neutral-300 font-bold">
                        {Math.round(platAngleRef.current)}°
                      </span>
                    </div>
                    <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                      <span className="text-neutral-600 uppercase">Status</span>
                      <span
                        className={`font-bold ${isPlaying ? "text-indicator" : "text-neutral-600"}`}
                      >
                        {isPlaying ? "Playing" : "Stopped"}
                      </span>
                    </div>
                  </div>

                  {/* Send to Sample Editor */}
                  <button
                    onClick={() => onSendToSampleEditor?.()}
                    className="w-full py-2.5 bg-brand/10 hover:bg-brand/20 text-brand text-[13px] font-bold uppercase rounded-lg border border-brand/40 hover:border-brand transition-all flex items-center justify-center gap-2"
                  >
                    <Send size={13} /> Send to Sample Editor
                  </button>
                </div>
              </>
            )}

            {/* ── MINORVDJ MODE ── */}
            {activeMode === "minorvdj" && (
              <>
                {/* Dual Deck + Crossfader */}
                <div className="flex-1 flex flex-col gap-3">
                  {/* Deck row */}
                  <div className="flex gap-3">
                    {/* Deck A */}
                    <div
                      className={`flex-1 bg-bg-surface rounded-xl border p-4 flex flex-col gap-3 transition-all ${deckAPlaying ? "border-indicator/50 shadow-lg shadow-indicator/5" : "border-border-main"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${deckAPlaying ? "bg-indicator animate-pulse shadow-[0_0_6px_var(--indicator-glow)] dot-glow" : "bg-neutral-700"}`}
                          />
                          <span className="text-[13px] font-bold text-neutral-300 uppercase tracking-widest">
                            Deck A
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setDeckAPlaying((p) => !p)}
                            className={`p-1.5 rounded border transition-all ${deckAPlaying ? "bg-indicator/20 text-indicator border-indicator/50" : "bg-bg-main text-neutral-400 border-border-main hover:text-white"}`}
                          >
                            <Play
                              size={12}
                              fill={deckAPlaying ? "currentColor" : "none"}
                            />
                          </button>
                          <button
                            onClick={() => {
                              setDeckAPlaying(false);
                              setDeckACuePoint(0);
                            }}
                            className="p-1.5 rounded border bg-bg-main text-neutral-400 border-border-main hover:text-white transition-all"
                          >
                            <SkipBack size={12} />
                          </button>
                        </div>
                      </div>
                      <select
                        value={selectedSample}
                        onChange={(e) => loadSampleToDeckA(e.target.value)}
                        className="bg-bg-main border border-border-main text-[13px] text-neutral-300 rounded-lg px-2 py-1.5 outline-none focus:border-brand"
                      >
                        {builtInSamples.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {/* Mini waveform A */}
                      <div className="relative h-12 rounded-lg border border-border-main bg-bg-main/50 overflow-hidden">
                        <svg
                          className="absolute inset-0 w-full h-full"
                          preserveAspectRatio="none"
                        >
                          <g fill="var(--brand-primary)" opacity="0.7">
                            {waveformData.slice(0, 60).map((val, i) => (
                              <rect
                                key={i}
                                x={`${(i / 60) * 100}%`}
                                y={`${50 - val * 40}%`}
                                width="1.5%"
                                height={`${val * 80}%`}
                                rx="1"
                              />
                            ))}
                          </g>
                          {deckAPlaying && (
                            <line
                              ref={deckAPlayheadRef}
                              x1={`${deckAPositionRef.current}%`}
                              y1="0"
                              x2={`${deckAPositionRef.current}%`}
                              y2="100%"
                              stroke="var(--indicator)"
                              strokeWidth="2"
                              opacity="0.9"
                            />
                          )}
                          {deckACuePoint > 0 && (
                            <line
                              x1={`${deckACuePoint}%`}
                              y1="0"
                              x2={`${deckACuePoint}%`}
                              y2="100%"
                              stroke="var(--brand-primary)"
                              strokeWidth="1"
                              strokeDasharray="3 3"
                              opacity="0.6"
                            />
                          )}
                          {/* Hot Cue markers */}
                          {deckAHotCues.map(
                            (cue, idx) =>
                              cue > 0 && (
                                <line
                                  key={idx}
                                  x1={`${cue}%`}
                                  y1="0"
                                  x2={`${cue}%`}
                                  y2="100%"
                                  stroke="var(--indicator)"
                                  strokeWidth="1"
                                  opacity="0.4"
                                />
                              ),
                          )}
                          {/* Loop region */}
                          {deckALoopStart !== null && deckALoopEnd !== null && (
                            <rect
                              x={`${deckALoopStart}%`}
                              y="0"
                              width={`${deckALoopEnd - deckALoopStart}%`}
                              height="100%"
                              fill="var(--indicator)"
                              opacity="0.1"
                            />
                          )}
                        </svg>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-neutral-600 uppercase">
                          BPM
                        </span>
                        <input
                          type="number"
                          value={deckABpm}
                          onChange={(e) =>
                            setDeckABpm(parseInt(e.target.value) || 90)
                          }
                          className="w-14 bg-bg-main border border-border-main text-brand font-bold text-[13px] rounded px-1.5 py-0.5 outline-none text-center"
                        />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={deckALevel}
                          onChange={(e) =>
                            setDeckALevel(parseInt(e.target.value))
                          }
                          className="flex-1 accent-brand"
                        />
                        <span className="text-xs font-mono text-neutral-500">
                          {deckALevel}%
                        </span>
                      </div>
                      {/* EQ: Lo / Mid / Hi — Deck A */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-neutral-600 uppercase w-5">EQ</span>
                        <div className="flex flex-col items-center flex-1">
                          <span className="text-[9px] font-mono text-neutral-600">Lo</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckAEqLow}
                            onChange={(e) => setDeckAEqLow(parseInt(e.target.value))}
                            className="w-full h-1 accent-brand"
                          />
                        </div>
                        <div className="flex flex-col items-center flex-1">
                          <span className="text-[9px] font-mono text-neutral-600">Mid</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckAEqMid}
                            onChange={(e) => setDeckAEqMid(parseInt(e.target.value))}
                            className="w-full h-1 accent-brand"
                          />
                        </div>
                        <div className="flex flex-col items-center flex-1">
                          <span className="text-[9px] font-mono text-neutral-600">Hi</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckAEqHigh}
                            onChange={(e) => setDeckAEqHigh(parseInt(e.target.value))}
                            className="w-full h-1 accent-brand"
                          />
                        </div>
                      </div>
                      {/* Cue buttons */}
                      <div className="flex gap-1">
                        {[0, 25, 50, 75].map((cue) => (
                          <button
                            key={cue}
                            onClick={() => {
                              setDeckACuePoint(cue);
                              // Convert percentage to time and set cue in engine
                              const buf = deckABufferRef.current;
                              const timeSec = buf
                                ? (cue / 100) * buf.duration
                                : 0;
                              setDeckCuePoint("A", timeSec);
                              if (cue === 0) jumpToDeckCue("A", 0);
                            }}
                            className={`flex-1 py-1 text-xs font-bold rounded border transition-all ${
                              deckACuePoint === cue
                                ? "bg-brand/20 text-brand border-brand/50"
                                : "bg-bg-main text-neutral-500 border-border-main hover:border-neutral-500"
                            }`}
                          >
                            {cue > 0 ? `${cue}%` : "CUE"}
                          </button>
                        ))}
                      </div>
                      {/* Hot Cue indicators */}
                      <div className="flex gap-1">
                        {deckAHotCues.map((cue, idx) => (
                          <div
                            key={idx}
                            className={`flex-1 h-1.5 rounded-sm ${cue > 0 ? "bg-indicator" : "bg-neutral-800"}`}
                            style={{ width: `${cue}%` }}
                            title={`Hot Cue ${idx + 1}: ${Math.round(cue)}%`}
                          />
                        ))}
                      </div>
                      {/* Loop indicator */}
                      {deckALoopStart !== null && deckALoopEnd !== null && (
                        <div className="text-[7px] font-mono text-indicator uppercase text-center">
                          LOOP ACTIVE
                        </div>
                      )}
                    </div>

                    {/* Center: Crossfader + sync */}
                    <div className="w-28 flex flex-col items-center gap-3 shrink-0">
                      <div className="flex flex-col items-center gap-2 w-full">
                        <span className="text-xs font-mono text-neutral-600 uppercase">
                          X-Fader
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={faderPosition}
                          onChange={(e) =>
                            setFaderPosition(parseInt(e.target.value))
                          }
                          className="w-24 h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-brand"
                          style={{ writingMode: "horizontal-tb" }}
                        />
                        <div className="flex justify-between w-full text-[7px] font-mono text-neutral-600">
                          <span>A</span>
                          <span className="text-brand font-bold">
                            {faderPosition}%
                          </span>
                          <span>B</span>
                        </div>
                      </div>
                      <button
                        onClick={handleSync}
                        className={`w-full py-2 text-xs font-bold uppercase rounded-lg border transition-all flex items-center justify-center gap-1 ${
                          syncEnabled
                            ? "bg-indicator/20 text-indicator border-indicator/50 animate-pulse"
                            : "bg-bg-main text-neutral-400 border-border-main hover:text-white hover:border-neutral-500"
                        }`}
                      >
                        <RefreshCw size={11} /> SYNC
                      </button>
                      <button
                        onClick={() => setAutoDj((d) => !d)}
                        className={`w-full py-2 text-xs font-bold uppercase rounded-lg border transition-all ${
                          autoDj
                            ? "bg-brand/20 text-brand border-brand/50"
                            : "bg-bg-main text-neutral-400 border-border-main hover:border-neutral-500"
                        }`}
                      >
                        AUTO DJ
                      </button>
                      <div className="text-xs font-mono text-neutral-600 text-center uppercase leading-tight">
                        {autoDj ? (
                          <span className="text-brand">● Active</span>
                        ) : (
                          "Off"
                        )}
                      </div>
                      {/* Playlist cursor */}
                      {autoDj && (
                        <div className="text-[7px] font-mono text-neutral-500 text-center">
                          Track {playlistCursor + 1}/{playlist.length}
                        </div>
                      )}
                    </div>

                    {/* Deck B */}
                    <div
                      className={`flex-1 bg-bg-surface rounded-xl border p-4 flex flex-col gap-3 transition-all ${deckBPlaying ? "border-indicator/50 shadow-lg shadow-indicator/5" : "border-border-main"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${deckBPlaying ? "bg-indicator animate-pulse shadow-[0_0_6px_var(--indicator-glow)] dot-glow" : "bg-neutral-700"}`}
                          />
                          <span className="text-[13px] font-bold text-neutral-300 uppercase tracking-widest">
                            Deck B
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setDeckBPlaying((p) => !p)}
                            className={`p-1.5 rounded border transition-all ${deckBPlaying ? "bg-indicator/20 text-indicator border-indicator/50" : "bg-bg-main text-neutral-400 border-border-main hover:text-white"}`}
                          >
                            <Play
                              size={12}
                              fill={deckBPlaying ? "currentColor" : "none"}
                            />
                          </button>
                          <button
                            onClick={() => {
                              setDeckBPlaying(false);
                              setDeckBCuePoint(0);
                            }}
                            className="p-1.5 rounded border bg-bg-main text-neutral-400 border-border-main hover:text-white transition-all"
                          >
                            <SkipBack size={12} />
                          </button>
                        </div>
                      </div>
                      <select
                        value={deckBSample}
                        onChange={(e) => loadSampleToDeckB(e.target.value)}
                        className="bg-bg-main border border-border-main text-[13px] text-neutral-300 rounded-lg px-2 py-1.5 outline-none focus:border-brand"
                      >
                        {builtInSamples.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {/* Mini waveform B */}
                      <div className="relative h-12 rounded-lg border border-border-main bg-bg-main/50 overflow-hidden">
                        <svg
                          className="absolute inset-0 w-full h-full"
                          preserveAspectRatio="none"
                        >
                          <g fill="var(--brand-primary)" opacity="0.7">
                            {waveformDataB.slice(0, 60).map((val, i) => (
                              <rect
                                key={i}
                                x={`${(i / 60) * 100}%`}
                                y={`${50 - val * 40}%`}
                                width="1.5%"
                                height={`${val * 80}%`}
                                rx="1"
                              />
                            ))}
                          </g>
                          {deckBPlaying && (
                            <line
                              ref={deckBPlayheadRef}
                              x1={`${deckBPositionRef.current}%`}
                              y1="0"
                              x2={`${deckBPositionRef.current}%`}
                              y2="100%"
                              stroke="var(--indicator)"
                              strokeWidth="2"
                              opacity="0.9"
                            />
                          )}
                          {deckBCuePoint > 0 && (
                            <line
                              x1={`${deckBCuePoint}%`}
                              y1="0"
                              x2={`${deckBCuePoint}%`}
                              y2="100%"
                              stroke="var(--brand-primary)"
                              strokeWidth="1"
                              strokeDasharray="3 3"
                              opacity="0.6"
                            />
                          )}
                          {/* Hot Cue markers */}
                          {deckBHotCues.map(
                            (cue, idx) =>
                              cue > 0 && (
                                <line
                                  key={idx}
                                  x1={`${cue}%`}
                                  y1="0"
                                  x2={`${cue}%`}
                                  y2="100%"
                                  stroke="var(--indicator)"
                                  strokeWidth="1"
                                  opacity="0.4"
                                />
                              ),
                          )}
                          {/* Loop region */}
                          {deckBLoopStart !== null && deckBLoopEnd !== null && (
                            <rect
                              x={`${deckBLoopStart}%`}
                              y="0"
                              width={`${deckBLoopEnd - deckBLoopStart}%`}
                              height="100%"
                              fill="var(--indicator)"
                              opacity="0.1"
                            />
                          )}
                        </svg>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-neutral-600 uppercase">
                          BPM
                        </span>
                        <input
                          type="number"
                          value={deckBBpm}
                          onChange={(e) =>
                            setDeckBBpm(parseInt(e.target.value) || 90)
                          }
                          className="w-14 bg-bg-main border border-border-main text-brand font-bold text-[13px] rounded px-1.5 py-0.5 outline-none text-center"
                        />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={deckBLevel}
                          onChange={(e) =>
                            setDeckBLevel(parseInt(e.target.value))
                          }
                          className="flex-1 accent-brand"
                        />
                        <span className="text-xs font-mono text-neutral-500">
                          {deckBLevel}%
                        </span>
                      </div>
                      {/* EQ: Lo / Mid / Hi — Deck B */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-neutral-600 uppercase w-5">EQ</span>
                        <div className="flex flex-col items-center flex-1">
                          <span className="text-[9px] font-mono text-neutral-600">Lo</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckBEqLow}
                            onChange={(e) => setDeckBEqLow(parseInt(e.target.value))}
                            className="w-full h-1 accent-brand"
                          />
                        </div>
                        <div className="flex flex-col items-center flex-1">
                          <span className="text-[9px] font-mono text-neutral-600">Mid</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckBEqMid}
                            onChange={(e) => setDeckBEqMid(parseInt(e.target.value))}
                            className="w-full h-1 accent-brand"
                          />
                        </div>
                        <div className="flex flex-col items-center flex-1">
                          <span className="text-[9px] font-mono text-neutral-600">Hi</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={deckBEqHigh}
                            onChange={(e) => setDeckBEqHigh(parseInt(e.target.value))}
                            className="w-full h-1 accent-brand"
                          />
                        </div>
                      </div>
                      {/* Cue buttons */}
                      <div className="flex gap-1">
                        {[0, 25, 50, 75].map((cue) => (
                          <button
                            key={cue}
                            onClick={() => {
                              setDeckBCuePoint(cue);
                              const buf = deckBBufferRef.current;
                              const timeSec = buf
                                ? (cue / 100) * buf.duration
                                : 0;
                              setDeckCuePoint("B", timeSec);
                              if (cue === 0) jumpToDeckCue("B", 0);
                            }}
                            className={`flex-1 py-1 text-xs font-bold rounded border transition-all ${
                              deckBCuePoint === cue
                                ? "bg-brand/20 text-brand border-brand/50"
                                : "bg-bg-main text-neutral-500 border-border-main hover:border-neutral-500"
                            }`}
                          >
                            {cue > 0 ? `${cue}%` : "CUE"}
                          </button>
                        ))}
                      </div>
                      {/* Hot Cue indicators */}
                      <div className="flex gap-1">
                        {deckBHotCues.map((cue, idx) => (
                          <div
                            key={idx}
                            className={`flex-1 h-1.5 rounded-sm ${cue > 0 ? "bg-indicator" : "bg-neutral-800"}`}
                            style={{ width: `${cue}%` }}
                            title={`Hot Cue ${idx + 1}: ${Math.round(cue)}%`}
                          />
                        ))}
                      </div>
                      {/* Loop indicator */}
                      {deckBLoopStart !== null && deckBLoopEnd !== null && (
                        <div className="text-[7px] font-mono text-indicator uppercase text-center">
                          LOOP ACTIVE
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Deck B Effects & Vinyl Sim ── */}
                  <div className="bg-bg-surface rounded-xl border border-border-main p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Sliders size={13} className="text-brand" />
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                        Deck B FX / Vinyl
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <Knob label="Echo" value={deckBEchoWet} onChange={setDeckBEchoWet} />
                      <Knob label="Reverb" value={deckBReverbWet} onChange={setDeckBReverbWet} />
                      <Knob label="Lo-Fi" value={deckBLofiTone} onChange={setDeckBLofiTone} />
                      <Knob label="Drive" value={deckBDrive} onChange={setDeckBDrive} />
                    </div>
                    <div className="grid grid-cols-4 gap-3 mt-1">
                      <Knob label="Noise" value={deckBVinylNoise} onChange={setDeckBVinylNoise} />
                      <Knob label="Drift" value={deckBPitchDrift} onChange={setDeckBPitchDrift} />
                      <Knob label="Wear" value={deckBWear} onChange={setDeckBWear} />
                      <Knob label="Crackle" value={deckBCrackle} onChange={setDeckBCrackle} />
                    </div>
                  </div>

                  {/* Playlist queue */}
                  <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ListMusic size={13} className="text-brand" />
                        <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
                          Playlist Queue
                        </span>
                      </div>
                      <span className="text-xs font-mono text-neutral-600">
                        {playlist.length} tracks
                      </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {playlist.map((id, idx) => {
                        const sample = builtInSamples.find((s) => s.id === id);
                        const isActive = idx === playlistCursor;
                        const isNext =
                          idx === (playlistCursor + 1) % playlist.length;
                        return (
                          <div
                            key={id}
                            onClick={() => setPlaylistCursor(idx)}
                            className={`shrink-0 px-3 py-2 rounded-lg border cursor-pointer text-xs font-bold uppercase transition-all ${
                              isActive
                                ? "bg-brand/20 border-brand text-brand"
                                : isNext
                                  ? "bg-bg-main border-indicator/40 text-indicator/80"
                                  : "bg-bg-main border-border-main text-neutral-500 hover:border-neutral-500"
                            }`}
                          >
                            <div>
                              {idx + 1}. {sample?.name}
                            </div>
                            {isActive && (
                              <div className="text-[7px] text-brand/60 mt-0.5">
                                ▶ NOW
                              </div>
                            )}
                            {isNext && (
                              <div className="text-[7px] text-indicator/60 mt-0.5">
                                NEXT
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Column: Controls */}
          <div className="w-52 flex flex-col gap-4 shrink-0">
            <TurntableEmulationSection
              inertia={inertia}
              friction={friction}
              vinylNoise={vinylNoise}
              pitchDrift={pitchDrift}
              onInertiaChange={setInertia}
              onFrictionChange={setFriction}
              onNoiseChange={setVinylNoise}
              onDriftChange={setPitchDrift}
            />

            <SonicFXSection
              echoWet={echoWet}
              reverbWet={reverbWet}
              drive={drive}
              wear={wear}
              crackle={crackle}
              lofiTone={lofiTone}
              onEchoChange={setEchoWet}
              onReverbChange={setReverbWet}
              onDriveChange={setDrive}
              onWearChange={setWear}
              onCrackleChange={setCrackle}
              onLofiChange={setLofiTone}
            />

            <MiniMixerSection
              deckALevel={deckALevel}
              deckBLevel={deckBLevel}
              masterLevel={masterLevel}
              onDeckAChange={setDeckALevel}
              onDeckBChange={setDeckBLevel}
              onMasterChange={setMasterLevel}
            />

            <QuickActionsSection
              onExportClip={handleExportClip}
              onSavePreset={handleSavePreset}
              onExportMidi={handleExportMidi}
            />

            <StatusSection
              audioLatencyMs={audioLatencyMs}
              audioCpuPercent={audioCpuPercent}
              sampleRate={djEngine?.context?.sampleRate ? `${(djEngine.context.sampleRate / 1000).toFixed(1)}kHz` : "--"}
              activeMode={activeMode}
            />
          </div>
        </div>
      </div>

      {/* ── Inline notification toast ── */}
      {vspNotification && (
        <div className="fixed bottom-8 right-8 z-200 bg-neutral-900/95 border border-neutral-700 text-neutral-200 text-sm font-bold uppercase tracking-widest px-5 py-3 rounded-xl shadow-2xl animate-in slide-in-from-right-8 stripe-left relative pl-7">
          {vspNotification}
        </div>
      )}

      {/* Hidden file input for built-in sample loading */}
      <input
        ref={builtInSampleFileRef}
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.aif,.aiff,.ogg"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const deck = pendingSampleDeckRef.current;
          await resumeAudio();
          const buffer = await loadFileToDeck(deck, file);

          if (buffer) {
            // Mirror the post-load steps from the drag-and-drop handler
            if (deck === "A") {
              deckABufferRef.current = buffer;
              deckAOriginalBufferRef.current = buffer;
              setDeckABufferVersion((v) => v + 1);
              setSelectedSample(file.name.replace(/\.[^/.]+$/, ""));
            } else {
              deckBBufferRef.current = buffer;
              setDeckBBufferVersion((v) => v + 1);
              setDeckBSample(file.name.replace(/\.[^/.]+$/, ""));
            }

            // Auto-detect BPM from the loaded file
            const detected = detectBpm(buffer);
            if (detected > 0) {
              if (deck === "A") {
                setBpm(detected);
                setDeckABpm(detected);
              } else {
                setDeckBBpm(detected);
              }
              setDeckBpm(deck, detected);
            }

            showVspNotification(`Loaded "${file.name}" into Deck ${deck}`);
          }

          e.target.value = "";
        }}
      />
    </>
  );
}

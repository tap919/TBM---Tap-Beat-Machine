import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  Repeat,
  Layers,
  Music,
  Clock,
  Plus,
  Download,
  Trash2,
  Copy,
  ClipboardPaste,
  Activity,
  FileCode,
  Filter,
  Link2,
  SlidersHorizontal,
  Upload,
  CheckCircle2,
  Keyboard,
  Ban,
} from "lucide-react";

import { useTBMAudio } from "../contexts/TBMAudioContext";
import type { Pad } from "../lib/TBMAudioEngine";
import { TRACK_NAMES, STORAGE_KEYS } from "../lib/constants";
import { MPCTransport } from "./ui/MPCTransport";
import { TrackStatusBar } from "./ui/TrackStatusBar";
import type { TrackContentType } from "../lib/trackRouter";

// Default drum pattern: track index → set of active step indices (0-15)
const DEFAULT_PATTERN: Record<number, number[]> = {
  0: [0, 4, 8, 12], // Kick 808: 4-on-the-floor
  1: [2, 6, 10, 14], // Snare 1: beats 2 & 4 (× 2)
  2: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // Hat Closed: every step
};

const TRACK_COLORS: string[] = ["#FF4C4C", "#4C83FF", "#FFD700", "#00FF00"];

const TRACK_LABEL_W = "w-36"; // shared width for track label column and automation label

// Choke group colors: group 1-4
const CHOKE_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f59e0b",
  3: "#22d3ee",
  4: "#a855f7",
};

// Apply velocity curve: input 0-1 → output with curve applied + min/max bounds
function applyVelocityCurve(
  inputVelocity: number,
  curve: VelocityCurveType,
  sensitivity: number, // 0-100
  minVel: number, // 0-1
  maxVel: number, // 0-1
): number {
  if (curve === 'constant') return maxVel;
  
  // Normalize sensitivity to 0.1-1 range for the curve multiplier
  const sensitivityMult = 0.1 + (sensitivity / 100) * 0.9;
  
  let curveOutput: number;
  const scaled = inputVelocity * sensitivityMult;
  
  switch (curve) {
    case 'exponential':
      curveOutput = scaled * scaled;
      break;
    case 'logarithmic':
      curveOutput = Math.sqrt(scaled);
      break;
    case 'linear':
    default:
      curveOutput = scaled;
  }
  
  // Apply min/max bounds
  return minVel + curveOutput * (maxVel - minVel);
}

type FilterType = "off" | "lp" | "hp" | "bp";

type VelocityCurveType = 'linear' | 'exponential' | 'logarithmic' | 'constant';
type NoteRepeatDivision = '1/4' | '1/8' | '1/16' | '1/32' | '1/8T' | '1/16T';
type SixteenLevelsParam = 'Velocity' | 'Tune' | 'Pan' | 'Filter';

interface TrackSettings {
  chokeGroup: number | null; // null = no choke, 1–4
  filterType: FilterType;
  filterCutoff: number; // 0–127
  filterResonance: number; // 0–127
  swing: number; // 0 = fallback to global swing, 1–100 = per-track swing amount
  muted: boolean;
  solo: boolean;
  velocityCurve: VelocityCurveType; // how velocity translates to volume
  padSensitivity: number; // 0-100, how sensitive the pad is
  minVelocity: number; // 0-1, minimum velocity output
  maxVelocity: number; // 0-1, maximum velocity output
  timeStretch: number; // 0.5–2.0 (50%–200%)
  pitchShift: number; // -12 to +12 semitones
}

const DEFAULT_TRACK_SETTINGS: TrackSettings = {
  chokeGroup: null,
  filterType: "off",
  filterCutoff: 64,
  filterResonance: 20,
  swing: 0,
  muted: false,
  solo: false,
  velocityCurve: 'linear',
  padSensitivity: 80,
  minVelocity: 0,
  maxVelocity: 1,
  timeStretch: 1,
  pitchShift: 0,
};

// Pre-assign choke groups for open/closed hat relationship (classic behaviour)
// 64 track settings for 4 pad banks (A/B/C/D × 16 pads each)
const INITIAL_TRACK_SETTINGS: TrackSettings[] = Array.from(
  { length: 64 },
  (_, i) => ({
    ...DEFAULT_TRACK_SETTINGS,
    // Closed hat (track 2) and Open hat (track 3) in bank A share choke group 1
    chokeGroup: i === 2 || i === 3 ? 1 : null,
  }),
);

// Pad bank letter → numeric index
const PAD_BANK_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

// QWERTY → pad index mapping (4 rows × 4 keys = 16 pads)
// Layout mirrors the on-screen 4×4 grid:
//   q w e r  →  0  1  2  3
//   a s d f  →  4  5  6  7
//   z x c v  →  8  9 10 11
//   t y u i  → 12 13 14 15
const KEY_TO_PAD: Record<string, number> = {
  q: 0, w: 1, e: 2, r: 3,
  a: 4, s: 5, d: 6, f: 7,
  z: 8, x: 9, c: 10, v: 11,
  t: 12, y: 13, u: 14, i: 15,
};

// MIDI note → pad mapping: notes 36-51 (C2-D#3, GM drum range) → pads 0-15
const MIDI_PAD_BASE = 36;

// Convert DrumMachine pattern (Record<trackId, step[]>) → boolean[][] for Sequencer
function convertPattern(
  pat: Record<number, number[]>,
  stepCount: 16 | 32 | 64,
): boolean[][] {
  return Array.from({ length: 16 }, (_, trackId) => {
    const active = new Set(pat[trackId] ?? []);
    return Array.from({ length: stepCount }, (_, step) => active.has(step));
  });
}

// Quantize pattern: pull steps toward nearest grid line by strength%
function applyQuantize(
  pattern: Record<number, number[]>,
  grid: 4 | 8 | 16 | 32,
  strength: number,
  stepCount: 16 | 32 | 64,
): Record<number, number[]> {
  const gridInterval = stepCount / grid;
  if (gridInterval < 1) return pattern;

  const result: Record<number, number[]> = {};
  const trackIds = Object.keys(pattern).map(Number);

  for (const trackId of trackIds) {
    const steps = pattern[trackId];
    if (!steps || steps.length === 0) {
      result[trackId] = [];
      continue;
    }
    const newSteps = new Set<number>();
    for (const step of steps) {
      const nearestGrid = Math.round(step / gridInterval) * gridInterval;
      const clampedGrid = Math.max(0, Math.min(stepCount - 1, nearestGrid));
      const distance = clampedGrid - step;
      const move = Math.round((distance * strength) / 100);
      const newStep = Math.max(0, Math.min(stepCount - 1, step + move));
      newSteps.add(newStep);
    }
    result[trackId] = Array.from(newSteps).sort((a, b) => a - b);
  }
  return result;
}

// ── Memoized step cell to avoid re-rendering all 256 cells on any toggle ──
const StepCell = React.memo(function StepCell({
  trackId,
  step,
  isActive,
  trackColor,
  isCurrent,
  onToggle,
  stepCount,
  velocity,
  showVelocity,
}: {
  trackId: number;
  step: number;
  isActive: boolean;
  trackColor: string;
  isCurrent: boolean;
  onToggle: (trackId: number, step: number) => void;
  stepCount: 16 | 32 | 64;
  velocity?: number;
  showVelocity?: boolean;
}) {
  const handleClick = useCallback(
    () => onToggle(trackId, step),
    [onToggle, trackId, step],
  );
  const isBeat = step % 4 === 0;
  const isBar = step % 16 === 0;
  const vel = velocity ?? 1;
  return (
    <div
      className={`absolute h-full cursor-pointer transition-colors ${isCurrent ? "step-playhead" : ""}`}
      style={{
        left: `${step * (100 / stepCount)}%`,
        width: `${100 / stepCount}%`,
        backgroundColor: isActive
          ? trackColor + (isCurrent ? "60" : "40")
          : isBeat
            ? "rgba(255,255,255,0.015)"
            : undefined,
        borderLeft: isActive
          ? `1px solid ${trackColor}`
          : isBar
            ? "1px solid rgba(255,255,255,0.06)"
            : isBeat
              ? "1px solid rgba(255,255,255,0.03)"
              : undefined,
      }}
      onClick={handleClick}
    >
      {/* FL-style velocity bar at bottom */}
      {isActive && showVelocity && (
        <div
          className="absolute bottom-0 left-[1px] right-[1px] velocity-bar rounded-t-sm"
          style={{
            height: `${vel * 100}%`,
            backgroundColor: trackColor + "70",
            borderTop: `1px solid ${trackColor}`,
          }}
        />
      )}
    </div>
  );
}, (prev, next) => 
  prev.isActive === next.isActive && 
  prev.isCurrent === next.isCurrent &&
  prev.trackId === next.trackId &&
  prev.step === next.step &&
  prev.trackColor === next.trackColor &&
  prev.stepCount === next.stepCount &&
  prev.velocity === next.velocity &&
  prev.showVelocity === next.showVelocity
);

export function DrumMachine() {
  const [activeTrack, setActiveTrack] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [noteRepeat, setNoteRepeat] = useState(false);
  const [sixteenLevels, setSixteenLevels] = useState(false);
  const [preCount, setPreCount] = useState(true);
  const [globalSwing, setGlobalSwing] = useState(15);
  const [showAutomation, setShowAutomation] = useState(false);
  const [automationParam, setAutomationParam] = useState<
    "Volume" | "Pan" | "Filter Cutoff"
  >("Volume");
  // automationData: per-track 16-point lanes (0–1)
  const [automationData, setAutomationData] = useState<
    Record<number, number[]>
  >({});
  const [pattern, setPattern] =
    useState<Record<number, number[]>>(DEFAULT_PATTERN);
  const [trackSettings, setTrackSettings] = useState<TrackSettings[]>(
    INITIAL_TRACK_SETTINGS,
  );
  const [activePadBank, setActivePadBank] = useState<"A" | "B" | "C" | "D">(
    "A",
  );
  const [showTrackDetail, setShowTrackDetail] = useState(true);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [dmNotification, setDmNotification] = useState<string | null>(null);
  const [stepCount, setStepCount] = useState<16 | 32 | 64>(16);
  const [isLooping, setIsLooping] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [quantizeEnabled, setQuantizeEnabled] = useState(false);
  const [recordMode, setRecordMode] = useState<"record" | "overdub">("record");
  const [quantizeStrength, setQuantizeStrength] = useState(100);
  const [quantizeGrid, setQuantizeGrid] = useState<4 | 8 | 16 | 32>(16);
  const [noteRepeatDivision, setNoteRepeatDivision] = useState<NoteRepeatDivision>('1/16');
  const [noteRepeatCount, setNoteRepeatCount] = useState<number>(0);
  const [sixteenLevelsParam, setSixteenLevelsParam] = useState<SixteenLevelsParam>('Velocity');
  const [padMuteMode, setPadMuteMode] = useState(false);
  const [mutedPads, setMutedPads] = useState<Set<number>>(new Set());

  // ── FL / MPC nuance state ──
  const [activePatternSlot, setActivePatternSlot] = useState(1); // 1-8 pattern slots (FL-style)
  const [patternBank, setPatternBank] = useState<Record<number, Record<number, number[]>>>({ 1: DEFAULT_PATTERN }); // slot → pattern
  const [velocityMap, setVelocityMap] = useState<Record<number, Record<number, number>>>({}); // track → step → velocity (0-1)
  const [showVelocity, setShowVelocity] = useState(false); // FL graph editor mode
  const [triggeredPads, setTriggeredPads] = useState<Set<number>>(new Set()); // pads currently flashing
  const [heldPads, setHeldPads] = useState<Set<number>>(new Set()); // pads currently held down
  const [keyboardMode, setKeyboardMode] = useState(false); // QWERTY → pad trigger mode

  // Shared audio engine from context
  const {
    engine,
    sequencer,
    pads: enginePads,
    triggerPad: ctxTriggerPad,
    loadSampleToPad,
    resumeAudio,
    updatePad: ctxUpdatePad,
    setSequencerMuteState,
    midiAccess,
    bpm,
    trackRouter,
  } = useTBMAudio();

  // Hidden file input ref for sample loading
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPadIndexRef = useRef<number>(-1);

  // XPM / SXQ file inputs
  const xpmInputRef = useRef<HTMLInputElement>(null);
  const sxqInputRef = useRef<HTMLInputElement>(null);
  const sxqSeqInputRef = useRef<HTMLInputElement>(null); // in sequencer header

  // Copy / Note-repeat refs
  const copiedPatternRef = useRef<Record<number, number[]> | null>(null);
  const copiedVelocityRef = useRef<Record<number, Record<number, number>> | null>(null);
  const [hasCopiedPattern, setHasCopiedPattern] = useState(false);
  const noteRepeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const noteRepeatPadRef = useRef<number>(-1);
  const copiedNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const dmNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fix 1.2 🟡: store pre-count timer so it can be cancelled on unmount
  const preCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stem import file input
  const stemImportRef = useRef<HTMLInputElement>(null);

  // ── Auto-register in TrackRouter (mixer channel) ────────────────────────
  const drumSlotIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (!trackRouter || !engine) return;
    const SOURCE_ID = 'drum-machine';
    const TYPE: TrackContentType = 'drums';

    // Idempotency: don't double-register
    const existing = trackRouter.getByType(TYPE);
    if (existing.length > 0) {
      drumSlotIndexRef.current = existing[0].index;
    } else {
      const slot = trackRouter.assignToNextFree(TYPE, SOURCE_ID, 'Drum Machine');
      if (slot) drumSlotIndexRef.current = slot.index;
    }

    // Route engine output → slot input (instead of masterBus)
    const slotInput = trackRouter.getSlotInput(drumSlotIndexRef.current);
    if (slotInput) {
      engine.rerouteOutput(slotInput);
    }

    return () => {
      // Restore engine routing to masterBus on unmount
      const masterBus = trackRouter.getMasterBus();
      if (masterBus) {
        engine.rerouteOutput(masterBus);
      }
      trackRouter.releaseBySource(SOURCE_ID);
      drumSlotIndexRef.current = -1;
    };
  }, [trackRouter, engine]);

  // Notification function
  const showDmNotification = useCallback((msg: string) => {
    if (dmNotifTimerRef.current !== null) clearTimeout(dmNotifTimerRef.current);
    setDmNotification(msg);
    dmNotifTimerRef.current = setTimeout(() => {
      setDmNotification(null);
      dmNotifTimerRef.current = null;
    }, 4000);
  }, []);

  // Refs for recording — track current step without stale closure issues
  const currentStepRef = useRef(-1);
  const isRecordingRef = useRef(false);
  const recordModeRef = useRef<"record" | "overdub">("record");
  
  // Update refs in useEffect to avoid React render violations
  useEffect(() => {
    isRecordingRef.current = isRecording;
    currentStepRef.current = currentStep;
    recordModeRef.current = recordMode;
  }, [isRecording, currentStep, recordMode]);

  // Memoize pattern conversion
  const sequencerPattern = useMemo(
    () => convertPattern(pattern, stepCount),
    [pattern, stepCount]
  );

  // Sync pattern changes to sequencer
  useEffect(() => {
    sequencer?.setPattern("main", sequencerPattern);
  }, [sequencerPattern, sequencer]);

  // Sync swing changes to sequencer
  useEffect(() => {
    sequencer?.setSwing(globalSwing);
  }, [globalSwing, sequencer]);

  // ── Sync mute/solo state from trackSettings + mutedPads → Sequencer ──
  useEffect(() => {
    const muteMap = trackSettings.map((ts, i) => ts.muted || mutedPads.has(i));
    const soloSet = new Set<number>();
    trackSettings.forEach((ts, i) => {
      if (ts.solo) soloSet.add(i);
    });
    setSequencerMuteState(muteMap, soloSet);
  }, [trackSettings, setSequencerMuteState, mutedPads]);

  // ── Sync choke groups + filter settings from trackSettings → Pad state ──
  useEffect(() => {
    trackSettings.forEach((ts, i) => {
      ctxUpdatePad(i, {
        chokeGroup: ts.chokeGroup,
        filterType: ts.filterType,
        filterCutoff: ts.filterCutoff,
        filterResonance: ts.filterResonance,
        swing: ts.swing,
        timeStretch: ts.timeStretch,
        pitchShift: ts.pitchShift,
      });
    });
  }, [trackSettings, ctxUpdatePad]);

  // Refs for automation data so the onStep callback always reads current values
  const automationDataRef = useRef(automationData);
  const automationParamRef = useRef(automationParam);
  
  // Update automation refs in useEffect
  useEffect(() => {
    automationDataRef.current = automationData;
    automationParamRef.current = automationParam;
  }, [automationData, automationParam]);

  const handlePlay = useCallback(() => {
    resumeAudio();
    if (sequencer) {
      sequencer.setOnStep((step) => {
        setCurrentStep(step);
        // Apply automation lane values to engine at each step (read from refs to avoid stale closure)
        if (engine) {
          const curAutomation = automationDataRef.current;
          const curParam = automationParamRef.current;
          for (let t = 0; t < 16; t++) {
            const lane = curAutomation[t];
            if (!lane || lane.length === 0) continue;
            const val = lane[step] ?? 0;
            // Apply automation to ALL tracks that have lane data (not just activeTrack)
            if (curParam === "Volume") engine.setPadVolume?.(t, val);
            else if (curParam === "Pan") engine.setPadPan?.(t, val * 2 - 1);
            else if (curParam === "Filter Cutoff")
              engine.setPadFilterCutoff?.(t, val * 127);
          }
        }
      });

      if (preCount && isRecordingRef.current) {
        // Pre-count: wait one bar (16 steps) before activating recording
        const stepMs = 60000 / bpm / 4;
        const preCountMs = 16 * stepMs;
        setIsRecording(false);
        sequencer.play();
        setIsPlaying(true);
        // Fix 1.2 🟡: store handle so it can be cancelled on unmount
        if (preCountTimerRef.current !== null) clearTimeout(preCountTimerRef.current);
        preCountTimerRef.current = setTimeout(() => {
          preCountTimerRef.current = null;
          setIsRecording(true);
        }, preCountMs);
      } else {
        sequencer.play();
        setIsPlaying(true);
      }
    }
  }, [sequencer, engine, resumeAudio, preCount, bpm]);

  const handleStop = useCallback(() => {
    sequencer?.stop();
    setIsPlaying(false);
    setCurrentStep(-1);
    setIsRecording(false);
  }, [sequencer]);

  // ── Note Repeat: while held, fire interval triggers ──
  function getNoteRepeatIntervalMs(bpm: number, division: NoteRepeatDivision): number {
    const base = 60000 / bpm;
    switch (division) {
      case '1/4': return base;
      case '1/8': return base / 2;
      case '1/16': return base / 4;
      case '1/32': return base / 8;
      case '1/8T': return base / 3;
      case '1/16T': return base / 6;
    }
  }

  const startNoteRepeat = useCallback(
    (trackId: number) => {
      if (!noteRepeat || !engine) return;
      if (noteRepeatIntervalRef.current)
        clearInterval(noteRepeatIntervalRef.current);
      noteRepeatPadRef.current = trackId;
      const intervalMs = getNoteRepeatIntervalMs(bpm, noteRepeatDivision);
      let repeatCount = 0;
      const maxRepeats = noteRepeatCount;
      noteRepeatIntervalRef.current = setInterval(() => {
        if (maxRepeats > 0 && repeatCount >= maxRepeats) {
          if (noteRepeatIntervalRef.current) {
            clearInterval(noteRepeatIntervalRef.current);
            noteRepeatIntervalRef.current = null;
          }
          return;
        }
        repeatCount++;
        const padTrackId = noteRepeatPadRef.current;
        const pad = enginePads[padTrackId];
        if (pad) {
          let repeatVelocity = 1;
          let modifiedPad: Pad = pad;

          if (sixteenLevels) {
            const localPadIndex = padTrackId % 16;
            const level = localPadIndex + 1;
            switch (sixteenLevelsParam) {
              case 'Velocity':
                repeatVelocity = level / 16;
                break;
              case 'Tune':
                modifiedPad = { ...pad, pitch: -12 + (level - 1) * (24 / 15) };
                break;
              case 'Pan': {
                const panVal = -1 + (level - 1) * (2 / 15);
                modifiedPad = { ...pad, pan: panVal };
                break;
              }
              case 'Filter': {
                const cutoff = Math.round((level - 1) * (127 / 15));
                modifiedPad = { ...pad, filterCutoff: cutoff };
                break;
              }
            }
          }

          ctxTriggerPad(modifiedPad, repeatVelocity);
          setTriggeredPads((prev) => new Set(prev).add(padTrackId));
          setTimeout(() => setTriggeredPads((prev) => { const next = new Set(prev); next.delete(padTrackId); return next; }), 60);
        }
      }, intervalMs);
    },
    [noteRepeat, engine, bpm, noteRepeatDivision, noteRepeatCount, enginePads, ctxTriggerPad, sixteenLevels, sixteenLevelsParam],
  );

  const stopNoteRepeat = useCallback(() => {
    if (noteRepeatIntervalRef.current) {
      clearInterval(noteRepeatIntervalRef.current);
      noteRepeatIntervalRef.current = null;
    }
  }, []);

  // ── MPC pad release: clear held state ──
  const handlePadRelease = useCallback((trackId: number) => {
    stopNoteRepeat();
    setHeldPads((prev) => { const next = new Set(prev); next.delete(trackId); return next; });
  }, [stopNoteRepeat]);

  const handlePadTrigger = useCallback(
    (trackId: number, event?: React.MouseEvent) => {
      setActiveTrack(trackId);

      // ── Pad Mute Mode: toggle mute, don't trigger sound ──
      if (padMuteMode) {
        setMutedPads((prev) => {
          const next = new Set(prev);
          if (next.has(trackId)) {
            next.delete(trackId);
          } else {
            next.add(trackId);
          }
          return next;
        });
        return;
      }

      const pad = enginePads[trackId];
      const trackSet = trackSettings[trackId];
      if (pad && trackSet) {
        let velocity = 1;
        let modifiedPad: Pad = pad;

        // ── 16 Levels: map pad index to parameter level ──
        if (sixteenLevels) {
          const localPadIndex = trackId % 16;
          const level = localPadIndex + 1;

          switch (sixteenLevelsParam) {
            case 'Velocity':
              velocity = level / 16;
              break;
            case 'Tune':
              modifiedPad = { ...pad, pitch: -12 + (level - 1) * (24 / 15) };
              break;
            case 'Pan': {
              const panVal = -1 + (level - 1) * (2 / 15);
              modifiedPad = { ...pad, pan: panVal };
              break;
            }
            case 'Filter': {
              const cutoff = Math.round((level - 1) * (127 / 15));
              modifiedPad = { ...pad, filterCutoff: cutoff };
              break;
            }
          }
        }

        // Apply velocity curve unless 16 Levels Velocity overrode it
        if (!(sixteenLevels && sixteenLevelsParam === 'Velocity')) {
          velocity = applyVelocityCurve(
            velocity,
            trackSet.velocityCurve,
            trackSet.padSensitivity,
            trackSet.minVelocity,
            trackSet.maxVelocity,
          );
        }

        ctxTriggerPad(modifiedPad, velocity);

        // MPC flash + held glow
        setTriggeredPads((prev) => new Set(prev).add(trackId));
        setHeldPads((prev) => new Set(prev).add(trackId));
        setTimeout(() => setTriggeredPads((prev) => { const next = new Set(prev); next.delete(trackId); return next; }), 180);

        // Note repeat: start interval
        if (noteRepeat) startNoteRepeat(trackId);

        // Recording: add step to pattern + store velocity
        if (isRecordingRef.current && currentStepRef.current >= 0) {
          const step = currentStepRef.current;
          if (recordModeRef.current === "record") {
            setPattern((prev) => {
              const current = prev[trackId] ?? [];
              const filtered = current.filter((s) => s !== step);
              return { ...prev, [trackId]: [...filtered, step] };
            });
          } else {
            setPattern((prev) => {
              const current = prev[trackId] ?? [];
              if (current.includes(step)) return prev;
              return { ...prev, [trackId]: [...current, step] };
            });
          }
          setVelocityMap((prev) => {
            const lane = prev[trackId] ? { ...prev[trackId] } : {};
            lane[step] = velocity;
            return { ...prev, [trackId]: lane };
          });
        }
      }
    },
    [enginePads, ctxTriggerPad, sixteenLevels, sixteenLevelsParam, noteRepeat, startNoteRepeat, engine, padMuteMode],
  );

  // Handle file selection for sample loading
  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || pendingPadIndexRef.current < 0) return;
      loadSampleToPad(pendingPadIndexRef.current, file);
      pendingPadIndexRef.current = -1;
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [loadSampleToPad],
  );

  const openSampleLoader = useCallback((padIndex: number) => {
    pendingPadIndexRef.current = padIndex;
    fileInputRef.current?.click();
  }, []);

  // ── XPM: parse XML <SampleFile> entries and load into sequential pads ──
  const handleXpmFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !engine) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "application/xml");
        const sampleNodes = Array.from(doc.querySelectorAll("SampleFile"));
        const samplePaths: string[] = [];
        sampleNodes.forEach((node) => {
          const path =
            node.textContent?.trim() ?? node.getAttribute("path") ?? "";
          if (!path) return;
          samplePaths.push(path);
        });

        if (samplePaths.length > 0) {
          // Show user-friendly notification about how to load samples
          const sampleList = samplePaths
            .slice(0, 3)
            .map((p, i) => `${i + 1}. ${p.split(/[\\/]/).pop()}`)
            .join(", ");
          const moreText =
            samplePaths.length > 3 ? ` and ${samplePaths.length - 3} more` : "";
          showDmNotification(
            `XPM: ${samplePaths.length} samples found (${sampleList}${moreText}) - Drag files to pads`,
          );
        }
      };
      reader.readAsText(file);
    },
    [engine, showDmNotification],
  );

  // ── SXQ: parse JSON pattern and apply to sequencer ──
  const handleSxqFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !sequencer) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string) as {
            pattern?: boolean[][];
          };
          if (Array.isArray(data.pattern) && data.pattern.length > 0) {
            sequencer.setPattern("main", data.pattern);
            // Rebuild local pattern state from boolean[][]
            const newPat: Record<number, number[]> = {};
            data.pattern.forEach((row, t) => {
              newPat[t] = row.reduce<number[]>((acc, on, s) => {
                if (on) acc.push(s);
                return acc;
              }, []);
            });
            setPattern(newPat);
          }
        } catch {
          /* ignore malformed SXQ */
        }
      };
      reader.readAsText(file);
    },
    [sequencer],
  );

  // ── Apply Quantize to current pattern ──
  const handleQuantize = useCallback(() => {
    if (quantizeStrength <= 0) return;
    const quantized = applyQuantize(pattern, quantizeGrid, quantizeStrength, stepCount);
    setPattern(quantized);
    sequencer?.setPattern("main", convertPattern(quantized, stepCount));
    showDmNotification(`Quantized (${quantizeGrid === 4 ? '1/4' : '1/' + quantizeGrid}, ${quantizeStrength}%)`);
  }, [pattern, quantizeGrid, quantizeStrength, stepCount, sequencer, showDmNotification]);

  // ── Import Last Chop from localStorage ──
  const handleImportLastChop = useCallback(() => {
    if (!engine) return;
    const b64 = localStorage.getItem(STORAGE_KEYS.LAST_CHOP);
    if (!b64) return;
    try {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/wav" });
      const file = new File([blob], "last_chop.wav", { type: "audio/wav" });
      loadSampleToPad(0, file);
    } catch {
      /* corrupt chop data */
    }
  }, [engine, loadSampleToPad]);

  // ── Import Stem Program: JSON file with WAV URLs ──
  const handleStemProgramFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string) as {
            stems?: { url: string; name?: string }[];
          };
          if (!Array.isArray(data.stems)) return;
          for (let i = 0; i < Math.min(data.stems.length, 16); i++) {
            const { url, name } = data.stems[i];
            const res = await fetch(url);
            const buf = await res.arrayBuffer();
            const blob = new Blob([buf], { type: "audio/wav" });
            const f = new File([blob], name ?? `stem_${i}.wav`, {
              type: "audio/wav",
            });
            loadSampleToPad(i, f);
          }
        } catch {
          /* ignore */
        }
      };
      reader.readAsText(file);
    },
    [loadSampleToPad],
  );

  // ── Copy pattern (with velocity) ──
  const handleCopyPattern = useCallback(() => {
    copiedPatternRef.current = JSON.parse(JSON.stringify(pattern));
    copiedVelocityRef.current = JSON.parse(JSON.stringify(velocityMap));
    setHasCopiedPattern(true);
    if (copiedNotifTimerRef.current) clearTimeout(copiedNotifTimerRef.current);
    setCopiedNotification(true);
    copiedNotifTimerRef.current = setTimeout(
      () => setCopiedNotification(false),
      1500,
    );
  }, [pattern, velocityMap]);

  // ── Paste pattern ──
  const handlePastePattern = useCallback(() => {
    if (!copiedPatternRef.current) {
      showDmNotification("No pattern copied — use Copy first");
      return;
    }
    const pasted: Record<number, number[]> = JSON.parse(JSON.stringify(copiedPatternRef.current));
    setPattern(pasted);
    sequencer?.setPattern("main", convertPattern(pasted, stepCount));
    // Restore velocity data if it was copied
    if (copiedVelocityRef.current) {
      setVelocityMap(JSON.parse(JSON.stringify(copiedVelocityRef.current)));
    }
    setHasCopiedPattern(false);
    showDmNotification("Pattern pasted");
  }, [sequencer, stepCount, showDmNotification]);

  // ── Trash pattern ──
  const handleTrashPattern = useCallback(() => {
    const empty: Record<number, number[]> = {};
    setPattern(empty);
    sequencer?.setPattern("main", convertPattern(empty, stepCount));
  }, [sequencer, stepCount]);

  // ── FL-style pattern slot switching ──
  const handlePatternSlotChange = useCallback((slot: number) => {
    // Save current pattern into current slot
    setPatternBank((prev) => ({ ...prev, [activePatternSlot]: { ...pattern } }));
    // Load new slot (or empty if nothing saved there yet)
    const loaded = patternBank[slot] ?? {};
    setPattern(loaded);
    sequencer?.setPattern("main", convertPattern(loaded, stepCount));
    setActivePatternSlot(slot);
  }, [activePatternSlot, pattern, patternBank, sequencer, stepCount]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      stopNoteRepeat();
      if (copiedNotifTimerRef.current)
        clearTimeout(copiedNotifTimerRef.current);
      // Fix 1.1 🔴: clear dmNotifTimerRef to prevent setState on unmounted component
      if (dmNotifTimerRef.current)
        clearTimeout(dmNotifTimerRef.current);
      // Fix 1.2 🟡: cancel pending pre-count recording activation
      if (preCountTimerRef.current)
        clearTimeout(preCountTimerRef.current);
    },
    [stopNoteRepeat],
  );

  // ── QWERTY keyboard → pad trigger (Enhancement 4) ──
  // Use refs to avoid stale closures in the keydown/keyup listeners
  const handlePadTriggerRef = useRef(handlePadTrigger);
  const handlePadReleaseRef = useRef(handlePadRelease);
  const kbPadsRef = useRef<{ trackId: number }[]>([]);
  const keyboardModeRef = useRef(keyboardMode);
  useEffect(() => {
    handlePadTriggerRef.current = handlePadTrigger;
    handlePadReleaseRef.current = handlePadRelease;
    keyboardModeRef.current = keyboardMode;
  }, [handlePadTrigger, handlePadRelease, keyboardMode]);

  // Track which keys are currently held to prevent key-repeat firing
  const heldKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!keyboardModeRef.current) return;
      // Skip if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return;
      // Skip if modifier keys are held (let App.tsx handle Ctrl combos)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const padIndex = KEY_TO_PAD[e.key.toLowerCase()];
      if (padIndex === undefined) return;

      // Prevent key repeat from re-triggering
      if (heldKeysRef.current.has(e.key.toLowerCase())) return;
      heldKeysRef.current.add(e.key.toLowerCase());

      e.preventDefault();
      e.stopPropagation();
      const padInfo = kbPadsRef.current[padIndex];
      if (padInfo) {
        handlePadTriggerRef.current(padInfo.trackId);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!keyboardModeRef.current) return;
      const key = e.key.toLowerCase();
      heldKeysRef.current.delete(key);
      const padIndex = KEY_TO_PAD[key];
      if (padIndex === undefined) return;
      const padInfo = kbPadsRef.current[padIndex];
      if (padInfo) {
        handlePadReleaseRef.current(padInfo.trackId);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true); // capture phase to intercept before App.tsx
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, []);

  // ── MIDI input → pad trigger (Enhancement 5) ──
  useEffect(() => {
    if (!midiAccess) return;

    const handleMidiMessage = (e: Event) => {
      const midiEvent = e as MIDIMessageEvent;
      const data = midiEvent.data;
      if (!data || data.length < 3) return;

      const status = data[0] & 0xf0;
      const note = data[1];
      const velocity = data[2];

      // Map MIDI note to pad index (36=C2 → pad 0, 37 → pad 1, ... 51 → pad 15)
      const padIndex = note - MIDI_PAD_BASE;
      if (padIndex < 0 || padIndex > 15) return;

      // Resolve to bank-aware track ID via kbPadsRef (shared with keyboard handler)
      const padInfo = kbPadsRef.current[padIndex];
      if (!padInfo) return;

      if (status === 0x90 && velocity > 0) {
        // Note On — trigger pad with normalized velocity
        const normalizedVelocity = velocity / 127;
        handlePadTriggerRef.current(padInfo.trackId);
        // Also trigger audio with correct velocity (apply velocity curve)
        const pad = enginePads[padInfo.trackId];
        const trackSet = trackSettings[padInfo.trackId];
        if (pad && trackSet) {
          const curvedVelocity = applyVelocityCurve(
            normalizedVelocity,
            trackSet.velocityCurve,
            trackSet.padSensitivity,
            trackSet.minVelocity,
            trackSet.maxVelocity,
          );
          ctxTriggerPad(pad, curvedVelocity);
        }
      } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
        // Note Off — release pad
        handlePadReleaseRef.current(padInfo.trackId);
      }
    };

    // Attach to all MIDI inputs
    const inputs: MIDIInput[] = [];
    midiAccess.inputs.forEach((input) => {
      input.addEventListener("midimessage", handleMidiMessage);
      inputs.push(input);
    });

    // Listen for hot-plug
    const handleStateChange = () => {
      // Re-attach to any new inputs
      midiAccess.inputs.forEach((input) => {
        input.removeEventListener("midimessage", handleMidiMessage);
        input.addEventListener("midimessage", handleMidiMessage);
      });
    };
    midiAccess.addEventListener("statechange", handleStateChange);

    return () => {
      inputs.forEach((input) => {
        input.removeEventListener("midimessage", handleMidiMessage);
      });
      midiAccess.removeEventListener("statechange", handleStateChange);
    };
  }, [midiAccess, enginePads, ctxTriggerPad]);

  // ── Automation drag handler ──
  const handleAutomationPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons !== 1) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const xNorm = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      const yNorm = Math.max(
        0,
        Math.min(1, (e.clientY - rect.top) / rect.height),
      );
      const stepIdx = Math.floor(xNorm * stepCount);
      const val = 1 - yNorm; // top = loud
      setAutomationData((prev) => {
        const lane = prev[activeTrack]
          ? [...prev[activeTrack]]
          : Array(stepCount).fill(0.5);
        lane[stepIdx] = val;
        return { ...prev, [activeTrack]: lane };
      });
    },
    [activeTrack, stepCount],
  );

  const toggleStep = useCallback((trackId: number, step: number) => {
    setPattern((prev) => {
      const current = prev[trackId] ?? [];
      const next = current.includes(step)
        ? current.filter((s) => s !== step)
        : [...current, step];
      return { ...prev, [trackId]: next };
    });
  }, []);

  const updateTrack = useCallback(
    (trackId: number, patch: Partial<TrackSettings>) => {
      setTrackSettings((prev) =>
        prev.map((t, i) => (i === trackId ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const pads = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        // Make pad → track mapping bank-aware: each bank exposes a different set of 16 tracks
        const bankIndex = PAD_BANK_INDEX[activePadBank] ?? 0;
        const globalTrackIndex = bankIndex * 16 + i;
        const settings = trackSettings[globalTrackIndex];
        const chokeColor =
          settings &&
          settings.chokeGroup !== null &&
          settings.chokeGroup !== undefined
            ? CHOKE_COLORS[settings.chokeGroup]
            : null;
        return {
          id: i,
          trackId: globalTrackIndex,
          label: TRACK_NAMES[globalTrackIndex] ?? `Pad ${globalTrackIndex + 1}`,
          color:
            i < 4
              ? "#FF4C4C"
              : i < 8
                ? "#4C83FF"
                : i < 12
                  ? "#FFD700"
                  : "#00FF00",
          chokeColor,
          chokeGroup: settings?.chokeGroup ?? null,
          filterType: settings?.filterType,
        };
      }),
    [activePadBank, trackSettings],
  );

  const tracks = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        name: TRACK_NAMES[i] ?? `Track ${i + 1}`,
        settings: trackSettings[i],
      })),
    [trackSettings],
  );

  const activeSettings = trackSettings[activeTrack];

  // Sync kbPadsRef for keyboard handler (pads is declared above via useMemo)
  useEffect(() => {
    kbPadsRef.current = pads;
  }, [pads]);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelected} />
      <input ref={xpmInputRef} type="file" accept=".xpm,.xml" className="hidden" onChange={handleXpmFile} />
      <input ref={sxqInputRef} type="file" accept=".sxq,.json" className="hidden" onChange={handleSxqFile} />
      <input ref={sxqSeqInputRef} type="file" accept=".sxq,.json" className="hidden" onChange={handleSxqFile} />
      <input ref={stemImportRef} type="file" accept=".json" className="hidden" onChange={handleStemProgramFile} />

      {/* ── MPC-Style Transport ── */}
      <MPCTransport
        isPlaying={isPlaying}
        isRecording={isRecording}
        isLooping={isLooping}
        bpm={bpm}
        currentStep={currentStep}
        totalSteps={stepCount}
        onPlay={handlePlay}
        onStop={handleStop}
        onRecord={() => setIsRecording(!isRecording)}
        onLoopToggle={() => setIsLooping(!isLooping)}
        onTapTempo={() => console.log("Tap tempo tapped")}
        onMetronomeToggle={() => setMetronomeEnabled(!metronomeEnabled)}
        onQuantize={() => setQuantizeEnabled(!quantizeEnabled)}
        metronomeEnabled={metronomeEnabled}
        quantizeEnabled={quantizeEnabled}
      />

      {/* ── Recording Indicator ── */}
      {isRecording && (
        <div className="flex items-center gap-2 px-3 py-1 bg-red-600/10 border border-red-500/30 rounded">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
          <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">
            {recordMode === "record" ? "Recording" : "Overdubbing"}
          </span>
          {recordMode === "overdub" && (
            <span className="text-[10px] font-mono text-amber-400/70 ml-1">(layering hits)</span>
          )}
        </div>
      )}

      {/* ── Track Channel Status ── */}
      <TrackStatusBar compact />

      {/* ── Quick Actions Bar ── */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPreCount(!preCount)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${
              preCount
                ? "bg-blue-600/20 text-blue-400 border-blue-500/50"
                : "bg-neutral-800 text-neutral-500 border-neutral-700"
            }`}
          >
            <Clock size={12} /> Pre-Count
          </button>

          {/* Record Mode: Record / Overdub */}
          <div className="flex items-center gap-1 bg-neutral-800 rounded border border-neutral-700 p-0.5">
            <button
              onClick={() => setRecordMode("record")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold uppercase transition-all ${
                recordMode === "record"
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              Record
            </button>
            <button
              onClick={() => setRecordMode("overdub")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold uppercase transition-all ${
                recordMode === "overdub"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              Overdub
            </button>
          </div>

          {/* Global Swing */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-neutral-600 uppercase">Swing</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={globalSwing}
              aria-label="Global Swing"
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n)) setGlobalSwing(n);
              }}
              className="w-24 h-1 bg-neutral-800 appearance-none accent-red-500"
            />
            <span className="text-[13px] font-mono text-neutral-400 min-w-10">{globalSwing}%</span>
          </div>

          {/* Quantize Controls */}
          <div className="flex items-center gap-2 border-l border-neutral-800 pl-3">
            <button
              onClick={handleQuantize}
              disabled={quantizeStrength <= 0}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-bold uppercase bg-cyan-600/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-600/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Activity size={11} /> Quantize
            </button>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-neutral-600">Str</span>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={quantizeStrength}
                onChange={(e) => setQuantizeStrength(parseInt(e.target.value, 10))}
                className="w-16 h-1 bg-neutral-800 appearance-none accent-cyan-500"
              />
              <span className="text-[11px] font-mono text-neutral-400 w-6">{quantizeStrength}</span>
            </div>
            <div className="flex bg-neutral-800 rounded p-0.5 border border-neutral-700">
              {([4, 8, 16, 32] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setQuantizeGrid(g)}
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all ${
                    quantizeGrid === g
                      ? "bg-cyan-600 text-white"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  1/{g}
                </button>
              ))}
            </div>
          </div>

          {/* Note Repeat */}
          <button
            onClick={() => setNoteRepeat(!noteRepeat)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${
              noteRepeat
                ? "bg-purple-600/20 text-purple-400 border-purple-500/50"
                : "bg-neutral-800 text-neutral-500 border-neutral-700"
            }`}
          >
            <Repeat size={12} /> Note Repeat
          </button>
          {noteRepeat && (
            <>
              <select
                value={noteRepeatDivision}
                onChange={(e) => setNoteRepeatDivision(e.target.value as NoteRepeatDivision)}
                className="bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 rounded px-1 py-1.5"
              >
                <option value="1/4">1/4</option>
                <option value="1/8">1/8</option>
                <option value="1/16">1/16</option>
                <option value="1/32">1/32</option>
                <option value="1/8T">1/8T</option>
                <option value="1/16T">1/16T</option>
              </select>
              <select
                value={noteRepeatCount}
                onChange={(e) => setNoteRepeatCount(Number(e.target.value))}
                className="bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 rounded px-1 py-1.5"
              >
                <option value={0}>Hold</option>
                <option value={4}>4</option>
                <option value={8}>8</option>
                <option value={16}>16</option>
              </select>
            </>
          )}

          {/* 16 Levels */}
          <button
            onClick={() => setSixteenLevels(!sixteenLevels)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${
              sixteenLevels
                ? "bg-orange-600/20 text-orange-400 border-orange-500/50"
                : "bg-neutral-800 text-neutral-500 border-neutral-700"
            }`}
          >
            <Layers size={12} /> 16 Levels
          </button>
          {sixteenLevels && (
            <select
              value={sixteenLevelsParam}
              onChange={(e) => setSixteenLevelsParam(e.target.value as SixteenLevelsParam)}
              className="bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 rounded px-1 py-1.5"
            >
              <option value="Velocity">Vel</option>
              <option value="Tune">Tune</option>
              <option value="Pan">Pan</option>
              <option value="Filter">Filter</option>
            </select>
          )}

          {/* Pad Mute Mode */}
          <button
            onClick={() => setPadMuteMode(!padMuteMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${
              padMuteMode
                ? "bg-red-600/20 text-red-400 border-red-500/50"
                : "bg-neutral-800 text-neutral-500 border-neutral-700"
            }`}
          >
            <Ban size={12} /> Mute
          </button>

          {/* Keyboard Mode */}
          <button
            onClick={() => setKeyboardMode(!keyboardMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${
              keyboardMode
                ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/50"
                : "bg-neutral-800 text-neutral-500 border-neutral-700"
            }`}
            title="QWERTY → Pads (Q/W/E/R, A/S/D/F, Z/X/C/V, T/Y/U/I)"
          >
            <Keyboard size={12} /> Keys
          </button>

          {/* Step Count */}
          <div className="flex items-center gap-1">
            {([16, 32, 64] as const).map((sc) => (
              <button
                key={sc}
                onClick={() => setStepCount(sc)}
                className={`px-2 py-1 text-[11px] font-bold border rounded ${
                  stepCount === sc
                    ? "bg-brand border-brand text-white"
                    : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                }`}
              >
                {sc}
              </button>
            ))}
          </div>
        </div>

        {/* Right side: pattern actions + load */}
        <div className="flex gap-2">
          <button onClick={handleCopyPattern} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded text-xs font-bold uppercase transition-colors border border-neutral-700" title="Copy Pattern">
            <Copy size={12} />
          </button>
          <button onClick={handlePastePattern} className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors border ${hasCopiedPattern ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border-neutral-700" : "bg-neutral-800/50 text-neutral-600 border-neutral-800 cursor-not-allowed"}`} title="Paste Pattern" disabled={!hasCopiedPattern}>
            <ClipboardPaste size={12} />
          </button>
          <button onClick={handleTrashPattern} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded text-xs font-bold uppercase transition-colors border border-neutral-700" title="Clear Pattern">
            <Trash2 size={12} />
          </button>
          <button onClick={handleImportLastChop} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded text-xs font-bold uppercase transition-colors border border-neutral-700" title="Import Last Chop">
            <Download size={12} /> Chop
          </button>

          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2 bg-brand hover:opacity-90 text-white rounded font-bold text-xs uppercase transition-colors shadow-lg shadow-brand/20">
              <Plus size={14} /> Load Kit
            </button>
            <div className="absolute right-0 top-full mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2 flex flex-col gap-1">
              <button
                onClick={() => xpmInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-[13px] text-neutral-300 transition-colors text-left"
              >
                <FileCode size={12} className="text-red-500" /> .XPM (Drum Program)
              </button>
              <button
                onClick={() => sxqInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-[13px] text-neutral-300 transition-colors text-left"
              >
                <FileCode size={12} className="text-blue-500" /> .SXQ (Drum Sequence)
              </button>
              <button
                onClick={() => stemImportRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-[13px] text-neutral-300 transition-colors text-left"
              >
                <FileCode size={12} className="text-green-500" /> Stem Program (.json)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content: MPC Pads (left) + Step Sequencer (right) ── */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* ═══════════ Left Panel: MPC-Style Pad Grid ═══════════ */}
        <div className="relative w-80 flex flex-col gap-4 bg-neutral-900 rounded-lg border border-neutral-800 p-4 overflow-y-auto vignette noise-texture">
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
            <Activity size={14} /> MPC Pads
          </h3>

          {/* 4x4 Pad Grid */}
          <div className="grid grid-cols-4 gap-2">
            {pads.map((pad) => {
              const isFlashing = triggeredPads.has(pad.trackId);
              const isHeld = heldPads.has(pad.trackId);
              const isMuted = mutedPads.has(pad.trackId);
              const level = pad.id + 1;
              return (
                <button
                  key={pad.trackId}
                  onMouseDown={(e) => handlePadTrigger(pad.trackId, e)}
                  onMouseUp={() => handlePadRelease(pad.trackId)}
                  onMouseLeave={() => handlePadRelease(pad.trackId)}
                  className={`relative group aspect-square bg-neutral-800 rounded-md border-b-4 border-neutral-950 active:border-b-0 active:translate-y-1 transition-all flex flex-col items-center justify-center overflow-hidden hover:shadow-[0_0_12px_rgba(255,199,44,0.08)] ${
                    activeTrack === pad.trackId ? "ring-1 ring-brand" : ""
                  } ${isFlashing ? "pad-flash" : ""} ${isHeld ? "pad-held" : ""} ${isMuted ? "opacity-40 saturate-0" : ""}`}
                  style={{ borderTop: `2px solid ${pad.color}44`, "--pad-glow": pad.color + "80" } as React.CSSProperties}
                >
                  {isMuted && (
                    <div className="absolute inset-0 bg-red-900/40 z-10 rounded-md flex items-center justify-center">
                      <Ban size={20} className="text-red-500" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-linear-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <span className="text-xs font-bold text-neutral-400 group-hover:text-white transition-colors leading-tight text-center px-1">
                    {sixteenLevels ? `Lv.${level}` : pad.label}
                  </span>
                  {/* Sample loaded indicator */}
                  {enginePads[pad.trackId]?.sample && !sixteenLevels && (
                    <span className="text-[6px] font-mono text-emerald-500 mt-0.5 truncate max-w-[90%]">
                      {enginePads[pad.trackId].sample!.name.slice(0, 12)}
                    </span>
                  )}
                  {/* Upload button (hover) */}
                  <div
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); openSampleLoader(pad.trackId); }}
                  >
                    <Upload size={9} className="text-neutral-400 hover:text-white" />
                  </div>
                  {/* Choke group indicator */}
                  {pad.chokeColor && (
                    <div
                      className="absolute top-1 left-1 w-2 h-2 rounded-full border border-black/40"
                      style={{ backgroundColor: pad.chokeColor }}
                      title={`Choke ${pad.chokeGroup}`}
                    ></div>
                  )}
                  {/* Filter indicator */}
                  {pad.filterType !== "off" && (
                    <div className="absolute top-1 right-1 group-hover:hidden">
                      <Filter size={7} className="text-cyan-400" />
                    </div>
                  )}
                  <div
                    className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full opacity-40"
                    style={{ backgroundColor: pad.color }}
                  ></div>
                </button>
              );
            })}
          </div>

          {/* Pad Bank Selector */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs font-mono text-neutral-600 uppercase">
              <span>Pad Bank</span>
            </div>
            <div className="flex gap-1">
              {(["A", "B", "C", "D"] as const).map((bank) => (
                <button
                  key={bank}
                  onClick={() => setActivePadBank(bank)}
                  className={`flex-1 py-1.5 text-[13px] font-bold uppercase border rounded transition-all ${
                    activePadBank === bank
                      ? "bg-brand border-brand text-white shadow-lg shadow-brand/20"
                      : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                  }`}
                >
                  {bank}
                </button>
              ))}
            </div>
          </div>

          {/* Groove / Swing Visualizer */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-mono text-neutral-600 uppercase">Groove</span>
            <div className="flex justify-between items-center px-1 h-3">
              {Array.from({ length: 8 }, (_, i) => {
                const isEven = i % 2 === 1; // off-beat positions shift right with swing
                const shiftPx = isEven ? (globalSwing / 100) * 6 : 0;
                return (
                  <div
                    key={i}
                    className="groove-dot w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: isEven ? "var(--brand-primary, #ffc72c)" : "rgba(255,255,255,0.2)",
                      transform: `translateX(${shiftPx}px)`,
                      boxShadow: isEven && globalSwing > 30 ? "0 0 4px var(--brand-primary-glow, rgba(255,199,44,0.4))" : "none",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* ── Track Detail Panel ── */}
          <div className="bg-neutral-800/50 rounded-lg border border-neutral-700/50 p-3 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                <SlidersHorizontal size={12} />{" "}
                {TRACK_NAMES[activeTrack] ?? `Track ${activeTrack + 1}`}
              </h3>
              <button
                onClick={() => setShowTrackDetail((v) => !v)}
                className="text-xs font-bold text-neutral-600 hover:text-neutral-300 uppercase transition-colors"
              >
                {showTrackDetail ? "Hide" : "Show"}
              </button>
            </div>

            {showTrackDetail && (
              <div className="flex flex-col gap-3">
                {/* Choke Group */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Link2 size={10} className="text-neutral-500" />
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Choke Group</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateTrack(activeTrack, { chokeGroup: null })}
                      className={`px-2 py-1 text-[11px] font-bold uppercase border rounded ${
                        activeSettings.chokeGroup === null
                          ? "bg-red-600 border-red-500 text-white"
                          : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                      }`}
                    >
                      None
                    </button>
                    {[1, 2, 3, 4].map((g) => (
                      <button
                        key={g}
                        onClick={() => updateTrack(activeTrack, { chokeGroup: g })}
                        className={`px-2 py-1 text-[11px] font-bold uppercase border rounded ${
                          activeSettings.chokeGroup === g
                            ? "border-white text-white"
                            : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                        }`}
                        style={activeSettings.chokeGroup === g ? { backgroundColor: CHOKE_COLORS[g] + "60", borderColor: CHOKE_COLORS[g] } : undefined}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Filter size={10} className="text-neutral-500" />
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Filter</span>
                  </div>
                  <div className="flex gap-1">
                    {(["off", "lp", "hp", "bp"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => updateTrack(activeTrack, { filterType: type })}
                        className={`px-2 py-1 text-[11px] font-bold uppercase border rounded ${
                          activeSettings.filterType === type
                            ? "bg-cyan-600 border-cyan-500 text-white"
                            : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                        }`}
                      >
                        {type === "off" ? "Off" : type === "lp" ? "LP" : type === "hp" ? "HP" : "BP"}
                      </button>
                    ))}
                  </div>
                  {activeSettings.filterType !== "off" && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-neutral-500">
                        <span>Cutoff</span>
                        <span>{activeSettings.filterCutoff}</span>
                      </div>
                      <input
                        type="range" min={0} max={127}
                        value={activeSettings.filterCutoff}
                        onChange={(e) => updateTrack(activeTrack, { filterCutoff: parseInt(e.target.value, 10) })}
                        className="w-full h-1 bg-neutral-800 appearance-none accent-cyan-500"
                      />
                      <div className="flex justify-between text-[11px] text-neutral-500">
                        <span>Resonance</span>
                        <span>{activeSettings.filterResonance}</span>
                      </div>
                      <input
                        type="range" min={0} max={127}
                        value={activeSettings.filterResonance}
                        onChange={(e) => updateTrack(activeTrack, { filterResonance: parseInt(e.target.value, 10) })}
                        className="w-full h-1 bg-neutral-800 appearance-none accent-cyan-500"
                      />
                    </div>
                  )}
                </div>

                {/* Velocity Curve */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Activity size={10} className="text-neutral-500" />
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Velocity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={activeSettings.velocityCurve}
                      onChange={(e) => updateTrack(activeTrack, { velocityCurve: e.target.value as VelocityCurveType })}
                      className="flex-1 bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 rounded px-1 py-1"
                    >
                      <option value="linear">Linear</option>
                      <option value="exponential">Exponential</option>
                      <option value="logarithmic">Logarithmic</option>
                      <option value="constant">Constant</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-neutral-600">Sensitivity</span>
                    <input
                      type="range" min={0} max={100} step={1}
                      value={activeSettings.padSensitivity}
                      onChange={(e) => updateTrack(activeTrack, { padSensitivity: parseInt(e.target.value, 10) })}
                      className="flex-1 h-1 bg-neutral-800 appearance-none accent-cyan-500"
                    />
                    <span className="text-[10px] font-mono text-neutral-500 w-6">{activeSettings.padSensitivity}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-neutral-600">Min</span>
                    <input
                      type="range" min={0} max={100} step={1}
                      value={activeSettings.minVelocity * 100}
                      onChange={(e) => updateTrack(activeTrack, { minVelocity: parseInt(e.target.value, 10) / 100 })}
                      className="flex-1 h-1 bg-neutral-800 appearance-none accent-green-500"
                    />
                    <span className="text-[10px] font-mono text-neutral-500 w-6">{Math.round(activeSettings.minVelocity * 100)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-neutral-600">Max</span>
                    <input
                      type="range" min={0} max={100} step={1}
                      value={activeSettings.maxVelocity * 100}
                      onChange={(e) => updateTrack(activeTrack, { maxVelocity: parseInt(e.target.value, 10) / 100 })}
                      className="flex-1 h-1 bg-neutral-800 appearance-none accent-green-500"
                    />
                    <span className="text-[10px] font-mono text-neutral-500 w-6">{Math.round(activeSettings.maxVelocity * 100)}</span>
                  </div>
                </div>

                {/* Per-track Swing */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Repeat size={10} className="text-neutral-500" />
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Track Swing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min={0} max={100} step={1}
                      value={activeSettings.swing}
                      onChange={(e) => updateTrack(activeTrack, { swing: parseInt(e.target.value, 10) })}
                      className="flex-1 h-1 bg-neutral-800 appearance-none accent-red-500"
                    />
                    <span className="text-[13px] font-mono text-neutral-400 min-w-10">
                      {activeSettings.swing === 0 ? "Global" : `${activeSettings.swing}%`}
                    </span>
                  </div>
                </div>

                {/* Time Stretch + Pitch Shift */}
                <div className="flex flex-col gap-1 border-t border-neutral-800 pt-2 mt-1">
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Time & Pitch</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-neutral-600 min-w-14">Stretch</span>
                    <input
                      type="range" min={50} max={200} step={1}
                      value={Math.round(activeSettings.timeStretch * 100)}
                      onChange={(e) => updateTrack(activeTrack, { timeStretch: parseInt(e.target.value, 10) / 100 })}
                      className="flex-1 h-1 bg-neutral-800 appearance-none accent-purple-500"
                    />
                    <span className="text-[11px] font-mono text-neutral-400 w-10 text-right">
                      {Math.round(activeSettings.timeStretch * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-neutral-600 min-w-14">Pitch</span>
                    <input
                      type="range" min={-12} max={12} step={1}
                      value={activeSettings.pitchShift}
                      onChange={(e) => updateTrack(activeTrack, { pitchShift: parseInt(e.target.value, 10) })}
                      className="flex-1 h-1 bg-neutral-800 appearance-none accent-purple-500"
                    />
                    <span className="text-[11px] font-mono text-neutral-400 w-10 text-right">
                      {activeSettings.pitchShift > 0 ? "+" : ""}{activeSettings.pitchShift}
                    </span>
                  </div>
                </div>

                {/* Mute / Solo */}
                <div className="flex gap-2">
                  <button
                    onClick={() => updateTrack(activeTrack, { muted: !activeSettings.muted })}
                    className={`flex-1 py-1.5 text-[11px] font-bold uppercase border rounded ${
                      activeSettings.muted
                        ? "bg-yellow-600 border-yellow-500 text-white"
                        : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                    }`}
                  >
                    {activeSettings.muted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    onClick={() => updateTrack(activeTrack, { solo: !activeSettings.solo })}
                    className={`flex-1 py-1.5 text-[11px] font-bold uppercase border rounded ${
                      activeSettings.solo
                        ? "bg-green-600 border-green-500 text-white"
                        : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                    }`}
                  >
                    {activeSettings.solo ? "Unsolo" : "Solo"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════ Right Panel: Step Sequencer ═══════════ */}
        <div className="relative flex-1 flex flex-col gap-4 bg-neutral-900 rounded-lg border border-neutral-800 p-4 min-w-0 overflow-y-auto vignette noise-texture">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
              <Music size={14} /> Step Sequencer
            </h3>
            <div className="flex items-center gap-2">
              {/* FL-style Pattern Slots 1-8 */}
              <div className="flex items-center gap-1 mr-2">
                <span className="text-[9px] font-mono text-neutral-600 uppercase mr-1">Pat</span>
                {Array.from({ length: 8 }, (_, i) => i + 1).map((slot) => (
                  <button
                    key={slot}
                    onClick={() => handlePatternSlotChange(slot)}
                    className={`w-6 h-6 text-[10px] font-bold rounded border transition-all ${
                      activePatternSlot === slot
                        ? "pattern-active bg-brand/20 border-brand text-white"
                        : patternBank[slot]
                          ? "bg-neutral-800 border-neutral-600 text-neutral-400 hover:border-neutral-500"
                          : "bg-neutral-800/50 border-neutral-700 text-neutral-600 hover:border-neutral-600"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAutomation(!showAutomation)}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase border rounded transition-all ${
                  showAutomation
                    ? "bg-red-600/20 text-red-400 border-red-500/50"
                    : "bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600"
                }`}
              >
                Automation
              </button>
              <button
                onClick={() => setShowVelocity(!showVelocity)}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase border rounded transition-all ${
                  showVelocity
                    ? "bg-orange-600/20 text-orange-400 border-orange-500/50"
                    : "bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600"
                }`}
              >
                Velocity
              </button>
              <button
                onClick={() => sxqSeqInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase border rounded bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600 transition-all"
              >
                <Download size={10} /> Load .SXQ
              </button>
            </div>
          </div>

          {/* Sequencer Rows */}
          <div className="flex flex-col gap-0.5">
            {/* Step number header */}
            <div className="flex items-center gap-0">
              <div className={`${TRACK_LABEL_W} shrink-0`}></div>
              <div className="flex-1 flex">
                {Array.from({ length: stepCount }, (_, i) => (
                  <div
                    key={i}
                    className={`flex-1 text-center text-[9px] font-mono ${
                      i % 4 === 0 ? "text-neutral-500" : "text-neutral-700"
                    }`}
                  >
                    {i % 4 === 0 ? i + 1 : ""}
                  </div>
                ))}
              </div>
            </div>

            {/* Track rows */}
            {tracks.map((track) => {
              const trackColor = TRACK_COLORS[track.id % TRACK_COLORS.length];
              const isActive = activeTrack === track.id;
              const activeSteps = new Set(pattern[track.id] ?? []);
              return (
                <div
                  key={track.id}
                  className={`flex items-center gap-0 group/row rounded transition-colors ${
                    isActive ? "bg-neutral-800/50" : "hover:bg-neutral-800/30"
                  }`}
                  onClick={() => setActiveTrack(track.id)}
                >
                  {/* Track label */}
                  <div className={`${TRACK_LABEL_W} shrink-0 flex items-center gap-2 px-2 py-1`}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: trackColor }}></div>
                    <span className={`text-[11px] font-bold uppercase truncate ${
                      isActive ? "text-white" : "text-neutral-500"
                    }`}>
                      {track.name}
                    </span>
                    {track.settings.muted && (
                      <div className="led led-mute shrink-0" title="Muted"></div>
                    )}
                    {track.settings.solo && (
                      <div className="led led-solo shrink-0" title="Solo"></div>
                    )}
                  </div>

                  {/* Step cells */}
                  <div className="flex-1 relative h-7 bg-neutral-950/50 rounded-sm overflow-hidden">
                    {Array.from({ length: stepCount }, (_, step) => (
                      <StepCell
                        key={step}
                        trackId={track.id}
                        step={step}
                        isActive={activeSteps.has(step)}
                        trackColor={trackColor}
                        isCurrent={currentStep === step}
                        onToggle={toggleStep}
                        stepCount={stepCount}
                        velocity={velocityMap[track.id]?.[step]}
                        showVelocity={showVelocity}
                      />
                    ))}
                    {/* Beat dividers */}
                    {Array.from({ length: Math.floor(stepCount / 4) }, (_, i) => (
                      <div
                        key={`div-${i}`}
                        className="absolute top-0 bottom-0 border-l border-neutral-700/30"
                        style={{ left: `${((i * 4) / stepCount) * 100}%` }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Automation Lane ── */}
          {showAutomation && (
            <div className="flex flex-col gap-2 border-t border-neutral-800 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`${TRACK_LABEL_W} text-xs font-bold text-neutral-500 uppercase tracking-wider`}>
                    Automation
                  </span>
                  <div className="flex gap-1">
                    {(["Volume", "Pan", "Filter Cutoff"] as const).map((param) => (
                      <button
                        key={param}
                        onClick={() => setAutomationParam(param)}
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase border rounded transition-all ${
                          automationParam === param
                            ? "bg-red-600/20 text-red-400 border-red-500/50"
                            : "bg-neutral-800 text-neutral-600 border-neutral-700 hover:border-neutral-600"
                        }`}
                      >
                        {param}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Automation visualization */}
              <div
                className="relative h-24 bg-neutral-950 rounded border border-neutral-800 cursor-crosshair"
                onPointerMove={handleAutomationPointerMove}
                onPointerDown={handleAutomationPointerMove}
              >
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                  {/* Grid lines */}
                  {Array.from({ length: 16 }, (_, i) => (
                    <line
                      key={i}
                      x1={`${(i / 16) * 100}%`}
                      y1="0"
                      x2={`${(i / 16) * 100}%`}
                      y2="100%"
                      stroke="#262626"
                      strokeWidth="1"
                    />
                  ))}
                  {/* Automation points */}
                  {(() => {
                    const lane = automationData[activeTrack] ?? Array(16).fill(0.5);
                    const pts = lane.map((v, i) => {
                      const x = ((i + 0.5) / 16) * 100;
                      const y = (1 - v) * 100;
                      return { x, y };
                    });
                    const pathD = pts
                      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x}% ${p.y}%`)
                      .join(" ");
                    return (
                      <>
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="1.5"
                          strokeDasharray="4 2"
                        />
                        {pts.map((p, i) => (
                          <circle
                            key={i}
                            cx={`${p.x}%`}
                            cy={`${p.y}%`}
                            r="3"
                            fill="#ef4444"
                          />
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Copied notification ── */}
      {copiedNotification && (
        <div className="fixed bottom-20 right-8 z-50 bg-emerald-900/90 border border-emerald-700 text-emerald-200 text-sm font-bold uppercase tracking-widest px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 stripe-left animate-in slide-in-from-right-8 fade-in">
          <CheckCircle2 size={16} /> Pattern Copied
        </div>
      )}

      {/* ── Inline notification toast ── */}
      {dmNotification && (
        <div className="fixed bottom-8 right-8 z-50 bg-neutral-900/95 border border-neutral-700 text-neutral-200 text-sm font-bold uppercase tracking-widest px-5 py-3 rounded-xl shadow-2xl stripe-left animate-in slide-in-from-right-8 fade-in">
          {dmNotification}
        </div>
      )}
    </div>
  );
}

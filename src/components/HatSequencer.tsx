import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Music,
  GripVertical,
  Plus,
  Clock,
  Search,
  Zap,
  Drum,
  History,
  X,
  Maximize2,
} from "lucide-react";
import { useTBMAudio } from "../contexts/TBMAudioContext";
import { TransportControls } from "./ui/TransportControls";
import { TrackStatusBar } from "./ui/TrackStatusBar";
import type { TrackContentType } from "../lib/trackRouter";
import {
  BEATS_PER_BAR as _BEATS_PER_BAR,
  SCHEDULE_AHEAD_S as _SCHEDULE_AHEAD_S,
  TIMER_INTERVAL_MS as _TIMER_INTERVAL_MS,
  FRAME_RATE as _FRAME_RATE,
} from "../lib/constants";



// Bug 12 fix: generate unique ids for each drag-dropped timeline clip so that
// multiple clips originating from the same library entry can be resized
// independently (resize handler matches by c.id === tc.id).
function makeId() {
  return Math.random().toString(36).slice(2);
}

// ── Pre-allocated noise buffers for hat synthesis ──
// Avoids creating new AudioBuffer on every playHat call (GC pressure fix)
// Bug 9 fix: key by "sampleRate:samples" so that after an AudioContext is
// recreated (new sampleRate or new context), cached buffers from the old
// context are never reused — reusing them causes NotSupportedError on
// source.start() and silently kills all hat playback.
const NOISE_BUFFER_CACHE = new WeakMap<AudioContext, Map<string, AudioBuffer>>();
const MAX_CACHE_ENTRIES = 16;

function getNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const samples = Math.ceil(ctx.sampleRate * duration);
  const cacheKey = `${ctx.sampleRate}:${samples}`;
  let perCtx = NOISE_BUFFER_CACHE.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    NOISE_BUFFER_CACHE.set(ctx, perCtx);
  }
  const cached = perCtx.get(cacheKey);
  if (cached) return cached;

  const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;

  if (perCtx.size >= MAX_CACHE_ENTRIES) {
    const firstKey = perCtx.keys().next().value;
    if (firstKey !== undefined) perCtx.delete(firstKey);
  }
  perCtx.set(cacheKey, buf);
  return buf;
}

// Synthesized hi-hat: short burst of highpass-filtered noise
// Routes through engine.masterGain instead of ctx.destination
function playHat(
  ctx: AudioContext,
  masterGain: AudioNode,
  frequency: number = 8000,
  duration: number = 0.08,
  volume: number = 0.4,
  when: number = 0,
) {
  const noiseBuffer = getNoiseBuffer(ctx, duration);

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = frequency;
  filter.Q.value = 0.5;

  const gain = ctx.createGain();
  const startTime = when > 0 ? when : ctx.currentTime;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(startTime);
  source.stop(startTime + duration);

  // HatSequencer 2.1: disconnect the node chain once playback ends to
  // prevent zombie AudioNodes from accumulating (~28,800/hour at 120 BPM).
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

interface Clip {
  id: string;
  name: string;
  type: "organic" | "trap";
  category: string;
  color: string;
}

interface TimelineClip extends Clip {
  trackId: number;
  startTime: number; // in beats
  duration: number; // in beats
}

// ── ClipLibraryItem — memoized to avoid re-renders as search query changes ──
const ClipLibraryItem = React.memo(function ClipLibraryItem({
  clip,
}: {
  clip: Clip;
}) {
  const handleDragStart = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(
        "application/tbm-clip",
        JSON.stringify({ clipId: clip.id, name: clip.name, url: "" }),
      );
      e.dataTransfer.effectAllowed = "copy";
    },
    [clip.id, clip.name],
  );

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group flex items-center gap-3 p-2 bg-neutral-950 border border-neutral-800 rounded hover:border-neutral-600 cursor-grab active:cursor-grabbing transition-all"
    >
      <div
        className="w-1 h-8 rounded-full"
        style={{ backgroundColor: clip.color }}
      ></div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[13px] font-bold text-neutral-300 truncate">
          {clip.name}
        </span>
        <span className="text-xs font-mono text-neutral-600 uppercase">
          {clip.category}
        </span>
      </div>
      <GripVertical
        className="text-neutral-800 group-hover:text-neutral-600"
        size={14}
      />
    </div>
  );
});

export const HatSequencer = React.memo(function HatSequencer() {
  const [activeCategory, setActiveCategory] = useState<"organic" | "trap">(
    "organic",
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const playheadDomRef = useRef<HTMLDivElement>(null);
  const [muteMap, setMuteMap] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);
  const [soloSet, setSoloSet] = useState<Set<number>>(new Set());
  // Keep refs so the scheduler closure always sees current mute/solo state
  const muteMapRef = useRef(muteMap);
  const soloSetRef = useRef(soloSet);
  
  useEffect(() => {
    muteMapRef.current = muteMap;
  }, [muteMap]);
  
  useEffect(() => {
    soloSetRef.current = soloSet;
  }, [soloSet]);
  const timecodeDomRef = useRef<HTMLSpanElement>(null);
  const [clipSearch, setClipSearch] = useState("");
  const [creatingCustomClip, setCreatingCustomClip] = useState(false);
  const [customClipName, setCustomClipName] = useState("");
  const [customClipSteps, setCustomClipSteps] = useState(16);
  const [_resizingClip, setResizingClip] = useState<string | null>(null);
  const clockRef = useRef<number | null>(null);
  const beatRef = useRef(0);
  const nextStepTimeRef = useRef(0);
  const playheadRafRef = useRef<number | null>(null);
  const timecodeRafRef = useRef<number | null>(null);
  const playStartTimeRef = useRef(0);

  const { audioContext, resumeAudio, engine, sequencer, bpm, trackRouter } = useTBMAudio();

  // HatSequencer 2.3: keep bpm in a ref so the scheduler closure always
  // reads the latest value without needing to be recreated on every BPM change.
  const bpmRef = useRef(bpm);
  
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  // ── Auto-register in TrackRouter (mixer channel) ────────────────────────
  const hatSlotIndexRef = useRef<number>(-1);
  const hatOutputNodeRef = useRef<AudioNode | null>(null);
  useEffect(() => {
    if (!trackRouter || !engine) return;
    const SOURCE_ID = 'hat-sequencer';
    const TYPE: TrackContentType = 'hats';

    // Idempotency: don't double-register
    const existing = trackRouter.getByType(TYPE);
    if (existing.length > 0) {
      hatSlotIndexRef.current = existing[0].index;
    } else {
      const slot = trackRouter.assignToNextFree(TYPE, SOURCE_ID, 'Hat Sequencer');
      if (slot) hatSlotIndexRef.current = slot.index;
    }

    // Use slot input as the hat audio destination (instead of engine.masterGain)
    const slotInput = trackRouter.getSlotInput(hatSlotIndexRef.current);
    hatOutputNodeRef.current = slotInput ?? engine?.masterGain ?? null;

    return () => {
      trackRouter.releaseBySource(SOURCE_ID);
      hatSlotIndexRef.current = -1;
      hatOutputNodeRef.current = null;
    };
  }, [trackRouter, engine]);

  // Undo history: store previous timeline states
  const [undoHistory, setUndoHistory] = useState<TimelineClip[][]>([]);
  const pushUndo = useCallback((clips: TimelineClip[]) => {
    setUndoHistory((prev) => [...prev.slice(-19), clips]); // keep last 20
  }, []);

  const BEATS_PER_BAR = _BEATS_PER_BAR;
  const SCHEDULE_AHEAD_S = _SCHEDULE_AHEAD_S;
  const TIMER_INTERVAL_MS = _TIMER_INTERVAL_MS;
  // Bug 13 fix: use the imported constant instead of re-declaring FRAME_RATE locally.
  const FRAME_RATE = _FRAME_RATE;

  // Keep timelineClips in a ref so the scheduler closure always sees the latest value
  const timelineClipsRef = useRef<TimelineClip[]>([]);

  const stopPlayback = useCallback(() => {
    if (clockRef.current !== null) {
      clearTimeout(clockRef.current);
      clockRef.current = null;
    }
    if (playheadRafRef.current !== null) {
      cancelAnimationFrame(playheadRafRef.current);
      playheadRafRef.current = null;
    }
    if (timecodeRafRef.current !== null) {
      cancelAnimationFrame(timecodeRafRef.current);
      timecodeRafRef.current = null;
    }
    beatRef.current = 0;
    // Bug 14 fix: also reset nextStepTimeRef so any future scheduleHats call
    // that runs without going through startPlayback's reset doesn't inherit a
    // stale audio timestamp and fire a burst of immediately-due steps.
    nextStepTimeRef.current = 0;
    if (playheadDomRef.current) {
      playheadDomRef.current.style.left = "0%";
    }
    if (timecodeDomRef.current) {
      timecodeDomRef.current.textContent = "00:00:00:00";
    }
    setIsPlaying(false);
  }, []);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (clockRef.current !== null) clearTimeout(clockRef.current);
      if (playheadRafRef.current !== null)
        cancelAnimationFrame(playheadRafRef.current);
      if (timecodeRafRef.current !== null)
        cancelAnimationFrame(timecodeRafRef.current);
    },
    [],
  );

  const presets = [
    {
      name: "Classic Breakbeat",
      clips: [
        {
          id: "o2",
          name: "70s Breakbeat Hat",
          trackId: 0,
          startTime: 0,
          duration: 8,
          color: "#a855f7",
        },
        {
          id: "o3",
          name: "Ghost Note Fill",
          trackId: 3,
          startTime: 6,
          duration: 2,
          color: "#a855f7",
        },
      ],
    },
    {
      name: "Trap Quads",
      clips: [
        {
          id: "t1",
          name: "Quad Roll",
          trackId: 0,
          startTime: 0,
          duration: 4,
          color: "#ef4444",
        },
        {
          id: "t2",
          name: "Triplet Stutter",
          trackId: 0,
          startTime: 4,
          duration: 4,
          color: "#ef4444",
        },
      ],
    },
    {
      name: "Live 4-Count",
      clips: [
        {
          id: "o1",
          name: "60s Live 4-Count",
          trackId: 0,
          startTime: 0,
          duration: 8,
          color: "#a855f7",
        },
      ],
    },
  ];

  const loadPreset = (presetName: string) => {
    const preset = presets.find((p) => p.name === presetName);
    if (preset) {
      pushUndo(timelineClips);
      setTimelineClips(
        preset.clips.map((c, i) => ({
          ...c,
          id: `preset-${i}`,
          type: c.color === "#a855f7" ? "organic" : "trap",
          category: "Preset",
        })),
      );
    }
  };

  const clipLibrary: Clip[] = [
    // Organic
    {
      id: "o1",
      name: "60s Live 4-Count",
      type: "organic",
      category: "Live",
      color: "#a855f7",
    },
    {
      id: "o2",
      name: "70s Breakbeat Hat",
      type: "organic",
      category: "Break",
      color: "#a855f7",
    },
    {
      id: "o3",
      name: "Ghost Note Fill",
      type: "organic",
      category: "Fill",
      color: "#a855f7",
    },
    {
      id: "o4",
      name: "Open Hat Swell",
      type: "organic",
      category: "Open",
      color: "#a855f7",
    },
    {
      id: "o5",
      name: "Ride Bell Tap",
      type: "organic",
      category: "Ride",
      color: "#a855f7",
    },
    {
      id: "o6",
      name: "Crash Accent",
      type: "organic",
      category: "Crash",
      color: "#a855f7",
    },
    // Trap
    {
      id: "t1",
      name: "Quad Roll",
      type: "trap",
      category: "Quads",
      color: "#ef4444",
    },
    {
      id: "t2",
      name: "Triplet Stutter",
      type: "trap",
      category: "Triplets",
      color: "#ef4444",
    },
    {
      id: "t3",
      name: "Pitch Slide Hat",
      type: "trap",
      category: "Slides",
      color: "#ef4444",
    },
    {
      id: "t4",
      name: "808 Closed Hat",
      type: "trap",
      category: "Basic",
      color: "#ef4444",
    },
    {
      id: "t5",
      name: "Velocity Ramp",
      type: "trap",
      category: "Stutter",
      color: "#ef4444",
    },
  ];

  const tracks = [
    { id: 0, name: "Closed Hat" },
    { id: 1, name: "Open Hat" },
    { id: 2, name: "Ride/Crash" },
    { id: 3, name: "Perc/Ghost" },
  ];

  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([
    { ...clipLibrary[0], trackId: 0, startTime: 0, duration: 4 },
    { ...clipLibrary[1], trackId: 0, startTime: 4, duration: 4 },
    { ...clipLibrary[3], trackId: 1, startTime: 2, duration: 1 },
    { ...clipLibrary[6], trackId: 0, startTime: 8, duration: 2 },
  ]);

  // Keep ref in sync so scheduler closure sees latest clips
  useEffect(() => {
    timelineClipsRef.current = timelineClips;
  }, [timelineClips]);

  const filteredLibrary = clipLibrary.filter((c) => c.type === activeCategory);
  const searchedLibrary = filteredLibrary.filter((c) =>
    c.name.toLowerCase().includes(clipSearch.toLowerCase()),
  );

  // ── Mute / Solo handlers ──
  const handleMute = useCallback(
    (trackIndex: number) => {
      const next = muteMap.map((m, i) => (i === trackIndex ? !m : m));
      setMuteMap(next);
      if (sequencer) sequencer.setMuteState(next, soloSet);
    },
    [muteMap, soloSet, sequencer],
  );

  const handleSolo = useCallback(
    (trackIndex: number) => {
      const nextSolo = new Set<number>(soloSet);
      if (nextSolo.has(trackIndex)) nextSolo.delete(trackIndex);
      else nextSolo.add(trackIndex);
      setSoloSet(nextSolo);
      if (sequencer) sequencer.setMuteState(muteMap, nextSolo);
    },
    [muteMap, soloSet, sequencer],
  );

  // ── Auto-Generate: probabilistic 4/4 hat pattern ──
  const handleAutoGenerate = useCallback(() => {
    // Bug 13 fix: FRAME_RATE is now the imported constant declared at component level.
    const generated: TimelineClip[] = [];
    // 16 sixteenth-note positions across 4 beats
    // Weight: beats 1&3 = 1.0, offbeats (2&4) = 0.7, in-between = 0.4
    const weights = [
      1.0, 0.4, 0.7, 0.4, 1.0, 0.4, 0.7, 0.4, 1.0, 0.4, 0.7, 0.4, 1.0, 0.4, 0.7,
      0.4,
    ];
    const closedHatSteps: number[] = [];
    weights.forEach((w, i) => {
      if (Math.random() < w) closedHatSteps.push(i);
    });
    // Convert step positions (0-15) to beat groups: 4 steps = 1 beat, pack into clips
    let i = 0;
    while (i < closedHatSteps.length) {
      const start = closedHatSteps[i] * 0.25; // in beats (1 beat = 4 sixteenths)
      let end = start + 0.25;
      while (
        i + 1 < closedHatSteps.length &&
        closedHatSteps[i + 1] === closedHatSteps[i] + 1
      ) {
        i++;
        end += 0.25;
      }
      generated.push({
        id: makeId(),
        name: "808 Closed Hat",
        type: "trap",
        category: "Basic",
        color: "#ef4444",
        trackId: 0,
        startTime: start,
        duration: end - start,
      });
      i++;
    }
    // Open hats on upbeats (positions 2, 6, 10, 14) with 50% probability
    [2, 6, 10, 14].forEach((pos) => {
      if (Math.random() > 0.5) {
        generated.push({
          id: makeId(),
          name: "Open Hat Swell",
          type: "organic",
          category: "Open",
          color: "#a855f7",
          trackId: 1,
          startTime: pos * 0.25,
          duration: 0.5,
        });
      }
    });
    setTimelineClips((prev) => {
      pushUndo(prev);
      return generated;
    });
  }, [pushUndo]);

  // ── Live timecode rAF loop ──
  // Bug 13 fix: FRAME_RATE is the imported constant declared at component level.
  const updateTimecodeRef = useRef<() => void>(() => {});
  
  const updateTimecode = useCallback(() => {
    if (!audioContext) return;
    const elapsed = audioContext.currentTime - playStartTimeRef.current;
    const totalSeconds = Math.max(0, elapsed);
    const frames = Math.floor(totalSeconds * FRAME_RATE) % FRAME_RATE;
    const secs = Math.floor(totalSeconds) % 60;
    const mins = Math.floor(totalSeconds / 60) % 60;
    const hrs = Math.floor(totalSeconds / 3600) % 24;
    const pad = (n: number, d = 2) => String(n).padStart(d, "0");
    if (timecodeDomRef.current) {
      timecodeDomRef.current.textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
    }
    timecodeRafRef.current = requestAnimationFrame(updateTimecodeRef.current);
  }, [audioContext, FRAME_RATE]);
  
  // Store the latest updateTimecode in the ref
  useEffect(() => {
    updateTimecodeRef.current = updateTimecode;
  }, [updateTimecode]);

  // ── Look-ahead scheduler ──
  const scheduleHatsRef = useRef<(ctx: AudioContext, masterGainNode: AudioNode) => void>(() => {});
  
  const scheduleHats = useCallback(
    (ctx: AudioContext, masterGainNode: AudioNode) => {
      // HatSequencer 2.3: read from ref to get the current BPM even if the
      // closure was created with a different BPM value.
      const stepDurationS = 60 / bpmRef.current / 4; // 16th-note duration in seconds
      const totalBeats = 32 * BEATS_PER_BAR * 4; // total 16th-note steps in 32 bars
      const deadline = ctx.currentTime + SCHEDULE_AHEAD_S;

      while (nextStepTimeRef.current < deadline) {
        const beat = beatRef.current;

        // Trigger hats for clips that cover the current beat
        timelineClipsRef.current.forEach((tc) => {
          // Bug 10 fix: tc.startTime / tc.duration are in bars; beatRef counts
          // sixteenth-note steps.  Convert to steps: 1 bar = BEATS_PER_BAR * 4 steps.
          const stepsPerBar = BEATS_PER_BAR * 4;
          const clipStartBeat = tc.startTime * stepsPerBar;
          const clipEndBeat = (tc.startTime + tc.duration) * stepsPerBar;
          if (beat >= clipStartBeat && beat < clipEndBeat) {
            // Check mute/solo state for this clip's track
            const trackId = tc.trackId;
            const currentMutes = muteMapRef.current;
            const currentSolos = soloSetRef.current;
            const hasSoloed = currentSolos.size > 0;
            if (currentMutes[trackId]) return; // track is muted
            if (hasSoloed && !currentSolos.has(trackId)) return; // another track is soloed
            const freq = tc.type === "trap" ? 10000 : 7000;
            const dur = tc.type === "trap" ? 0.04 : 0.12;
            playHat(
              ctx,
              masterGainNode,
              freq,
              dur,
              0.35,
              nextStepTimeRef.current,
            );
          }
        });

        nextStepTimeRef.current += stepDurationS;
        beatRef.current = (beat + 1) % totalBeats;

        // UI update via rAF to coalesce with next paint.
        // Bug 11 fix: re-read beatRef.current inside the rAF callback instead
        // of closing over `pos`, which would be stale by the time rAF fires.
        if (playheadRafRef.current === null) {
          playheadRafRef.current = requestAnimationFrame(() => {
            if (playheadDomRef.current) {
              const currentPos = (beatRef.current / totalBeats) * 100;
              playheadDomRef.current.style.left = `${currentPos}%`;
            }
            playheadRafRef.current = null;
          });
        }
      }

      clockRef.current = window.setTimeout(
        () => scheduleHatsRef.current?.(ctx, masterGainNode),
        TIMER_INTERVAL_MS,
      );
    },
    [BEATS_PER_BAR, SCHEDULE_AHEAD_S, TIMER_INTERVAL_MS], // HatSequencer 2.3: bpm removed — read from ref
  );
  
  // Store the latest scheduleHats in a ref
  useEffect(() => {
    scheduleHatsRef.current = scheduleHats;
  }, [scheduleHats]);

  const startPlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (!audioContext) return;
    resumeAudio();
    const ctx = audioContext;
    // Use TrackRouter slot input if registered, else fall back to engine.masterGain
    const masterGainNode: AudioNode =
      hatOutputNodeRef.current ?? (engine as any)?.masterGain ?? ctx.destination;
    setIsPlaying(true);
    beatRef.current = 0;
    nextStepTimeRef.current = ctx.currentTime;
    playStartTimeRef.current = ctx.currentTime;
    scheduleHats(ctx, masterGainNode);
    timecodeRafRef.current = requestAnimationFrame(updateTimecode);
  }, [
    isPlaying,
    audioContext,
    resumeAudio,
    stopPlayback,
    scheduleHats,
    updateTimecode,
    engine,
  ]);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center bg-neutral-900 p-3 rounded-lg border border-neutral-800 relative edge-glow-bottom">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Music className="text-red-500" size={18} />
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest">
              Hat Progression Timeline
            </h2>
          </div>
          <div className="h-6 w-px bg-neutral-800"></div>
          <TransportControls
            isPlaying={isPlaying}
            onPlay={startPlayback}
            onStop={stopPlayback}
            size={16}
          />
          <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1 rounded border border-neutral-800">
            <Clock size={12} className="text-neutral-500" />
            <span
              ref={timecodeDomRef}
              className="text-[13px] font-mono text-red-500 font-bold"
            >
              00:00:00:00
            </span>
          </div>
          <div className="h-6 w-px bg-neutral-800"></div>
          <select
            onChange={(e) => loadPreset(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 text-[13px] text-neutral-400 rounded px-2 py-1 outline-none focus:border-red-500 transition-colors"
          >
            <option value="">Load Preset...</option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="h-6 w-px bg-neutral-800"></div>
          <TrackStatusBar compact />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-neutral-950 rounded p-1 border border-neutral-800">
            <button
              onClick={() => setActiveCategory("organic")}
              className={`px-3 py-1 rounded text-[13px] font-bold uppercase transition-all ${activeCategory === "organic" ? "bg-neutral-800 text-white" : "text-neutral-500"}`}
            >
              Organic
            </button>
            <button
              onClick={() => setActiveCategory("trap")}
              className={`px-3 py-1 rounded text-[13px] font-bold uppercase transition-all ${activeCategory === "trap" ? "bg-neutral-800 text-white" : "text-neutral-500"}`}
            >
              Trap
            </button>
          </div>
          <button
            onClick={handleAutoGenerate}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold text-xs uppercase transition-colors"
          >
            <Zap size={14} /> Auto-Generate
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Clip Library */}
        <div className="w-72 flex flex-col gap-3 bg-neutral-900 rounded-lg border border-neutral-800 p-4 noise-texture relative">
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-600"
              size={12}
            />
            <input
              type="text"
              placeholder="Search Clips..."
              value={clipSearch}
              onChange={(e) => setClipSearch(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-7 py-1.5 text-[13px] outline-none focus:border-red-500 transition-colors"
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
            {searchedLibrary.map((clip) => (
              <ClipLibraryItem key={clip.id} clip={clip} />
            ))}
          </div>

          <div className="pt-3 border-t border-neutral-800">
            {creatingCustomClip ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Clip name..."
                  value={customClipName}
                  onChange={(e) => setCustomClipName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setCreatingCustomClip(false);
                      setCustomClipName("");
                    }
                  }}
                  autoFocus
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-[13px] text-neutral-200 outline-none focus:border-red-500 transition-colors"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-500">Steps:</label>
                  <input
                    type="number"
                    min={4}
                    max={64}
                    value={customClipSteps}
                    onChange={(e) =>
                      setCustomClipSteps(
                        Math.max(4, Math.min(64, Number(e.target.value))),
                      )
                    }
                    className="w-16 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-[13px] text-neutral-200 outline-none focus:border-red-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const name =
                        customClipName.trim() ||
                        `Custom ${clipLibrary.length + 1}`;
                      const newClip: Clip = {
                        id: `custom-${Date.now()}`,
                        name,
                        type: activeCategory,
                        category: "Custom",
                        color:
                          activeCategory === "organic" ? "#a855f7" : "#ef4444",
                      };
                      // Add to timeline on track 0 at beat 0 with duration derived from steps
                      const duration = customClipSteps / 4; // 4 steps per beat
                      pushUndo(timelineClips);
                      setTimelineClips((prev) => [
                        ...prev,
                        { ...newClip, trackId: 0, startTime: 0, duration },
                      ]);
                      setCreatingCustomClip(false);
                      setCustomClipName("");
                      setCustomClipSteps(16);
                    }}
                    className="flex-1 py-1 bg-red-600 hover:bg-red-500 text-white text-[13px] font-bold uppercase rounded transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setCreatingCustomClip(false);
                      setCustomClipName("");
                    }}
                    className="flex-1 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[13px] font-bold uppercase rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreatingCustomClip(true)}
                className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[13px] font-bold uppercase rounded flex items-center justify-center gap-2"
              >
                <Plus size={12} /> New Custom Clip
              </button>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 flex flex-col bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden vignette">
          {/* Timeline Ruler */}
          <div className="h-8 bg-neutral-950 border-b border-neutral-800 flex relative">
            <div className="w-32 shrink-0 border-r border-neutral-800"></div>
            <div className="flex-1 flex relative">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 border-r border-neutral-900 flex items-center px-2 text-xs font-mono text-neutral-600"
                >
                  {i + 1}.0
                </div>
              ))}
              {/* Playhead */}
              {/* Playhead marker */}
              <div
                ref={playheadDomRef}
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                style={{ left: `0%`, willChange: "left" }}
              >
                <div className="absolute -top-1 -left-1.5 w-4 h-4 bg-red-500 rotate-45"></div>
              </div>
            </div>
          </div>

          {/* Tracks */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="h-16 flex border-b border-neutral-800 group"
              >
                <div className="w-32 shrink-0 bg-neutral-950 border-r border-neutral-800 p-3 flex flex-col justify-center">
                  <span className="text-[13px] font-bold text-neutral-400 group-hover:text-white transition-colors">
                    {track.name}
                  </span>
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={() => handleMute(track.id)}
                      className={`w-3 h-3 rounded-full transition-colors ${muteMap[track.id] ? "bg-red-500" : "bg-neutral-800 hover:bg-red-500"}`}
                      title="Mute"
                    />
                    <button
                      onClick={() => handleSolo(track.id)}
                      className={`w-3 h-3 rounded-full transition-colors ${soloSet.has(track.id) ? "bg-emerald-500" : "bg-neutral-800 hover:bg-emerald-500"}`}
                      title="Solo"
                    />
                  </div>
                </div>
                <div
                  className="flex-1 relative bg-neutral-950/30"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw = e.dataTransfer.getData("application/tbm-clip");
                    if (!raw) return;
                    try {
                      const data = JSON.parse(raw) as {
                        clipId: string;
                        name: string;
                        url: string;
                      };
                      const rect = e.currentTarget.getBoundingClientRect();
                      const relX = (e.clientX - rect.left) / rect.width;
                      const startTime = Math.floor(relX * 32); // snap to bar
                      const src = clipLibrary.find(
                        (c) => c.id === data.clipId,
                      ) ?? {
                        id: data.clipId,
                        name: data.name,
                        type: activeCategory,
                        category: "Custom",
                        color: "#888",
                      };
                      const newClip: TimelineClip = {
                        ...src,
                        // Bug 12 fix: assign a fresh unique id so that multiple clips
                        // dropped from the same library entry don't share an id and
                        // accidentally all resize together when one is dragged.
                        id: makeId(),
                        trackId: track.id,
                        startTime,
                        duration: 2,
                      };
                      pushUndo(timelineClips);
                      setTimelineClips((prev) => [...prev, newClip]);
                    } catch {
                      /* ignore bad data */
                    }
                  }}
                >
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: 32 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 border-r ${i % 4 === 3 ? "border-neutral-800" : "border-neutral-900/30"}`}
                      ></div>
                    ))}
                  </div>

                  {/* Clips on this track */}
                  {timelineClips
                    .filter((tc) => tc.trackId === track.id)
                    .map((tc) => (
                      <div
                        key={tc.id}
                        className="absolute top-2 bottom-2 rounded border-l-4 shadow-lg flex flex-col justify-center px-2 overflow-hidden cursor-pointer hover:brightness-110 transition-all group/clip"
                        style={{
                          left: `${(tc.startTime / 32) * 100}%`,
                          width: `${(tc.duration / 32) * 100}%`,
                          backgroundColor: `${tc.color}22`,
                          borderColor: tc.color,
                          borderWidth: "1px",
                          borderLeftWidth: "4px",
                        }}
                      >
                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            pushUndo(timelineClips);
                            setTimelineClips((prev) =>
                              prev.filter((c) => c !== tc),
                            );
                          }}
                          className="absolute top-0.5 right-0.5 opacity-0 group-hover/clip:opacity-100 bg-neutral-900/80 rounded p-0.5 hover:bg-red-600 transition-all z-10"
                          title="Delete clip"
                        >
                          <X size={8} className="text-white" />
                        </button>
                        {/* Resize handle */}
                        <div
                          className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 hover:bg-white/20 transition-all z-10 flex items-center justify-center"
                          title="Drag to resize"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setResizingClip(tc.id);
                            const startX = e.clientX;
                            const startDuration = tc.duration;
                            const trackEl = e.currentTarget.closest(
                              ".flex-1.relative",
                            ) as HTMLElement;
                            if (!trackEl) return;
                            const trackWidth =
                              trackEl.getBoundingClientRect().width;
                            const onMove = (ev: MouseEvent) => {
                              const dx = ev.clientX - startX;
                              const deltaBars = (dx / trackWidth) * 32;
                              const newDuration = Math.max(
                                0.25,
                                Math.round((startDuration + deltaBars) * 4) / 4,
                              );
                              setTimelineClips((prev) =>
                                prev.map((c) =>
                                  c.id === tc.id
                                    ? { ...c, duration: newDuration }
                                    : c,
                                ),
                              );
                            };
                            const onUp = () => {
                              setResizingClip(null);
                              document.removeEventListener("mousemove", onMove);
                              document.removeEventListener("mouseup", onUp);
                            };
                            pushUndo(timelineClips);
                            document.addEventListener("mousemove", onMove);
                            document.addEventListener("mouseup", onUp);
                          }}
                        >
                          <Maximize2 size={6} className="text-white/60" />
                        </div>
                        <span className="text-xs font-bold text-white truncate">
                          {tc.name}
                        </span>
                        <div className="flex gap-0.5 mt-0.5">
                          {Array.from({ length: 4 }).map((_, j) => (
                            <div
                              key={j}
                              className="h-1 flex-1 bg-white/20 rounded-full"
                            ></div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Info */}
          <div className="h-8 bg-neutral-950 border-t border-neutral-800 flex items-center px-4 justify-between separator-glow">
            <div className="flex items-center gap-4 text-xs font-mono text-neutral-600 uppercase">
              <span className="flex items-center gap-1">
                <Drum size={10} /> 4 Tracks
              </span>
              <span className="flex items-center gap-1">
                <History size={10} /> Undo History: {undoHistory.length} Steps
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-neutral-600 uppercase">
                Snap: 1/16
              </span>
              <div className="w-24 h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                <div className="w-1/3 h-full bg-red-500"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GripVertical, Music, Clock, Activity, Search, ChevronDown, ChevronUp, Send, Volume2 } from 'lucide-react';
import { useTBMAudio } from '../contexts/TBMAudioContext';
import { DEFAULT_BPM, NOTE_NAMES } from '../lib/constants';
import { SoundPreviewEngine, PREVIEW_VOICES, type PreviewVoiceId } from '../lib/soundPreview';
import { type TrackContentType } from '../lib/trackRouter';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChordDef {
  name: string;
  root: number; // MIDI note
  notes: number[]; // absolute MIDI notes
  /** Scale degree label (I, ii, iii, etc.) */
  degree?: string;
  /** Functional harmony role */
  function?: 'tonic' | 'subdominant' | 'dominant' | 'mediant' | 'passing';
}

interface SlotVoicing {
  inversion: number;
  openVoicing: boolean;
}

// ─── Scale-degree chord generation (Scaler-inspired) ──────────────────────────

const SCALE_INTERVALS: Record<string, number[]> = {
  major:       [0, 2, 4, 5, 7, 9, 11],
  minor:       [0, 2, 3, 5, 7, 8, 10],
  dorian:      [0, 2, 3, 5, 7, 9, 10],
  mixolydian:  [0, 2, 4, 5, 7, 9, 10],
  lydian:      [0, 2, 4, 6, 7, 9, 11],
  phrygian:    [0, 1, 3, 5, 7, 8, 10],
  harmMinor:   [0, 2, 3, 5, 7, 8, 11],
  pentatonic:  [0, 2, 4, 7, 9],
  blues:       [0, 3, 5, 6, 7, 10],
};

const DEGREE_LABELS_MAJOR  = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii\u00B0'];
const DEGREE_LABELS_MINOR  = ['i', 'ii\u00B0', 'III', 'iv', 'v', 'VI', 'VII'];

/** Chord quality for each diatonic degree in major key */
const MAJOR_TRIAD_INTERVALS = [
  [0, 4, 7],       // I   — major
  [0, 3, 7],       // ii  — minor
  [0, 3, 7],       // iii — minor
  [0, 4, 7],       // IV  — major
  [0, 4, 7],       // V   — major
  [0, 3, 7],       // vi  — minor
  [0, 3, 6],       // vii — dim
];

const MAJOR_SEVENTH_INTERVALS = [
  [0, 4, 7, 11],   // Imaj7
  [0, 3, 7, 10],   // ii7
  [0, 3, 7, 10],   // iii7
  [0, 4, 7, 11],   // IVmaj7
  [0, 4, 7, 10],   // V7 (dom7)
  [0, 3, 7, 10],   // vi7
  [0, 3, 6, 10],   // viiø7
];

const MINOR_TRIAD_INTERVALS = [
  [0, 3, 7],       // i   — minor
  [0, 3, 6],       // ii  — dim
  [0, 4, 7],       // III — major
  [0, 3, 7],       // iv  — minor
  [0, 3, 7],       // v   — minor
  [0, 4, 7],       // VI  — major
  [0, 4, 7],       // VII — major
];

const MINOR_SEVENTH_INTERVALS = [
  [0, 3, 7, 10],   // i7
  [0, 3, 6, 10],   // iiø7
  [0, 4, 7, 11],   // IIImaj7
  [0, 3, 7, 10],   // iv7
  [0, 3, 7, 10],   // v7
  [0, 4, 7, 11],   // VImaj7
  [0, 4, 7, 10],   // VII7
];

/** Functional harmony mapping for degree indices */
const DEGREE_FUNCTIONS: Array<ChordDef['function']> = [
  'tonic',        // I / i
  'subdominant',  // ii
  'mediant',      // iii
  'subdominant',  // IV / iv
  'dominant',     // V / v
  'mediant',      // vi / VI
  'dominant',     // vii / VII
];

/** Colour per harmonic function */
const FUNCTION_COLORS: Record<string, string> = {
  tonic:       '#22c55e',  // green
  subdominant: '#f59e0b',  // amber
  dominant:    '#ef4444',  // red
  mediant:     '#8b5cf6',  // purple
  passing:     '#6b7280',  // gray
};

const FUNCTION_LABELS: Record<string, string> = {
  tonic:       'T',
  subdominant: 'SD',
  dominant:    'D',
  mediant:     'M',
  passing:     'P',
};

/** Get the root note for a key string like "Cm" or "G#M" */
function getKeyRoot(key: string): { rootPc: number; isMinor: boolean } {
  const isMinor = key.endsWith('m') && !key.endsWith('M');
  const rootName = key.replace(/[mM]$/, '');
  const rootPc = NOTE_NAMES.indexOf(rootName as typeof NOTE_NAMES[number]);
  return { rootPc: rootPc >= 0 ? rootPc : 0, isMinor };
}

type ChordMode = 'triads' | 'sevenths';

/** Build diatonic chords for the project key */
function buildDiatonicChords(projectKey: string, mode: ChordMode = 'triads'): ChordDef[] {
  const { rootPc, isMinor } = getKeyRoot(projectKey);
  const scaleIntervals = SCALE_INTERVALS[isMinor ? 'minor' : 'major'];
  const degreeLabels = isMinor ? DEGREE_LABELS_MINOR : DEGREE_LABELS_MAJOR;

  const triadIntervals = isMinor
    ? (mode === 'sevenths' ? MINOR_SEVENTH_INTERVALS : MINOR_TRIAD_INTERVALS)
    : (mode === 'sevenths' ? MAJOR_SEVENTH_INTERVALS : MAJOR_TRIAD_INTERVALS);

  return scaleIntervals.map((interval, degIdx) => {
    const root = 60 + rootPc + interval; // C4 + key offset + scale degree
    const chordIntervals = triadIntervals[degIdx];
    const notes = chordIntervals.map(ci => root + ci);

    // Build display name
    const noteName = NOTE_NAMES[(rootPc + interval) % 12];
    const quality = getQualityLabel(chordIntervals);

    return {
      name: `${noteName}${quality}`,
      root,
      notes,
      degree: degreeLabels[degIdx],
      function: DEGREE_FUNCTIONS[degIdx],
    };
  });
}

function getQualityLabel(intervals: number[]): string {
  const sig = intervals.join(',');
  const map: Record<string, string> = {
    '0,4,7': '',          // major
    '0,3,7': 'm',         // minor
    '0,3,6': 'dim',       // diminished
    '0,4,8': 'aug',       // augmented
    '0,4,7,11': 'maj7',
    '0,3,7,10': 'm7',
    '0,4,7,10': '7',
    '0,3,6,10': 'm7b5',
    '0,3,6,9':  'dim7',
  };
  return map[sig] ?? '';
}

// ─── Extended chord palette (jazz/neo-soul voicings) ──────────────────────────

const CHORD_PALETTE_BASE: Array<{ name: string; root: number; intervals: number[] }> = [
  { name: 'Cmaj13',     root: 60, intervals: [0, 4, 7, 11, 14, 21] },
  { name: 'Dm11',       root: 62, intervals: [0, 3, 7, 10, 14, 17] },
  { name: 'E7#9',       root: 64, intervals: [0, 4, 7, 10, 15] },
  { name: 'F6/9',       root: 65, intervals: [0, 4, 7, 9, 14] },
  { name: 'G13',        root: 67, intervals: [0, 4, 7, 10, 14, 21] },
  { name: 'Am9',        root: 69, intervals: [0, 3, 7, 10, 14] },
  { name: 'Bbmaj7',     root: 70, intervals: [0, 4, 7, 11] },
  { name: 'Bdim7',      root: 71, intervals: [0, 3, 6, 9] },
  { name: 'C#m7b5',     root: 61, intervals: [0, 3, 6, 10] },
  { name: 'Ebmaj9',     root: 63, intervals: [0, 4, 7, 11, 14] },
  { name: 'F#7b13',     root: 66, intervals: [0, 4, 7, 10, 20] },
  { name: 'G#m11',      root: 68, intervals: [0, 3, 7, 10, 14, 17] },
  { name: 'D7#11',      root: 62, intervals: [0, 4, 7, 10, 18] },
  { name: 'A7b9',       root: 69, intervals: [0, 4, 7, 10, 13] },
  { name: 'Cmin(maj7)', root: 60, intervals: [0, 3, 7, 11] },
];

const KEY_ROOT: Record<string, number> = {
  'Cm': 0, 'C#m': 1, 'Dm': 2, 'D#m': 3, 'Em': 4, 'Fm': 5,
  'F#m': 6, 'Gm': 7, 'G#m': 8, 'Am': 9, 'A#m': 10, 'Bm': 11,
  'CM': 0, 'C#M': 1, 'DM': 2, 'D#M': 3, 'EM': 4, 'FM': 5,
  'F#M': 6, 'GM': 7, 'G#M': 8, 'AM': 9, 'A#M': 10, 'BM': 11,
};

const NUM_SLOTS = 8;

function buildChordPalette(projectKey: string): ChordDef[] {
  const transpose = KEY_ROOT[projectKey] ?? 0;
  return CHORD_PALETTE_BASE.map(c => ({
    name: c.name,
    root: c.root + transpose,
    notes: c.intervals.map(i => c.root + transpose + i),
  }));
}

// ─── Voicing utilities ────────────────────────────────────────────────────────

function applyVoicing(notes: number[], voicing: SlotVoicing): number[] {
  if (notes.length === 0) return notes;
  let result = [...notes].sort((a, b) => a - b);
  const maxInversion = Math.min(voicing.inversion, result.length - 1);
  for (let i = 0; i < maxInversion; i++) {
    result[i] += 12;
  }
  result.sort((a, b) => a - b);
  if (voicing.openVoicing && result.length > 2) {
    result = result.map((note, idx) => idx % 2 === 1 ? note + 12 : note);
    result.sort((a, b) => a - b);
  }
  return result;
}

function maxInversionForChord(chord: ChordDef): number {
  return Math.max(0, chord.notes.length - 1);
}

const INVERSION_LABELS = ['Root', '1st', '2nd', '3rd'];

// ─── Rhythm config ────────────────────────────────────────────────────────────

const RHYTHM_SUBDIVISIONS: Record<string, number> = {
  staccato: 4,
  syncopated: 3,
  lush: 1,
  triplet: 3,
};

const RHYTHM_TEMPLATES = [
  { id: 'staccato', label: 'Staccato', icon: <Activity size={12} /> },
  { id: 'syncopated', label: 'Syncopated', icon: <Clock size={12} /> },
  { id: 'lush', label: 'Lush Pad', icon: <Music size={12} /> },
  { id: 'triplet', label: 'Triplet Feel', icon: <Activity size={12} /> },
];

function defaultVoicings(): SlotVoicing[] {
  return Array.from({ length: NUM_SLOTS }, () => ({ inversion: 0, openVoicing: false }));
}

// ─── Palette view mode ────────────────────────────────────────────────────────

type PaletteView = 'diatonic' | 'extended';

// ─── Component ────────────────────────────────────────────────────────────────

export const ChordBuilder = React.memo(function ChordBuilder() {
  const [slots, setSlots] = useState<(ChordDef | null)[]>(Array(NUM_SLOTS).fill(null));
  const [voicings, setVoicings] = useState<SlotVoicing[]>(defaultVoicings);
  const [draggedChord, setDraggedChord] = useState<ChordDef | null>(null);
  const [activeRhythm, setActiveRhythm] = useState('lush');
  const [isPlaying, setIsPlaying] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  // Sound preview state
  const [previewVoice, setPreviewVoice] = useState<PreviewVoiceId>('piano');
  const [chordMode, setChordMode] = useState<ChordMode>('sevenths');
  const [paletteView, setPaletteView] = useState<PaletteView>('diatonic');

  // Send-to-track state
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);

  const { audioContext, projectKey, bpm: contextBpm, trackRouter, previewEngine } = useTBMAudio();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slotIndexRef = useRef(0);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const voicingsRef = useRef(voicings);
  voicingsRef.current = voicings;

  // Sound preview engine (from shared context)
  const previewEngineRef = useRef<SoundPreviewEngine | null>(null);
  previewEngineRef.current = previewEngine ?? null;
  const previewVoiceRef = useRef(previewVoice);
  previewVoiceRef.current = previewVoice;

  // ── Auto-register in TrackRouter (mixer channel) ────────────────────────
  const chordSlotIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (!trackRouter) return;
    const SOURCE_ID = 'chord-builder';
    const TYPE: TrackContentType = 'chords';

    // Idempotency: don't double-register
    const existing = trackRouter.getByType(TYPE);
    if (existing.length > 0) {
      chordSlotIndexRef.current = existing[0].index;
    } else {
      const slot = trackRouter.assignToNextFree(TYPE, SOURCE_ID, 'Chord Builder');
      if (slot) chordSlotIndexRef.current = slot.index;
    }

    // Route preview engine output → slot input
    const slotInput = trackRouter.getSlotInput(chordSlotIndexRef.current);
    if (slotInput && previewEngine) {
      previewEngine.rerouteOutput(slotInput);
    }

    return () => {
      // Restore preview engine routing to masterBus on unmount
      const masterBus = trackRouter.getMasterBus();
      if (masterBus && previewEngine) {
        previewEngine.rerouteOutput(masterBus);
      }
      trackRouter.releaseBySource(SOURCE_ID);
      chordSlotIndexRef.current = -1;
    };
  }, [trackRouter, previewEngine]);

  // Build diatonic chords for scale degree view
  const diatonicChords = useMemo(
    () => buildDiatonicChords(projectKey, chordMode),
    [projectKey, chordMode],
  );

  // Build extended palette transposed to key
  const chordPalette = useMemo(() => buildChordPalette(projectKey), [projectKey]);

  // Active palette based on view
  const activePalette = paletteView === 'diatonic' ? diatonicChords : chordPalette;

  // Filtered palette for search
  const filteredPalette = useMemo(() => {
    if (!paletteSearch.trim()) return activePalette;
    const q = paletteSearch.trim().toLowerCase();
    return activePalette.filter(c => c.name.toLowerCase().includes(q));
  }, [activePalette, paletteSearch]);

  // ── Stop rhythm scheduler ──
  const stopRhythm = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => () => stopRhythm(), [stopRhythm]);

  // ── Play chord through SoundPreviewEngine ──
  const playChordAudio = useCallback((chord: ChordDef, voicing?: SlotVoicing) => {
    if (!audioContext) return;
    if (audioContext.state === 'suspended') audioContext.resume();

    const notesToPlay = voicing ? applyVoicing(chord.notes, voicing) : chord.notes;
    previewEngineRef.current?.playChord(notesToPlay, previewVoiceRef.current, 1.5);
  }, [audioContext]);

  // ── Trigger next slot in rhythm sequence ──
  const triggerNextSlot = useCallback(() => {
    const currentSlots = slotsRef.current;
    const currentVoicings = voicingsRef.current;
    const filledIndices: number[] = [];
    currentSlots.forEach((s, i) => { if (s) filledIndices.push(i); });
    if (!filledIndices.length) return;
    const idx = filledIndices[slotIndexRef.current % filledIndices.length];
    slotIndexRef.current++;
    playChordAudio(currentSlots[idx]!, currentVoicings[idx]);
  }, [playChordAudio]);

  // ── Toggle rhythm scheduler ──
  const toggleRhythm = useCallback(() => {
    if (isPlaying) {
      stopRhythm();
      return;
    }
    const filledSlots = slotsRef.current.filter(Boolean);
    if (!filledSlots.length) return;
    setIsPlaying(true);
    slotIndexRef.current = 0;
    const bpm = contextBpm || DEFAULT_BPM;
    const subdivisionFactor = RHYTHM_SUBDIVISIONS[activeRhythm] ?? 1;
    const intervalMs = (60000 / bpm) / subdivisionFactor;
    triggerNextSlot();
    intervalRef.current = setInterval(triggerNextSlot, intervalMs);
  }, [isPlaying, activeRhythm, triggerNextSlot, stopRhythm, contextBpm]);

  // Reset scheduler on rhythm change while playing
  useEffect(() => {
    if (isPlaying) stopRhythm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRhythm]);

  // ── Slot operations ──
  const handleDrop = (index: number) => {
    if (draggedChord) {
      const newSlots = [...slots];
      newSlots[index] = draggedChord;
      setSlots(newSlots);
      const newVoicings = [...voicings];
      newVoicings[index] = { inversion: 0, openVoicing: false };
      setVoicings(newVoicings);
    }
  };

  const clearAllSlots = () => {
    setSlots(Array(NUM_SLOTS).fill(null));
    setVoicings(defaultVoicings());
    setExpandedSlot(null);
    stopRhythm();
  };

  const removeSlot = (index: number) => {
    const n = [...slots];
    n[index] = null;
    setSlots(n);
    const v = [...voicings];
    v[index] = { inversion: 0, openVoicing: false };
    setVoicings(v);
    if (expandedSlot === index) setExpandedSlot(null);
  };

  const setSlotInversion = (index: number, inv: number) => {
    const v = [...voicings];
    v[index] = { ...v[index], inversion: inv };
    setVoicings(v);
  };

  const toggleSlotOpenVoicing = (index: number) => {
    const v = [...voicings];
    v[index] = { ...v[index], openVoicing: !v[index].openVoicing };
    setVoicings(v);
  };

  // ── Send to Track (one-click export) ──
  const handleSendToTrack = useCallback(() => {
    const filledSlots = slots.filter(Boolean) as ChordDef[];
    if (!filledSlots.length) {
      setSendFeedback('No chords to send');
      setTimeout(() => setSendFeedback(null), 2000);
      return;
    }

    const router = trackRouter;
    const slot = router.assignToNextFree(
      'chords' as TrackContentType,
      'chord-builder',
      `Chords: ${filledSlots.map(c => c.name).join('-')}`,
    );

    if (slot) {
      // Emit a custom event so the mixer/sequencer can pick up the data
      const event = new CustomEvent('tbm:send-to-track', {
        detail: {
          channelIndex: slot.index,
          type: 'chords',
          sourceId: 'chord-builder',
          data: {
            chords: filledSlots.map((c, _i) => ({
              name: c.name,
              notes: applyVoicing(c.notes, voicings[slots.indexOf(c)] ?? { inversion: 0, openVoicing: false }),
              root: c.root,
              degree: c.degree,
              function: c.function,
            })),
            rhythm: activeRhythm,
            voiceId: previewVoice,
            bpm: contextBpm || DEFAULT_BPM,
          },
        },
      });
      window.dispatchEvent(event);

      setSendFeedback(`Sent to Track ${slot.index + 1}`);
    } else {
      setSendFeedback('No free tracks available');
    }
    setTimeout(() => setSendFeedback(null), 2500);
  }, [slots, voicings, activeRhythm, previewVoice, contextBpm]);

  // ── Mini keyboard display for chord preview ──
  const renderMiniKeyboard = (chord: ChordDef | null, voicing?: SlotVoicing) => {
    if (!chord) return null;
    const notes = voicing ? applyVoicing(chord.notes, voicing) : chord.notes;
    // Show 2-octave range C3-B4 (MIDI 48-71)
    const startNote = 48;
    const numKeys = 24;
    const blacks = [1, 3, 6, 8, 10];

    return (
      <div className="flex h-6 gap-px relative" title={`Notes: ${notes.map(n => NOTE_NAMES[n % 12] + Math.floor(n / 12 - 1)).join(', ')}`}>
        {Array.from({ length: numKeys }, (_, i) => {
          const midi = startNote + i;
          const pc = midi % 12;
          const isBlack = blacks.includes(pc);
          const isActive = notes.some(n => n % 12 === pc);
          if (isBlack) return null; // Skip black keys in minimal view
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-colors ${
                isActive
                  ? 'bg-yellow-500/80'
                  : 'bg-neutral-700/40'
              }`}
              style={{ minWidth: 3, maxWidth: 8 }}
            />
          );
        })}
      </div>
    );
  };

  // ── Voice category groups for selector ──
  const voiceCategories = useMemo(() => {
    const cats: Record<string, typeof PREVIEW_VOICES> = {};
    PREVIEW_VOICES.forEach(v => {
      if (!cats[v.category]) cats[v.category] = [];
      cats[v.category].push(v);
    });
    return cats;
  }, []);

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Progression Builder</h2>
          <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-wide mt-0.5">
            Scale-aware chords with audition preview
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sound source selector */}
          <div className="flex items-center gap-1.5 bg-neutral-800/80 border border-neutral-700 rounded-lg px-2 py-1">
            <Volume2 size={11} className="text-neutral-500" />
            <select
              value={previewVoice}
              onChange={(e) => setPreviewVoice(e.target.value as PreviewVoiceId)}
              className="text-[11px] font-mono uppercase bg-transparent text-neutral-300 focus:outline-none cursor-pointer border-none"
              title="Preview sound source"
            >
              {Object.entries(voiceCategories).map(([cat, voices]) => (
                <optgroup key={cat} label={cat.toUpperCase()}>
                  {voices.map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* MIDI drag handle */}
          <div
            draggable
            onDragStart={(e) => {
              const filledSlots = slots.filter(Boolean) as ChordDef[];
              e.dataTransfer.setData('application/tbm-chord-progression', JSON.stringify(
                filledSlots.map(c => ({ type: 'chord', notes: c.notes, root: c.root, name: c.name, degree: c.degree, function: c.function }))
              ));
              e.dataTransfer.setData('text/plain', JSON.stringify(
                filledSlots.map(c => ({ type: 'chord', notes: c.notes, root: c.root }))
              ));
            }}
            className="flex items-center gap-1 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded cursor-grab active:cursor-grabbing hover:bg-neutral-700 transition-colors group"
          >
            <GripVertical className="w-3 h-3 text-neutral-500 group-hover:text-yellow-500" />
            <span className="text-[11px] font-bold text-neutral-400 uppercase">MIDI</span>
          </div>

          {/* Send to Track */}
          <button
            onClick={handleSendToTrack}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border bg-emerald-600/15 text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/25 hover:border-emerald-500/50"
            title="Send progression to next free mixer track"
          >
            <Send size={11} />
            Send to Track
          </button>

          {/* Play / Stop */}
          <button
            onClick={toggleRhythm}
            className={`text-[11px] font-mono uppercase px-2.5 py-1 rounded-lg border transition-colors ${
              isPlaying
                ? 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50 hover:bg-yellow-600/30'
                : 'text-neutral-500 border-neutral-700 bg-neutral-800 hover:text-neutral-300'
            }`}
          >
            {isPlaying ? 'Stop' : 'Play'}
          </button>
          <button onClick={clearAllSlots} className="text-[11px] font-mono text-neutral-600 hover:text-neutral-400 uppercase">
            Clear
          </button>
        </div>
      </div>

      {/* Send feedback toast */}
      {sendFeedback && (
        <div className="shrink-0 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-[11px] font-mono text-emerald-400 animate-pulse">
          {sendFeedback}
        </div>
      )}

      {/* ── 8-slot builder grid ── */}
      <div className="shrink-0">
        <div className="grid grid-cols-4 gap-2 vignette rounded-lg p-2 bg-neutral-950/30 border border-neutral-800/30">
          {slots.map((slot, i) => (
            <div key={i} className="flex flex-col gap-1">
              {/* Slot cell */}
              <div
                className={`border-2 border-dashed rounded-md flex flex-col items-center justify-center transition-colors relative group cursor-pointer h-20 ${
                  slot ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-500'
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                onClick={() => slot && playChordAudio(slot, voicings[i])}
              >
                {slot ? (
                  <>
                    {/* Function badge */}
                    {slot.function && (
                      <span
                        className="absolute top-1 left-1 text-[8px] font-black uppercase rounded px-1 py-px"
                        style={{
                          backgroundColor: FUNCTION_COLORS[slot.function] + '25',
                          color: FUNCTION_COLORS[slot.function],
                          border: `1px solid ${FUNCTION_COLORS[slot.function]}40`,
                        }}
                      >
                        {FUNCTION_LABELS[slot.function]}
                      </span>
                    )}
                    {/* Degree label */}
                    {slot.degree && (
                      <span className="text-[9px] font-mono text-neutral-500 mb-0.5">{slot.degree}</span>
                    )}
                    <span className="text-[#FFD700] font-bold font-mono text-sm leading-tight text-center px-1">{slot.name}</span>
                    {/* Mini keyboard */}
                    <div className="w-full px-1.5 mt-1">
                      {renderMiniKeyboard(slot, voicings[i])}
                    </div>
                  </>
                ) : (
                  <span className="text-neutral-600 text-[11px] font-mono uppercase">Slot {i+1}</span>
                )}
                {slot && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeSlot(i); }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-neutral-700 rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-white"
                    >
                      x
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedSlot(expandedSlot === i ? null : i); }}
                      className="absolute -bottom-1 right-0 w-4 h-4 bg-neutral-700 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Voicing settings"
                    >
                      {expandedSlot === i ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
                    </button>
                  </>
                )}
              </div>
              {/* Voicing controls */}
              {slot && expandedSlot === i && (
                <div className="bg-neutral-800/80 border border-neutral-700 rounded p-1.5 flex flex-col gap-1">
                  <div className="flex items-center gap-0.5">
                    {INVERSION_LABELS.slice(0, maxInversionForChord(slot) + 1).map((label, inv) => (
                      <button
                        key={inv}
                        onClick={(e) => { e.stopPropagation(); setSlotInversion(i, inv); }}
                        className={`flex-1 text-[10px] font-mono px-0.5 py-0.5 rounded transition-colors ${
                          voicings[i].inversion === inv
                            ? 'bg-yellow-600/30 text-yellow-400 border border-yellow-600/50'
                            : 'text-neutral-500 border border-neutral-700 hover:text-neutral-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSlotOpenVoicing(i); }}
                    className={`text-[10px] font-mono uppercase w-full py-0.5 rounded border transition-colors ${
                      voicings[i].openVoicing
                        ? 'bg-cyan-600/20 text-cyan-400 border-cyan-600/50'
                        : 'text-neutral-500 border-neutral-700 hover:text-neutral-300'
                    }`}
                  >
                    {voicings[i].openVoicing ? 'Open' : 'Closed'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom: Scale Degree Chords + Palette + Rhythm ── */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">

        {/* Left: Chord palettes */}
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {/* Palette mode toggle + search */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setPaletteView('diatonic')}
                className={`text-[10px] font-bold uppercase px-2.5 py-1 transition-colors ${
                  paletteView === 'diatonic'
                    ? 'bg-yellow-600/20 text-yellow-400'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                Scale Degrees
              </button>
              <button
                onClick={() => setPaletteView('extended')}
                className={`text-[10px] font-bold uppercase px-2.5 py-1 transition-colors ${
                  paletteView === 'extended'
                    ? 'bg-yellow-600/20 text-yellow-400'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                Extended
              </button>
            </div>

            {/* Chord mode (triads / sevenths) — only for diatonic view */}
            {paletteView === 'diatonic' && (
              <div className="flex items-center bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setChordMode('triads')}
                  className={`text-[10px] font-bold uppercase px-2 py-1 transition-colors ${
                    chordMode === 'triads'
                      ? 'bg-purple-600/20 text-purple-400'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Triads
                </button>
                <button
                  onClick={() => setChordMode('sevenths')}
                  className={`text-[10px] font-bold uppercase px-2 py-1 transition-colors ${
                    chordMode === 'sevenths'
                      ? 'bg-purple-600/20 text-purple-400'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  7ths
                </button>
              </div>
            )}

            <span className="text-[10px] font-bold font-mono text-neutral-600 uppercase tracking-widest ml-1">
              {projectKey}
            </span>

            <div className="relative flex-1 max-w-xs">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                type="text"
                placeholder="Search..."
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                className="w-full text-[11px] font-mono pl-6 pr-2 py-1 rounded border border-neutral-700 bg-neutral-800/80 text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-yellow-600/50 transition-colors"
              />
            </div>
          </div>

          {/* Diatonic scale degree strip (Scaler-inspired) */}
          {paletteView === 'diatonic' && (
            <div className="shrink-0">
              <div className="flex gap-1.5">
                {diatonicChords.map((chord, idx) => {
                  const fnColor = FUNCTION_COLORS[chord.function ?? 'passing'];
                  return (
                    <div
                      key={idx}
                      draggable
                      onDragStart={() => setDraggedChord(chord)}
                      onDragEnd={() => setDraggedChord(null)}
                      onClick={() => playChordAudio(chord)}
                      className="flex-1 flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-all border hover:scale-105"
                      style={{
                        backgroundColor: fnColor + '10',
                        borderColor: fnColor + '30',
                      }}
                    >
                      {/* Degree numeral */}
                      <span className="text-[10px] font-mono font-bold" style={{ color: fnColor }}>
                        {chord.degree}
                      </span>
                      {/* Chord name */}
                      <span className="text-[11px] font-bold font-mono text-neutral-200">
                        {chord.name}
                      </span>
                      {/* Function badge */}
                      <span
                        className="text-[7px] font-black uppercase tracking-wider px-1 rounded"
                        style={{ color: fnColor + 'cc' }}
                      >
                        {FUNCTION_LABELS[chord.function ?? 'passing']}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scrollable chord grid */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex flex-wrap gap-1.5 content-start">
              {filteredPalette.length === 0 && (
                <span className="text-neutral-600 text-[11px] font-mono">No chords match</span>
              )}
              {filteredPalette.map((chord, idx) => {
                const fnColor = chord.function ? FUNCTION_COLORS[chord.function] : '#FFD700';
                return (
                  <div
                    key={`${chord.name}-${idx}`}
                    draggable
                    onDragStart={() => setDraggedChord(chord)}
                    onDragEnd={() => setDraggedChord(null)}
                    onClick={() => playChordAudio(chord)}
                    className="flex flex-col items-center px-2.5 py-1.5 bg-neutral-800 border rounded-md cursor-grab active:cursor-grabbing text-sm font-mono transition-all hover:scale-105 group"
                    style={{
                      borderColor: fnColor + '30',
                    }}
                  >
                    {chord.degree && (
                      <span className="text-[8px] font-mono" style={{ color: fnColor + 'aa' }}>
                        {chord.degree}
                      </span>
                    )}
                    <span className="text-neutral-200 font-bold text-[12px] group-hover:text-[#FFD700] transition-colors">
                      {chord.name}
                    </span>
                    {chord.function && (
                      <span
                        className="text-[7px] font-black uppercase tracking-wider"
                        style={{ color: fnColor + '88' }}
                      >
                        {FUNCTION_LABELS[chord.function]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: Rhythm + preview info */}
        <div className="w-48 shrink-0 flex flex-col gap-2 border-l border-neutral-800 pl-3">
          <span className="text-[10px] font-bold font-mono text-neutral-500 uppercase tracking-widest shrink-0">Rhythm</span>
          <div className="flex flex-col gap-1.5">
            {RHYTHM_TEMPLATES.map(template => (
              <button
                key={template.id}
                onClick={() => setActiveRhythm(template.id)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase transition-all border ${
                  activeRhythm === template.id
                    ? 'bg-yellow-600/20 text-yellow-500 border-yellow-600/50'
                    : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:bg-neutral-700 hover:text-neutral-300'
                }`}
              >
                {template.icon}
                {template.label}
              </button>
            ))}
          </div>

          {/* Sound source info */}
          <div className="mt-2 pt-2 border-t border-neutral-800">
            <span className="text-[10px] font-bold font-mono text-neutral-600 uppercase tracking-widest block mb-1">
              Preview Sound
            </span>
            <div className="text-[10px] font-mono text-neutral-500 bg-neutral-900 rounded p-2 border border-neutral-800">
              {PREVIEW_VOICES.find(v => v.id === previewVoice)?.description ?? 'Select a sound'}
            </div>
          </div>

          {/* Function legend */}
          <div className="mt-2 pt-2 border-t border-neutral-800">
            <span className="text-[10px] font-bold font-mono text-neutral-600 uppercase tracking-widest block mb-1.5">
              Chord Functions
            </span>
            <div className="flex flex-col gap-1">
              {Object.entries(FUNCTION_LABELS).map(([fn, label]) => (
                <div key={fn} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: FUNCTION_COLORS[fn] }}
                  />
                  <span className="text-[10px] font-mono text-neutral-400 capitalize">{fn}</span>
                  <span className="text-[9px] font-bold text-neutral-600 ml-auto">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rhythm pattern info */}
          <div className="mt-auto pt-2 border-t border-neutral-800">
            <div className="text-[10px] font-mono text-neutral-500 bg-neutral-900 rounded p-2 border border-neutral-800">
              {activeRhythm === 'staccato' && 'Short, punchy 16th-note chord stabs. Great for funk and neo-soul.'}
              {activeRhythm === 'syncopated' && 'Off-beat syncopated chords with triplet feel. Jazz & R&B grooves.'}
              {activeRhythm === 'lush' && 'Sustained whole-note pads. Ambient and cinematic.'}
              {activeRhythm === 'triplet' && 'Triplet subdivision for swing and shuffle feels.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

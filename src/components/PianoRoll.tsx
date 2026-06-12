import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ZoomIn, ZoomOut, Plus, Music,
  List, LayoutGrid, Music2, AlignLeft, Magnet
} from 'lucide-react';
import { SynthSettings } from '../lib/TBMAudioEngine';
import { useTBMAudio } from '../contexts/TBMAudioContext';
import { TransportControls } from './ui/TransportControls';
import { TrackStatusBar } from './ui/TrackStatusBar';
import { NOTE_NAMES as _NOTE_NAMES, BEATS_PER_BAR as _BEATS_PER_BAR, DEFAULT_BPM } from '../lib/constants';
import type { TrackContentType } from '../lib/trackRouter';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Note {
  id: string;
  pitch: number;   // 0 = C-2 … 127 = G8
  start: number;   // beat fraction (0.0 = bar 1 beat 1)
  duration: number;
  velocity: number;
}

interface StepArticulation {
  sliding: boolean;
  portamento: boolean;
  accent: boolean;
}

type NoteTool = 'select' | 'draw' | 'paint' | 'drum-paint';

interface Track {
  id: number;
  name: string;
  color: string;
  notes: Note[];
  muted: boolean;
  solo: boolean;
}

interface Sequence {
  id: number;
  name: string;
  color: string;
  bars: number;
  tracks: Track[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const NOTE_NAMES = [..._NOTE_NAMES];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const TOTAL_PITCHES = 88; // piano range
const PITCH_OFFSET = 21; // A0 = MIDI 21
const ROW_H = 20; // px per pitch row (increased from 14 for better editing precision)
const BEAT_W = 48; // px per beat at zoom 1
const BEATS_PER_BAR = _BEATS_PER_BAR;

function pitchName(midi: number) {
  // Clamp to valid piano range before computing name to avoid negative modulo
  // in JS (e.g. -1 % 12 === -1), which would index NOTE_NAMES out-of-bounds.
  const clamped = Math.max(PITCH_OFFSET, midi);
  const n = clamped - PITCH_OFFSET;
  const octave = Math.floor(n / 12) + 1;
  return `${NOTE_NAMES[n % 12]}${octave}`;
}

const SCALE_PATTERNS: Record<string, number[]> = {
  'Major': [2, 2, 1, 2, 2, 2, 1],
  'Minor': [2, 1, 2, 2, 1, 2, 2],
  'Dorian': [2, 1, 2, 2, 2, 1, 2],
  'Phrygian': [1, 2, 2, 2, 1, 2, 2],
  'Lydian': [2, 2, 2, 1, 2, 2, 1],
  'Mixolydian': [2, 2, 1, 2, 2, 1, 2],
  'Locrian': [1, 2, 2, 1, 2, 2, 2],
};

function getScaleNotes(keyStr?: string): Set<number> {
  const scale = new Set<number>();
  if (!keyStr) return scale;
  
  let rootStr: string;
  let intervals: number[];
  
  if (keyStr.includes(':')) {
    const [r, m] = keyStr.split(':');
    rootStr = r;
    intervals = SCALE_PATTERNS[m] || SCALE_PATTERNS['Major'];
  } else {
    const isMinor = keyStr.endsWith('m');
    rootStr = isMinor ? keyStr.slice(0, -1) : keyStr;
    intervals = isMinor ? SCALE_PATTERNS['Minor'] : SCALE_PATTERNS['Major'];
  }
  
  const rootIndex = NOTE_NAMES.indexOf(rootStr as any);
  if (rootIndex === -1) return scale;
  
  let current = rootIndex;
  scale.add(current);
  for (let i = 0; i < 6; i++) {
    current = (current + intervals[i]) % 12;
    scale.add(current);
  }
  return scale;
}

function makeId() {
  return Math.random().toString(36).slice(2);
}

// ─── Sample data ──────────────────────────────────────────────────────────────
const TRACK_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

function makeDefaultTracks(): Track[] {
  return [
    {
      id: 0, name: 'Kick 808', color: '#ef4444', muted: false, solo: false,
      notes: [
        { id: makeId(), pitch: 36, start: 0,   duration: 0.5, velocity: 100 },
        { id: makeId(), pitch: 36, start: 1,   duration: 0.5, velocity: 100 },
        { id: makeId(), pitch: 36, start: 2,   duration: 0.5, velocity: 100 },
        { id: makeId(), pitch: 36, start: 3,   duration: 0.5, velocity: 100 },
      ]
    },
    {
      id: 1, name: 'Snare', color: '#3b82f6', muted: false, solo: false,
      notes: [
        { id: makeId(), pitch: 38, start: 1,   duration: 0.5, velocity: 90 },
        { id: makeId(), pitch: 38, start: 3,   duration: 0.5, velocity: 90 },
      ]
    },
    {
      id: 2, name: 'Hi-Hat', color: '#f59e0b', muted: false, solo: false,
      notes: Array.from({ length: 8 }, (_, i) => ({
        id: makeId(), pitch: 42, start: i * 0.5, duration: 0.25, velocity: 70
      }))
    },
    {
      id: 3, name: 'Bass', color: '#10b981', muted: false, solo: false,
      notes: [
        { id: makeId(), pitch: 40, start: 0,   duration: 1, velocity: 95 },
        { id: makeId(), pitch: 43, start: 1,   duration: 1, velocity: 95 },
        { id: makeId(), pitch: 40, start: 2,   duration: 1, velocity: 95 },
        { id: makeId(), pitch: 45, start: 3,   duration: 1, velocity: 95 },
      ]
    },
  ];
}

function makeDefaultSequences(): Sequence[] {
  return [
    { id: 0, name: 'Intro',  color: '#8b5cf6', bars: 4,  tracks: makeDefaultTracks() },
    { id: 1, name: 'Verse',  color: '#3b82f6', bars: 8,  tracks: makeDefaultTracks() },
    { id: 2, name: 'Chorus', color: '#ef4444', bars: 8,  tracks: makeDefaultTracks() },
    { id: 3, name: 'Break',  color: '#f59e0b', bars: 4,  tracks: makeDefaultTracks() },
    { id: 4, name: 'Outro',  color: '#10b981', bars: 4,  tracks: makeDefaultTracks() },
  ];
}

// Song arrangement row – which sequence plays at which bar position
interface ArrangementCell {
  seqId: number | null;
}

function makeDefaultArrangement(sequences: Sequence[]): ArrangementCell[][] {
  // sequences.length rows (one per sequence) × 32 columns (bars)
  const rows: ArrangementCell[][] = sequences.map(() =>
    Array.from({ length: 32 }, () => ({ seqId: null }))
  );
  // pre-fill a simple arrangement
  const layout = [
    [0, 4],    // Intro: bar 0-3
    [4, 12],   // Verse: bar 4-11
    [12, 20],  // Chorus: bar 12-19
    [20, 24],  // Break: bar 20-23
    [24, 32],  // Outro: bar 24-31
  ];
  layout.forEach(([start, end], si) => {
    for (let b = start; b < end && b < 32; b++) {
      rows[si][b].seqId = sequences[si].id;
    }
  });
  return rows;
}

// ─── TrackListRow — memoized to avoid re-renders when other tracks update ─────
const TrackListRow = React.memo(function TrackListRow({
  track,
  isActive,
  onClick,
}: {
  track: Track;
  isActive: boolean;
  onClick: (id: number) => void;
}) {
  return (
    <div
      onClick={() => onClick(track.id)}
      className={`h-10 px-2 flex items-center gap-2 cursor-pointer border-b border-neutral-900 transition-colors ${
        isActive ? 'bg-brand/10 text-brand' : 'text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
      }`}
    >
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: track.color }} />
      <span className="text-[13px] font-bold uppercase truncate">{track.name}</span>
    </div>
  );
});

// ─── TrackView ────────────────────────────────────────────────────────────────
function TrackView({
  tracks,
  bars,
  zoom,
  isRecording,
  midiAccess,
  onNotesChange,
  articulations,
  onArticulationChange,
}: {
  tracks: Track[];
  bars: number;
  zoom: number;
  isRecording: boolean;
  midiAccess: MIDIAccess | null;
  onNotesChange?: (trackIndex: number, notes: Note[]) => void;
  articulations: Map<string, StepArticulation>;
  onArticulationChange: (noteId: string, art: StepArticulation) => void;
}) {
  const [activeTrack, setActiveTrack] = useState(0);
  const [tool, setTool] = useState<NoteTool>('draw');
  const [localTracks, setLocalTracks] = useState<Track[]>(tracks);
  const [quantizeValue, setQuantizeValue] = useState<number>(4); // 1/4 note grid
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());

  // Resize state
  const [resizing, setResizing] = useState<{ noteId: string; startX: number; origDuration: number } | null>(null);
  // Velocity drag state (Ctrl+drag vertically)
  const [velDrag, setVelDrag] = useState<{ noteId: string; startY: number; origVelocity: number } | null>(null);
  // Scale snap
  const [snapToScale, setSnapToScale] = useState(false);
  const [showScalePopup, setShowScalePopup] = useState(false);
  const [scaleMode, setScaleMode] = useState<string>('Minor');

  const { bpm: contextBpm, projectKey, setProjectKey } = useTBMAudio();

  // Articulation popup state
  const [artPopup, setArtPopup] = useState<{ noteId: string; x: number; y: number } | null>(null);
  const artPopupRef = useRef<HTMLDivElement>(null);

  // Virtualization state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const OVERSCAN = 8; // extra rows above/below viewport

  const isPaintingRef = useRef(false);
  const paintPitchRef = useRef(0);

  // Sync local editable tracks when the active sequence changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalTracks(tracks);
    setActiveTrack(tracks[0]?.id ?? 0);
  }, [tracks]);

  // Notify parent of note changes (for synth.setSequence persistence)
  useEffect(() => {
    if (!onNotesChange) return;
    const activeIdx = localTracks.findIndex(t => t.id === activeTrack);
    if (activeIdx >= 0) {
      onNotesChange(activeIdx, localTracks[activeIdx].notes);
    }
  }, [localTracks, activeTrack, onNotesChange]);

  // ── MIDI recording ──
  const recordingRef = useRef(isRecording);
  const activeTrackRef = useRef(activeTrack);
  const contextBpmRef = useRef(contextBpm || DEFAULT_BPM);
  
  // Update refs in useEffect to avoid React render violations
  useEffect(() => {
    recordingRef.current = isRecording;
    activeTrackRef.current = activeTrack;
    contextBpmRef.current = contextBpm || DEFAULT_BPM;
  }, [isRecording, activeTrack, contextBpm]);
  const openNotesRef = useRef<Map<number, { startBeat: number; noteId: string }>>(new Map());
  const transportBeatRef = useRef(0);
  // Advance transport beat via rAF (approximate)
  const transportRafRef = useRef<number>(0);
  useEffect(() => {
    if (!isRecording) {
      cancelAnimationFrame(transportRafRef.current);
      openNotesRef.current.clear();
      return;
    }
    const startTime = performance.now();
    // Bug 3 fix: read from ref inside tick so BPM changes mid-record are respected
    const tick = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      transportBeatRef.current = elapsed * (contextBpmRef.current / 60);
      transportRafRef.current = requestAnimationFrame(tick);
    };
    transportRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(transportRafRef.current);
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording || !midiAccess) return;

    const handleMidiMsg = (e: Event) => {
      if (!recordingRef.current) return;
      const msg = e as MIDIMessageEvent;
      const [status, pitch, velocity] = Array.from(msg.data ?? []);
      const isNoteOn  = (status & 0xF0) === 0x90 && velocity > 0;
      const isNoteOff = (status & 0xF0) === 0x80 || ((status & 0xF0) === 0x90 && velocity === 0);

      if (isNoteOn) {
        const noteId = makeId();
        openNotesRef.current.set(pitch, { startBeat: transportBeatRef.current, noteId });
        // Bug 1 fix: use prev (functional updater arg) instead of closed-over localTracks;
        // Bug 2 fix: use activeTrackRef so this handler never goes stale.
        setLocalTracks(prev => prev.map((t, i) =>
          i === prev.findIndex(lt => lt.id === activeTrackRef.current)
            ? { ...t, notes: [...t.notes, { id: noteId, pitch, start: transportBeatRef.current, duration: 0.25, velocity }] }
            : t
        ));
      } else if (isNoteOff) {
        const open = openNotesRef.current.get(pitch);
        if (open) {
          const duration = Math.max(0.0625, transportBeatRef.current - open.startBeat);
          openNotesRef.current.delete(pitch);
          setLocalTracks(prev => prev.map(t => ({
            ...t,
            notes: t.notes.map(n =>
              n.id === open.noteId ? { ...n, duration } : n
            ),
          })));
        }
      }
    };

    for (const input of (midiAccess as any).inputs.values()) {
      input.addEventListener('midimessage', handleMidiMsg);
    }
    return () => {
      for (const input of (midiAccess as any).inputs.values()) {
        input.removeEventListener('midimessage', handleMidiMsg);
      }
    };
  // Bug 2 fix: removed localTracks and activeTrack from deps — both are now
  // read via refs inside the handler, so the listener never needs to be
  // torn down and re-registered on each state update.
  }, [isRecording, midiAccess]);

  // Track scroll position for virtualization
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewportHeight(el.clientHeight);
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    onResize();
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  const beatWidth = BEAT_W * zoom;

  // ── Scale computations ──
  const currentRootStr = useMemo(() => {
    if (!projectKey) return 'C';
    const isMinor = projectKey.endsWith('m');
    return isMinor ? projectKey.slice(0, -1) : projectKey;
  }, [projectKey]);

  const rootNoteIndex = useMemo(() => {
    if (!projectKey) return -1;
    const idx = NOTE_NAMES.indexOf(currentRootStr as any);
    return idx >= 0 ? idx : -1;
  }, [projectKey, currentRootStr]);

  const effectiveScaleKey = useMemo(() => {
    if (scaleMode === 'Minor' || scaleMode === 'Major') return projectKey;
    return `${currentRootStr}:${scaleMode}`;
  }, [projectKey, scaleMode, currentRootStr]);

  const displayScale = useMemo(() => {
    if (!projectKey) return 'No Key';
    return `${currentRootStr} ${scaleMode}`;
  }, [currentRootStr, scaleMode]);

  const ROOT_NOTES = useMemo(() => [...NOTE_NAMES], []);
  const SCALE_TYPES = ['Major', 'Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian'];
  const scalePopupRef = useRef<HTMLDivElement>(null);

  // Close scale popup on outside click
  useEffect(() => {
    if (!showScalePopup) return;
    const handleClick = (e: MouseEvent) => {
      if (scalePopupRef.current && !scalePopupRef.current.contains(e.target as Node)) {
        setShowScalePopup(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showScalePopup]);

  const handleGridClick = useCallback((e: React.MouseEvent<HTMLDivElement>, trackId: number) => {
    if (tool !== 'draw') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const beat = x / beatWidth;
    const pitchIdx = Math.floor(y / ROW_H);
    let midiPitch = PITCH_OFFSET + (TOTAL_PITCHES - 1 - pitchIdx);
    const snapped = Math.floor(beat * 4) / 4; // snap to 16th

    // Snap-to-scale: snap to nearest in-scale note
    if (snapToScale && effectiveScaleKey) {
      const scaleNotes = getScaleNotes(effectiveScaleKey);
      const noteInOct = (midiPitch - PITCH_OFFSET) % 12;
      if (!scaleNotes.has(noteInOct)) {
        let best = noteInOct;
        let bestDist = 12;
        for (const sn of scaleNotes) {
          let dist = Math.abs(sn - noteInOct);
          if (dist > 6) dist = 12 - dist;
          if (dist < bestDist) { bestDist = dist; best = sn; }
        }
        midiPitch = midiPitch - noteInOct + best;
      }
    }

    setLocalTracks(prev => prev.map(t =>
      t.id === trackId
        ? { ...t, notes: [...t.notes, { id: makeId(), pitch: midiPitch, start: snapped, duration: 0.25, velocity: 80 }] }
        : t
    ));
  }, [tool, beatWidth, snapToScale, effectiveScaleKey]);

  const totalBeats = bars * BEATS_PER_BAR;

  const handleDrumPaint = useCallback((midiPitch: number) => {
    if (tool !== 'drum-paint') return;
    const gridStep = 1 / quantizeValue;
    const totalSteps = Math.ceil(totalBeats / gridStep);
    setLocalTracks(prev => prev.map(t => {
      if (t.id !== activeTrack) return t;
      const newNotes = [...t.notes];
      for (let step = 0; step < totalSteps; step++) {
        const beatPos = Math.round(step * gridStep * 10000) / 10000;
        const exists = t.notes.some(n => n.pitch === midiPitch && Math.abs(n.start - beatPos) < 0.001);
        if (!exists) {
          newNotes.push({ id: makeId(), pitch: midiPitch, start: beatPos, duration: gridStep * 0.9, velocity: 80 });
        }
      }
      return { ...t, notes: newNotes };
    }));
  }, [tool, activeTrack, quantizeValue, totalBeats]);

  const handlePaintStart = useCallback((e: React.MouseEvent<HTMLDivElement>, trackId: number) => {
    if (tool !== 'paint') return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let midiPitch = PITCH_OFFSET + (TOTAL_PITCHES - 1 - Math.floor(y / ROW_H));
    // Snap-to-scale
    if (snapToScale && effectiveScaleKey) {
      const scaleNotes = getScaleNotes(effectiveScaleKey);
      const noteInOct = (midiPitch - PITCH_OFFSET) % 12;
      if (!scaleNotes.has(noteInOct)) {
        let best = noteInOct;
        let bestDist = 12;
        for (const sn of scaleNotes) {
          let dist = Math.abs(sn - noteInOct);
          if (dist > 6) dist = 12 - dist;
          if (dist < bestDist) { bestDist = dist; best = sn; }
        }
        midiPitch = midiPitch - noteInOct + best;
      }
    }
    const snapped = Math.round((x / beatWidth) * 4) / 4;
    isPaintingRef.current = true;
    paintPitchRef.current = midiPitch;
    setLocalTracks(prev => prev.map(t =>
      t.id === trackId ? { ...t, notes: [...t.notes, { id: makeId(), pitch: midiPitch, start: snapped, duration: 0.25, velocity: 80 }] } : t
    ));
    let lastPaintedBeat = snapped;
    const handleMove = (ev: MouseEvent) => {
      const bx = (ev.clientX - rect.left) / beatWidth;
      const curSnapped = Math.round(bx * 4) / 4;
      const curPitch = PITCH_OFFSET + (TOTAL_PITCHES - 1 - Math.floor((ev.clientY - rect.top) / ROW_H));
      if (curPitch === midiPitch && curSnapped !== lastPaintedBeat) {
        lastPaintedBeat = curSnapped;
        setLocalTracks(prev => prev.map(t => {
          if (t.id !== trackId) return t;
          const exists = t.notes.some(n => n.pitch === midiPitch && Math.abs(n.start - curSnapped) < 0.001);
          if (!exists) {
            return { ...t, notes: [...t.notes, { id: makeId(), pitch: midiPitch, start: curSnapped, duration: 0.25, velocity: 80 }] };
          }
          return t;
        }));
      }
    };
    const handleUp = () => {
      isPaintingRef.current = false;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [tool, beatWidth, snapToScale, effectiveScaleKey]);

  // ── Note articulation popup (right-click) ──
  const handleNoteContextMenu = useCallback((e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setArtPopup({ noteId, x: e.clientX, y: e.clientY });
  }, []);

  // Close articulation popup on outside click
  useEffect(() => {
    if (!artPopup) return;
    const handleClick = (e: MouseEvent) => {
      if (artPopupRef.current && !artPopupRef.current.contains(e.target as Node)) {
        setArtPopup(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [artPopup]);

  // ── Note resize (drag right edge) ──
  const handleResizeStart = useCallback((e: React.MouseEvent, noteId: string, origDuration: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ noteId, startX: e.clientX, origDuration });
  }, []);

  // ── Velocity drag (Ctrl+drag vertically on a note) ──
  const handleVelDragStart = useCallback((e: React.MouseEvent, noteId: string, origVelocity: number) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    setVelDrag({ noteId, startY: e.clientY, origVelocity });
  }, []);

  // Global mouse move/up for resize and velocity editing
  useEffect(() => {
    if (!resizing && !velDrag) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (resizing) {
        const dx = e.clientX - resizing.startX;
        const deltaDuration = dx / beatWidth;
        const newDuration = Math.max(0.0625, resizing.origDuration + deltaDuration);
        // Snap duration to 1/16th
        const snappedDuration = Math.round(newDuration * 16) / 16;
        setLocalTracks(prev => prev.map(t =>
          t.id === activeTrack
            ? { ...t, notes: t.notes.map(n => n.id === resizing.noteId ? { ...n, duration: Math.max(0.0625, snappedDuration) } : n) }
            : t
        ));
      }
      if (velDrag) {
        const dy = velDrag.startY - e.clientY; // up = louder
        const newVel = Math.round(Math.min(127, Math.max(1, velDrag.origVelocity + dy)));
        setLocalTracks(prev => prev.map(t =>
          t.id === activeTrack
            ? { ...t, notes: t.notes.map(n => n.id === velDrag.noteId ? { ...n, velocity: newVel } : n) }
            : t
        ));
      }
    };
    const handleMouseUp = () => {
      setResizing(null);
      setVelDrag(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, velDrag, beatWidth, activeTrack]);

  // ── Quantize notes ──
  const handleQuantize = useCallback(() => {
    const grid = 1 / quantizeValue; // e.g. quantizeValue=4 → grid=0.25 (quarter note)
    setLocalTracks(prev => prev.map(t =>
      t.id === activeTrack
        ? { ...t, notes: t.notes.map(n => ({ ...n, start: Math.round(n.start / grid) * grid })) }
        : t
    ));
  }, [activeTrack, quantizeValue]);

  const currentTrack = localTracks.find(t => t.id === activeTrack) ?? localTracks[0];
  const totalBars = bars;
  const gridWidth = totalBeats * beatWidth;
  const totalHeight = TOTAL_PITCHES * ROW_H;

  const handleTrackClick = useCallback((id: number) => setActiveTrack(id), []);

  // Compute visible row range
  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const lastVisibleRow = Math.min(TOTAL_PITCHES - 1, Math.ceil((scrollTop + viewportHeight) / ROW_H) + OVERSCAN);

  // Memoize visible rows for piano keys and grid rows
  const visibleRows = useMemo(() => {
    const scaleNotes = getScaleNotes(effectiveScaleKey);
    const rows: { i: number; midiPitch: number; noteInOctave: number; isBlack: boolean; isC: boolean; inScale: boolean }[] = [];
    for (let i = firstVisibleRow; i <= lastVisibleRow; i++) {
      const midiPitch = PITCH_OFFSET + (TOTAL_PITCHES - 1 - i);
      const noteInOctave = (midiPitch - PITCH_OFFSET) % 12;
      rows.push({
        i,
        midiPitch,
        noteInOctave,
        isBlack: BLACK_KEYS.has(noteInOctave),
        isC: noteInOctave === 0,
        inScale: scaleNotes.has(noteInOctave)
      });
    }
    return rows;
  }, [firstVisibleRow, lastVisibleRow, effectiveScaleKey]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-1 bg-neutral-950 rounded-md p-0.5">
          {(['select', 'draw', 'paint', 'drum-paint'] as NoteTool[]).map(t => (
            <button
              key={t}
              onClick={() => setTool(t)}
              title={t === 'drum-paint' ? 'Fill empty steps in row' : t === 'paint' ? 'Paint across grid cells' : undefined}
              className={`px-2.5 py-1 rounded text-[13px] font-bold uppercase transition-all ${tool === t ? 'bg-brand text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              {t === 'drum-paint' ? 'Drum' : t}
            </button>
          ))}
        </div>

        {/* Quantize controls */}
        <div className="flex items-center gap-1 bg-neutral-950 rounded-md p-0.5 border border-neutral-800">
          <Magnet size={11} className="text-neutral-500 ml-1" />
          <select
            value={quantizeValue}
            onChange={e => setQuantizeValue(Number(e.target.value))}
            className="bg-transparent text-[13px] font-bold text-neutral-400 outline-none cursor-pointer uppercase px-1 py-0.5"
          >
            <option value={1}>1/1</option>
            <option value={2}>1/2</option>
            <option value={4}>1/4</option>
            <option value={8}>1/8</option>
            <option value={16}>1/16</option>
            <option value={32}>1/32</option>
          </select>
          <button
            onClick={handleQuantize}
            className="px-2 py-0.5 rounded text-[13px] font-bold uppercase text-neutral-500 hover:text-white hover:bg-brand transition-all"
          >
            Quantize
          </button>
        </div>

        {/* Scale selector */}
        <div className="relative" ref={scalePopupRef}>
          <button
            onClick={() => setShowScalePopup(v => !v)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <Music2 size={11} />
            <span>{displayScale}</span>
          </button>
          {showScalePopup && (
            <div className="absolute top-full left-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-lg p-2 z-50 shadow-xl" style={{ minWidth: 200 }}>
              <div className="text-[10px] font-bold text-neutral-600 uppercase mb-1">Root</div>
              <div className="grid grid-cols-6 gap-0.5 mb-2">
                {ROOT_NOTES.map(note => (
                  <button
                    key={note}
                    onClick={() => {
                      setShowScalePopup(false);
                      const newKey = scaleMode === 'Minor' ? note + 'm' : note;
                      setProjectKey(newKey);
                    }}
                    className={`text-xs font-bold px-1.5 py-1 rounded transition-colors ${
                      currentRootStr === note ? 'bg-brand text-white' : 'text-neutral-400 hover:bg-neutral-800'
                    }`}
                  >
                    {note}
                  </button>
                ))}
              </div>
              <div className="text-[10px] font-bold text-neutral-600 uppercase mb-1">Scale</div>
              <div className="flex flex-col gap-0.5">
                {SCALE_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setScaleMode(type);
                      setShowScalePopup(false);
                      if (type === 'Major') setProjectKey(currentRootStr);
                      else if (type === 'Minor') setProjectKey(currentRootStr + 'm');
                      // Other modes: keep projectKey as root-only for backward compat
                    }}
                    className={`text-xs font-bold px-2 py-1 rounded text-left transition-colors ${
                      scaleMode === type ? 'bg-brand text-white' : 'text-neutral-400 hover:bg-neutral-800'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Snap-to-scale toggle */}
        <button
          onClick={() => setSnapToScale(v => !v)}
          title="Snap to scale"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold transition-colors ${
            snapToScale
              ? 'bg-brand text-white shadow-sm shadow-brand/30'
              : 'bg-neutral-950 border border-neutral-800 text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Music size={11} />
          <span>Snap</span>
        </button>

        <span className="text-[13px] font-mono text-neutral-600 uppercase tracking-widest">
          {totalBars} bars · {currentTrack.notes.length} notes
        </span>
        <span className="text-xs font-mono text-neutral-700 ml-auto uppercase">
          Right-click note to delete · Drag edge to resize · Ctrl+drag to set velocity
        </span>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Track list */}
        <div className="w-36 shrink-0 border-r border-neutral-800 overflow-y-auto custom-scrollbar bg-neutral-950">
          {localTracks.map(t => (
            <TrackListRow
              key={t.id}
              track={t}
              isActive={activeTrack === t.id}
              onClick={handleTrackClick}
            />
          ))}
          <button
            onClick={() => {
              const newId = (localTracks.length > 0 ? Math.max(...localTracks.map(t => t.id)) : -1) + 1;
              const color = TRACK_COLORS[newId % TRACK_COLORS.length];
              setLocalTracks(prev => [...prev, { id: newId, name: `Track ${newId + 1}`, color, notes: [], muted: false, solo: false }]);
              setActiveTrack(newId);
            }}
            className="w-full h-8 flex items-center justify-center gap-1 text-neutral-700 hover:text-neutral-400 text-[13px] hover:bg-neutral-900 transition-colors"
          >
            <Plus size={11} /> Track
          </button>
        </div>

        {/* Piano keys + note grid — virtualized */}
        <div className="flex-1 flex overflow-auto custom-scrollbar" ref={scrollContainerRef}>
          {/* Piano keys */}
          <div
            className="shrink-0 w-10 bg-neutral-950 border-r border-neutral-800 relative"
            style={{ height: totalHeight }}
          >
            {visibleRows.map(({ i, midiPitch, isBlack, isC, inScale }) => (
              <div
                key={i}
                className={`absolute w-full border-b border-neutral-900 flex items-center justify-end pr-1 ${
                  isBlack ? 'bg-neutral-800' : 'bg-neutral-200/5'
                } ${tool === 'drum-paint' ? 'cursor-pointer' : ''}`}
                style={{ top: i * ROW_H, height: ROW_H }}
                onClick={() => handleDrumPaint(midiPitch)}
              >
                {inScale && !isC && (
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand/50" />
                )}
                {isC && (
                  <span className={`text-[7px] font-bold ${inScale ? 'text-brand' : 'text-neutral-600'}`}>{pitchName(midiPitch)}</span>
                )}
              </div>
            ))}
          </div>

          {/* Note grid */}
          <div
            className={`relative bg-neutral-950 ${tool === 'draw' ? 'cursor-crosshair' : tool === 'paint' ? 'cursor-copy' : tool === 'drum-paint' ? 'cursor-pointer' : 'cursor-default'}`}
            style={{ width: gridWidth, height: totalHeight, minWidth: gridWidth }}
            onMouseDown={(e) => {
              if (tool === 'draw') handleGridClick(e, activeTrack);
              else if (tool === 'paint') handlePaintStart(e, activeTrack);
            }}
          >
            {/* Horizontal pitch rows — only visible ones */}
            {visibleRows.map(({ i, isBlack, inScale }) => (
              <div
                key={i}
                className={`absolute w-full border-b ${isBlack ? 'bg-neutral-900/50' : ''} ${inScale ? 'bg-brand/10' : 'bg-black/30'} border-neutral-900`}
                style={{ top: i * ROW_H, height: ROW_H }}
              />
            ))}

            {/* Vertical beat lines */}
            {Array.from({ length: totalBeats + 1 }).map((_, b) => (
              <div
                key={b}
                className={`absolute top-0 bottom-0 border-l ${b % BEATS_PER_BAR === 0 ? 'border-neutral-600' : 'border-neutral-800'}`}
                style={{ left: b * beatWidth }}
              />
            ))}

            {/* Notes for current track */}
            {currentTrack.notes.map(note => {
              const pitchIdx = PITCH_OFFSET + (TOTAL_PITCHES - 1) - note.pitch;
              const noteWidth = Math.max(note.duration * beatWidth - 2, 4);
              // Velocity → opacity: 1–127 maps to 0.3–1.0
              const velOpacity = 0.3 + (note.velocity / 127) * 0.7;
              const isSelected = selectedNotes.has(note.id);
              const noteInOctave = (note.pitch - PITCH_OFFSET) % 12;
              const isRootNote = rootNoteIndex >= 0 && noteInOctave === rootNoteIndex;
              const art = articulations.get(note.id);
              return (
                <div
                  key={note.id}
                  className="absolute rounded-sm flex items-center group border-l-2"
                  style={{
                    left: note.start * beatWidth,
                    top: pitchIdx * ROW_H + 1,
                    width: noteWidth,
                    height: ROW_H - 2,
                    borderLeftWidth: isRootNote ? 3 : 2,
                    backgroundColor: isRootNote ? currentTrack.color + '88' : currentTrack.color + '55',
                    borderColor: isRootNote ? '#f59e0b' : currentTrack.color,
                    opacity: velOpacity,
                    outline: isSelected ? `1px solid ${currentTrack.color}` : undefined,
                    cursor: resizing ? 'ew-resize' : velDrag ? 'ns-resize' : 'default',
                    zIndex: isSelected ? 10 : 1,
                  }}
                  onContextMenu={e => handleNoteContextMenu(e, note.id)}
                  onMouseDown={e => {
                    // Ctrl+click → velocity drag
                    if (e.ctrlKey) {
                      handleVelDragStart(e, note.id, note.velocity);
                      return;
                    }
                    // Normal click in select mode → toggle selection
                    if (tool === 'select') {
                      e.stopPropagation();
                      setSelectedNotes(prev => {
                        const next = new Set(prev);
                        if (next.has(note.id)) next.delete(note.id);
                        else next.add(note.id);
                        return next;
                      });
                    }
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <span className="text-[7px] font-bold truncate px-1 pointer-events-none select-none" style={{ color: currentTrack.color }}>
                    {pitchName(note.pitch)}
                  </span>
                  {/* Velocity indicator bar (bottom edge) */}
                  <div
                    className="absolute bottom-0 left-0 h-0.5 pointer-events-none"
                    style={{
                      width: `${(note.velocity / 127) * 100}%`,
                      backgroundColor: currentTrack.color,
                      opacity: 0.9,
                    }}
                  />
                  {/* Resize handle (right edge) */}
                  <div
                    className="absolute top-0 right-0 w-1.25 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: currentTrack.color + '88' }}
                    onMouseDown={e => handleResizeStart(e, note.id, note.duration)}
                  />
                  {/* Articulation indicators */}
                  {art && (
                    <div className="absolute top-0.5 right-3 flex gap-0.5 pointer-events-none">
                      {art.accent && <div className="w-1 h-1 rounded-full bg-yellow-400" title="Accent" />}
                      {art.sliding && <div className="w-1 h-1 rounded-full bg-cyan-400" title="Sliding" />}
                      {art.portamento && <div className="w-1 h-1 rounded-full bg-fuchsia-400" title="Portamento" />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Articulation popup */}
      {artPopup && (
        <div
          ref={artPopupRef}
          className="fixed z-50 bg-neutral-900 border border-neutral-700 rounded-lg p-2 shadow-xl flex gap-1"
          style={{ left: artPopup.x, top: artPopup.y }}
        >
          {(['accent', 'sliding', 'portamento'] as const).map(flag => {
            const current = articulations.get(artPopup.noteId);
            const isOn = current?.[flag] ?? false;
            return (
              <button
                key={flag}
                onClick={() => {
                  const prev = articulations.get(artPopup.noteId) ?? { sliding: false, portamento: false, accent: false };
                  onArticulationChange(artPopup.noteId, { ...prev, [flag]: !isOn });
                  setArtPopup(null);
                }}
                className={`px-2.5 py-1 rounded text-xs font-bold uppercase transition-all ${
                  isOn
                    ? flag === 'accent' ? 'bg-yellow-500 text-black'
                      : flag === 'sliding' ? 'bg-cyan-500 text-black'
                      : 'bg-fuchsia-500 text-black'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                {flag}
              </button>
            );
          })}
          <button
            onClick={() => {
              setLocalTracks(prev => prev.map(t =>
                t.id === activeTrack
                  ? { ...t, notes: t.notes.filter(n => n.id !== artPopup.noteId) }
                  : t
              ));
              setSelectedNotes(prev => {
                const next = new Set(prev);
                next.delete(artPopup.noteId);
                return next;
              });
              setArtPopup(null);
            }}
            className="px-2 py-1 rounded text-xs font-bold uppercase bg-red-900/50 text-red-400 hover:bg-red-800 transition-all ml-2"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── SongMode ─────────────────────────────────────────────────────────────────
function SongMode({ sequences }: { sequences: Sequence[] }) {
  const [arrangement, setArrangement] = useState<ArrangementCell[][]>(() =>
    makeDefaultArrangement(sequences)
  );
  const [hoveredSeqId, setHoveredSeqId] = useState<number | null>(null);
  const [selectedSeqId, setSelectedSeqId] = useState<number>(sequences[0]?.id ?? 0);
  const COLS = 32;
  const CELL_W = 36;

  const toggleCell = (rowIdx: number, colIdx: number) => {
    setArrangement(prev => {
      const next = prev.map(row => [...row]);
      next[rowIdx][colIdx] = {
        seqId: next[rowIdx][colIdx].seqId !== null ? null : selectedSeqId,
      };
      return next;
    });
  };

  const selectedSeq = sequences.find(s => s.id === selectedSeqId);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-neutral-800 shrink-0 flex-wrap">
        <span className="text-[13px] font-bold uppercase tracking-widest text-neutral-500">Paint Sequence:</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {sequences.map(seq => (
            <button
              key={seq.id}
              onClick={() => setSelectedSeqId(seq.id)}
              className={`px-2.5 py-1 rounded text-[13px] font-bold uppercase transition-all border ${
                selectedSeqId === seq.id
                  ? 'text-white border-transparent'
                  : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:text-neutral-300'
              }`}
              style={selectedSeqId === seq.id ? { backgroundColor: seq.color + 'cc', borderColor: seq.color } : {}}
            >
              {seq.name}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[13px] font-mono text-neutral-600 uppercase">
          {selectedSeq ? `${selectedSeq.bars} bars` : ''}
        </span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sequence labels */}
        <div className="w-28 shrink-0 border-r border-neutral-800 bg-neutral-950 overflow-y-auto custom-scrollbar">
          <div className="h-6 border-b border-neutral-800" /> {/* ruler spacer */}
          {sequences.map((seq) => (
            <div
              key={seq.id}
              className="h-10 px-3 flex items-center gap-2 border-b border-neutral-900"
            >
              <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: seq.color }} />
              <span className="text-[13px] font-bold uppercase text-neutral-400 truncate">{seq.name}</span>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {/* Bar ruler */}
          <div className="flex border-b border-neutral-800 sticky top-0 bg-neutral-950 z-10" style={{ width: COLS * CELL_W }}>
            {Array.from({ length: COLS }).map((_, b) => (
              <div
                key={b}
                className={`shrink-0 h-6 border-r border-neutral-800 flex items-center justify-center ${b % 4 === 0 ? 'text-neutral-400' : 'text-neutral-700'}`}
                style={{ width: CELL_W, fontSize: 8, fontWeight: 'bold', fontFamily: 'monospace' }}
              >
                {b % 4 === 0 ? b + 1 : ''}
              </div>
            ))}
          </div>

          {/* Arrangement rows */}
          {sequences.map((seq, rowIdx) => (
            <div key={seq.id} className="flex border-b border-neutral-900" style={{ height: 40 }}>
              {arrangement[rowIdx]?.map((cell, colIdx) => {
                const filled = cell.seqId !== null;
                const cellSeq = filled ? sequences.find(s => s.id === cell.seqId) : null;
                const isHovered = cell.seqId === hoveredSeqId && cell.seqId !== null;
                return (
                  <div
                    key={colIdx}
                    className={`shrink-0 border-r border-neutral-900 cursor-pointer transition-colors ${
                      filled ? '' : 'hover:bg-neutral-800/40'
                    }`}
                    style={{
                      width: CELL_W,
                      backgroundColor: filled
                        ? (cellSeq?.color ?? seq.color) + (isHovered ? 'cc' : '77')
                        : undefined,
                    }}
                    onClick={() => toggleCell(rowIdx, colIdx)}
                    onMouseEnter={() => cell.seqId !== null && setHoveredSeqId(cell.seqId)}
                    onMouseLeave={() => setHoveredSeqId(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DEFAULT_SYNTH_SETTINGS: SynthSettings = {
  type: 'sine',
  frequency: 440,
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.3,
  filterFreq: 8000,
  filterQ: 1,
  distortion: 0,
};

export function PianoRoll() {
  const [mode, setMode] = useState<'track' | 'song'>('track');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sequences, setSequences] = useState<Sequence[]>(makeDefaultSequences);
  const [activeSequenceId, setActiveSequenceId] = useState(0);
  const [articulations, setArticulations] = useState<Map<string, StepArticulation>>(new Map());
  const articulationsRef = useRef(articulations);
  useEffect(() => {
    articulationsRef.current = articulations;
  }, [articulations]);

  const { synth, midiAccess, bpm, setBpm, trackRouter } = useTBMAudio();
  const playTimeoutsRef = useRef<number[]>([]);
  const activeVoiceIdsRef = useRef<number[]>([]);
  // Flag cleared by handleStop so any note-off timeout that fires after stop
  // doesn't call noteOff on a voice that has already been killed (Bug 6 fix).
  const playbackActiveRef = useRef(false);
  // Always-current ref to synth so the unmount cleanup never closes over a
  // stale value (avoids re-registering the cleanup effect on every synth change).
  const synthRef = useRef(synth);
  
  // Update synth ref in useEffect
  useEffect(() => {
    synthRef.current = synth;
  }, [synth]);

  // ── Auto-register in TrackRouter (mixer channel) ────────────────────────
  const pianoSlotIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (!trackRouter || !synth) return;
    const SOURCE_ID = 'piano-roll';
    const TYPE: TrackContentType = 'melody';

    // Idempotency: don't double-register
    const existing = trackRouter.getByType(TYPE);
    if (existing.length > 0) {
      pianoSlotIndexRef.current = existing[0].index;
    } else {
      const slot = trackRouter.assignToNextFree(TYPE, SOURCE_ID, 'Piano Roll');
      if (slot) pianoSlotIndexRef.current = slot.index;
    }

    // Route synth output → slot input (instead of masterBus)
    const slotInput = trackRouter.getSlotInput(pianoSlotIndexRef.current);
    if (slotInput) {
      synth.rerouteOutput(slotInput);
    }

    return () => {
      // Restore synth routing to masterBus on unmount
      const masterBus = trackRouter.getMasterBus();
      if (masterBus) {
        synth.rerouteOutput(masterBus);
      }
      trackRouter.releaseBySource(SOURCE_ID);
      pianoSlotIndexRef.current = -1;
    };
  }, [trackRouter, synth]);
  // Ref to handleStop so that the auto-stop timeout (scheduled inside handlePlay
  // before handleStop is defined) can call the full stop routine instead of only
  // setting isPlaying to false and leaving playbackActiveRef / activeVoiceIdsRef stale.
  const handleStopRef = useRef<() => void>(() => {});

  const activeSequence = sequences.find(s => s.id === activeSequenceId) ?? sequences[0];

  // Save piano roll state to localStorage
  const savePianoRollState = useCallback(() => {
    try {
      const state = {
        sequences,
        activeSequenceId,
        mode,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem('tbm_piano_roll_state', JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save piano roll state:', error);
    }
  }, [sequences, activeSequenceId, mode]);

  // Load piano roll state from localStorage on mount
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      const saved = localStorage.getItem('tbm_piano_roll_state');
      if (saved) {
        const state = JSON.parse(saved);
         if (state.sequences && Array.isArray(state.sequences)) {
           queueMicrotask(() => setSequences(state.sequences));
         }
         if (state.activeSequenceId !== undefined) {
           queueMicrotask(() => setActiveSequenceId(state.activeSequenceId));
         }
         if (state.mode === 'track' || state.mode === 'song') {
           queueMicrotask(() => setMode(state.mode));
         }
      }
    } catch (error) {
      console.error('Failed to load piano roll state:', error);
    }
  }, []);

  // Save state when it changes
  useEffect(() => {
    savePianoRollState();
  }, [savePianoRollState]);

  // Cleanup play timeouts on unmount to prevent memory leaks and setState on unmounted component
  // Bug 4 fix: dep was [synth], causing this effect to tear down and kill all active voices
  // whenever synth changed mid-session. Changed to [] (unmount only); synth accessed via ref.
  useEffect(() => {
    return () => {
      playTimeoutsRef.current.forEach(id => clearTimeout(id));
      playTimeoutsRef.current = [];
      activeVoiceIdsRef.current.forEach(voiceId => {
        try {
          synthRef.current?.noteOff(voiceId, DEFAULT_SYNTH_SETTINGS);
        } catch { /* synth may have been destroyed */ }
      });
      activeVoiceIdsRef.current = [];
    };
  }, []);

  const handlePlay = useCallback(() => {
    if (!synth) return;

    // Resume AudioContext on first user gesture
    const ctx = synth.getContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();

    const beatMs = (60 / bpm) * 1000;

    // Collect notes from all non-muted tracks
    const activeTracks = activeSequence.tracks.filter(t => !t.muted);
    // Track active voice IDs so handleStop can kill them
    activeVoiceIdsRef.current = [];
    playbackActiveRef.current = true;

    activeTracks.forEach(track => {
      track.notes.forEach(note => {
        const startMs = note.start * beatMs;
        const durMs = note.duration * beatMs;
        const art = articulationsRef.current.get(note.id);
        let effectiveVelocity = note.velocity / 127;
        if (art?.accent) {
          effectiveVelocity = Math.min(1, effectiveVelocity * 1.2);
        }

        const onId = window.setTimeout(() => {
          if (!playbackActiveRef.current) return;
          const voiceId = synth.noteOn(note.pitch, DEFAULT_SYNTH_SETTINGS, effectiveVelocity);
          activeVoiceIdsRef.current.push(voiceId);

          if (art?.sliding || art?.portamento) {
            return;
          }
          const offId = window.setTimeout(() => {
            // Bug 6 fix: guard against handleStop having fired before offId was
            // pushed into playTimeoutsRef (the note-on/push race window).
            if (!playbackActiveRef.current) return;
            synth.noteOff(voiceId, DEFAULT_SYNTH_SETTINGS);
            // Remove from active list
            activeVoiceIdsRef.current = activeVoiceIdsRef.current.filter(id => id !== voiceId);
          }, durMs);
          playTimeoutsRef.current.push(offId);
        }, startMs);

        playTimeoutsRef.current.push(onId);
      });
    });

    setIsPlaying(true);

    // Auto-stop after the sequence length
    const totalBeats = activeSequence.bars * BEATS_PER_BAR;
    const totalMs = totalBeats * beatMs;
    const stopId = window.setTimeout(() => {
      handleStopRef.current();
    }, totalMs + 500);
    playTimeoutsRef.current.push(stopId);
  }, [bpm, activeSequence, synth]);

  const handleStop = useCallback(() => {
    playbackActiveRef.current = false;
    playTimeoutsRef.current.forEach(id => clearTimeout(id));
    playTimeoutsRef.current = [];
    // Kill all currently sounding voices to prevent phantom oscillators
    if (synth) {
      activeVoiceIdsRef.current.forEach(voiceId => {
        synth.noteOff(voiceId, DEFAULT_SYNTH_SETTINGS);
      });
    }
    activeVoiceIdsRef.current = [];
    setIsPlaying(false);
    setIsRecording(false);
  }, [synth]);

  // Keep handleStopRef in sync so auto-stop timeout always calls the latest version.
  useEffect(() => {
    handleStopRef.current = handleStop;
  }, [handleStop]);

  const handleNotesChange = useCallback((trackIndex: number, notes: Note[]) => {
    // Forward notes to synth if available (setSequence API)
    if (synth && typeof (synth as any).setSequence === 'function') {
      (synth as any).setSequence(trackIndex, notes);
    }
  }, [synth]);

  return (
    <div className="h-full flex flex-col gap-0 bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden vignette">
      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-neutral-800 shrink-0 bg-neutral-950/60 relative edge-glow-bottom">
        <div className="flex items-center gap-1.5">
          <Music2 size={14} className="text-brand" />
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-300">Piano Roll</span>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-0.5 bg-neutral-950 rounded-lg p-0.5 border border-neutral-800">
          <button
            onClick={() => setMode('track')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[13px] font-bold uppercase tracking-wide transition-all ${
              mode === 'track' ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <List size={11} /> Track View
          </button>
          <button
            onClick={() => setMode('song')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[13px] font-bold uppercase tracking-wide transition-all ${
              mode === 'song' ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <LayoutGrid size={11} /> Song Mode
          </button>
        </div>

        {/* Transport */}
        <TransportControls
          isPlaying={isPlaying}
          isRecording={isRecording}
          onPlay={handlePlay}
          onStop={handleStop}
          onRecord={() => setIsRecording(!isRecording)}
          size={14}
        />

        {/* BPM */}
        <div className="flex items-center gap-1 bg-neutral-950 px-2 py-1 rounded border border-neutral-800">
          <span className="text-xs font-mono text-neutral-600 uppercase">BPM</span>
          <input
            type="number"
            value={bpm}
            onChange={e => setBpm(parseInt(e.target.value) || bpm)}
            className="w-10 bg-transparent text-red-400 font-bold text-xs outline-none"
          />
        </div>

        {/* Track Channel Status */}
        <TrackStatusBar compact />

        {/* Zoom */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1 rounded bg-neutral-800 text-neutral-500 hover:text-white transition-colors">
            <ZoomOut size={12} />
          </button>
          <span className="text-xs font-mono text-neutral-600 w-8 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1 rounded bg-neutral-800 text-neutral-500 hover:text-white transition-colors">
            <ZoomIn size={12} />
          </button>
        </div>
      </div>

      {/* Track mode: sequence selector strip */}
      {mode === 'track' && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-neutral-800 bg-neutral-950/40 shrink-0 overflow-x-auto custom-scrollbar">
          <AlignLeft size={11} className="text-neutral-600 shrink-0" />
          {sequences.map(seq => (
            <button
              key={seq.id}
              onClick={() => setActiveSequenceId(seq.id)}
              className={`shrink-0 px-2.5 py-0.5 rounded text-xs font-bold uppercase transition-all border ${
                activeSequenceId === seq.id
                  ? 'text-white border-transparent'
                  : 'bg-neutral-900 text-neutral-600 border-neutral-800 hover:text-neutral-400'
              }`}
              style={activeSequenceId === seq.id ? { backgroundColor: seq.color + 'cc', borderColor: seq.color } : {}}
            >
              {seq.name}
            </button>
          ))}
          <button
            onClick={() => {
              const colors = ['#8b5cf6', '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#ec4899'];
              const newId = sequences.length > 0 ? Math.max(...sequences.map(s => s.id)) + 1 : 0;
              const newSeq: Sequence = {
                id: newId,
                name: `Seq ${newId + 1}`,
                color: colors[newId % colors.length],
                bars: 4,
                tracks: makeDefaultTracks(),
              };
              setSequences(prev => [...prev, newSeq]);
              setActiveSequenceId(newId);
            }}
            className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold text-neutral-700 hover:text-neutral-400 hover:bg-neutral-900 transition-colors"
          >
            <Plus size={10} /> Seq
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {mode === 'track' ? (
          <TrackView
            tracks={activeSequence.tracks}
            bars={activeSequence.bars}
            zoom={zoom}
            isRecording={isRecording}
            midiAccess={midiAccess ?? null}
            onNotesChange={handleNotesChange}
            articulations={articulations}
            onArticulationChange={(noteId, art) => {
              setArticulations(prev => {
                const next = new Map(prev);
                next.set(noteId, art);
                return next;
              });
            }}
          />
        ) : (
          <SongMode sequences={sequences} />
        )}
      </div>
    </div>
  );
}

import React, { useState, useCallback } from 'react';
import {
  Play, Square, Circle, ZoomIn, ZoomOut, Plus,
  List, LayoutGrid, Music2, AlignLeft
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Note {
  id: string;
  pitch: number;   // 0 = C-2 … 127 = G8
  start: number;   // beat fraction (0.0 = bar 1 beat 1)
  duration: number;
  velocity: number;
}

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
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const TOTAL_PITCHES = 88; // piano range
const PITCH_OFFSET = 21; // A0 = MIDI 21
const ROW_H = 14; // px per pitch row
const BEAT_W = 48; // px per beat at zoom 1
const BEATS_PER_BAR = 4;

function pitchName(midi: number) {
  const n = midi - PITCH_OFFSET;
  const octave = Math.floor(n / 12) + 1;
  return `${NOTE_NAMES[n % 12]}${octave}`;
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
  // 8 rows (tracks) × 32 columns (bars)
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

// ─── TrackView ────────────────────────────────────────────────────────────────
function TrackView({ tracks, zoom }: { tracks: Track[]; zoom: number }) {
  const [activeTrack, setActiveTrack] = useState(0);
  const [tool, setTool] = useState<'pencil' | 'select'>('pencil');
  const [localTracks, setLocalTracks] = useState<Track[]>(tracks);

  const beatWidth = BEAT_W * zoom;

  const handleGridClick = useCallback((e: React.MouseEvent<HTMLDivElement>, trackId: number) => {
    if (tool !== 'pencil') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const beat = x / beatWidth;
    const pitchIdx = Math.floor(y / ROW_H);
    const midiPitch = PITCH_OFFSET + (TOTAL_PITCHES - 1 - pitchIdx);
    const snapped = Math.floor(beat * 4) / 4; // snap to 16th

    setLocalTracks(prev => prev.map(t =>
      t.id === trackId
        ? { ...t, notes: [...t.notes, { id: makeId(), pitch: midiPitch, start: snapped, duration: 0.25, velocity: 80 }] }
        : t
    ));
  }, [tool, beatWidth]);

  const currentTrack = localTracks.find(t => t.id === activeTrack) ?? localTracks[0];
  const totalBars = 4;
  const totalBeats = totalBars * BEATS_PER_BAR;
  const gridWidth = totalBeats * beatWidth;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-1 bg-neutral-950 rounded-md p-0.5">
          {(['pencil', 'select'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-all ${tool === t ? 'bg-brand text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
          {totalBars} bars · {currentTrack.notes.length} notes
        </span>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Track list */}
        <div className="w-36 flex-shrink-0 border-r border-neutral-800 overflow-y-auto custom-scrollbar bg-neutral-950">
          {localTracks.map(t => (
            <div
              key={t.id}
              onClick={() => setActiveTrack(t.id)}
              className={`h-10 px-2 flex items-center gap-2 cursor-pointer border-b border-neutral-900 transition-colors ${
                activeTrack === t.id ? 'bg-brand/10 text-brand' : 'text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
              }`}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
              <span className="text-[10px] font-bold uppercase truncate">{t.name}</span>
            </div>
          ))}
          <button className="w-full h-8 flex items-center justify-center gap-1 text-neutral-700 hover:text-neutral-400 text-[10px] hover:bg-neutral-900 transition-colors">
            <Plus size={11} /> Track
          </button>
        </div>

        {/* Piano keys + note grid */}
        <div className="flex-1 flex overflow-auto custom-scrollbar">
          {/* Piano keys */}
          <div
            className="flex-shrink-0 w-10 bg-neutral-950 border-r border-neutral-800"
            style={{ height: TOTAL_PITCHES * ROW_H }}
          >
            {Array.from({ length: TOTAL_PITCHES }).map((_, i) => {
              const midiPitch = PITCH_OFFSET + (TOTAL_PITCHES - 1 - i);
              const noteInOctave = (midiPitch - PITCH_OFFSET) % 12;
              const isBlack = BLACK_KEYS.has(noteInOctave);
              const isC = noteInOctave === 0;
              return (
                <div
                  key={i}
                  className={`border-b border-neutral-900 flex items-center justify-end pr-1 ${
                    isBlack ? 'bg-neutral-800' : 'bg-neutral-200/5'
                  }`}
                  style={{ height: ROW_H }}
                >
                  {isC && (
                    <span className="text-[7px] font-bold text-neutral-600">{pitchName(midiPitch)}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Note grid */}
          <div
            className="relative bg-neutral-950 cursor-crosshair"
            style={{ width: gridWidth, height: TOTAL_PITCHES * ROW_H, minWidth: gridWidth }}
            onClick={(e) => handleGridClick(e, activeTrack)}
          >
            {/* Horizontal pitch rows */}
            {Array.from({ length: TOTAL_PITCHES }).map((_, i) => {
              const midiPitch = PITCH_OFFSET + (TOTAL_PITCHES - 1 - i);
              const noteInOctave = (midiPitch - PITCH_OFFSET) % 12;
              const isBlack = BLACK_KEYS.has(noteInOctave);
              return (
                <div
                  key={i}
                  className={`absolute w-full border-b ${isBlack ? 'bg-neutral-900/50' : ''} border-neutral-900`}
                  style={{ top: i * ROW_H, height: ROW_H }}
                />
              );
            })}

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
              return (
                <div
                  key={note.id}
                  className="absolute rounded-sm border-l-2 flex items-center px-1"
                  style={{
                    left: note.start * beatWidth,
                    top: pitchIdx * ROW_H + 1,
                    width: Math.max(note.duration * beatWidth - 2, 4),
                    height: ROW_H - 2,
                    backgroundColor: currentTrack.color + '55',
                    borderColor: currentTrack.color,
                  }}
                >
                  <span className="text-[7px] font-bold truncate" style={{ color: currentTrack.color }}>
                    {pitchName(note.pitch)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
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
      <div className="flex items-center gap-4 px-4 py-2 border-b border-neutral-800 flex-shrink-0 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Paint Sequence:</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {sequences.map(seq => (
            <button
              key={seq.id}
              onClick={() => setSelectedSeqId(seq.id)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-all border ${
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
        <span className="ml-auto text-[10px] font-mono text-neutral-600 uppercase">
          {selectedSeq ? `${selectedSeq.bars} bars` : ''}
        </span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sequence labels */}
        <div className="w-28 flex-shrink-0 border-r border-neutral-800 bg-neutral-950 overflow-y-auto custom-scrollbar">
          <div className="h-6 border-b border-neutral-800" /> {/* ruler spacer */}
          {sequences.map((seq) => (
            <div
              key={seq.id}
              className="h-10 px-3 flex items-center gap-2 border-b border-neutral-900"
            >
              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: seq.color }} />
              <span className="text-[10px] font-bold uppercase text-neutral-400 truncate">{seq.name}</span>
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
                className={`flex-shrink-0 h-6 border-r border-neutral-800 flex items-center justify-center ${b % 4 === 0 ? 'text-neutral-400' : 'text-neutral-700'}`}
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
                    className={`flex-shrink-0 border-r border-neutral-900 cursor-pointer transition-colors ${
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
export function PianoRoll() {
  const [mode, setMode] = useState<'track' | 'song'>('track');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [bpm, setBpm] = useState(92);
  const [sequences] = useState<Sequence[]>(makeDefaultSequences);
  const [activeSequenceId, setActiveSequenceId] = useState(0);

  const activeSequence = sequences.find(s => s.id === activeSequenceId) ?? sequences[0];

  return (
    <div className="h-full flex flex-col gap-0 bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-neutral-800 flex-shrink-0 bg-neutral-950/60">
        <div className="flex items-center gap-1.5">
          <Music2 size={14} className="text-brand" />
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-300">Piano Roll</span>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-0.5 bg-neutral-950 rounded-lg p-0.5 border border-neutral-800">
          <button
            onClick={() => setMode('track')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${
              mode === 'track' ? 'bg-brand text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <List size={11} /> Track View
          </button>
          <button
            onClick={() => setMode('song')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${
              mode === 'song' ? 'bg-brand text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <LayoutGrid size={11} /> Song Mode
          </button>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-1.5 rounded transition-colors ${isPlaying ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
          >
            <Play size={14} fill={isPlaying ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => { setIsPlaying(false); setIsRecording(false); }}
            className="p-1.5 rounded bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <Square size={14} fill="currentColor" />
          </button>
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`p-1.5 rounded transition-colors ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-400 hover:text-red-400'}`}
          >
            <Circle size={14} fill={isRecording ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* BPM */}
        <div className="flex items-center gap-1 bg-neutral-950 px-2 py-1 rounded border border-neutral-800">
          <span className="text-[9px] font-mono text-neutral-600 uppercase">BPM</span>
          <input
            type="number"
            value={bpm}
            onChange={e => setBpm(parseInt(e.target.value) || bpm)}
            className="w-10 bg-transparent text-red-400 font-bold text-xs outline-none"
          />
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1 rounded bg-neutral-800 text-neutral-500 hover:text-white transition-colors">
            <ZoomOut size={12} />
          </button>
          <span className="text-[9px] font-mono text-neutral-600 w-8 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1 rounded bg-neutral-800 text-neutral-500 hover:text-white transition-colors">
            <ZoomIn size={12} />
          </button>
        </div>
      </div>

      {/* Track mode: sequence selector strip */}
      {mode === 'track' && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-neutral-800 bg-neutral-950/40 flex-shrink-0 overflow-x-auto custom-scrollbar">
          <AlignLeft size={11} className="text-neutral-600 flex-shrink-0" />
          {sequences.map(seq => (
            <button
              key={seq.id}
              onClick={() => setActiveSequenceId(seq.id)}
              className={`flex-shrink-0 px-2.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all border ${
                activeSequenceId === seq.id
                  ? 'text-white border-transparent'
                  : 'bg-neutral-900 text-neutral-600 border-neutral-800 hover:text-neutral-400'
              }`}
              style={activeSequenceId === seq.id ? { backgroundColor: seq.color + 'cc', borderColor: seq.color } : {}}
            >
              {seq.name}
            </button>
          ))}
          <button className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold text-neutral-700 hover:text-neutral-400 hover:bg-neutral-900 transition-colors">
            <Plus size={10} /> Seq
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {mode === 'track' ? (
          <TrackView tracks={activeSequence.tracks} zoom={zoom} />
        ) : (
          <SongMode sequences={sequences} />
        )}
      </div>
    </div>
  );
}

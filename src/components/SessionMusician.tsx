import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Brain, Play, Square, ChevronRight,
  Music, Mic2, Piano, Guitar, AudioLines, Drum,
  Sparkles, RefreshCw, Volume2, VolumeX, Sliders, Send, Headphones
} from 'lucide-react';
import { analyzeSession, type AnalysisResult } from '../lib/api';
import { useTBMAudio } from '../contexts/TBMAudioContext';
import { BandSynthesizer } from '../lib/bandSynthesis';
import { PREVIEW_VOICES, type PreviewVoiceId } from '../lib/soundPreview';
import { NOTE_NAMES } from '../lib/constants';
import { type TrackContentType } from '../lib/trackRouter';

// ─── Option lists ─────────────────────────────────────────────────────────────
const GENRES = ['Hip-Hop', 'Jazz', 'R&B / Soul', 'Electronic', 'Pop', 'Rock', 'Classical', 'Bossa Nova', 'Funk', 'Blues'];
const STYLES = [
  { id: 'comping',  label: 'Comping',      desc: 'Rhythmic chord stabs' },
  { id: 'walking',  label: 'Walking Bass', desc: 'Jazz bass movement' },
  { id: 'arpeggio', label: 'Arpeggiated',  desc: 'Broken chord patterns' },
  { id: 'pad',      label: 'Pad / Lush',   desc: 'Long held tones' },
  { id: 'stab',     label: 'Stabs',        desc: 'Short percussive hits' },
  { id: 'lead',     label: 'Lead Fill',    desc: 'Melodic soloing' },
];
const RHYTHMS = [
  { id: 'straight', label: 'Straight 8th',  groove: 0  },
  { id: 'swing',    label: 'Swing',          groove: 50 },
  { id: 'shuffle',  label: 'Shuffle',        groove: 65 },
  { id: 'dotted',   label: 'Dotted',         groove: 40 },
  { id: 'triplet',  label: 'Triplet',        groove: 33 },
  { id: 'synco',    label: 'Syncopated',     groove: 20 },
];
const NOTATIONS = ['Diatonic', 'Pentatonic', 'Chromatic', 'Modal (Dorian)', 'Lydian', 'Mixolydian', 'Whole Tone'];
const HARMONIES = [
  { id: 'unison',   label: 'Unison'         },
  { id: 'thirds',   label: '3rds'           },
  { id: 'fifths',   label: '5ths (Power)'   },
  { id: 'octave',   label: 'Octave'         },
  { id: 'triad',    label: 'Full Triad'     },
  { id: 'seventh',  label: '7th Chord'      },
  { id: 'ninth',    label: '9th Chord'      },
];

// ─── Instruments the session band can play ───────────────────────────────────
interface Instrument {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  active: boolean;
  volume: number;
  /** Selected preview voice for audition */
  voiceId: PreviewVoiceId;
}

function makeInstruments(): Instrument[] {
  return [
    { id: 'piano',   name: 'Piano',    icon: <Piano size={14} />,      color: '#8b5cf6', active: true,  volume: 80, voiceId: 'piano' },
    { id: 'bass',    name: 'Bass',     icon: <AudioLines size={14} />, color: '#10b981', active: true,  volume: 85, voiceId: 'bass' },
    { id: 'guitar',  name: 'Guitar',   icon: <Guitar size={14} />,     color: '#f59e0b', active: false, volume: 70, voiceId: 'pluck' },
    { id: 'strings', name: 'Strings',  icon: <Music size={14} />,      color: '#3b82f6', active: false, volume: 65, voiceId: 'strings' },
    { id: 'brass',   name: 'Brass',    icon: <Mic2 size={14} />,       color: '#ef4444', active: false, volume: 75, voiceId: 'organ' },
    { id: 'drums',   name: 'Drums',    icon: <Drum size={14} />,       color: '#ec4899', active: true,  volume: 90, voiceId: 'sine' },
  ];
}

// ─── Voice category groups for dropdown ──────────────────────────────────────
function groupVoicesByCategory() {
  const cats: Record<string, typeof PREVIEW_VOICES> = {};
  PREVIEW_VOICES.forEach(v => {
    if (!cats[v.category]) cats[v.category] = [];
    cats[v.category].push(v);
  });
  return cats;
}
const VOICE_CATEGORIES = groupVoicesByCategory();

// ─── Mini keyboard display ───────────────────────────────────────────────────
function MiniKeyboard({ notes }: { notes: number[] }) {
  const startNote = 36; // C2
  const numKeys = 48;   // 4 octaves
  const blacks = [1, 3, 6, 8, 10];
  const activeSet = new Set(notes.map(n => n % 12));

  return (
    <div
      className="flex h-5 gap-px"
      title={notes.length > 0 ? `Notes: ${notes.map(n => NOTE_NAMES[n % 12] + Math.floor(n / 12 - 1)).join(', ')}` : 'No active notes'}
    >
      {Array.from({ length: numKeys }, (_, i) => {
        const midi = startNote + i;
        const pc = midi % 12;
        if (blacks.includes(pc)) return null;
        const isActive = activeSet.has(pc);
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm transition-colors ${
              isActive ? 'bg-emerald-500/70' : 'bg-neutral-700/30'
            }`}
            style={{ minWidth: 2, maxWidth: 6 }}
          />
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SessionMusician() {
  const [instruments, setInstruments] = useState<Instrument[]>(makeInstruments);
  const [activeGenre, setActiveGenre] = useState('Hip-Hop');
  const [activeStyle, setActiveStyle] = useState('comping');
  const [activeRhythm, setActiveRhythm] = useState('swing');
  const [activeNotation, setActiveNotation] = useState('Diatonic');
  const [activeHarmony, setActiveHarmony] = useState('seventh');
  const [isLearning, setIsLearning] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [groove, setGroove] = useState(50);
  const [intensity, setIntensity] = useState(70);
  const [complexity, setComplexity] = useState(50);

  // Chord receive from ChordBuilder
  const [receivedChords, setReceivedChords] = useState<string[] | null>(null);

  // Active notes display (updated by playback tick)
  const [activeNotes, setActiveNotes] = useState<number[]>([]);

  // Send-to-track feedback
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);

  // Audition instrument sound selector expanded
  const [, setExpandedVoiceSelector] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bandSynthesizerRef = useRef<BandSynthesizer | null>(null);

  const {
    audioContext, sequencer, synth: _synth, resumeAudio,
    trackRouter, previewEngine, projectKey, bpm: contextBpm
  } = useTBMAudio();

  // ── Listen for chord progressions sent from ChordBuilder ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'chords' && detail?.data?.chords) {
        const chordNames = detail.data.chords.map((c: { name: string }) => c.name);
        setReceivedChords(chordNames);
      }
    };
    window.addEventListener('tbm:send-to-track', handler);
    return () => window.removeEventListener('tbm:send-to-track', handler);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      bandSynthesizerRef.current?.dispose();
      sequencer?.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-register in TrackRouter (mixer channel) ────────────────────────
  const sessionSlotIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (!trackRouter) return;
    const SOURCE_ID = 'session-musician';
    const TYPE: TrackContentType = 'session';

    // Idempotency: don't double-register
    const existing = trackRouter.getByType(TYPE);
    if (existing.length > 0) {
      sessionSlotIndexRef.current = existing[0].index;
    } else {
      const slot = trackRouter.assignToNextFree(TYPE, SOURCE_ID, 'Session Band');
      if (slot) sessionSlotIndexRef.current = slot.index;
    }

    // Route BandSynthesizer output → slot input (if one is already active)
    const slotInput = trackRouter.getSlotInput(sessionSlotIndexRef.current);
    if (slotInput && bandSynthesizerRef.current) {
      bandSynthesizerRef.current.rerouteOutput(slotInput);
    }

    return () => {
      trackRouter.releaseBySource(SOURCE_ID);
      sessionSlotIndexRef.current = -1;
    };
  }, [trackRouter]);

  const handleLearn = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsLearning(true);
    setAnalysis(null);
    setAnalyzeError(null);
    try {
      const result = await analyzeSession({
        genre: activeGenre,
        style: activeStyle,
        rhythm: activeRhythm,
        notation: activeNotation,
      }, abortRef.current.signal);
      setAnalysis(result);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAnalyzeError((err as Error).message ?? 'Analysis failed');
      }
    } finally {
      setIsLearning(false);
    }
  }, [activeGenre, activeStyle, activeRhythm, activeNotation]);

  const toggleInstrument = (id: string) => {
    setInstruments(prev =>
      prev.map(inst => inst.id === id ? { ...inst, active: !inst.active } : inst)
    );
  };

  const setInstrumentVolume = (id: string, volume: number) => {
    setInstruments(prev =>
      prev.map(inst => inst.id === id ? { ...inst, volume } : inst)
    );
    if (isPlaying) {
      bandSynthesizerRef.current?.updateInstrumentVolume(id, volume);
    }
  };

  const setInstrumentVoice = (id: string, voiceId: PreviewVoiceId) => {
    setInstruments(prev =>
      prev.map(inst => inst.id === id ? { ...inst, voiceId } : inst)
    );
    setExpandedVoiceSelector(null);
    // Live-update if band is currently playing
    if (isPlaying && bandSynthesizerRef.current) {
      bandSynthesizerRef.current.setVoiceOverride(id, voiceId);
    }
  };

  // ── Audition single instrument sound ──
  const auditInstrumentVoice = useCallback((voiceId: PreviewVoiceId) => {
    if (!previewEngine) return;
    // Play a short C major chord through the selected voice
    previewEngine.playChord([60, 64, 67], voiceId, 1.0);
  }, [previewEngine]);

  // ── Effective chord progression (received > analysis > default) ──
  const effectiveChords = useMemo(() => {
    if (receivedChords && receivedChords.length > 0) return receivedChords;
    if (analysis?.chords) return analysis.chords;
    return ['C', 'G', 'Am', 'F'];
  }, [receivedChords, analysis]);

  // ── Play Band: real multi-voice synthesis ──
  const handlePlayBand = useCallback(() => {
    if (isPlaying) {
      bandSynthesizerRef.current?.stop();
      sequencer?.stop();
      setIsPlaying(false);
      setActiveNotes([]);
      return;
    }

    resumeAudio();
    
    if (
      !bandSynthesizerRef.current ||
      (audioContext && (bandSynthesizerRef.current as any).context !== audioContext)
    ) {
      bandSynthesizerRef.current?.dispose();
      bandSynthesizerRef.current = null;
    }
    if (!bandSynthesizerRef.current && audioContext) {
      bandSynthesizerRef.current = new BandSynthesizer(audioContext, {
        bpm: analysis?.tempo ?? (contextBpm || 92),
        groove,
        intensity,
        complexity,
        key: analysis?.key || 'C',
        scale: analysis?.scale || 'major',
        chords: effectiveChords
      });
      // Route through TrackRouter slot if registered
      if (sessionSlotIndexRef.current >= 0 && trackRouter) {
        const slotInput = trackRouter.getSlotInput(sessionSlotIndexRef.current);
        if (slotInput) bandSynthesizerRef.current.rerouteOutput(slotInput);
      }
    }

    if (bandSynthesizerRef.current) {
      // Wire rich voice delegation through SoundPreviewEngine
      bandSynthesizerRef.current.setPreviewEngine(previewEngine);
      bandSynthesizerRef.current.setVoiceOverrides(
        Object.fromEntries(
          instruments.filter(i => i.active).map(i => [i.id, i.voiceId])
        )
      );
      // Feed active notes to mini keyboard display
      bandSynthesizerRef.current.onNotes((notes) => setActiveNotes(notes));

      bandSynthesizerRef.current.updatePerformance({
        groove,
        intensity,
        complexity,
        chords: effectiveChords,
      });

      instruments.forEach(inst => {
        bandSynthesizerRef.current?.updateInstrumentVolume(inst.id, inst.volume);
      });

      const activeInstrumentIds = instruments.filter(i => i.active).map(i => i.id);
      bandSynthesizerRef.current.start(activeInstrumentIds, {
        tempo: analysis?.tempo ?? (contextBpm || 92),
        key: analysis?.key || 'C',
        scale: analysis?.scale || 'major',
        chords: effectiveChords
      });
    }

    sequencer?.setSwing(groove);
    setIsPlaying(true);
  }, [isPlaying, analysis, audioContext, sequencer, groove, intensity, complexity, instruments, resumeAudio, effectiveChords, contextBpm, previewEngine]);

  // ── Send to Track (one-click export to next free mixer channel) ──
  const handleSendToTrack = useCallback(() => {
    const activeInsts = instruments.filter(i => i.active);
    if (!activeInsts.length) {
      setSendFeedback('No active instruments to send');
      setTimeout(() => setSendFeedback(null), 2000);
      return;
    }

    const slot = trackRouter.assignToNextFree(
      'session' as TrackContentType,
      'session-musician',
      `Session: ${activeInsts.map(i => i.name).join(', ')}`,
    );

    if (slot) {
      const event = new CustomEvent('tbm:send-to-track', {
        detail: {
          channelIndex: slot.index,
          type: 'session',
          sourceId: 'session-musician',
          data: {
            instruments: activeInsts.map(i => ({
              id: i.id,
              name: i.name,
              voiceId: i.voiceId,
              volume: i.volume,
            })),
            genre: activeGenre,
            style: activeStyle,
            rhythm: activeRhythm,
            harmony: activeHarmony,
            chords: effectiveChords,
            bpm: analysis?.tempo ?? (contextBpm || 92),
            groove,
            intensity,
            complexity,
          },
        },
      });
      window.dispatchEvent(event);
      setSendFeedback(`Sent to Track ${slot.index + 1}`);
    } else {
      setSendFeedback('No free tracks available');
    }
    setTimeout(() => setSendFeedback(null), 2500);
  }, [instruments, trackRouter, activeGenre, activeStyle, activeRhythm, activeHarmony, effectiveChords, analysis, contextBpm, groove, intensity, complexity]);

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto custom-scrollbar">
      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0 relative edge-glow-bottom">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand/15 border border-brand/30 flex items-center justify-center">
            <Brain size={16} className="text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-neutral-200">Session Musician</h2>
            <p className="text-[13px] font-mono text-neutral-500 uppercase tracking-wide">
              MIDI · Learns & Accompanies
            </p>
          </div>
        </div>
        {/* Transport */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleLearn}
            disabled={isLearning}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition-all border ${
              isLearning
                ? 'bg-brand/20 text-brand border-brand/40 animate-pulse'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-brand hover:border-brand/40'
            }`}
          >
            {isLearning ? <RefreshCw size={12} className="animate-spin" /> : <Brain size={12} />}
            {isLearning ? 'Analyzing...' : 'Learn Track'}
          </button>

          {/* Send to Track */}
          <button
            onClick={handleSendToTrack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border bg-emerald-600/15 text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/25 hover:border-emerald-500/50"
            title="Send session output to next free mixer track"
          >
            <Send size={11} />
            Send to Track
          </button>

          <button
            onClick={handlePlayBand}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition-all shadow-lg ${
              isPlaying
                ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                : 'bg-brand hover:opacity-90 text-white shadow-brand/20'
            }`}
          >
            {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            {isPlaying ? 'Stop' : 'Play Band'}
          </button>
        </div>
      </div>

      {/* Send feedback toast */}
      {sendFeedback && (
        <div className="shrink-0 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-[11px] font-mono text-emerald-400 animate-pulse">
          {sendFeedback}
        </div>
      )}

      {/* Received chords indicator */}
      {receivedChords && receivedChords.length > 0 && (
        <div className="shrink-0 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
          <Music size={11} className="text-yellow-400" />
          <span className="text-[11px] font-mono text-yellow-400">
            Chords from Builder: <span className="font-bold">{receivedChords.join(' - ')}</span>
          </span>
          <button
            onClick={() => setReceivedChords(null)}
            className="ml-auto text-[10px] font-mono text-neutral-500 hover:text-neutral-300 uppercase"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Analysis result ── */}
      {analysis && (
        <div className="shrink-0 bg-brand/5 border border-brand/20 rounded-xl p-3 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-brand" />
            <span className="text-[13px] font-bold uppercase tracking-widest text-neutral-400">Detected:</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap text-sm font-bold font-mono">
            <span><span className="text-neutral-600">Key: </span><span className="text-brand">{analysis.key} {analysis.scale}</span></span>
            <span><span className="text-neutral-600">Tempo: </span><span className="text-emerald-400">{analysis.tempo} BPM</span></span>
            <span><span className="text-neutral-600">Chords: </span><span className="text-yellow-400">{analysis.chords.join(' → ')}</span></span>
            <span><span className="text-neutral-600">Confidence: </span><span className={analysis.confidence > 90 ? 'text-emerald-400' : 'text-yellow-400'}>{analysis.confidence}%</span></span>
          </div>
        </div>
      )}

      {analyzeError && !analysis && (
        <div className="shrink-0 bg-red-950/30 border border-red-900/40 rounded-xl p-3 flex items-center gap-3">
          <span className="text-[13px] font-bold uppercase tracking-widest text-red-400">Analysis error:</span>
          <span className="text-[13px] font-mono text-red-500">{analyzeError}</span>
        </div>
      )}

      {/* ── Mini keyboard: active note display ── */}
      <div className="shrink-0 bg-neutral-900 rounded-xl border border-neutral-800 p-2">
        <div className="flex items-center gap-2 mb-1.5">
          <Headphones size={10} className="text-neutral-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Active Notes</span>
          <span className="text-[10px] font-mono text-neutral-600 ml-auto">
            {projectKey} · {effectiveChords.join(' - ')}
          </span>
        </div>
        <MiniKeyboard notes={activeNotes} />
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ── Left column: menus ── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">

          {/* Genre */}
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-3 vignette">
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Genre</span>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map(g => (
                <button
                  key={g}
                  onClick={() => setActiveGenre(g)}
                  className={`px-2.5 py-1 rounded-md text-[13px] font-bold uppercase transition-all border ${
                    activeGenre === g
                      ? 'bg-brand/20 text-brand border-brand/40'
                      : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:text-neutral-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-3 vignette">
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Playing Style</span>
            <div className="grid grid-cols-3 gap-1.5">
              {STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveStyle(s.id)}
                  className={`flex flex-col items-start px-2.5 py-2 rounded-md text-left transition-all border ${
                    activeStyle === s.id
                      ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                      : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:text-neutral-300'
                  }`}
                >
                  <span className="text-[13px] font-bold uppercase">{s.label}</span>
                  <span className="text-xs text-neutral-600 mt-0.5">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rhythm */}
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-3 vignette">
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Rhythm</span>
            <div className="grid grid-cols-3 gap-1.5">
              {RHYTHMS.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setActiveRhythm(r.id); setGroove(r.groove); }}
                  className={`flex flex-col items-center px-2.5 py-2 rounded-md transition-all border ${
                    activeRhythm === r.id
                      ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                      : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:text-neutral-300'
                  }`}
                >
                  <span className="text-[13px] font-bold uppercase">{r.label}</span>
                  <span className="text-xs text-neutral-600 mt-0.5">groove {r.groove}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notation & Harmony (side by side) */}
          <div className="flex gap-3">
            <div className="flex-1 bg-neutral-900 rounded-xl border border-neutral-800 p-3 vignette">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Notation</span>
              <div className="flex flex-col gap-1">
                {NOTATIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => setActiveNotation(n)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[13px] font-bold uppercase transition-all border text-left ${
                      activeNotation === n
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:text-neutral-300'
                    }`}
                  >
                    {n}
                    {activeNotation === n && <ChevronRight size={10} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 bg-neutral-900 rounded-xl border border-neutral-800 p-3 vignette">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Harmony</span>
              <div className="flex flex-col gap-1">
                {HARMONIES.map(h => (
                  <button
                    key={h.id}
                    onClick={() => setActiveHarmony(h.id)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[13px] font-bold uppercase transition-all border text-left ${
                      activeHarmony === h.id
                        ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                        : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:text-neutral-300'
                    }`}
                  >
                    {h.label}
                    {activeHarmony === h.id && <ChevronRight size={10} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: instruments + performance controls ── */}
        <div className="w-72 shrink-0 flex flex-col gap-3">

          {/* Instruments with voice selectors */}
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-3 flex flex-col gap-2 vignette">
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Band Instruments</span>
            {instruments.map(inst => (
              <div key={inst.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleInstrument(inst.id)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all border shrink-0 ${
                      inst.active
                        ? 'border-transparent'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-600'
                    }`}
                    style={inst.active ? { backgroundColor: inst.color + '33', borderColor: inst.color + '66', color: inst.color } : {}}
                    title={inst.active ? 'Mute' : 'Enable'}
                  >
                    {inst.icon}
                  </button>
                  <span className={`text-[13px] font-bold uppercase w-14 shrink-0 ${inst.active ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    {inst.name}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={inst.volume}
                    onChange={e => setInstrumentVolume(inst.id, parseInt(e.target.value))}
                    disabled={!inst.active}
                    className="flex-1 h-1 appearance-none accent-brand disabled:opacity-30"
                  />
                  <span className="text-xs font-mono text-neutral-600 w-6 text-right">{inst.volume}</span>
                  {inst.active ? (
                    <Volume2 size={10} className="text-neutral-500 shrink-0" />
                  ) : (
                    <VolumeX size={10} className="text-neutral-700 shrink-0" />
                  )}
                </div>

                {/* Voice selector row */}
                {inst.active && (
                  <div className="flex items-center gap-1.5 ml-9 relative">
                    <Headphones size={9} className="text-neutral-600 shrink-0" />
                    <select
                      value={inst.voiceId}
                      onChange={(e) => setInstrumentVoice(inst.id, e.target.value as PreviewVoiceId)}
                      className="text-[10px] font-mono uppercase bg-neutral-800 text-neutral-400 border border-neutral-700 rounded px-1.5 py-0.5 focus:outline-none cursor-pointer flex-1"
                      title="Select preview voice for this instrument"
                    >
                      {Object.entries(VOICE_CATEGORIES).map(([cat, voices]) => (
                        <optgroup key={cat} label={cat.toUpperCase()}>
                          {voices.map(v => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      onClick={() => auditInstrumentVoice(inst.voiceId)}
                      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-500 hover:text-brand hover:border-brand/40 transition-colors"
                      title="Audition this voice"
                    >
                      Preview
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Performance controls */}
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-3 flex flex-col gap-3 vignette">
            <div className="flex items-center gap-2">
              <Sliders size={12} className="text-neutral-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Performance</span>
            </div>
             {[
               { label: 'Groove',     value: groove,     setValue: setGroove,     color: '#f59e0b' },
               { label: 'Intensity',  value: intensity,  setValue: setIntensity,  color: '#ef4444' },
               { label: 'Complexity', value: complexity, setValue: setComplexity, color: '#8b5cf6' },
             ].map(ctrl => (
               <div key={ctrl.label} className="flex flex-col gap-1">
                 <div className="flex justify-between">
                   <span className="text-xs font-bold uppercase text-neutral-600">{ctrl.label}</span>
                   <span className="text-xs font-mono text-neutral-500">{ctrl.value}%</span>
                 </div>
                 <input
                   type="range"
                   min={0}
                   max={100}
                   value={ctrl.value}
                   onChange={e => {
                     ctrl.setValue(parseInt(e.target.value));
                     if (isPlaying && bandSynthesizerRef.current) {
                       bandSynthesizerRef.current.updatePerformance({
                         [ctrl.label.toLowerCase()]: parseInt(e.target.value)
                       });
                     }
                   }}
                   className="w-full h-1.5 appearance-none rounded-full"
                   style={{ accentColor: ctrl.color }}
                 />
               </div>
             ))}
          </div>

          {/* Status */}
          <div className={`bg-neutral-900 rounded-xl border p-3 flex flex-col gap-2 transition-all vignette ${
            isPlaying ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-neutral-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Band Status</span>
              <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-500 animate-pulse dot-glow' : 'bg-neutral-700'}`} />
            </div>
            <div className="flex flex-col gap-1">
              {[
                { label: 'Style',    val: STYLES.find(s => s.id === activeStyle)?.label  ?? '' },
                { label: 'Rhythm',   val: RHYTHMS.find(r => r.id === activeRhythm)?.label ?? '' },
                { label: 'Notation', val: activeNotation },
                { label: 'Harmony',  val: HARMONIES.find(h => h.id === activeHarmony)?.label ?? '' },
                { label: 'Genre',    val: activeGenre },
                { label: 'Chords',   val: effectiveChords.join(' - ') },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-xs font-mono">
                  <span className="text-neutral-600 uppercase">{row.label}</span>
                  <span className={`${isPlaying ? 'text-emerald-400' : 'text-neutral-400'} truncate ml-2 max-w-[140px]`}>{row.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Track router status */}
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-2.5 vignette">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Mixer Channels</span>
              <span className="text-[10px] font-mono text-neutral-600">
                {trackRouter.occupiedCount}/{trackRouter.slots.length} used
              </span>
            </div>
            <div className="flex gap-0.5 mt-1.5">
              {trackRouter.slots.slice(0, 16).map((slot, i) => (
                <div
                  key={i}
                  className="flex-1 h-1.5 rounded-full transition-colors"
                  style={{ backgroundColor: slot.occupied ? slot.color : '#333' }}
                  title={slot.occupied ? `${slot.name}: ${slot.type}` : `Track ${i + 1}: Empty`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

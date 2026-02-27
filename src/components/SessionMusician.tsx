import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Play, Square, ChevronRight,
  Music, Mic2, Piano, Guitar, AudioLines, Drum,
  Sparkles, RefreshCw, Volume2, VolumeX, Sliders
} from 'lucide-react';

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
}

function makeInstruments(): Instrument[] {
  return [
    { id: 'piano',   name: 'Piano',    icon: <Piano size={14} />,      color: '#8b5cf6', active: true,  volume: 80 },
    { id: 'bass',    name: 'Bass',     icon: <AudioLines size={14} />, color: '#10b981', active: true,  volume: 85 },
    { id: 'guitar',  name: 'Guitar',   icon: <Guitar size={14} />,     color: '#f59e0b', active: false, volume: 70 },
    { id: 'strings', name: 'Strings',  icon: <Music size={14} />,      color: '#3b82f6', active: false, volume: 65 },
    { id: 'brass',   name: 'Brass',    icon: <Mic2 size={14} />,       color: '#ef4444', active: false, volume: 75 },
    { id: 'drums',   name: 'Drums',    icon: <Drum size={14} />,       color: '#ec4899', active: true,  volume: 90 },
  ];
}

// ─── Detected scale / chord info (simulated analysis) ────────────────────────
interface AnalysisResult {
  key: string;
  scale: string;
  chords: string[];
  tempo: number;
  confidence: number;
}

function fakeAnalyze(): AnalysisResult {
  const keys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const scales = ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Pentatonic Minor'];
  const chordSets = [
    ['Cmaj7', 'Am7', 'Fmaj7', 'G7'],
    ['Dm7', 'G7', 'Cmaj7', 'Am7'],
    ['Am9', 'Dm9', 'E7#9', 'Am9'],
  ];
  return {
    key: keys[Math.floor(Math.random() * keys.length)],
    scale: scales[Math.floor(Math.random() * scales.length)],
    chords: chordSets[Math.floor(Math.random() * chordSets.length)],
    tempo: 80 + Math.floor(Math.random() * 60),
    confidence: 75 + Math.floor(Math.random() * 25),
  };
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
  const [groove, setGroove] = useState(50);
  const [intensity, setIntensity] = useState(70);
  const [complexity, setComplexity] = useState(50);

  const learnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (learnTimerRef.current !== null) clearTimeout(learnTimerRef.current);
    };
  }, []);

  const handleLearn = useCallback(() => {
    setIsLearning(true);
    setAnalysis(null);
    learnTimerRef.current = setTimeout(() => {
      setIsLearning(false);
      setAnalysis(fakeAnalyze());
    }, 1600);
  }, []);

  const toggleInstrument = (id: string) => {
    setInstruments(prev =>
      prev.map(inst => inst.id === id ? { ...inst, active: !inst.active } : inst)
    );
  };

  const setInstrumentVolume = (id: string, volume: number) => {
    setInstruments(prev =>
      prev.map(inst => inst.id === id ? { ...inst, volume } : inst)
    );
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto custom-scrollbar">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand/15 border border-brand/30 flex items-center justify-center">
            <Brain size={16} className="text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-neutral-200">Session Musician</h2>
            <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wide">
              MIDI · Learns & Accompanies
            </p>
          </div>
        </div>
        {/* Transport */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleLearn}
            disabled={isLearning}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
              isLearning
                ? 'bg-brand/20 text-brand border-brand/40 animate-pulse'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-brand hover:border-brand/40'
            }`}
          >
            {isLearning ? <RefreshCw size={12} className="animate-spin" /> : <Brain size={12} />}
            {isLearning ? 'Analyzing…' : 'Learn Track'}
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg ${
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

      {/* ── Analysis result ── */}
      {analysis && (
        <div className="flex-shrink-0 bg-brand/5 border border-brand/20 rounded-xl p-3 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-brand" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Detected:</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap text-[11px] font-bold font-mono">
            <span><span className="text-neutral-600">Key: </span><span className="text-brand">{analysis.key} {analysis.scale}</span></span>
            <span><span className="text-neutral-600">Tempo: </span><span className="text-emerald-400">{analysis.tempo} BPM</span></span>
            <span><span className="text-neutral-600">Chords: </span><span className="text-yellow-400">{analysis.chords.join(' → ')}</span></span>
            <span><span className="text-neutral-600">Confidence: </span><span className={analysis.confidence > 90 ? 'text-emerald-400' : 'text-yellow-400'}>{analysis.confidence}%</span></span>
          </div>
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ── Left column: menus ── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">

          {/* Genre */}
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Genre</span>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map(g => (
                <button
                  key={g}
                  onClick={() => setActiveGenre(g)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all border ${
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
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Playing Style</span>
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
                  <span className="text-[10px] font-bold uppercase">{s.label}</span>
                  <span className="text-[8px] text-neutral-600 mt-0.5">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rhythm */}
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Rhythm</span>
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
                  <span className="text-[10px] font-bold uppercase">{r.label}</span>
                  <span className="text-[8px] text-neutral-600 mt-0.5">groove {r.groove}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notation & Harmony (side by side) */}
          <div className="flex gap-3">
            <div className="flex-1 bg-neutral-900 rounded-xl border border-neutral-800 p-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Notation</span>
              <div className="flex flex-col gap-1">
                {NOTATIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => setActiveNotation(n)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all border text-left ${
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

            <div className="flex-1 bg-neutral-900 rounded-xl border border-neutral-800 p-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Harmony</span>
              <div className="flex flex-col gap-1">
                {HARMONIES.map(h => (
                  <button
                    key={h.id}
                    onClick={() => setActiveHarmony(h.id)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all border text-left ${
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
        <div className="w-64 flex-shrink-0 flex flex-col gap-3">

          {/* Instruments */}
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-3 flex flex-col gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Band Instruments</span>
            {instruments.map(inst => (
              <div key={inst.id} className="flex items-center gap-2">
                <button
                  onClick={() => toggleInstrument(inst.id)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all border flex-shrink-0 ${
                    inst.active
                      ? 'border-transparent'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-600'
                  }`}
                  style={inst.active ? { backgroundColor: inst.color + '33', borderColor: inst.color + '66', color: inst.color } : {}}
                  title={inst.active ? 'Mute' : 'Enable'}
                >
                  {inst.icon}
                </button>
                <span className={`text-[10px] font-bold uppercase w-14 flex-shrink-0 ${inst.active ? 'text-neutral-300' : 'text-neutral-600'}`}>
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
                <span className="text-[9px] font-mono text-neutral-600 w-6 text-right">{inst.volume}</span>
                {inst.active ? (
                  <Volume2 size={10} className="text-neutral-500 flex-shrink-0" />
                ) : (
                  <VolumeX size={10} className="text-neutral-700 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          {/* Performance controls */}
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sliders size={12} className="text-neutral-500" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Performance</span>
            </div>
            {[
              { label: 'Groove',     value: groove,     setValue: setGroove,     color: '#f59e0b' },
              { label: 'Intensity',  value: intensity,  setValue: setIntensity,  color: '#ef4444' },
              { label: 'Complexity', value: complexity, setValue: setComplexity, color: '#8b5cf6' },
            ].map(ctrl => (
              <div key={ctrl.label} className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-[9px] font-bold uppercase text-neutral-600">{ctrl.label}</span>
                  <span className="text-[9px] font-mono text-neutral-500">{ctrl.value}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={ctrl.value}
                  onChange={e => ctrl.setValue(parseInt(e.target.value))}
                  className="w-full h-1.5 appearance-none rounded-full"
                  style={{ accentColor: ctrl.color }}
                />
              </div>
            ))}
          </div>

          {/* Status */}
          <div className={`bg-neutral-900 rounded-xl border p-3 flex flex-col gap-2 transition-all ${
            isPlaying ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-neutral-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Band Status</span>
              <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-700'}`} />
            </div>
            <div className="flex flex-col gap-1">
              {[
                { label: 'Style',    val: STYLES.find(s => s.id === activeStyle)?.label  ?? '' },
                { label: 'Rhythm',   val: RHYTHMS.find(r => r.id === activeRhythm)?.label ?? '' },
                { label: 'Notation', val: activeNotation },
                { label: 'Harmony',  val: HARMONIES.find(h => h.id === activeHarmony)?.label ?? '' },
                { label: 'Genre',    val: activeGenre },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-[9px] font-mono">
                  <span className="text-neutral-600 uppercase">{row.label}</span>
                  <span className={isPlaying ? 'text-emerald-400' : 'text-neutral-400'}>{row.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

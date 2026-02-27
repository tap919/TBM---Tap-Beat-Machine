import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Knob } from './Knob';
import {
  Disc3,
  Play,
  Square,
  Circle,
  Shuffle,
  Sliders,
  Zap,
  Music,
  Repeat,
  Scissors,
  UploadCloud,
  ListMusic,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Lock,
  Unlock,
  SkipForward,
  SkipBack,
  RefreshCw,
  Keyboard,
  GitBranch,
  Send,
} from 'lucide-react';

type ScratchStyle = {
  id: string;
  name: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  description: string;
};

type EditorEvent = {
  id: string;
  type: 'forward' | 'backward' | 'fader_open' | 'fader_close' | 'hold' | 'chirp' | 'tear' | 'stutter' | 'one_shot';
  startBeat: number;
  durationBeats: number;
  speedMultiplier: number;
  faderPosition: number;
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  forward: 'bg-indicator/20 text-indicator border-indicator/40',
  backward: 'bg-red-500/20 text-red-400 border-red-500/40',
  fader_open: 'bg-brand/20 text-brand border-brand/40',
  fader_close: 'bg-neutral-600/30 text-neutral-400 border-neutral-600/40',
  hold: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  chirp: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  tear: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  stutter: 'bg-pink-500/20 text-pink-400 border-pink-500/40',
  one_shot: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
};

const scratchStyles: ScratchStyle[] = [
  { id: 'baby', name: 'Baby Scratch', difficulty: 'beginner', description: 'Classic simple back-and-forth. No fader.' },
  { id: 'chirp', name: 'Chirp Scratch', difficulty: 'intermediate', description: 'Fast forward motion with fader cut.' },
  { id: 'transformer', name: 'Transformer', difficulty: 'intermediate', description: 'Steady motion; fader stutters on/off.' },
  { id: 'tear', name: 'Tear Scratch', difficulty: 'intermediate', description: 'Aggressive rip forward with fader.' },
  { id: 'flare', name: 'Flare Scratch', difficulty: 'advanced', description: 'Forward with fader cuts mid-motion.' },
  { id: 'crab', name: 'Crab Scratch', difficulty: 'advanced', description: 'Multi-finger rapid stutter technique.' },
  { id: 'hook_style', name: 'Hook Scratch', difficulty: 'intermediate', description: 'Musical rhythmic chopped stabs and chirps.' },
  { id: 'soul_scratch', name: 'Soul Scratch', difficulty: 'intermediate', description: 'Laid-back, funky groovy vocal stabs.' },
];

const builtInSamples = [
  { id: 'ah_yeah1', name: 'Ah Yeah!', category: 'vocal' },
  { id: 'fresh', name: 'Fresh', category: 'vocal' },
  { id: 'yeah_boy', name: 'Yeah Boy', category: 'vocal' },
  { id: 'one_two', name: 'One Two', category: 'vocal' },
  { id: 'what', name: 'What?!', category: 'vocal' },
  { id: 'baby_base', name: 'Baby Scratch Base', category: 'scratch' },
];

const difficultyColors: Record<string, string> = {
  beginner: 'text-indicator border-indicator/30 bg-indicator/10',
  intermediate: 'text-brand border-brand/30 bg-brand/10',
  advanced: 'text-red-400 border-red-500/30 bg-red-500/10',
};

export function VinylScratchPro({ onSendToSampleEditor }: { onSendToSampleEditor?: () => void }) {
  const [activeMode, setActiveMode] = useState<'auto' | 'live' | 'editor' | 'turntable' | 'minorvdj'>('auto');
  const [selectedStyle, setSelectedStyle] = useState('baby');
  const [selectedSample, setSelectedSample] = useState('ah_yeah1');
  const [intensity, setIntensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [bpm, setBpm] = useState(90);
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
  const [faderCurve, setFaderCurve] = useState('exponential');

  // Effects
  const [echoWet, setEchoWet] = useState(30);
  const [reverbWet, setReverbWet] = useState(15);
  const [lofiTone, setLofiTone] = useState(40);

  // Minimal mixer
  const [deckALevel, setDeckALevel] = useState(72);
  const [deckBLevel, setDeckBLevel] = useState(68);
  const [masterLevel, setMasterLevel] = useState(85);

  // MinorVDJ
  const [autoDj, setAutoDj] = useState(false);
  const [playlistCursor, setPlaylistCursor] = useState(0);
  const playlist = useMemo(
    () => ['ah_yeah1', 'fresh', 'yeah_boy', 'one_two', 'what', 'baby_base'],
    []
  );

  // ── AUTO MODE extras ──────────────────────────────────────────────
  const [autoLength, setAutoLength] = useState<'short_stab' | '1_bar' | '2_bars' | '4_bars' | 'full_hook'>('2_bars');
  const [addSignatureFX, setAddSignatureFX] = useState(true);
  const [autoQuantize, setAutoQuantize] = useState(true);
  const [targetTransients, setTargetTransients] = useState(true);
  const [autoProgress, setAutoProgress] = useState<number | null>(null); // 0-100 or null

  // ── LIVE MODE ─────────────────────────────────────────────────────
  const [liveVelocity, setLiveVelocity] = useState(0); // -4 to 4
  const [liveDirection, setLiveDirection] = useState<'forward' | 'reverse' | 'stopped'>('stopped');
  const [liveFaderOpen, setLiveFaderOpen] = useState(false);
  const [liveDragActive, setLiveDragActive] = useState(false);
  const liveDragStartX = useRef(0);
  const [livePlayhead, setLivePlayhead] = useState(25); // 0-100 percent

  // ── EDITOR MODE ───────────────────────────────────────────────────
  const [editorEvents, setEditorEvents] = useState<EditorEvent[]>([
    { id: 'e1', type: 'forward',    startBeat: 0.0, durationBeats: 0.5, speedMultiplier: 1.0, faderPosition: 1.0 },
    { id: 'e2', type: 'backward',   startBeat: 0.5, durationBeats: 0.5, speedMultiplier: 1.0, faderPosition: 1.0 },
    { id: 'e3', type: 'fader_open', startBeat: 1.0, durationBeats: 0.25, speedMultiplier: 1.8, faderPosition: 1.0 },
    { id: 'e4', type: 'chirp',      startBeat: 1.25, durationBeats: 0.25, speedMultiplier: 2.0, faderPosition: 0.8 },
  ]);
  const [gridResolution, setGridResolution] = useState<'8n' | '16n' | '32n'>('16n');
  const [patternLengthBars, setPatternLengthBars] = useState(2);
  const [patternName, setPatternName] = useState('My Pattern');
  const [editorPreviewPlaying, setEditorPreviewPlaying] = useState(false);
  const [editorRecording, setEditorRecording] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // ── TURNTABLE MODE ────────────────────────────────────────────────
  const [vinylRpm, setVinylRpm] = useState(33.3);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [keyLock, setKeyLock] = useState(false);
  const [speedMult, setSpeedMult] = useState(1.0);
  const [platAngle, setPlatAngle] = useState(0);
  const platAnimRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  // ── MINORVDJ DUAL DECK ────────────────────────────────────────────
  const [deckBSample, setDeckBSample] = useState('fresh');
  const [deckABpm, setDeckABpm] = useState(90);
  const [deckBBpm, setDeckBBpm] = useState(95);
  const [deckAPlaying, setDeckAPlaying] = useState(false);
  const [deckBPlaying, setDeckBPlaying] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [deckACuePoint, setDeckACuePoint] = useState(0);
  const [deckBCuePoint, setDeckBCuePoint] = useState(0);

  const [isDragging, setIsDragging] = useState(false);

  const currentStyle = scratchStyles.find(s => s.id === selectedStyle);
  const currentSample = builtInSamples.find(s => s.id === selectedSample);

  const waveformData = useMemo(() =>
    Array.from({ length: 120 }, (_, i) =>
      Math.abs(Math.sin(i * 0.15) * 0.3 + (Math.sin(i * 0.73) * 0.5 + 0.5) * 0.4 + 0.15)
    ), []);

  const waveformDataB = useMemo(() =>
    Array.from({ length: 120 }, (_, i) =>
      Math.abs(Math.cos(i * 0.12) * 0.35 + (Math.sin(i * 0.61) * 0.4 + 0.5) * 0.4 + 0.12)
    ), []);

  const autoScratchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (autoScratchTimer.current !== null) clearTimeout(autoScratchTimer.current);
      if (autoProgressTimer.current !== null) clearInterval(autoProgressTimer.current);
      if (platAnimRef.current !== null) cancelAnimationFrame(platAnimRef.current);
    };
  }, []);

  // Auto-DJ playlist advance
  useEffect(() => {
    if (!autoDj || activeMode !== 'minorvdj') return;
    const timer = setInterval(() => {
      setPlaylistCursor(prev => (prev + 1) % playlist.length);
      setSelectedSample(prev => {
        const currentIndex = playlist.indexOf(prev);
        const nextIndex = (currentIndex + 1) % playlist.length;
        return playlist[nextIndex];
      });
    }, Math.max(2500, Math.round((60 / Math.max(1, bpm)) * 16 * 1000)));
    return () => clearInterval(timer);
  }, [activeMode, autoDj, bpm, playlist]);

  // Turntable platter animation
  useEffect(() => {
    if (platAnimRef.current !== null) cancelAnimationFrame(platAnimRef.current);
    if (activeMode !== 'turntable' || !isPlaying) return;
    let lastTime = performance.now();
    const step = (now: number) => {
      const delta = (now - lastTime) / 1000; // seconds
      lastTime = now;
      setPlatAngle(a => (a + (vinylRpm / 60) * speedMult * 360 * delta) % 360);
      platAnimRef.current = requestAnimationFrame(step);
    };
    platAnimRef.current = requestAnimationFrame(step);
    return () => {
      if (platAnimRef.current !== null) cancelAnimationFrame(platAnimRef.current);
    };
  }, [activeMode, isPlaying, vinylRpm, speedMult]);

  const handleAutoScratch = useCallback(() => {
    const lengthMs: Record<string, number> = {
      short_stab: 800, '1_bar': 2000, '2_bars': 4000, '4_bars': 8000, full_hook: 12000,
    };
    const duration = lengthMs[autoLength] ?? 2000;
    setIsPlaying(true);
    setAutoProgress(0);
    if (autoScratchTimer.current !== null) clearTimeout(autoScratchTimer.current);
    if (autoProgressTimer.current !== null) clearInterval(autoProgressTimer.current);
    const startTime = Date.now();
    autoProgressTimer.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startTime) / duration) * 100);
      setAutoProgress(pct);
      if (pct >= 100) {
        if (autoProgressTimer.current !== null) clearInterval(autoProgressTimer.current);
        setAutoProgress(null);
      }
    }, 50);
    autoScratchTimer.current = setTimeout(() => {
      setIsPlaying(false);
      setAutoProgress(null);
    }, duration);
  }, [autoLength]);

  // Live mode: mouse drag on waveform
  const handleLiveDragStart = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    setLiveDragActive(true);
    liveDragStartX.current = e.clientX;
    setLiveFaderOpen(true);
  }, []);

  const handleLiveDragMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!e.buttons) return;
    const delta = e.clientX - liveDragStartX.current;
    const velocity = Math.max(-4, Math.min(4, delta * 0.04));
    setLiveVelocity(velocity);
    setLiveDirection(velocity > 0.05 ? 'forward' : velocity < -0.05 ? 'reverse' : 'stopped');
    setLivePlayhead(prev => Math.max(0, Math.min(100, prev + velocity * 0.5)));
    liveDragStartX.current = e.clientX;
  }, []);

  const handleLiveDragEnd = useCallback(() => {
    setLiveDragActive(false);
    setLiveVelocity(0);
    setLiveDirection('stopped');
    setLiveFaderOpen(false);
  }, []);

  const editorEventCounter = useRef(10);

  // Editor mode helpers
  const addEditorEvent = useCallback(() => {
    editorEventCounter.current += 1;
    const newEvent: EditorEvent = {
      id: `e${editorEventCounter.current}`,
      type: 'forward',
      startBeat: editorEvents.length * 0.5,
      durationBeats: 0.5,
      speedMultiplier: 1.0,
      faderPosition: 1.0,
    };
    setEditorEvents(prev => [...prev, newEvent].sort((a, b) => a.startBeat - b.startBeat));
    setSelectedEventId(newEvent.id);
  }, [editorEvents]);

  const deleteEditorEvent = useCallback((id: string) => {
    setEditorEvents(prev => prev.filter(e => e.id !== id));
    setSelectedEventId(prev => prev === id ? null : prev);
  }, []);

  const updateEditorEvent = useCallback((id: string, changes: Partial<EditorEvent>) => {
    setEditorEvents(prev =>
      prev.map(e => e.id === id ? { ...e, ...changes } : e)
        .sort((a, b) => a.startBeat - b.startBeat)
    );
  }, []);

  const loadStyleToEditor = useCallback((styleId: string) => {
    const stylePatterns: Record<string, EditorEvent[]> = {
      baby: [
        { id: 'b1', type: 'forward',  startBeat: 0.0, durationBeats: 0.5, speedMultiplier: 1.0, faderPosition: 1.0 },
        { id: 'b2', type: 'backward', startBeat: 0.5, durationBeats: 0.5, speedMultiplier: 1.0, faderPosition: 1.0 },
      ],
      chirp: [
        { id: 'c1', type: 'forward',     startBeat: 0.0,  durationBeats: 0.5,  speedMultiplier: 1.8, faderPosition: 0.0 },
        { id: 'c2', type: 'fader_open',  startBeat: 0.15, durationBeats: 0.2,  speedMultiplier: 1.8, faderPosition: 1.0 },
        { id: 'c3', type: 'fader_close', startBeat: 0.35, durationBeats: 0.0,  speedMultiplier: 1.8, faderPosition: 0.0 },
        { id: 'c4', type: 'backward',    startBeat: 0.5,  durationBeats: 0.5,  speedMultiplier: 1.0, faderPosition: 0.0 },
      ],
      transformer: [
        { id: 't1', type: 'forward',  startBeat: 0.0, durationBeats: 1.0, speedMultiplier: 1.0, faderPosition: 1.0 },
        { id: 't2', type: 'stutter',  startBeat: 0.0, durationBeats: 1.0, speedMultiplier: 1.0, faderPosition: 1.0 },
        { id: 't3', type: 'backward', startBeat: 1.0, durationBeats: 1.0, speedMultiplier: 1.0, faderPosition: 0.0 },
      ],
    };
    const events = stylePatterns[styleId];
    if (events) {
      setEditorEvents(events.map((e, idx) => ({ ...e, id: `${e.id}_${idx}` })));
      setPatternName(scratchStyles.find(s => s.id === styleId)?.name ?? 'Pattern');
    }
  }, []);

  // MinorVDJ sync
  const handleSync = useCallback(() => {
    setSyncEnabled(true);
    setDeckBBpm(deckABpm);
    setTimeout(() => setSyncEnabled(false), 500);
  }, [deckABpm]);

  // Grid columns from patternLengthBars + resolution
  const gridDivisions = useMemo(() => {
    const divPerBeat: Record<string, number> = { '8n': 2, '16n': 4, '32n': 8 };
    return patternLengthBars * 4 * (divPerBeat[gridResolution] ?? 4);
  }, [patternLengthBars, gridResolution]);

  const totalBeats = patternLengthBars * 4;

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center bg-bg-surface p-4 rounded-xl border border-border-main shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-brand/20 rounded-lg flex items-center justify-center border border-brand/30">
            <Disc3 className="text-brand" size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest">Vinyl Scratch Pro</h2>
            <p className="text-[10px] text-neutral-500 font-mono uppercase">Engine: VSP v2.0.0 · Scratch System</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode selector */}
          <div className="flex items-center gap-0.5 bg-bg-main/60 rounded-lg px-1 py-0.5 border border-border-main">
            {(['auto', 'live', 'editor', 'turntable', 'minorvdj'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setActiveMode(mode)}
                className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                  activeMode === mode
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          {/* BPM */}
          <div className="flex items-center gap-2 bg-bg-main/60 px-3 py-1.5 rounded-lg border border-border-main">
            <span className="text-[10px] font-mono text-neutral-600 uppercase">BPM</span>
            <input
              type="number"
              value={bpm}
              onChange={e => setBpm(parseInt(e.target.value) || 90)}
              className="w-12 bg-transparent text-brand font-bold text-sm outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Column: Vinyl Platter + Fader */}
        <div className="w-72 flex flex-col gap-4 flex-shrink-0">
          {/* Vinyl Platter Visualization */}
          <div
            className={`relative aspect-square rounded-2xl border-2 transition-all overflow-hidden flex items-center justify-center ${
              isDragging
                ? 'border-brand border-dashed bg-brand/5'
                : 'border-border-main bg-bg-main/50'
            }`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); }}
          >
            {/* Platter rings */}
            <div
              className="w-56 h-56 rounded-full border-4 border-neutral-700/50 flex items-center justify-center"
              style={{
                transform: activeMode === 'turntable' ? `rotate(${platAngle}deg)` : undefined,
                transition: activeMode === 'turntable' ? 'none' : undefined,
                animation: (isPlaying && activeMode !== 'turntable') ? 'spin 2s linear infinite' : 'none',
              }}
            >
              <div className="w-44 h-44 rounded-full border-2 border-neutral-700/30 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border border-neutral-700/20 flex items-center justify-center bg-bg-surface/30">
                  <div className="w-16 h-16 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-brand shadow-[0_0_12px_var(--brand-primary-glow)]"></div>
                  </div>
                </div>
              </div>
            </div>
            {/* Turntable mode: tonearm decoration */}
            {activeMode === 'turntable' && (
              <div className="absolute top-3 right-3 flex flex-col items-end gap-1 pointer-events-none">
                <div className="text-[8px] font-mono text-brand uppercase">{vinylRpm} RPM</div>
                <div className="text-[8px] font-mono text-neutral-500 uppercase">{speedMult.toFixed(2)}×</div>
              </div>
            )}
            {/* Drop zone overlay */}
            {!selectedSample && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
                <UploadCloud className="w-7 h-7 text-neutral-600 opacity-50" />
                <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">Drop Sample Here</span>
              </div>
            )}
            {/* Playing indicator */}
            {isPlaying && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indicator animate-pulse shadow-[0_0_8px_var(--indicator-glow)]"></div>
            )}
            {/* Live mode: direction badge */}
            {activeMode === 'live' && liveDirection !== 'stopped' && (
              <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                liveDirection === 'forward' ? 'bg-indicator/20 text-indicator' : 'bg-red-500/20 text-red-400'
              }`}>
                {liveDirection === 'forward' ? '▶ Forward' : '◀ Reverse'}
              </div>
            )}
          </div>

          {/* Crossfader */}
          <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Crossfader</span>
              <select
                value={faderCurve}
                onChange={e => setFaderCurve(e.target.value)}
                className="bg-bg-main border border-border-main text-[9px] text-neutral-400 rounded px-1.5 py-0.5 outline-none"
              >
                <option value="linear">Linear</option>
                <option value="exponential">Exponential</option>
                <option value="s_curve">S-Curve</option>
                <option value="hard_cut">Hard Cut</option>
              </select>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={faderPosition}
              onChange={e => setFaderPosition(parseInt(e.target.value))}
              className="w-full h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-brand"
            />
            <div className="flex justify-between text-[9px] font-mono text-neutral-600">
              <span>Cut</span>
              <span className="text-brand font-bold">{faderPosition}%</span>
              <span>Open</span>
            </div>
          </div>

          {/* Transport */}
          <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex items-center justify-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-3 rounded-lg transition-all ${
                isPlaying
                  ? 'bg-indicator/20 text-indicator border border-indicator/50 shadow-[0_0_10px_var(--indicator-glow)]'
                  : 'bg-bg-main text-neutral-400 hover:text-white border border-border-main'
              }`}
            >
              <Play size={18} fill={isPlaying ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => { setIsPlaying(false); setIsRecording(false); }}
              className="p-3 rounded-lg bg-bg-main text-neutral-400 hover:text-white border border-border-main transition-all"
            >
              <Square size={18} fill="currentColor" />
            </button>
            <button
              onClick={() => setIsRecording(!isRecording)}
              className={`p-3 rounded-lg transition-all ${
                isRecording
                  ? 'bg-red-600/20 text-red-400 border border-red-500/50 animate-pulse'
                  : 'bg-bg-main text-neutral-400 hover:text-red-400 border border-border-main'
              }`}
            >
              <Circle size={18} fill={isRecording ? 'currentColor' : 'none'} />
            </button>
            <div className="h-6 w-px bg-border-main"></div>
            <button
              onClick={handleAutoScratch}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand hover:opacity-90 text-white rounded-lg font-bold text-[10px] uppercase transition-all shadow-lg shadow-brand/20"
            >
              <Zap size={14} /> Auto-Scratch
            </button>
          </div>
        </div>

        {/* Center Column: Mode-specific content */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* ── AUTO MODE ── */}
          {activeMode === 'auto' && (
            <>
              {/* Scratch Style Presets */}
              <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shuffle size={14} className="text-brand" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Scratch Styles</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={intensity}
                      onChange={e => setIntensity(e.target.value as 'low' | 'medium' | 'high')}
                      className="bg-bg-main border border-border-main text-[9px] text-neutral-400 rounded px-2 py-1 outline-none"
                    >
                      <option value="low">Low Intensity</option>
                      <option value="medium">Medium</option>
                      <option value="high">High Intensity</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {scratchStyles.map(style => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedStyle(style.id)}
                      className={`flex flex-col gap-1.5 p-3 rounded-lg border transition-all text-left ${
                        selectedStyle === style.id
                          ? 'bg-brand/10 border-brand shadow-lg shadow-brand/5'
                          : 'bg-bg-main/50 border-border-main hover:border-neutral-600'
                      }`}
                    >
                      <span className={`text-[10px] font-bold uppercase ${selectedStyle === style.id ? 'text-brand' : 'text-neutral-300'}`}>
                        {style.name}
                      </span>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border w-fit ${difficultyColors[style.difficulty]}`}>
                        {style.difficulty}
                      </span>
                      <span className="text-[8px] text-neutral-500 leading-tight">{style.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-Scratch Settings + Sample */}
              <div className="flex-1 bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3 min-h-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-brand" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Auto-Scratch Settings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedSample}
                      onChange={e => setSelectedSample(e.target.value)}
                      className="bg-bg-main border border-border-main text-[10px] text-neutral-300 rounded-lg px-3 py-1.5 outline-none focus:border-brand transition-colors"
                    >
                      {builtInSamples.map(sample => (
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
                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Clip Length</span>
                    <div className="flex flex-wrap gap-1">
                      {(['short_stab', '1_bar', '2_bars', '4_bars', 'full_hook'] as const).map(len => (
                        <button
                          key={len}
                          onClick={() => setAutoLength(len)}
                          className={`px-2 py-1 rounded text-[9px] font-bold uppercase border transition-all ${
                            autoLength === len
                              ? 'bg-brand text-white border-brand'
                              : 'bg-bg-main text-neutral-500 border-border-main hover:border-neutral-500'
                          }`}
                        >
                          {len.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Options</span>
                    <label className="flex items-center gap-2 text-[9px] font-mono text-neutral-400 uppercase cursor-pointer">
                      <input type="checkbox" checked={addSignatureFX} onChange={e => setAddSignatureFX(e.target.checked)} className="accent-brand" />
                      Add Signature FX
                    </label>
                    <label className="flex items-center gap-2 text-[9px] font-mono text-neutral-400 uppercase cursor-pointer">
                      <input type="checkbox" checked={autoQuantize} onChange={e => setAutoQuantize(e.target.checked)} className="accent-brand" />
                      Auto-Quantize
                    </label>
                    <label className="flex items-center gap-2 text-[9px] font-mono text-neutral-400 uppercase cursor-pointer">
                      <input type="checkbox" checked={targetTransients} onChange={e => setTargetTransients(e.target.checked)} className="accent-brand" />
                      Target Transients
                    </label>
                    <label className="flex items-center gap-2 text-[9px] font-mono text-neutral-400 uppercase cursor-pointer">
                      <input type="checkbox" checked={sampleThroughTurntable} onChange={e => setSampleThroughTurntable(e.target.checked)} className="accent-brand" />
                      Through Turntable
                    </label>
                  </div>
                </div>

                {/* Waveform with progress */}
                <div className="flex-1 relative rounded-lg border border-border-main bg-bg-main/50 overflow-hidden min-h-[80px]">
                  <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                    <rect x="10%" y="0" width="30%" height="100%" fill="var(--brand-primary)" opacity="0.06" />
                    <line x1="10%" y1="0" x2="10%" y2="100%" stroke="var(--brand-primary)" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
                    <line x1="40%" y1="0" x2="40%" y2="100%" stroke="var(--brand-primary)" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
                    <g fill="var(--brand-primary)" opacity="0.7">
                      {waveformData.map((val, i) => (
                        <rect key={i} x={`${(i / 120) * 100}%`} y={`${50 - val * 42}%`} width="0.7%" height={`${val * 84}%`} rx="1" />
                      ))}
                    </g>
                    {autoProgress !== null && (
                      <rect x="0" y="0" width={`${autoProgress}%`} height="100%" fill="var(--indicator)" opacity="0.08" />
                    )}
                    {(isPlaying || autoProgress !== null) && (
                      <line
                        x1={`${autoProgress ?? 25}%`} y1="0"
                        x2={`${autoProgress ?? 25}%`} y2="100%"
                        stroke="var(--indicator)" strokeWidth="2" opacity="0.9"
                      />
                    )}
                  </svg>
                  <div className="absolute bottom-1 left-[10%] text-[7px] font-mono text-brand/60 uppercase">Loop Start</div>
                  <div className="absolute bottom-1 left-[35%] text-[7px] font-mono text-brand/60 uppercase">Loop End</div>
                  {autoProgress !== null && (
                    <div className="absolute top-1 right-2 text-[8px] font-mono text-indicator uppercase">Rendering {Math.round(autoProgress)}%</div>
                  )}
                </div>

                {currentStyle && (
                  <div className="flex items-center gap-4 px-3 py-2 bg-bg-main/60 rounded-lg border border-border-main">
                    <div className="flex items-center gap-2">
                      <Disc3 size={12} className="text-brand" />
                      <span className="text-[10px] font-bold text-neutral-300 uppercase">{currentStyle.name}</span>
                    </div>
                    <span className="text-[9px] text-neutral-500">·</span>
                    <span className="text-[9px] text-neutral-500">{currentStyle.description}</span>
                    <span className="ml-auto text-[9px] font-mono text-neutral-600 uppercase">
                      Sample: {currentSample?.name}
                    </span>
                    {sampleThroughTurntable && (
                      <span className="text-[8px] font-mono text-indicator uppercase">Turntable ON</span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── LIVE MODE ── */}
          {activeMode === 'live' && (
            <>
              {/* Velocity / Direction meter */}
              <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowRight size={14} className="text-brand" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Live Scratch</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                      liveDirection === 'forward' ? 'text-indicator border-indicator/40 bg-indicator/10' :
                      liveDirection === 'reverse' ? 'text-red-400 border-red-500/40 bg-red-500/10' :
                      'text-neutral-500 border-border-main bg-bg-main'
                    }`}>
                      {liveDirection}
                    </span>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                      liveFaderOpen ? 'text-brand border-brand/40 bg-brand/10' : 'text-neutral-600 border-border-main bg-bg-main'
                    }`}>
                      Fader {liveFaderOpen ? 'Open' : 'Closed'}
                    </span>
                  </div>
                </div>

                {/* Velocity bar */}
                <div className="flex items-center gap-3">
                  <span className="text-[8px] font-mono text-neutral-600 w-12 text-right">-4×</span>
                  <div className="flex-1 h-4 bg-bg-main rounded-full overflow-hidden border border-border-main relative">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-600"></div>
                    <div
                      className={`absolute top-0 bottom-0 transition-all rounded-full ${liveVelocity >= 0 ? 'bg-indicator left-1/2' : 'bg-red-500 right-1/2'}`}
                      style={{ width: `${Math.abs(liveVelocity) / 4 * 50}%` }}
                    />
                  </div>
                  <span className="text-[8px] font-mono text-neutral-600 w-8">+4×</span>
                  <span className={`text-[9px] font-mono font-bold w-10 ${liveVelocity > 0 ? 'text-indicator' : liveVelocity < 0 ? 'text-red-400' : 'text-neutral-600'}`}>
                    {liveVelocity > 0 ? '+' : ''}{liveVelocity.toFixed(2)}×
                  </span>
                </div>

                {/* Sample selector */}
                <div className="flex items-center gap-2">
                  <Music size={12} className="text-brand" />
                  <span className="text-[9px] font-mono text-neutral-500 uppercase">Sample</span>
                  <select
                    value={selectedSample}
                    onChange={e => setSelectedSample(e.target.value)}
                    className="flex-1 bg-bg-main border border-border-main text-[10px] text-neutral-300 rounded-lg px-2 py-1 outline-none focus:border-brand"
                  >
                    {builtInSamples.map(sample => (
                      <option key={sample.id} value={sample.id}>{sample.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Interactive Waveform – drag to scratch */}
              <div className="flex-1 bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3 min-h-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Drag Waveform to Scratch</span>
                  <span className="text-[9px] font-mono text-neutral-600">Sensitivity: 0.04×</span>
                </div>
                <div className="flex-1 relative rounded-lg border border-border-main overflow-hidden min-h-[120px] cursor-ew-resize select-none">
                  <svg
                    className="absolute inset-0 w-full h-full"
                    preserveAspectRatio="none"
                    onMouseDown={handleLiveDragStart}
                    onMouseMove={handleLiveDragMove}
                    onMouseUp={handleLiveDragEnd}
                    onMouseLeave={handleLiveDragEnd}
                  >
                    {/* Background */}
                    <rect x="0" y="0" width="100%" height="100%" fill="transparent" />
                    {/* Waveform */}
                    <g fill="var(--brand-primary)" opacity={liveFaderOpen ? 0.9 : 0.5}>
                      {waveformData.map((val, i) => (
                        <rect key={i} x={`${(i / 120) * 100}%`} y={`${50 - val * 42}%`} width="0.7%" height={`${val * 84}%`} rx="1" />
                      ))}
                    </g>
                    {/* Playhead */}
                    <line
                      x1={`${livePlayhead}%`} y1="0"
                      x2={`${livePlayhead}%`} y2="100%"
                      stroke="var(--indicator)" strokeWidth="2" opacity="0.9"
                    />
                    {/* Fader gate overlay */}
                    {!liveFaderOpen && (
                      <rect x="0" y="0" width="100%" height="100%" fill="black" opacity="0.35" />
                    )}
                  </svg>
                  {!liveDragActive && liveDirection === 'stopped' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">← Drag to Scratch →</span>
                    </div>
                  )}
                </div>

                {/* Keyboard shortcuts reference */}
                <div className="bg-bg-main/60 rounded-lg border border-border-main p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Keyboard size={11} className="text-neutral-500" />
                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Keyboard Shortcuts</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[8px] font-mono">
                    {[
                      ['Space', 'Play/Pause'],
                      ['← →', 'Scratch ±1×'],
                      ['Shift ← →', 'Scratch ±2×'],
                      ['↑ ↓', 'Speed ±0.25×'],
                      ['R', 'Toggle Reverse'],
                      ['F (hold)', 'Fader Open'],
                      ['1–8', 'Load Preset'],
                      ['Ctrl+Z', 'Undo'],
                      ['Ctrl+Y', 'Redo'],
                    ].map(([key, action]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-bg-surface border border-border-main rounded text-neutral-300 font-bold whitespace-nowrap">{key}</span>
                        <span className="text-neutral-500">{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── EDITOR MODE ── */}
          {activeMode === 'editor' && (
            <>
              {/* Editor toolbar */}
              <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <GitBranch size={14} className="text-brand" />
                    <input
                      value={patternName}
                      onChange={e => setPatternName(e.target.value)}
                      className="bg-bg-main border border-border-main text-neutral-200 text-xs font-bold px-2 py-1 rounded-lg outline-none focus:border-brand w-32"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase">Grid</span>
                    {(['8n', '16n', '32n'] as const).map(g => (
                      <button
                        key={g}
                        onClick={() => setGridResolution(g)}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border transition-all ${
                          gridResolution === g ? 'bg-brand text-white border-brand' : 'bg-bg-main text-neutral-500 border-border-main'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase">Bars</span>
                    <button onClick={() => setPatternLengthBars(b => Math.max(1, b - 1))} className="p-0.5 rounded bg-bg-main border border-border-main hover:border-neutral-500 text-neutral-400"><ChevronDown size={12} /></button>
                    <span className="text-[10px] font-bold text-neutral-300 w-4 text-center">{patternLengthBars}</span>
                    <button onClick={() => setPatternLengthBars(b => Math.min(8, b + 1))} className="p-0.5 rounded bg-bg-main border border-border-main hover:border-neutral-500 text-neutral-400"><ChevronUp size={12} /></button>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase">Template</span>
                    <select
                      onChange={e => { if (e.target.value) { loadStyleToEditor(e.target.value); e.target.value = ''; } }}
                      className="bg-bg-main border border-border-main text-[9px] text-neutral-400 rounded px-2 py-1 outline-none"
                      defaultValue=""
                    >
                      <option value="" disabled>Load style…</option>
                      {scratchStyles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button
                      onClick={() => setEditorPreviewPlaying(p => !p)}
                      className={`p-1.5 rounded-lg border transition-all ${editorPreviewPlaying ? 'bg-indicator/20 text-indicator border-indicator/50' : 'bg-bg-main text-neutral-400 border-border-main hover:text-white'}`}
                    >
                      <Play size={13} fill={editorPreviewPlaying ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={() => setEditorRecording(r => !r)}
                      className={`p-1.5 rounded-lg border transition-all ${editorRecording ? 'bg-red-600/20 text-red-400 border-red-500/50 animate-pulse' : 'bg-bg-main text-neutral-400 border-border-main hover:text-red-400'}`}
                    >
                      <Circle size={13} fill={editorRecording ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Pattern Grid */}
              <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-2">
                <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Pattern Grid — {patternLengthBars} bar{patternLengthBars > 1 ? 's' : ''} @ {gridResolution}</span>
                <div className="relative overflow-x-auto">
                  <div
                    className="relative h-14 bg-bg-main rounded-lg border border-border-main overflow-hidden"
                    style={{ minWidth: `${gridDivisions * 14}px` }}
                  >
                    {/* Grid lines */}
                    {Array.from({ length: gridDivisions + 1 }, (_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 w-px"
                        style={{
                          left: `${(i / gridDivisions) * 100}%`,
                          background: i % (gridDivisions / totalBeats) === 0
                            ? 'rgba(255,199,44,0.3)'
                            : 'rgba(255,255,255,0.05)',
                        }}
                      />
                    ))}
                    {/* Beat labels */}
                    {Array.from({ length: totalBeats + 1 }, (_, i) => (
                      <div
                        key={i}
                        className="absolute top-0.5 text-[7px] font-mono text-brand/50"
                        style={{ left: `${(i / totalBeats) * 100}%`, transform: 'translateX(-50%)' }}
                      >
                        {i > 0 ? i : ''}
                      </div>
                    ))}
                    {/* Events on grid */}
                    {editorEvents.map(ev => {
                      const left = (ev.startBeat / totalBeats) * 100;
                      const width = (ev.durationBeats / totalBeats) * 100;
                      return (
                        <div
                          key={ev.id}
                          onClick={() => setSelectedEventId(ev.id === selectedEventId ? null : ev.id)}
                          className={`absolute top-5 h-6 rounded cursor-pointer border text-[7px] font-bold uppercase flex items-center justify-center truncate transition-all ${
                            EVENT_TYPE_COLORS[ev.type] ?? 'bg-neutral-700 text-neutral-300 border-neutral-600'
                          } ${ev.id === selectedEventId ? 'ring-1 ring-white/40' : 'opacity-80 hover:opacity-100'}`}
                          style={{
                            left: `${Math.max(0, left)}%`,
                            width: `${Math.max(2, width)}%`,
                          }}
                        >
                          {ev.type.replace(/_/g, '·')}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Event List */}
              <div className="flex-1 bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3 min-h-0">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Events ({editorEvents.length})</span>
                  <button
                    onClick={addEditorEvent}
                    className="flex items-center gap-1.5 px-3 py-1 bg-brand/10 text-brand text-[9px] font-bold uppercase rounded-lg border border-brand/30 hover:bg-brand/20 transition-all"
                  >
                    <Plus size={11} /> Add Event
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
                  {editorEvents.map(ev => (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEventId(ev.id === selectedEventId ? null : ev.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                        ev.id === selectedEventId
                          ? 'bg-brand/5 border-brand/40'
                          : 'bg-bg-main/50 border-border-main hover:border-neutral-600'
                      }`}
                    >
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border w-20 text-center ${EVENT_TYPE_COLORS[ev.type] ?? ''}`}>
                        {ev.type.replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-center gap-3 flex-1 text-[9px] font-mono text-neutral-400">
                        <span>Beat <span className="text-neutral-200">{ev.startBeat.toFixed(2)}</span></span>
                        <span>Dur <span className="text-neutral-200">{ev.durationBeats.toFixed(2)}</span></span>
                        <span>Speed <span className="text-neutral-200">{ev.speedMultiplier.toFixed(1)}×</span></span>
                        <span>Fdr <span className="text-neutral-200">{Math.round(ev.faderPosition * 100)}%</span></span>
                      </div>
                      {ev.id === selectedEventId && (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <select
                            value={ev.type}
                            onChange={e => updateEditorEvent(ev.id, { type: e.target.value as EditorEvent['type'] })}
                            className="bg-bg-surface border border-border-main text-[9px] text-neutral-300 rounded px-1 py-0.5 outline-none"
                          >
                            {['forward','backward','fader_open','fader_close','hold','chirp','tear','stutter','one_shot'].map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            value={ev.startBeat}
                            onChange={e => updateEditorEvent(ev.id, { startBeat: parseFloat(e.target.value) || 0 })}
                            className="w-12 bg-bg-surface border border-border-main text-[9px] text-neutral-300 rounded px-1 py-0.5 outline-none text-center"
                            title="Start Beat"
                          />
                          <input
                            type="number"
                            step="0.25"
                            min="0.25"
                            value={ev.durationBeats}
                            onChange={e => updateEditorEvent(ev.id, { durationBeats: parseFloat(e.target.value) || 0.25 })}
                            className="w-12 bg-bg-surface border border-border-main text-[9px] text-neutral-300 rounded px-1 py-0.5 outline-none text-center"
                            title="Duration Beats"
                          />
                        </div>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); deleteEditorEvent(ev.id); }}
                        className="p-1 text-neutral-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  {editorEvents.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-[10px] text-neutral-600 uppercase tracking-widest">
                      No events — add one or load a template
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── TURNTABLE MODE ── */}
          {activeMode === 'turntable' && (
            <>
              {/* RPM + Pitch + Key Lock */}
              <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Disc3 size={14} className="text-brand" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Turntable Controls</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsPlaying(p => !p)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all flex items-center gap-1.5 ${
                        isPlaying ? 'bg-indicator/20 text-indicator border-indicator/50' : 'bg-bg-main text-neutral-400 border-border-main hover:text-white'
                      }`}
                    >
                      <Play size={12} fill={isPlaying ? 'currentColor' : 'none'} /> {isPlaying ? 'Spinning' : 'Stopped'}
                    </button>
                  </div>
                </div>

                {/* RPM selector */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-mono text-neutral-500 uppercase">RPM</span>
                  <div className="flex items-center gap-2">
                    {[33.3, 45, 78].map(rpm => (
                      <button
                        key={rpm}
                        onClick={() => setVinylRpm(rpm)}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase border transition-all ${
                          vinylRpm === rpm
                            ? 'bg-brand/20 text-brand border-brand/50 shadow-lg shadow-brand/10'
                            : 'bg-bg-main text-neutral-500 border-border-main hover:border-neutral-500'
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
                    <span className="text-[9px] font-mono text-neutral-500 uppercase">Speed</span>
                    <span className="text-[9px] font-bold text-brand font-mono">{speedMult.toFixed(2)}×</span>
                  </div>
                  <input
                    type="range"
                    min="0.25"
                    max="4"
                    step="0.05"
                    value={speedMult}
                    onChange={e => setSpeedMult(parseFloat(e.target.value))}
                    className="w-full h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-brand"
                  />
                  <div className="flex justify-between text-[8px] font-mono text-neutral-600">
                    <span>0.25×</span>
                    <button onClick={() => setSpeedMult(1.0)} className="text-brand hover:text-white transition-colors">Reset 1×</button>
                    <span>4×</span>
                  </div>
                </div>

                {/* Pitch slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase">Pitch</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold font-mono ${pitchSemitones > 0 ? 'text-indicator' : pitchSemitones < 0 ? 'text-red-400' : 'text-neutral-500'}`}>
                        {pitchSemitones > 0 ? '+' : ''}{pitchSemitones} st
                      </span>
                      <button
                        onClick={() => setKeyLock(k => !k)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-bold uppercase border transition-all ${
                          keyLock ? 'bg-brand/20 text-brand border-brand/50' : 'bg-bg-main text-neutral-500 border-border-main hover:border-neutral-500'
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
                    onChange={e => setPitchSemitones(parseInt(e.target.value))}
                    className="w-full h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-brand"
                  />
                  <div className="flex justify-between text-[8px] font-mono text-neutral-600">
                    <span>-12 st</span>
                    <button onClick={() => setPitchSemitones(0)} className="text-brand hover:text-white transition-colors">Center</button>
                    <span>+12 st</span>
                  </div>
                </div>
              </div>

              {/* Waveform + sample for turntable */}
              <div className="flex-1 bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3 min-h-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Music size={14} className="text-brand" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Loaded Sample</span>
                  </div>
                  <select
                    value={selectedSample}
                    onChange={e => setSelectedSample(e.target.value)}
                    className="bg-bg-main border border-border-main text-[10px] text-neutral-300 rounded-lg px-3 py-1.5 outline-none focus:border-brand"
                  >
                    {builtInSamples.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="flex-1 relative rounded-lg border border-border-main bg-bg-main/50 overflow-hidden min-h-[80px]">
                  <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                    <g fill="var(--brand-primary)" opacity="0.7">
                      {waveformData.map((val, i) => (
                        <rect key={i} x={`${(i / 120) * 100}%`} y={`${50 - val * 42}%`} width="0.7%" height={`${val * 84}%`} rx="1" />
                      ))}
                    </g>
                    {isPlaying && (
                      <line x1="25%" y1="0" x2="25%" y2="100%" stroke="var(--indicator)" strokeWidth="2" opacity="0.9" />
                    )}
                  </svg>
                </div>

                {/* Turntable status */}
                <div className="grid grid-cols-3 gap-2 text-[9px] font-mono">
                  <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                    <span className="text-neutral-600 uppercase">RPM</span>
                    <span className="text-brand font-bold">{vinylRpm}</span>
                  </div>
                  <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                    <span className="text-neutral-600 uppercase">Pitch</span>
                    <span className={`font-bold ${pitchSemitones !== 0 ? 'text-indicator' : 'text-neutral-400'}`}>{pitchSemitones > 0 ? '+' : ''}{pitchSemitones} st</span>
                  </div>
                  <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                    <span className="text-neutral-600 uppercase">Key Lock</span>
                    <span className={`font-bold ${keyLock ? 'text-brand' : 'text-neutral-600'}`}>{keyLock ? 'ON' : 'OFF'}</span>
                  </div>
                  <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                    <span className="text-neutral-600 uppercase">Speed</span>
                    <span className="text-brand font-bold">{speedMult.toFixed(2)}×</span>
                  </div>
                  <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                    <span className="text-neutral-600 uppercase">Platter °</span>
                    <span className="text-neutral-300 font-bold">{Math.round(platAngle)}°</span>
                  </div>
                  <div className="bg-bg-main/60 rounded-lg border border-border-main p-2 flex flex-col gap-0.5">
                    <span className="text-neutral-600 uppercase">Status</span>
                    <span className={`font-bold ${isPlaying ? 'text-indicator' : 'text-neutral-600'}`}>{isPlaying ? 'Playing' : 'Stopped'}</span>
                  </div>
                </div>

                {/* Send to Sample Editor */}
                <button
                  onClick={() => onSendToSampleEditor?.()}
                  className="w-full py-2.5 bg-brand/10 hover:bg-brand/20 text-brand text-[10px] font-bold uppercase rounded-lg border border-brand/40 hover:border-brand transition-all flex items-center justify-center gap-2"
                >
                  <Send size={13} /> Send to Sample Editor
                </button>
              </div>
            </>
          )}

          {/* ── MINORVDJ MODE ── */}
          {activeMode === 'minorvdj' && (
            <>
              {/* Dual Deck + Crossfader */}
              <div className="flex-1 flex flex-col gap-3">
                {/* Deck row */}
                <div className="flex gap-3">
                  {/* Deck A */}
                  <div className={`flex-1 bg-bg-surface rounded-xl border p-4 flex flex-col gap-3 transition-all ${deckAPlaying ? 'border-indicator/50 shadow-lg shadow-indicator/5' : 'border-border-main'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${deckAPlaying ? 'bg-indicator animate-pulse shadow-[0_0_6px_var(--indicator-glow)]' : 'bg-neutral-700'}`} />
                        <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-widest">Deck A</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setDeckAPlaying(p => !p)}
                          className={`p-1.5 rounded border transition-all ${deckAPlaying ? 'bg-indicator/20 text-indicator border-indicator/50' : 'bg-bg-main text-neutral-400 border-border-main hover:text-white'}`}
                        >
                          <Play size={12} fill={deckAPlaying ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          onClick={() => { setDeckAPlaying(false); setDeckACuePoint(0); }}
                          className="p-1.5 rounded border bg-bg-main text-neutral-400 border-border-main hover:text-white transition-all"
                        >
                          <SkipBack size={12} />
                        </button>
                      </div>
                    </div>
                    <select
                      value={selectedSample}
                      onChange={e => setSelectedSample(e.target.value)}
                      className="bg-bg-main border border-border-main text-[10px] text-neutral-300 rounded-lg px-2 py-1.5 outline-none focus:border-brand"
                    >
                      {builtInSamples.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {/* Mini waveform A */}
                    <div className="relative h-12 rounded-lg border border-border-main bg-bg-main/50 overflow-hidden">
                      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                        <g fill="var(--brand-primary)" opacity="0.7">
                          {waveformData.slice(0, 60).map((val, i) => (
                            <rect key={i} x={`${(i / 60) * 100}%`} y={`${50 - val * 40}%`} width="1.5%" height={`${val * 80}%`} rx="1" />
                          ))}
                        </g>
                        {deckAPlaying && <line x1={`${deckACuePoint}%`} y1="0" x2={`${deckACuePoint}%`} y2="100%" stroke="var(--indicator)" strokeWidth="2" opacity="0.9" />}
                      </svg>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-mono text-neutral-600 uppercase">BPM</span>
                      <input
                        type="number"
                        value={deckABpm}
                        onChange={e => setDeckABpm(parseInt(e.target.value) || 90)}
                        className="w-14 bg-bg-main border border-border-main text-brand font-bold text-[10px] rounded px-1.5 py-0.5 outline-none text-center"
                      />
                      <input
                        type="range" min="0" max="100" value={deckALevel}
                        onChange={e => setDeckALevel(parseInt(e.target.value))}
                        className="flex-1 accent-brand"
                      />
                      <span className="text-[8px] font-mono text-neutral-500">{deckALevel}%</span>
                    </div>
                    {/* Cue buttons */}
                    <div className="flex gap-1">
                      {[0, 25, 50, 75].map(cue => (
                        <button
                          key={cue}
                          onClick={() => setDeckACuePoint(cue)}
                          className={`flex-1 py-1 text-[8px] font-bold rounded border transition-all ${
                            deckACuePoint === cue ? 'bg-brand/20 text-brand border-brand/50' : 'bg-bg-main text-neutral-500 border-border-main hover:border-neutral-500'
                          }`}
                        >
                          {cue > 0 ? `${cue}%` : 'CUE'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Center: Crossfader + sync */}
                  <div className="w-28 flex flex-col items-center gap-3 flex-shrink-0">
                    <div className="flex flex-col items-center gap-2 w-full">
                      <span className="text-[8px] font-mono text-neutral-600 uppercase">X-Fader</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={faderPosition}
                        onChange={e => setFaderPosition(parseInt(e.target.value))}
                        className="w-24 h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-brand"
                        style={{ writingMode: 'horizontal-tb' }}
                      />
                      <div className="flex justify-between w-full text-[7px] font-mono text-neutral-600">
                        <span>A</span>
                        <span className="text-brand font-bold">{faderPosition}%</span>
                        <span>B</span>
                      </div>
                    </div>
                    <button
                      onClick={handleSync}
                      className={`w-full py-2 text-[9px] font-bold uppercase rounded-lg border transition-all flex items-center justify-center gap-1 ${
                        syncEnabled
                          ? 'bg-indicator/20 text-indicator border-indicator/50 animate-pulse'
                          : 'bg-bg-main text-neutral-400 border-border-main hover:text-white hover:border-neutral-500'
                      }`}
                    >
                      <RefreshCw size={11} /> SYNC
                    </button>
                    <button
                      onClick={() => setAutoDj(d => !d)}
                      className={`w-full py-2 text-[9px] font-bold uppercase rounded-lg border transition-all ${
                        autoDj ? 'bg-brand/20 text-brand border-brand/50' : 'bg-bg-main text-neutral-400 border-border-main hover:border-neutral-500'
                      }`}
                    >
                      AUTO DJ
                    </button>
                    <div className="text-[8px] font-mono text-neutral-600 text-center uppercase leading-tight">
                      {autoDj ? <span className="text-brand">● Active</span> : 'Off'}
                    </div>
                    {/* Playlist cursor */}
                    {autoDj && (
                      <div className="text-[7px] font-mono text-neutral-500 text-center">
                        Track {playlistCursor + 1}/{playlist.length}
                      </div>
                    )}
                  </div>

                  {/* Deck B */}
                  <div className={`flex-1 bg-bg-surface rounded-xl border p-4 flex flex-col gap-3 transition-all ${deckBPlaying ? 'border-indicator/50 shadow-lg shadow-indicator/5' : 'border-border-main'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${deckBPlaying ? 'bg-indicator animate-pulse shadow-[0_0_6px_var(--indicator-glow)]' : 'bg-neutral-700'}`} />
                        <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-widest">Deck B</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setDeckBPlaying(p => !p)}
                          className={`p-1.5 rounded border transition-all ${deckBPlaying ? 'bg-indicator/20 text-indicator border-indicator/50' : 'bg-bg-main text-neutral-400 border-border-main hover:text-white'}`}
                        >
                          <Play size={12} fill={deckBPlaying ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          onClick={() => { setDeckBPlaying(false); setDeckBCuePoint(0); }}
                          className="p-1.5 rounded border bg-bg-main text-neutral-400 border-border-main hover:text-white transition-all"
                        >
                          <SkipBack size={12} />
                        </button>
                      </div>
                    </div>
                    <select
                      value={deckBSample}
                      onChange={e => setDeckBSample(e.target.value)}
                      className="bg-bg-main border border-border-main text-[10px] text-neutral-300 rounded-lg px-2 py-1.5 outline-none focus:border-brand"
                    >
                      {builtInSamples.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {/* Mini waveform B */}
                    <div className="relative h-12 rounded-lg border border-border-main bg-bg-main/50 overflow-hidden">
                      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                        <g fill="var(--brand-primary)" opacity="0.7">
                          {waveformDataB.slice(0, 60).map((val, i) => (
                            <rect key={i} x={`${(i / 60) * 100}%`} y={`${50 - val * 40}%`} width="1.5%" height={`${val * 80}%`} rx="1" />
                          ))}
                        </g>
                        {deckBPlaying && <line x1={`${deckBCuePoint}%`} y1="0" x2={`${deckBCuePoint}%`} y2="100%" stroke="var(--indicator)" strokeWidth="2" opacity="0.9" />}
                      </svg>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-mono text-neutral-600 uppercase">BPM</span>
                      <input
                        type="number"
                        value={deckBBpm}
                        onChange={e => setDeckBBpm(parseInt(e.target.value) || 90)}
                        className="w-14 bg-bg-main border border-border-main text-brand font-bold text-[10px] rounded px-1.5 py-0.5 outline-none text-center"
                      />
                      <input
                        type="range" min="0" max="100" value={deckBLevel}
                        onChange={e => setDeckBLevel(parseInt(e.target.value))}
                        className="flex-1 accent-brand"
                      />
                      <span className="text-[8px] font-mono text-neutral-500">{deckBLevel}%</span>
                    </div>
                    {/* Cue buttons */}
                    <div className="flex gap-1">
                      {[0, 25, 50, 75].map(cue => (
                        <button
                          key={cue}
                          onClick={() => setDeckBCuePoint(cue)}
                          className={`flex-1 py-1 text-[8px] font-bold rounded border transition-all ${
                            deckBCuePoint === cue ? 'bg-brand/20 text-brand border-brand/50' : 'bg-bg-main text-neutral-500 border-border-main hover:border-neutral-500'
                          }`}
                        >
                          {cue > 0 ? `${cue}%` : 'CUE'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Playlist queue */}
                <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListMusic size={13} className="text-brand" />
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Playlist Queue</span>
                    </div>
                    <span className="text-[9px] font-mono text-neutral-600">{playlist.length} tracks</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {playlist.map((id, idx) => {
                      const sample = builtInSamples.find(s => s.id === id);
                      const isActive = idx === playlistCursor;
                      const isNext = idx === (playlistCursor + 1) % playlist.length;
                      return (
                        <div
                          key={id}
                          onClick={() => setPlaylistCursor(idx)}
                          className={`flex-shrink-0 px-3 py-2 rounded-lg border cursor-pointer text-[9px] font-bold uppercase transition-all ${
                            isActive
                              ? 'bg-brand/20 border-brand text-brand'
                              : isNext
                              ? 'bg-bg-main border-indicator/40 text-indicator/80'
                              : 'bg-bg-main border-border-main text-neutral-500 hover:border-neutral-500'
                          }`}
                        >
                          <div>{idx + 1}. {sample?.name}</div>
                          {isActive && <div className="text-[7px] text-brand/60 mt-0.5">▶ NOW</div>}
                          {isNext && <div className="text-[7px] text-indicator/60 mt-0.5">NEXT</div>}
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
        <div className="w-52 flex flex-col gap-4 flex-shrink-0">
          {/* Vinyl Simulation */}
          <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Turntable Emulation</span>
            <div className="grid grid-cols-2 gap-y-4 gap-x-2 place-items-center">
              <Knob label="Inertia" value={inertia} onChange={setInertia} color="#FFC72C" />
              <Knob label="Friction" value={friction} onChange={setFriction} color="#FFC72C" />
              <Knob label="Noise" value={vinylNoise} onChange={setVinylNoise} color="#39FF14" />
              <Knob label="Drift" value={pitchDrift} onChange={setPitchDrift} color="#39FF14" />
            </div>
          </div>

          {/* Effects */}
          <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Sonic Degradation FX</span>
            <div className="grid grid-cols-2 gap-y-4 gap-x-2 place-items-center">
              <Knob label="Echo" value={echoWet} onChange={setEchoWet} color="#3b82f6" />
              <Knob label="Reverb" value={reverbWet} onChange={setReverbWet} color="#3b82f6" />
              <Knob label="Drive" value={drive} onChange={setDrive} color="#f97316" />
              <Knob label="Wear" value={wear} onChange={setWear} color="#f97316" />
              <Knob label="Crackle" value={crackle} onChange={setCrackle} color="#f97316" />
              <Knob label="Lo-Fi" value={lofiTone} onChange={setLofiTone} color="#f97316" />
            </div>
          </div>

          <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <ListMusic size={12} className="text-brand" />
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Minimal Mixer</span>
            </div>
            <div className="flex flex-col gap-2 text-[9px] font-mono text-neutral-500 uppercase">
              <label className="flex items-center gap-2">Deck A <input type="range" min="0" max="100" value={deckALevel} onChange={e => setDeckALevel(parseInt(e.target.value))} className="flex-1 accent-brand" /></label>
              <label className="flex items-center gap-2">Deck B <input type="range" min="0" max="100" value={deckBLevel} onChange={e => setDeckBLevel(parseInt(e.target.value))} className="flex-1 accent-brand" /></label>
              <label className="flex items-center gap-2">Master <input type="range" min="0" max="100" value={masterLevel} onChange={e => setMasterLevel(parseInt(e.target.value))} className="flex-1 accent-brand" /></label>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Quick Actions</span>
            <button className="w-full py-2 bg-bg-main hover:bg-neutral-800 text-neutral-300 text-[10px] font-bold uppercase rounded-lg transition-colors border border-border-main flex items-center justify-center gap-2">
              <Scissors size={12} /> Export Clip
            </button>
            <button className="w-full py-2 bg-bg-main hover:bg-neutral-800 text-neutral-300 text-[10px] font-bold uppercase rounded-lg transition-colors border border-border-main flex items-center justify-center gap-2">
              <Repeat size={12} /> Save as Preset
            </button>
            <button className="w-full py-2 bg-bg-main hover:bg-neutral-800 text-neutral-300 text-[10px] font-bold uppercase rounded-lg transition-colors border border-border-main flex items-center justify-center gap-2">
              <Sliders size={12} /> Export MIDI
            </button>
          </div>

          {/* Status */}
          <div className="mt-auto bg-bg-main/60 rounded-lg border border-border-main p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-neutral-600 uppercase">Latency</span>
              <span className="text-[9px] font-mono text-indicator">6ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-neutral-600 uppercase">CPU</span>
              <span className="text-[9px] font-mono text-indicator">3.2%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-neutral-600 uppercase">Mode</span>
              <span className="text-[9px] font-mono text-brand uppercase">{activeMode}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

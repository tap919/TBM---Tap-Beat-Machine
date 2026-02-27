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
} from 'lucide-react';

type ScratchStyle = {
  id: string;
  name: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  description: string;
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

export function VinylScratchPro() {
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

  const [isDragging, setIsDragging] = useState(false);

  const currentStyle = scratchStyles.find(s => s.id === selectedStyle);
  const currentSample = builtInSamples.find(s => s.id === selectedSample);

  const waveformData = useMemo(() =>
    Array.from({ length: 120 }, (_, i) =>
      Math.abs(Math.sin(i * 0.15) * 0.3 + (Math.sin(i * 0.73) * 0.5 + 0.5) * 0.4 + 0.15)
    ), []);

  const autoScratchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoScratchTimer.current !== null) clearTimeout(autoScratchTimer.current);
    };
  }, []);

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

  const handleAutoScratch = useCallback(() => {
    setIsPlaying(true);
    if (autoScratchTimer.current !== null) clearTimeout(autoScratchTimer.current);
    autoScratchTimer.current = setTimeout(() => setIsPlaying(false), 2000);
  }, []);

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
            <div className={`w-56 h-56 rounded-full border-4 border-neutral-700/50 flex items-center justify-center ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '2s' }}>
              <div className="w-44 h-44 rounded-full border-2 border-neutral-700/30 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border border-neutral-700/20 flex items-center justify-center bg-bg-surface/30">
                  <div className="w-16 h-16 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-brand shadow-[0_0_12px_var(--brand-primary-glow)]"></div>
                  </div>
                </div>
              </div>
            </div>
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

        {/* Center Column: Style Presets + Sample Library */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
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

          {/* Sample Selector + Waveform */}
          <div className="flex-1 bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3 min-h-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music size={14} className="text-brand" />
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Sample Library</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[9px] font-bold text-neutral-500 uppercase">
                  <input
                    type="checkbox"
                    checked={sampleThroughTurntable}
                    onChange={e => setSampleThroughTurntable(e.target.checked)}
                    className="accent-brand"
                  />
                  Through Turntable
                </label>
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
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-brand/10 text-brand text-[9px] font-bold uppercase rounded-lg border border-brand/30 hover:bg-brand/20 transition-all">
                  <UploadCloud size={10} /> Import
                </button>
              </div>
            </div>

            {/* Waveform with scratch regions */}
            <div className="flex-1 relative rounded-lg border border-border-main bg-bg-main/50 overflow-hidden min-h-[80px]">
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                {/* Scratch region highlight */}
                <rect x="10%" y="0" width="30%" height="100%" fill="var(--brand-primary)" opacity="0.06" />
                <line x1="10%" y1="0" x2="10%" y2="100%" stroke="var(--brand-primary)" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
                <line x1="40%" y1="0" x2="40%" y2="100%" stroke="var(--brand-primary)" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
                {/* Waveform display */}
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
                {/* Playhead */}
                {isPlaying && (
                  <line x1="25%" y1="0" x2="25%" y2="100%" stroke="var(--indicator)" strokeWidth="2" opacity="0.9" />
                )}
              </svg>
              {/* Loop region labels */}
              <div className="absolute bottom-1 left-[10%] text-[7px] font-mono text-brand/60 uppercase">Loop Start</div>
              <div className="absolute bottom-1 left-[35%] text-[7px] font-mono text-brand/60 uppercase">Loop End</div>
            </div>

            {/* Active style info */}
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

            {activeMode === 'minorvdj' && (
              <div className="bg-bg-main/60 rounded-lg border border-border-main p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">MinorVDJ</span>
                  <button
                    onClick={() => setAutoDj(!autoDj)}
                    className={`px-2 py-1 rounded text-[9px] font-bold uppercase border transition-colors ${
                      autoDj ? 'text-indicator border-indicator/50 bg-indicator/10' : 'text-neutral-400 border-border-main bg-bg-main'
                    }`}
                  >
                    Auto DJ {autoDj ? 'On' : 'Off'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono uppercase">
                  <div className="bg-bg-main/70 border border-border-main rounded p-2 text-neutral-400">
                    Deck A: {builtInSamples.find(s => s.id === playlist[playlistCursor])?.name}
                  </div>
                  <div className="bg-bg-main/70 border border-border-main rounded p-2 text-neutral-400">
                    Deck B: {builtInSamples.find(s => s.id === playlist[(playlistCursor + 1) % playlist.length])?.name}
                  </div>
                </div>
              </div>
            )}
          </div>
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

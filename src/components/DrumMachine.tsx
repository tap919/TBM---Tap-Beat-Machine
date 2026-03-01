import React, { useState } from 'react';
import { 
  Play, 
  Square, 
  Circle, 
  Repeat, 
  Layers, 
  Music, 
  Clock, 
  Plus, 
  Download,
  Trash2,
  Copy,
  Activity,
  FileCode,
  Filter,
  Link2,
  SlidersHorizontal
} from 'lucide-react';

// Default drum pattern: track index → set of active step indices (0-15)
const DEFAULT_PATTERN: Record<number, number[]> = {
  0: [0, 4, 8, 12],  // Kick 808: 4-on-the-floor
  1: [2, 6, 10, 14], // Snare 1: beats 2 & 4 (× 2)
  2: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // Hat Closed: every step
};

const TRACK_COLORS: string[] = ['#FF4C4C', '#4C83FF', '#FFD700', '#00FF00'];
const STEP_W = 6.25; // 100% / 16 steps
const TRACK_LABEL_W = 'w-44'; // shared width for track label column and automation label

// Choke group colors: group 1-4
const CHOKE_COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#f59e0b',
  3: '#22d3ee',
  4: '#a855f7',
};

type FilterType = 'off' | 'lp' | 'hp' | 'bp';

interface TrackSettings {
  chokeGroup: number | null; // null = no choke, 1–4
  filterType: FilterType;
  filterCutoff: number;    // 0–127
  filterResonance: number; // 0–127
  swing: number;           // 0–100 per-track swing
  muted: boolean;
  solo: boolean;
}

const DEFAULT_TRACK_SETTINGS: TrackSettings = {
  chokeGroup: null,
  filterType: 'off',
  filterCutoff: 64,
  filterResonance: 20,
  swing: 0,
  muted: false,
  solo: false,
};

const TRACK_NAMES = [
  'Kick 808', 'Snare 1', 'Hat Closed', 'Hat Open',
  'Clap', 'Tom Hi', 'Tom Mid', 'Tom Lo',
  'Rim', 'Cowbell', 'Crash', 'Ride',
  'Perc 1', 'Perc 2', 'FX 1', 'FX 2',
];

// Pre-assign choke groups for open/closed hat relationship (classic behaviour)
const INITIAL_TRACK_SETTINGS: TrackSettings[] = Array.from({ length: 16 }, (_, i) => ({
  ...DEFAULT_TRACK_SETTINGS,
  // Closed hat (track 2) and Open hat (track 3) share choke group 1
  chokeGroup: i === 2 || i === 3 ? 1 : null,
}));

export function DrumMachine() {
  const [activeTrack, setActiveTrack] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [noteRepeat, setNoteRepeat] = useState(false);
  const [sixteenLevels, setSixteenLevels] = useState(false);
  const [preCount, setPreCount] = useState(true);
  const [globalSwing, setGlobalSwing] = useState(15);
  const [bpm, setBpm] = useState(92);
  const [showAutomation, setShowAutomation] = useState(false);
  const [pattern, setPattern] = useState<Record<number, number[]>>(DEFAULT_PATTERN);
  const [trackSettings, setTrackSettings] = useState<TrackSettings[]>(INITIAL_TRACK_SETTINGS);
  const [activePadBank, setActivePadBank] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [showTrackDetail, setShowTrackDetail] = useState(true);

  const toggleStep = (trackId: number, step: number) => {
    setPattern(prev => {
      const current = prev[trackId] ?? [];
      const next = current.includes(step) ? current.filter(s => s !== step) : [...current, step];
      return { ...prev, [trackId]: next };
    });
  };

  const updateTrack = (trackId: number, patch: Partial<TrackSettings>) => {
    setTrackSettings(prev => prev.map((t, i) => i === trackId ? { ...t, ...patch } : t));
  };

  const pads = Array.from({ length: 16 }, (_, i) => {
    const trackId = i; // pads map to tracks 0-15 in bank A
    const settings = trackSettings[trackId];
    const chokeColor = settings.chokeGroup !== null ? CHOKE_COLORS[settings.chokeGroup] : null;
    return {
      id: i,
      trackId,
      label: TRACK_NAMES[i] ?? `Pad ${i + 1}`,
      color: i < 4 ? '#FF4C4C' : i < 8 ? '#4C83FF' : i < 12 ? '#FFD700' : '#00FF00',
      chokeColor,
      chokeGroup: settings.chokeGroup,
      filterType: settings.filterType,
    };
  });

  const tracks = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    name: TRACK_NAMES[i] ?? `Track ${i + 1}`,
    settings: trackSettings[i],
  }));

  const activeSettings = trackSettings[activeTrack];

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header / Transport */}
      <div className="flex justify-between items-center bg-neutral-900 p-3 rounded-lg border border-neutral-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded border border-neutral-800">
            <span className="text-[10px] font-mono text-neutral-600 uppercase">BPM</span>
            <input 
              type="number" 
              value={bpm} 
              onChange={(e) => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) setBpm(n); }}
              className="w-12 bg-transparent text-red-500 font-bold text-sm outline-none"
            />
          </div>
          <div className="flex gap-1">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded transition-colors ${isPlaying ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
            >
              <Play size={18} fill={isPlaying ? 'currentColor' : 'none'} />
            </button>
            <button 
              onClick={() => { setIsPlaying(false); setIsRecording(false); }}
              className="p-2 rounded bg-neutral-800 text-neutral-400 hover:text-white"
            >
              <Square size={18} fill="currentColor" />
            </button>
            <button 
              onClick={() => setIsRecording(!isRecording)}
              className={`p-2 rounded transition-colors ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-400 hover:text-red-500'}`}
            >
              <Circle size={18} fill={isRecording ? 'currentColor' : 'none'} />
            </button>
          </div>
          <button 
            onClick={() => setPreCount(!preCount)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all border ${
              preCount ? 'bg-blue-600/20 text-blue-400 border-blue-500/50' : 'bg-neutral-800 text-neutral-500 border-neutral-700'
            }`}
          >
            <Clock size={12} /> Pre-Count
          </button>
        </div>

        <div className="flex items-center gap-6">
          {/* Global Swing */}
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-mono text-neutral-600 uppercase">Global Swing</span>
            <div className="flex items-center gap-2">
              <input 
                type="range" 
                min={0} max={100}
                value={globalSwing} 
                onChange={(e) => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) setGlobalSwing(n); }}
                className="w-24 h-1 bg-neutral-800 appearance-none accent-red-500"
              />
              <span className="text-[10px] font-mono text-neutral-400">{globalSwing}%</span>
            </div>
          </div>
          <div className="h-8 w-[1px] bg-neutral-800"></div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-bold text-xs uppercase transition-colors border border-neutral-700">
              <Download size={14} /> Load Program
            </button>
            <div className="relative group">
              <button className="flex items-center gap-2 px-4 py-2 bg-brand hover:opacity-90 text-white rounded font-bold text-xs uppercase transition-colors shadow-lg shadow-brand/20">
                <Plus size={14} /> Load Kit
              </button>
              <div className="absolute right-0 top-full mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2 flex flex-col gap-1">
                <button className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-[10px] text-neutral-300 transition-colors text-left">
                  <FileCode size={12} className="text-red-500" /> .XPM (Drum Program)
                </button>
                <button className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-[10px] text-neutral-300 transition-colors text-left">
                  <FileCode size={12} className="text-blue-500" /> .SXQ (Drum Sequence)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Tracks & Step Sequencer */}
        <div className="flex-1 flex flex-col gap-4 bg-neutral-900 rounded-lg border border-neutral-800 p-4 min-w-0">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
              <Music size={14} /> Step Sequencer
            </h3>
            <div className="flex gap-2">
              <button className="flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all border bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white">
                <FileCode size={12} className="text-blue-500" /> Load .SXQ
              </button>
              <button 
                onClick={() => setShowAutomation(!showAutomation)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all border ${
                  showAutomation ? 'bg-red-600/20 text-red-400 border-red-500/50' : 'bg-neutral-800 text-neutral-500 border-neutral-700'
                }`}
              >
                <Activity size={12} /> Automation
              </button>
              <button className="p-1.5 rounded bg-neutral-800 text-neutral-500 hover:text-white"><Copy size={14} /></button>
              <button className="p-1.5 rounded bg-neutral-800 text-neutral-500 hover:text-white"><Trash2 size={14} /></button>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col min-h-0 border border-neutral-800 rounded overflow-hidden">
            {/* Step Sequencer Grid */}
            <div className="flex-1 flex overflow-auto custom-scrollbar">
              {/* Track Labels */}
              <div className={`${TRACK_LABEL_W} flex-shrink-0 bg-neutral-950 border-r border-neutral-800`}>
                {tracks.map((track) => {
                  const chokeColor = track.settings.chokeGroup !== null ? CHOKE_COLORS[track.settings.chokeGroup] : null;
                  const effectiveSwing = track.settings.swing > 0 ? track.settings.swing : globalSwing;
                  return (
                    <div 
                      key={track.id}
                      onClick={() => setActiveTrack(track.id)}
                      className={`h-8 px-2 flex items-center justify-between text-[10px] border-b border-neutral-900 cursor-pointer transition-colors ${
                        activeTrack === track.id ? 'bg-brand/10 text-brand' : 'text-neutral-500 hover:bg-neutral-900'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {chokeColor && (
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: chokeColor }} title={`Choke ${track.settings.chokeGroup}`}></div>
                        )}
                        {track.settings.filterType !== 'off' && (
                          <Filter size={8} className="flex-shrink-0 text-cyan-400" title={`Filter: ${track.settings.filterType.toUpperCase()}`} />
                        )}
                        <span className="truncate">{track.name}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {effectiveSwing > 0 && (
                          <span className="text-[8px] font-mono text-yellow-500">{effectiveSwing}%</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.settings.muted }); }}
                          aria-label={`${track.settings.muted ? 'Unmute' : 'Mute'} ${track.name}`}
                          className={`w-3 h-3 rounded-sm text-[7px] font-black leading-none flex items-center justify-center transition-colors ${track.settings.muted ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-600 hover:bg-neutral-700'}`}
                        >M</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.settings.solo }); }}
                          aria-label={`${track.settings.solo ? 'Unsolo' : 'Solo'} ${track.name}`}
                          className={`w-3 h-3 rounded-sm text-[7px] font-black leading-none flex items-center justify-center transition-colors ${track.settings.solo ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-600 hover:bg-neutral-700'}`}
                        >S</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Grid */}
              <div className="flex-1 bg-neutral-950 relative" style={{ minWidth: '800px' }}>
                <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className={`border-r ${i % 4 === 3 ? 'border-neutral-700' : 'border-neutral-900'}`}></div>
                  ))}
                </div>
                {tracks.map((track) => {
                    const trackColor = TRACK_COLORS[track.id % TRACK_COLORS.length];
                    const activeSteps = pattern[track.id] ?? [];
                    return (
                      <div key={track.id} className="h-8 border-b border-neutral-900 flex relative">
                        {activeSteps.map(step => (
                          <div
                            key={step}
                            className="absolute h-full border-l cursor-pointer"
                            style={{
                              left: `${step * STEP_W}%`,
                              width: `${STEP_W}%`,
                              backgroundColor: trackColor + '40',
                              borderColor: trackColor,
                            }}
                            onClick={() => toggleStep(track.id, step)}
                          />
                        ))}
                        {/* Click on empty cells to add notes */}
                        {Array.from({ length: 16 }, (_, step) => (
                          <div
                            key={`empty-${step}`}
                            className="absolute h-full cursor-pointer hover:bg-white/5 transition-colors"
                            style={{ left: `${step * STEP_W}%`, width: `${STEP_W}%` }}
                            onClick={() => toggleStep(track.id, step)}
                          />
                        ))}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Automation Lane (Ardour Style) */}
            {showAutomation && (
              <div className="h-24 bg-neutral-950 border-t border-neutral-800 flex overflow-hidden">
                <div className={`${TRACK_LABEL_W} flex-shrink-0 bg-neutral-900 border-r border-neutral-800 p-2 flex flex-col gap-1`}>
                  <span className="text-[8px] font-bold text-neutral-500 uppercase">Automation</span>
                  <select className="bg-neutral-950 border border-neutral-800 text-[9px] text-red-400 rounded px-1 py-0.5 outline-none">
                    <option>Volume</option>
                    <option>Pan</option>
                    <option>Filter Cutoff</option>
                  </select>
                </div>
                <div className="flex-1 relative" style={{ minWidth: '800px' }}>
                  <svg className="absolute inset-0 w-full h-full">
                    <path 
                      d="M 0 50 L 100 20 L 200 80 L 400 40 L 600 60 L 800 10" 
                      fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2"
                    />
                    {[0, 100, 200, 400, 600, 800].map((x, i) => (
                      <circle key={i} cx={x} cy={[50, 20, 80, 40, 60, 10][i]} r="3" fill="#ef4444" />
                    ))}
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Drum Pads + Track Detail */}
        <div className="w-80 flex flex-col gap-3">
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Drum Pads</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => setNoteRepeat(!noteRepeat)}
                  className={`p-2 rounded border transition-all ${noteRepeat ? 'bg-red-600 border-red-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}
                  title="Note Repeat"
                >
                  <Repeat size={14} />
                </button>
                <button 
                  onClick={() => setSixteenLevels(!sixteenLevels)}
                  className={`p-2 rounded border transition-all ${sixteenLevels ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}
                  title="16 Levels"
                >
                  <Layers size={14} />
                </button>
              </div>
            </div>

            {/* 4x4 Pad Grid */}
            <div className="grid grid-cols-4 gap-2 aspect-square">
              {pads.map((pad) => (
                <button
                  key={pad.id}
                  onClick={() => setActiveTrack(pad.trackId)}
                  className={`relative group aspect-square bg-neutral-800 rounded-md border-b-4 border-neutral-950 active:border-b-0 active:translate-y-1 transition-all flex flex-col items-center justify-center overflow-hidden ${
                    activeTrack === pad.trackId ? 'ring-1 ring-brand' : ''
                  }`}
                  style={{ borderTop: `2px solid ${pad.color}44` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <span className="text-[8px] font-bold text-neutral-400 group-hover:text-white transition-colors leading-tight text-center px-1">{pad.label}</span>
                  {/* Choke group indicator */}
                  {pad.chokeColor && (
                    <div className="absolute top-1 left-1 w-2 h-2 rounded-full border border-black/40" style={{ backgroundColor: pad.chokeColor }} title={`Choke ${pad.chokeGroup}`}></div>
                  )}
                  {/* Filter indicator */}
                  {pad.filterType !== 'off' && (
                    <div className="absolute top-1 right-1">
                      <Filter size={7} className="text-cyan-400" />
                    </div>
                  )}
                  <div 
                    className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full opacity-40"
                    style={{ backgroundColor: pad.color }}
                  ></div>
                </button>
              ))}
            </div>

            {/* Pad Bank */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[9px] font-mono text-neutral-600 uppercase">
                <span>Pad Bank</span>
                <span className="text-red-500">Bank {activePadBank}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(['A', 'B', 'C', 'D'] as const).map(bank => (
                  <button
                    key={bank}
                    onClick={() => setActivePadBank(bank)}
                    className={`py-1 rounded text-[10px] font-bold border transition-colors ${bank === activePadBank ? 'bg-red-600 border-red-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600'}`}
                  >
                    {bank}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Track Detail Panel */}
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                <SlidersHorizontal size={12} /> {TRACK_NAMES[activeTrack] ?? `Track ${activeTrack + 1}`}
              </h3>
              <button
                onClick={() => setShowTrackDetail(v => !v)}
                className="text-[9px] font-bold text-neutral-600 hover:text-neutral-300 uppercase transition-colors"
              >
                {showTrackDetail ? 'Hide' : 'Show'}
              </button>
            </div>

            {showTrackDetail && (
              <div className="flex flex-col gap-3">
                {/* Choke Group */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Link2 size={10} className="text-neutral-500" />
                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">Choke Group</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateTrack(activeTrack, { chokeGroup: null })}
                      className={`flex-1 py-1 rounded text-[9px] font-bold uppercase border transition-colors ${activeSettings.chokeGroup === null ? 'bg-neutral-700 text-white border-neutral-600' : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600'}`}
                    >
                      Off
                    </button>
                    {[1, 2, 3, 4].map(g => (
                      <button
                        key={g}
                        onClick={() => updateTrack(activeTrack, { chokeGroup: g })}
                        className={`flex-1 py-1 rounded text-[9px] font-bold uppercase border transition-colors ${activeSettings.chokeGroup === g ? 'text-black' : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600'}`}
                        style={activeSettings.chokeGroup === g ? { backgroundColor: CHOKE_COLORS[g], borderColor: CHOKE_COLORS[g] } : {}}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  {activeSettings.chokeGroup !== null && (
                    <p className="text-[8px] text-neutral-600 font-mono leading-tight">
                      Triggering this pad stops all other pads in group {activeSettings.chokeGroup}.
                    </p>
                  )}
                </div>

                {/* Filter */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <Filter size={10} className="text-neutral-500" />
                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">Filter</span>
                  </div>
                  <div className="flex gap-1">
                    {(['off', 'lp', 'hp', 'bp'] as FilterType[]).map(ft => (
                      <button
                        key={ft}
                        onClick={() => updateTrack(activeTrack, { filterType: ft })}
                        className={`flex-1 py-1 rounded text-[9px] font-bold uppercase border transition-colors ${
                          activeSettings.filterType === ft
                            ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/60'
                            : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600'
                        }`}
                      >
                        {ft === 'off' ? 'Off' : ft === 'lp' ? 'LP' : ft === 'hp' ? 'HP' : 'BP'}
                      </button>
                    ))}
                  </div>
                  {activeSettings.filterType !== 'off' && (
                    <div className="flex flex-col gap-1.5 mt-0.5 bg-neutral-950 rounded p-2 border border-neutral-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-mono text-neutral-600 uppercase">Cutoff</span>
                        <span className="text-[8px] font-mono text-cyan-400">{activeSettings.filterCutoff}</span>
                      </div>
                      <input
                        type="range" min={0} max={127}
                        value={activeSettings.filterCutoff}
                        onChange={(e) => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) updateTrack(activeTrack, { filterCutoff: n }); }}
                        className="w-full h-1 bg-neutral-800 appearance-none accent-cyan-500"
                      />
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[8px] font-mono text-neutral-600 uppercase">Resonance</span>
                        <span className="text-[8px] font-mono text-cyan-400">{activeSettings.filterResonance}</span>
                      </div>
                      <input
                        type="range" min={0} max={127}
                        value={activeSettings.filterResonance}
                        onChange={(e) => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) updateTrack(activeTrack, { filterResonance: n }); }}
                        className="w-full h-1 bg-neutral-800 appearance-none accent-cyan-500"
                      />
                    </div>
                  )}
                </div>

                {/* Per-Track Swing */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} className="text-neutral-500" />
                      <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">Track Swing</span>
                    </div>
                    <span className="text-[8px] font-mono text-yellow-400">
                      {activeSettings.swing > 0 ? `${activeSettings.swing}%` : `Global (${globalSwing}%)`}
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={100}
                    value={activeSettings.swing}
                    onChange={(e) => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) updateTrack(activeTrack, { swing: n }); }}
                    className="w-full h-1 bg-neutral-800 appearance-none accent-yellow-500"
                  />
                  <p className="text-[8px] text-neutral-600 font-mono leading-tight">
                    {activeSettings.swing > 0 ? 'Per-track override active.' : 'Set above 0 to override global swing for this track.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Sampler Link */}
          <div className="bg-red-600/10 rounded-lg border border-red-500/20 p-3 flex flex-col gap-2">
            <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-2">
              <Plus size={12} /> Sampler Link
            </h4>
            <div className="flex flex-col gap-1.5">
              <button className="w-full py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold uppercase rounded transition-colors">
                Import Last Chop
              </button>
              <button className="w-full py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-[10px] font-bold uppercase rounded border border-red-500/30 transition-colors flex items-center justify-center gap-2">
                <Layers size={12} /> Import Stem Program
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

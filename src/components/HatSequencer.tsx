import React, { useState } from 'react';
import { 
  Music, 
  GripVertical, 
  Plus, 
  Play, 
  Square, 
  Clock, 
  ChevronRight, 
  Search,
  Zap,
  Drum,
  History
} from 'lucide-react';

interface Clip {
  id: string;
  name: string;
  type: 'organic' | 'trap';
  category: string;
  color: string;
}

interface TimelineClip extends Clip {
  trackId: number;
  startTime: number; // in beats
  duration: number; // in beats
}

export function HatSequencer() {
  const [activeCategory, setActiveCategory] = useState<'organic' | 'trap'>('organic');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPos, setPlayheadPos] = useState(0);

  const presets = [
    { name: 'Classic Breakbeat', clips: [
      { id: 'o2', name: '70s Breakbeat Hat', trackId: 0, startTime: 0, duration: 8, color: '#a855f7' },
      { id: 'o3', name: 'Ghost Note Fill', trackId: 3, startTime: 6, duration: 2, color: '#a855f7' }
    ]},
    { name: 'Trap Quads', clips: [
      { id: 't1', name: 'Quad Roll', trackId: 0, startTime: 0, duration: 4, color: '#ef4444' },
      { id: 't2', name: 'Triplet Stutter', trackId: 0, startTime: 4, duration: 4, color: '#ef4444' }
    ]},
    { name: 'Live 4-Count', clips: [
      { id: 'o1', name: '60s Live 4-Count', trackId: 0, startTime: 0, duration: 8, color: '#a855f7' }
    ]}
  ];

  const loadPreset = (presetName: string) => {
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      setTimelineClips(preset.clips.map((c, i) => ({
        ...c,
        id: `preset-${i}`,
        type: c.color === '#a855f7' ? 'organic' : 'trap',
        category: 'Preset'
      })));
    }
  };

  const clipLibrary: Clip[] = [
    // Organic
    { id: 'o1', name: '60s Live 4-Count', type: 'organic', category: 'Live', color: '#a855f7' },
    { id: 'o2', name: '70s Breakbeat Hat', type: 'organic', category: 'Break', color: '#a855f7' },
    { id: 'o3', name: 'Ghost Note Fill', type: 'organic', category: 'Fill', color: '#a855f7' },
    { id: 'o4', name: 'Open Hat Swell', type: 'organic', category: 'Open', color: '#a855f7' },
    { id: 'o5', name: 'Ride Bell Tap', type: 'organic', category: 'Ride', color: '#a855f7' },
    { id: 'o6', name: 'Crash Accent', type: 'organic', category: 'Crash', color: '#a855f7' },
    // Trap
    { id: 't1', name: 'Quad Roll', type: 'trap', category: 'Quads', color: '#ef4444' },
    { id: 't2', name: 'Triplet Stutter', type: 'trap', category: 'Triplets', color: '#ef4444' },
    { id: 't3', name: 'Pitch Slide Hat', type: 'trap', category: 'Slides', color: '#ef4444' },
    { id: 't4', name: '808 Closed Hat', type: 'trap', category: 'Basic', color: '#ef4444' },
    { id: 't5', name: 'Velocity Ramp', type: 'trap', category: 'Stutter', color: '#ef4444' },
  ];

  const tracks = [
    { id: 0, name: 'Closed Hat' },
    { id: 1, name: 'Open Hat' },
    { id: 2, name: 'Ride/Crash' },
    { id: 3, name: 'Perc/Ghost' },
  ];

  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([
    { ...clipLibrary[0], trackId: 0, startTime: 0, duration: 4 },
    { ...clipLibrary[1], trackId: 0, startTime: 4, duration: 4 },
    { ...clipLibrary[3], trackId: 1, startTime: 2, duration: 1 },
    { ...clipLibrary[6], trackId: 0, startTime: 8, duration: 2 },
  ]);

  const filteredLibrary = clipLibrary.filter(c => c.type === activeCategory);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center bg-neutral-900 p-3 rounded-lg border border-neutral-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Music className="text-red-500" size={18} />
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest">Hat Progression Timeline</h2>
          </div>
          <div className="h-6 w-[1px] bg-neutral-800"></div>
          <div className="flex gap-1">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded transition-colors ${isPlaying ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
            >
              <Play size={16} fill={isPlaying ? 'currentColor' : 'none'} />
            </button>
            <button 
              onClick={() => setIsPlaying(false)}
              className="p-2 rounded bg-neutral-800 text-neutral-400 hover:text-white"
            >
              <Square size={16} fill="currentColor" />
            </button>
          </div>
          <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1 rounded border border-neutral-800">
            <Clock size={12} className="text-neutral-500" />
            <span className="text-[10px] font-mono text-red-500 font-bold">00:01:04:12</span>
          </div>
          <div className="h-6 w-[1px] bg-neutral-800"></div>
          <select 
            onChange={(e) => loadPreset(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 text-[10px] text-neutral-400 rounded px-2 py-1 outline-none focus:border-red-500 transition-colors"
          >
            <option value="">Load Preset...</option>
            {presets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-neutral-950 rounded p-1 border border-neutral-800">
            <button 
              onClick={() => setActiveCategory('organic')}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${activeCategory === 'organic' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}
            >
              Organic
            </button>
            <button 
              onClick={() => setActiveCategory('trap')}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${activeCategory === 'trap' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}
            >
              Trap
            </button>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold text-xs uppercase transition-colors">
            <Zap size={14} /> Auto-Generate
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Clip Library */}
        <div className="w-64 flex flex-col gap-3 bg-neutral-900 rounded-lg border border-neutral-800 p-4">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-600" size={12} />
            <input 
              type="text" 
              placeholder="Search Clips..." 
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-7 py-1.5 text-[10px] outline-none focus:border-red-500 transition-colors"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
            {filteredLibrary.map(clip => (
              <div 
                key={clip.id}
                draggable
                className="group flex items-center gap-3 p-2 bg-neutral-950 border border-neutral-800 rounded hover:border-neutral-600 cursor-grab active:cursor-grabbing transition-all"
              >
                <div className="w-1 h-8 rounded-full" style={{ backgroundColor: clip.color }}></div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-neutral-300 truncate">{clip.name}</span>
                  <span className="text-[8px] font-mono text-neutral-600 uppercase">{clip.category}</span>
                </div>
                <GripVertical className="text-neutral-800 group-hover:text-neutral-600" size={14} />
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-neutral-800">
            <button className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[10px] font-bold uppercase rounded flex items-center justify-center gap-2">
              <Plus size={12} /> New Custom Clip
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 flex flex-col bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
          {/* Timeline Ruler */}
          <div className="h-8 bg-neutral-950 border-b border-neutral-800 flex relative">
            <div className="w-32 flex-shrink-0 border-r border-neutral-800"></div>
            <div className="flex-1 flex relative">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex-1 border-r border-neutral-900 flex items-center px-2 text-[9px] font-mono text-neutral-600">
                  {i + 1}.0
                </div>
              ))}
              {/* Playhead */}
              <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-20 shadow-[0_0_10px_rgba(239,68,68,0.5)]" style={{ left: '15%' }}>
                <div className="absolute -top-1 -left-1.5 w-4 h-4 bg-red-500 rotate-45"></div>
              </div>
            </div>
          </div>

          {/* Tracks */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {tracks.map(track => (
              <div key={track.id} className="h-16 flex border-b border-neutral-800 group">
                <div className="w-32 flex-shrink-0 bg-neutral-950 border-r border-neutral-800 p-3 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white transition-colors">{track.name}</span>
                  <div className="flex gap-1 mt-1">
                    <button className="w-3 h-3 rounded-full bg-neutral-800 hover:bg-red-500 transition-colors" title="Mute"></button>
                    <button className="w-3 h-3 rounded-full bg-neutral-800 hover:bg-emerald-500 transition-colors" title="Solo"></button>
                  </div>
                </div>
                <div className="flex-1 relative bg-neutral-950/30">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: 32 }).map((_, i) => (
                      <div key={i} className={`flex-1 border-r ${i % 4 === 3 ? 'border-neutral-800' : 'border-neutral-900/30'}`}></div>
                    ))}
                  </div>
                  
                  {/* Clips on this track */}
                  {timelineClips.filter(tc => tc.trackId === track.id).map((tc, i) => (
                    <div 
                      key={i}
                      className="absolute top-2 bottom-2 rounded border-l-4 shadow-lg flex flex-col justify-center px-2 overflow-hidden cursor-pointer hover:brightness-110 transition-all"
                      style={{ 
                        left: `${(tc.startTime / 32) * 100}%`, 
                        width: `${(tc.duration / 32) * 100}%`,
                        backgroundColor: `${tc.color}22`,
                        borderColor: tc.color,
                        borderWidth: '1px',
                        borderLeftWidth: '4px'
                      }}
                    >
                      <span className="text-[9px] font-bold text-white truncate">{tc.name}</span>
                      <div className="flex gap-0.5 mt-0.5">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <div key={j} className="h-1 flex-1 bg-white/20 rounded-full"></div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Info */}
          <div className="h-8 bg-neutral-950 border-t border-neutral-800 flex items-center px-4 justify-between">
            <div className="flex items-center gap-4 text-[9px] font-mono text-neutral-600 uppercase">
              <span className="flex items-center gap-1"><Drum size={10} /> 4 Tracks</span>
              <span className="flex items-center gap-1"><History size={10} /> Undo History: 12 Steps</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-neutral-600 uppercase">Snap: 1/16</span>
              <div className="w-24 h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                <div className="w-1/3 h-full bg-red-500"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

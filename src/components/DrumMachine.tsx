import React, { useState } from 'react';
import { 
  Play, 
  Square, 
  Circle, 
  Repeat, 
  Layers, 
  Music, 
  Clock, 
  ChevronRight, 
  Plus, 
  Download,
  Trash2,
  Copy,
  Activity,
  FileCode
} from 'lucide-react';

export function DrumMachine() {
  const [activeTrack, setActiveTrack] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [noteRepeat, setNoteRepeat] = useState(false);
  const [sixteenLevels, setSixteenLevels] = useState(false);
  const [preCount, setPreCount] = useState(true);
  const [swing, setSwing] = useState(15);
  const [bpm, setBpm] = useState(92);

  const [showAutomation, setShowAutomation] = useState(false);

  const pads = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    label: `Pad ${i + 1}`,
    color: i < 4 ? '#FF4C4C' : i < 8 ? '#4C83FF' : i < 12 ? '#FFD700' : '#00FF00'
  }));

  const tracks = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    name: i === 0 ? 'Kick 808' : i === 1 ? 'Snare 1' : i === 2 ? 'Hat Closed' : `Track ${i + 1}`,
    muted: false,
    solo: false
  }));

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
              onChange={(e) => setBpm(parseInt(e.target.value))}
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
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-mono text-neutral-600 uppercase">Swing</span>
            <div className="flex items-center gap-2">
              <input 
                type="range" 
                value={swing} 
                onChange={(e) => setSwing(parseInt(e.target.value))}
                className="w-24 h-1 bg-neutral-800 appearance-none accent-red-500"
              />
              <span className="text-[10px] font-mono text-neutral-400">{swing}%</span>
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
        {/* Left: Tracks & Piano Roll */}
        <div className="flex-1 flex flex-col gap-4 bg-neutral-900 rounded-lg border border-neutral-800 p-4 min-w-0">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
              <Music size={14} /> Piano Roll
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
            {/* Piano Roll Grid */}
            <div className="flex-1 flex overflow-auto custom-scrollbar">
              {/* Track Labels */}
              <div className="w-32 flex-shrink-0 bg-neutral-950 border-r border-neutral-800">
                {tracks.map((track) => (
                  <div 
                    key={track.id}
                    onClick={() => setActiveTrack(track.id)}
                    className={`h-8 px-2 flex items-center justify-between text-[10px] border-b border-neutral-900 cursor-pointer transition-colors ${
                      activeTrack === track.id ? 'bg-brand/10 text-brand' : 'text-neutral-500 hover:bg-neutral-900'
                    }`}
                  >
                    <span className="truncate">{track.name}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                      <div className="w-2 h-2 rounded-full bg-neutral-800"></div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Grid */}
              <div className="flex-1 bg-neutral-950 relative" style={{ minWidth: '800px' }}>
                <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className={`border-r ${i % 4 === 3 ? 'border-neutral-700' : 'border-neutral-900'}`}></div>
                  ))}
                </div>
                {tracks.map((track) => (
                  <div key={track.id} className="h-8 border-b border-neutral-900 flex relative">
                    {/* Fake Notes */}
                    {track.id === 0 && (
                      <>
                        <div className="absolute left-0 w-[6.25%] h-full bg-red-500/40 border-l border-red-500"></div>
                        <div className="absolute left-[25%] w-[6.25%] h-full bg-red-500/40 border-l border-red-500"></div>
                        <div className="absolute left-[50%] w-[6.25%] h-full bg-red-500/40 border-l border-red-500"></div>
                        <div className="absolute left-[75%] w-[6.25%] h-full bg-red-500/40 border-l border-red-500"></div>
                      </>
                    )}
                    {track.id === 1 && (
                      <>
                        <div className="absolute left-[12.5%] w-[6.25%] h-full bg-blue-500/40 border-l border-blue-500"></div>
                        <div className="absolute left-[37.5%] w-[6.25%] h-full bg-blue-500/40 border-l border-blue-500"></div>
                        <div className="absolute left-[62.5%] w-[6.25%] h-full bg-blue-500/40 border-l border-blue-500"></div>
                        <div className="absolute left-[87.5%] w-[6.25%] h-full bg-blue-500/40 border-l border-blue-500"></div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Automation Lane (Ardour Style) */}
            {showAutomation && (
              <div className="h-24 bg-neutral-950 border-t border-neutral-800 flex overflow-hidden">
                <div className="w-32 flex-shrink-0 bg-neutral-900 border-r border-neutral-800 p-2 flex flex-col gap-1">
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
                    {/* Automation Points */}
                    {[0, 100, 200, 400, 600, 800].map((x, i) => (
                      <circle key={i} cx={x} cy={[50, 20, 80, 40, 60, 10][i]} r="3" fill="#ef4444" />
                    ))}
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Drum Pads */}
        <div className="w-80 flex flex-col gap-4">
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
            <div className="grid grid-cols-4 gap-3 aspect-square">
              {pads.map((pad) => (
                <button
                  key={pad.id}
                  className="relative group aspect-square bg-neutral-800 rounded-md border-b-4 border-neutral-950 active:border-b-0 active:translate-y-1 transition-all flex flex-col items-center justify-center overflow-hidden"
                  style={{ borderTop: `2px solid ${pad.color}44` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white transition-colors">{pad.label}</span>
                  <div 
                    className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full opacity-40"
                    style={{ backgroundColor: pad.color }}
                  ></div>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <div className="flex justify-between text-[9px] font-mono text-neutral-600 uppercase">
                <span>Pad Bank</span>
                <span className="text-red-500">Bank A</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {['A', 'B', 'C', 'D'].map(bank => (
                  <button key={bank} className={`py-1 rounded text-[10px] font-bold border ${bank === 'A' ? 'bg-red-600 border-red-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}>
                    {bank}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Sampler Link */}
          <div className="bg-red-600/10 rounded-lg border border-red-500/20 p-4 flex flex-col gap-2">
            <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-2">
              <Plus size={12} /> Sampler Link
            </h4>
            <p className="text-[9px] text-neutral-500 leading-tight">
              Drag chops directly from the Sampler view onto pads to auto-assign.
            </p>
            <div className="flex flex-col gap-2 mt-2">
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

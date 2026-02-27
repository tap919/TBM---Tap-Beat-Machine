import React, { useState } from 'react';
import { UploadCloud, Scissors, Maximize, Wind, RotateCcw, Layers, Zap, Music, Plus, FileCode } from 'lucide-react';
import { Knob } from './Knob';

export function WaveformVisualizer() {
  const [isDragging, setIsDragging] = useState(false);
  const [isChopped, setIsChopped] = useState(false);
  const [lofiMode, setLofiMode] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [filter, setFilter] = useState(100);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [isDenoising, setIsDenoising] = useState(false);
  const [isReversed, setIsReversed] = useState(false);
  const [isStemMode, setIsStemMode] = useState(false);
  const [activeStem, setActiveStem] = useState('Full');
  
  // ADSR State
  const [adsr, setAdsr] = useState({ a: 10, d: 20, s: 70, r: 30 });

  // Generate some fake waveform data
  const waveform = Array.from({ length: 150 }, () => Math.random() * 0.8 + 0.1);
  const slices = [20, 45, 70, 85];

  const stems = ['Full', 'Drums', 'Bass', 'Vocals', 'Other'];

  const handleNormalize = () => {
    setIsNormalizing(true);
    setTimeout(() => setIsNormalizing(false), 800);
  };

  const handleDenoise = () => {
    setIsDenoising(true);
    setTimeout(() => setIsDenoising(false), 1200);
  };

    const stemColors: Record<string, string> = {
      'Full': '#FF4C4C',
      'Drums': '#3b82f6',
      'Bass': '#a855f7',
      'Vocals': '#eab308',
      'Other': '#22c55e'
    };

    return (
      <div className="h-full flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Sample Engine</h2>
          <div className="flex gap-2">
            <button 
              onClick={handleNormalize}
              className={`px-2 py-1 rounded text-[9px] font-bold uppercase border transition-all ${
                isNormalizing ? 'bg-emerald-600/20 text-emerald-500 border-emerald-600/50' : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:bg-neutral-700'
              }`}
            >
              <Maximize size={10} className="inline mr-1" /> Normalize
            </button>
            <button 
              onClick={handleDenoise}
              className={`px-2 py-1 rounded text-[9px] font-bold uppercase border transition-all ${
                isDenoising ? 'bg-blue-600/20 text-blue-500 border-blue-600/50' : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:bg-neutral-700'
              }`}
            >
              <Wind size={10} className="inline mr-1" /> Denoise
            </button>
            <button 
              onClick={() => setIsReversed(!isReversed)}
              className={`px-2 py-1 rounded text-[9px] font-bold uppercase border transition-all ${
                isReversed ? 'bg-orange-600/20 text-orange-500 border-orange-600/50' : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:bg-neutral-700'
              }`}
            >
              <RotateCcw size={10} className="inline mr-1" /> Reverse
            </button>
            <button 
              onClick={() => setIsStemMode(!isStemMode)}
              className={`px-2 py-1 rounded text-[9px] font-bold uppercase border transition-all ${
                isStemMode ? 'bg-red-600/20 text-red-500 border-red-600/50' : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:bg-neutral-700'
              }`}
            >
              <Layers size={10} className="inline mr-1" /> Stem Mode
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1 rounded-full border border-neutral-800 shadow-inner">
            <div className="w-4 h-4 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
              <Music size={8} className="text-red-500" />
            </div>
            <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-tighter">Detected:</span>
            <span className="text-[10px] font-bold text-red-500 uppercase">Cm</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-tighter">Mode:</span>
            <select className="bg-neutral-800 border border-neutral-700 text-[10px] text-neutral-300 rounded px-1 py-0.5 outline-none">
              <option>Poly</option>
              <option>Mono</option>
              <option>Legato</option>
            </select>
            <div className="h-4 w-[1px] bg-neutral-800 mx-1"></div>
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-1 bg-brand hover:opacity-90 text-white rounded font-bold text-[10px] uppercase transition-colors shadow-lg shadow-brand/20">
                <Plus size={10} /> Load MPC
              </button>
              <div className="absolute right-0 top-full mt-2 w-40 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2 flex flex-col gap-1">
                <button className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-[9px] text-neutral-300 transition-colors text-left">
                  <FileCode size={10} className="text-red-500" /> .XPM (Program)
                </button>
                <button className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-[9px] text-neutral-300 transition-colors text-left">
                  <FileCode size={10} className="text-blue-500" /> .SXQ (Sequence)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isStemMode && (
        <div className="flex items-center gap-2 bg-neutral-900/50 p-2 rounded border border-neutral-800">
          <span className="text-[10px] font-mono text-neutral-500 uppercase mr-2">Stem Focus:</span>
          {stems.map(stem => (
            <button
              key={stem}
              onClick={() => setActiveStem(stem)}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all border ${
                activeStem === stem ? 'bg-brand border-brand text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500'
              }`}
            >
              {stem}
            </button>
          ))}
          <div className="h-4 w-[1px] bg-neutral-800 mx-2"></div>
          <button className="flex items-center gap-2 px-3 py-1 bg-neutral-950 hover:bg-neutral-800 text-red-400 text-[10px] font-bold uppercase rounded border border-red-900/30 transition-colors">
            <Zap size={10} /> Separate via Demucs
          </button>
          <span className="ml-auto text-[9px] font-mono text-neutral-600 italic uppercase">Cuts are synchronized across all stems</span>
        </div>
      )}

      <div className="flex-1 flex gap-6">
        {/* Waveform Area */}
        <div 
          className={`relative flex-1 rounded-lg border-2 transition-colors ${
            isDragging ? 'border-red-500 bg-red-500/10 border-dashed' : 'border-neutral-800 bg-neutral-900 border-solid'
          } overflow-hidden flex items-center justify-center group`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); }}
        >
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" style={{ transform: isReversed ? 'scaleX(-1)' : 'none' }}>
            {isChopped && slices.map((slice, i) => {
              const start = i === 0 ? 0 : slices[i-1];
              const width = slice - start;
              return (
                <rect 
                  key={`region-${i}`}
                  x={`${start}%`} y="0" width={`${width}%`} height="100%"
                  fill={i % 2 === 0 ? '#FF4C4C' : '#ffffff'}
                  opacity="0.05"
                />
              );
            })}
            
            <g fill={isChopped ? (lofiMode ? "#d97706" : stemColors[activeStem]) : "#666"} opacity="0.8" className="transition-colors duration-500">
              {waveform.map((val, i) => (
                <rect 
                  key={i}
                  x={`${(i / waveform.length) * 100}%`}
                  y={`${50 - (val * 40)}%`}
                  width="0.5%"
                  height={`${val * 80}%`}
                  rx="1"
                />
              ))}
            </g>
            
            {isChopped && slices.map((slice, i) => (
              <g key={`slice-${i}`}>
                <line x1={`${slice}%`} y1="0" x2={`${slice}%`} y2="100%" stroke={lofiMode ? "#d97706" : stemColors[activeStem]} strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />
                <polygon points={`${slice},0 ${slice-4},6 ${slice+4},6`} fill={lofiMode ? "#d97706" : stemColors[activeStem]} />
              </g>
            ))}
          </svg>

          {!isChopped && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <UploadCloud className="w-8 h-8 text-neutral-600 mb-2 opacity-50" />
              <span className="text-sm font-mono text-neutral-500 uppercase tracking-widest">Drop Audio Loop</span>
            </div>
          )}

          <button
            onClick={() => setIsChopped(!isChopped)}
            className={`absolute bottom-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
              isChopped ? 'bg-neutral-800 text-neutral-400 border border-neutral-700' : 'bg-red-500/20 text-red-400 border border-red-500/50'
            }`}
          >
            <Scissors className="w-3 h-3" />
            {isChopped ? 'Reset' : 'Auto-Chop'}
          </button>
        </div>

        {/* ADSR & Quick Controls */}
        <div className="w-48 flex flex-col gap-4 py-1">
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Amp Envelope</span>
            <div className="flex-1 bg-neutral-950 rounded border border-neutral-800 relative overflow-hidden p-2">
               {/* ADSR Visualization */}
               <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                 <path 
                   d={`M 0 100 L ${adsr.a/2} 0 L ${(adsr.a + adsr.d)/2} ${100 - adsr.s} L 80 ${100 - adsr.s} L 100 100`}
                   fill="none" stroke={isStemMode ? stemColors[activeStem] : "#FF4C4C"} strokeWidth="2"
                 />
               </svg>
               <div className="absolute bottom-1 left-0 w-full flex justify-around px-1">
                 {['A','D','S','R'].map(l => <span key={l} className="text-[8px] font-mono text-neutral-600">{l}</span>)}
               </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              <input type="range" value={adsr.a} onChange={e => setAdsr({...adsr, a: parseInt(e.target.value)})} className="h-1 bg-neutral-800 appearance-none accent-red-500" />
              <input type="range" value={adsr.d} onChange={e => setAdsr({...adsr, d: parseInt(e.target.value)})} className="h-1 bg-neutral-800 appearance-none accent-red-500" />
              <input type="range" value={adsr.s} onChange={e => setAdsr({...adsr, s: parseInt(e.target.value)})} className="h-1 bg-neutral-800 appearance-none accent-red-500" />
              <input type="range" value={adsr.r} onChange={e => setAdsr({...adsr, r: parseInt(e.target.value)})} className="h-1 bg-neutral-800 appearance-none accent-red-500" />
            </div>
          </div>
          <div className="flex gap-4">
            <Knob label="Pitch" value={pitch} onChange={setPitch} min={-24} max={24} color={isStemMode ? stemColors[activeStem] : "#FF4C4C"} />
            <Knob label="Filter" value={filter} onChange={setFilter} color={isStemMode ? stemColors[activeStem] : "#FF4C4C"} />
          </div>
        </div>
      </div>
    </div>
  );
}

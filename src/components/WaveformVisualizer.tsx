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
    Full: '#FF4C4C', Drums: '#3b82f6', Bass: '#a855f7', Vocals: '#eab308', Other: '#22c55e'
  };

  const activeColor = isStemMode ? stemColors[activeStem] : '#FF4C4C';

  return (
    <div className="h-full flex flex-col gap-3">
      {/* ── Top toolbar ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left: title + process buttons */}
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mr-1">Sample Engine</h2>
          {[
            { label: 'Normalize', icon: <Maximize size={9} />, active: isNormalizing,  activeClass: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50', onClick: handleNormalize },
            { label: 'Denoise',   icon: <Wind size={9} />,     active: isDenoising,    activeClass: 'bg-blue-600/20 text-blue-400 border-blue-500/50',           onClick: handleDenoise },
            { label: 'Reverse',   icon: <RotateCcw size={9} />,active: isReversed,     activeClass: 'bg-orange-600/20 text-orange-400 border-orange-500/50',     onClick: () => setIsReversed(!isReversed) },
            { label: 'Stems',     icon: <Layers size={9} />,   active: isStemMode,     activeClass: 'bg-red-600/20 text-red-400 border-red-500/50',              onClick: () => setIsStemMode(!isStemMode) },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase border transition-all ${
                btn.active
                  ? btn.activeClass
                  : 'bg-bg-main/60 text-neutral-500 border-border-main hover:text-neutral-300 hover:border-neutral-600'
              }`}
            >
              {btn.icon} {btn.label}
            </button>
          ))}
        </div>

        {/* Right: key detection + mode + load */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-bg-main/60 px-2.5 py-1 rounded-lg border border-border-main">
            <Music size={9} className="text-brand" />
            <span className="text-[9px] font-mono text-neutral-500 uppercase">Key:</span>
            <span className="text-[10px] font-black text-brand uppercase">Cm</span>
          </div>
          <select className="bg-bg-main/60 border border-border-main text-[9px] text-neutral-300 rounded-md px-1.5 py-1 outline-none focus:border-brand transition-colors">
            <option>Poly</option>
            <option>Mono</option>
            <option>Legato</option>
          </select>
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-2.5 py-1 bg-brand hover:opacity-90 text-white rounded-md font-bold text-[9px] uppercase transition-all shadow-md shadow-brand/20">
              <Plus size={9} /> Load MPC
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-36 bg-bg-surface border border-border-main rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-1.5 flex flex-col gap-0.5">
              <button className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-main/80 rounded-md text-[9px] text-neutral-300 transition-colors text-left">
                <FileCode size={9} className="text-brand" /> .XPM (Program)
              </button>
              <button className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-main/80 rounded-md text-[9px] text-neutral-300 transition-colors text-left">
                <FileCode size={9} className="text-blue-400" /> .SXQ (Sequence)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stem bar (conditional) ───────────────────────── */}
      {isStemMode && (
        <div className="flex items-center gap-2 bg-bg-main/60 px-3 py-1.5 rounded-lg border border-border-main animate-in">
          <span className="text-[9px] font-mono text-neutral-500 uppercase mr-1">Focus:</span>
          {stems.map(stem => (
            <button
              key={stem}
              onClick={() => setActiveStem(stem)}
              className={`px-2.5 py-0.5 rounded-md text-[9px] font-bold uppercase transition-all border ${
                activeStem === stem
                  ? 'border-transparent text-white'
                  : 'bg-bg-surface border-border-main text-neutral-500 hover:text-neutral-300'
              }`}
              style={activeStem === stem ? { backgroundColor: stemColors[stem] + '33', borderColor: stemColors[stem] + '80', color: stemColors[stem] } : {}}
            >
              {stem}
            </button>
          ))}
          <div className="h-3 w-px bg-border-main mx-1"></div>
          <button className="flex items-center gap-1.5 px-2.5 py-0.5 bg-bg-surface hover:bg-bg-main text-red-400 text-[9px] font-bold uppercase rounded-md border border-red-900/30 transition-colors">
            <Zap size={9} /> Demucs
          </button>
          <span className="ml-auto text-[8px] font-mono text-neutral-600 italic uppercase">Cuts sync across stems</span>
        </div>
      )}

      {/* ── Waveform + ADSR row ──────────────────────────── */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Waveform */}
        <div
          className={`relative flex-1 rounded-xl border-2 transition-all ${
            isDragging
              ? 'border-brand border-dashed bg-brand/5'
              : 'border-border-main bg-bg-main/50 hover:border-neutral-700'
          } overflow-hidden flex items-center justify-center`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); }}
        >
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" style={{ transform: isReversed ? 'scaleX(-1)' : 'none' }}>
            {isChopped && slices.map((slice, i) => {
              const start = i === 0 ? 0 : slices[i - 1];
              const width = slice - start;
              return (
                <rect key={`region-${i}`} x={`${start}%`} y="0" width={`${width}%`} height="100%"
                  fill={i % 2 === 0 ? activeColor : '#fff'} opacity="0.04" />
              );
            })}
            <g fill={isChopped ? (lofiMode ? '#d97706' : activeColor) : '#444'} opacity="0.85" className="transition-colors duration-500">
              {waveform.map((val, i) => (
                <rect key={i}
                  x={`${(i / waveform.length) * 100}%`}
                  y={`${50 - val * 42}%`}
                  width="0.55%"
                  height={`${val * 84}%`}
                  rx="1"
                />
              ))}
            </g>
            {isChopped && slices.map((slice, i) => (
              <g key={`slice-${i}`}>
                <line x1={`${slice}%`} y1="0" x2={`${slice}%`} y2="100%"
                  stroke={lofiMode ? '#d97706' : activeColor} strokeWidth="1" strokeDasharray="4 4" opacity="0.7" />
                <polygon points={`${slice},0 ${slice - 4},7 ${slice + 4},7`}
                  fill={lofiMode ? '#d97706' : activeColor} />
              </g>
            ))}
          </svg>

          {!isChopped && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
              <UploadCloud className="w-7 h-7 text-neutral-600 opacity-50" />
              <span className="text-[11px] font-bold font-mono text-neutral-600 uppercase tracking-widest">Drop Audio Loop</span>
              <span className="text-[9px] font-mono text-neutral-700 uppercase">or click Load MPC above</span>
            </div>
          )}

          <button
            onClick={() => setIsChopped(!isChopped)}
            className={`absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
              isChopped
                ? 'bg-bg-surface/80 text-neutral-400 border border-border-main hover:border-neutral-600'
                : 'bg-brand/20 text-brand border border-brand/50 hover:bg-brand/30'
            }`}
          >
            <Scissors size={11} />
            {isChopped ? 'Reset Chops' : 'Auto-Chop'}
          </button>
        </div>

        {/* ADSR + Quick Controls */}
        <div className="w-44 flex flex-col gap-3 flex-shrink-0">
          {/* ADSR */}
          <div className="flex-1 flex flex-col gap-1.5 min-h-0">
            <span className="text-[9px] font-bold font-mono text-neutral-500 uppercase tracking-widest">Amp Envelope</span>
            <div className="flex-1 bg-bg-main/80 rounded-lg border border-border-main relative overflow-hidden min-h-0">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="adsrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeColor} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={activeColor} stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path
                  d={`M 0 100 L ${adsr.a / 2} 0 L ${(adsr.a + adsr.d) / 2} ${100 - adsr.s} L 80 ${100 - adsr.s} L 100 100 Z`}
                  fill="url(#adsrGrad)"
                />
                <path
                  d={`M 0 100 L ${adsr.a / 2} 0 L ${(adsr.a + adsr.d) / 2} ${100 - adsr.s} L 80 ${100 - adsr.s} L 100 100`}
                  fill="none" stroke={activeColor} strokeWidth="2"
                />
              </svg>
              <div className="absolute bottom-1 left-0 w-full flex justify-around px-2">
                {['A', 'D', 'S', 'R'].map(l => (
                  <span key={l} className="text-[8px] font-black font-mono text-neutral-600">{l}</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(['a', 'd', 's', 'r'] as const).map(k => (
                <input key={k} type="range" value={adsr[k]}
                  onChange={e => setAdsr({ ...adsr, [k]: parseInt(e.target.value) })}
                  className="h-1 w-full bg-neutral-800 appearance-none rounded-full accent-brand cursor-pointer"
                />
              ))}
            </div>
          </div>

          {/* Pitch + Filter knobs */}
          <div className="flex justify-around py-1">
            <Knob label="Pitch" value={pitch} onChange={setPitch} min={-24} max={24} color={activeColor} />
            <Knob label="Filter" value={filter} onChange={setFilter} color={activeColor} />
          </div>
        </div>
      </div>
    </div>
  );
}

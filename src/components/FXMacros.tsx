import React, { useState } from 'react';
import { Knob } from './Knob';
import { RefreshCw, Activity, Plus } from 'lucide-react';

export function FXMacros() {
  const [cutoff, setCutoff] = useState(80);
  const [humanize, setHumanize] = useState(15);
  const [vinyl, setVinyl] = useState(30);
  const [reverb, setReverb] = useState(40);
  const [mix, setMix] = useState(100);
  const [lfoRate, setLfoRate] = useState(25);
  const [lfoDepth, setLfoDepth] = useState(40);

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest">FX Rack</h2>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-neutral-600 uppercase">Mix: {mix}%</span>
          <button className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 hover:text-white transition-colors uppercase tracking-tighter">
            <RefreshCw className="w-3 h-3" />
            Resample
          </button>
        </div>
      </div>
      
      <div className="flex-1 grid grid-cols-4 gap-y-4 gap-x-2 place-items-center">
        <Knob label="Cutoff" value={cutoff} onChange={setCutoff} color="#FFD700" />
        <Knob label="Humanize" value={humanize} onChange={setHumanize} color="#FFD700" />
        <Knob label="Vinyl Age" value={vinyl} onChange={setVinyl} color="#d97706" />
        <Knob label="Reverb" value={reverb} onChange={setReverb} color="#00FF00" />
        <Knob label="Dry/Wet" value={mix} onChange={setMix} color="#3b82f6" />
        
        {/* LFO Section */}
        <div className="col-span-1 flex flex-col items-center gap-1 border-l border-neutral-800 pl-2">
           <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
           <span className="text-[7px] font-mono text-neutral-600 uppercase">LFO</span>
        </div>
        <Knob label="LFO Rate" value={lfoRate} onChange={setLfoRate} color="#10b981" />
        <Knob label="LFO Depth" value={lfoDepth} onChange={setLfoDepth} color="#10b981" />
      </div>

      <div className="mt-6 pt-6 border-t border-neutral-800">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">VST Inserts</span>
          <button className="p-1 rounded bg-neutral-800 text-neutral-500 hover:text-white transition-colors">
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-3 py-2 bg-neutral-950 rounded border border-neutral-800 group hover:border-blue-500/50 transition-all cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div>
              <span className="text-[10px] font-bold text-neutral-300">Serum</span>
            </div>
            <span className="text-[8px] font-mono text-neutral-600 uppercase">VST3</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 bg-neutral-950/50 rounded border border-dashed border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400 transition-all cursor-pointer">
            <span className="text-[9px] font-bold uppercase tracking-tighter">Empty Slot</span>
            <Plus className="w-3 h-3" />
          </div>
        </div>
      </div>
    </div>
  );
}

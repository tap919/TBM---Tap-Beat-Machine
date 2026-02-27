import React, { useState } from 'react';
import { Knob } from './Knob';
import { Link2, Activity, Cpu } from 'lucide-react';

export function Mixer808() {
  const [blend, setBlend] = useState(50);
  const [tune, setTune] = useState(0);
  const [drive, setDrive] = useState(20);
  const [glide, setGlide] = useState(15);
  const [sidechain, setSidechain] = useState(true);

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest">808 Engine</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${sidechain ? 'bg-green-500 animate-pulse' : 'bg-neutral-700'}`}></div>
          <span className="text-[10px] font-mono text-neutral-500 uppercase">SC Link</span>
        </div>
      </div>
      
      <div className="flex-1 grid grid-cols-4 gap-2 place-items-center">
        <Knob label="Punch" value={blend} onChange={setBlend} color="#4C83FF" />
        <Knob label="Tune" value={tune} onChange={setTune} min={-12} max={12} color="#4C83FF" />
        <Knob label="Drive" value={drive} onChange={setDrive} color="#FF4C4C" />
        <Knob label="Glide" value={glide} onChange={setGlide} color="#4C83FF" />
      </div>

      <div className="mt-4 flex items-center justify-between bg-neutral-950 p-2 rounded border border-neutral-800">
        <div className="flex items-center gap-2">
          <Link2 className="w-3 h-3 text-neutral-600" />
          <span className="text-[10px] font-mono text-neutral-500 uppercase">Sidechain to Kick</span>
        </div>
        <button 
          onClick={() => setSidechain(!sidechain)}
          className={`w-8 h-4 rounded-full relative transition-colors ${sidechain ? 'bg-blue-600' : 'bg-neutral-800'}`}
        >
          <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${sidechain ? 'left-4.5' : 'left-0.5'}`}></div>
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between bg-neutral-950 p-2 rounded border border-neutral-800 group hover:border-blue-500/50 transition-all cursor-pointer">
        <div className="flex items-center gap-2">
          <Cpu className="w-3 h-3 text-blue-500" />
          <span className="text-[9px] font-bold text-neutral-400 uppercase">Insert: FabFilter Pro-Q 3</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
      </div>
    </div>
  );
}

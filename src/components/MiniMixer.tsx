import React, { useState } from 'react';
import { Volume2, Mic2, Music } from 'lucide-react';

interface ChannelProps {
  label: string;
  icon: React.ReactNode;
  color: string;
}

function Channel({ label, icon, color }: ChannelProps) {
  const [vol, setVol] = useState(75);
  const [pan, setPan] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSolo, setIsSolo] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2 w-16 group">
      {/* Pan Knob (Mini) */}
      <div className="relative w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center cursor-ns-resize">
        <div 
          className="w-0.5 h-3 bg-neutral-400 absolute top-0.5 rounded-full"
          style={{ transform: `rotate(${pan * 1.5}deg)`, transformOrigin: 'bottom center' }}
        ></div>
        <span className="text-[8px] font-mono text-neutral-500 absolute -top-4">PAN</span>
      </div>

      {/* Fader Track */}
      <div className="relative w-6 h-32 bg-neutral-950 rounded-sm border border-neutral-800 flex justify-center py-2">
        <div className="absolute inset-0 flex flex-col justify-between px-1 py-4 pointer-events-none">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="w-full h-[1px] bg-neutral-800"></div>
          ))}
        </div>
        <input 
          type="range"
          min="0"
          max="100"
          value={vol}
          onChange={(e) => setVol(parseInt(e.target.value))}
          className="appearance-none w-32 h-6 bg-transparent cursor-pointer -rotate-90 absolute top-1/2 -translate-y-1/2 accent-white"
          style={{ width: '110px' }}
        />
        {/* Fader Cap (Visual) */}
        <div 
          className="absolute w-5 h-8 bg-neutral-200 rounded-sm shadow-md pointer-events-none flex flex-col items-center justify-center gap-0.5"
          style={{ bottom: `${vol * 0.8 + 10}px` }}
        >
          <div className="w-3 h-[1px] bg-neutral-400"></div>
          <div className="w-3 h-[1px] bg-neutral-400"></div>
        </div>
      </div>

      {/* M/S Buttons */}
      <div className="flex gap-1">
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className={`w-5 h-5 rounded-sm text-[10px] font-bold flex items-center justify-center transition-colors ${
            isMuted ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
          }`}
        >
          M
        </button>
        <button 
          onClick={() => setIsSolo(!isSolo)}
          className={`w-5 h-5 rounded-sm text-[10px] font-bold flex items-center justify-center transition-colors ${
            isSolo ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
          }`}
        >
          S
        </button>
      </div>

      <div className="flex flex-col items-center">
        <div className="p-1 rounded bg-neutral-800 mb-1" style={{ color }}>
          {icon}
        </div>
        <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-tighter">{label}</span>
      </div>
    </div>
  );
}

export function MiniMixer() {
  const [inGain, setInGain] = useState(0);
  const [outGain, setOutGain] = useState(0);

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[11px] font-black text-neutral-400 uppercase tracking-widest">SSL Console</h2>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-bg-main/50 border border-border-main">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.5)]"></div>
          <span className="text-[8px] font-bold font-mono text-neutral-600 uppercase">VCA Group 1</span>
        </div>
      </div>
      <div className="flex-1 flex items-start justify-around">
        <Channel label="Chops" icon={<Volume2 size={12} />} color="#FF4C4C" />
        <Channel label="808" icon={<Mic2 size={12} />} color="#4C83FF" />
        <Channel label="Chords" icon={<Music size={12} />} color="#FFD700" />
        
        {/* Master Section */}
        <div className="w-[1px] h-full bg-neutral-800 mx-1"></div>
        <div className="flex flex-col items-center gap-4 px-2">
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center cursor-ns-resize">
              <div className="w-0.5 h-3 bg-red-500 absolute top-0.5 rounded-full" style={{ transform: `rotate(${inGain * 1.5}deg)`, transformOrigin: 'bottom center' }}></div>
              <span className="text-[7px] font-mono text-neutral-500 absolute -top-4">IN GAIN</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center cursor-ns-resize">
              <div className="w-0.5 h-3 bg-emerald-500 absolute top-0.5 rounded-full" style={{ transform: `rotate(${outGain * 1.5}deg)`, transformOrigin: 'bottom center' }}></div>
              <span className="text-[7px] font-mono text-neutral-500 absolute -top-4">OUT GAIN</span>
            </div>
          </div>
          <div className="mt-auto flex flex-col items-center gap-2">
             <div className="flex gap-1">
               <div className="flex flex-col items-center">
                 <span className="text-[7px] font-mono text-neutral-600 uppercase">RMS</span>
                 <div className="w-1.5 h-12 bg-neutral-900 rounded-full relative overflow-hidden">
                   <div className="absolute bottom-0 w-full h-[70%] bg-blue-500"></div>
                 </div>
               </div>
               <div className="flex flex-col items-center">
                 <span className="text-[7px] font-mono text-neutral-600 uppercase">LUFS</span>
                 <div className="w-1.5 h-12 bg-neutral-900 rounded-full relative overflow-hidden">
                   <div className="absolute bottom-0 w-full h-[60%] bg-emerald-500"></div>
                 </div>
               </div>
             </div>
             <div className="w-10 h-10 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-center">
                <div className="w-1 h-6 bg-red-600 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)]"></div>
             </div>
             <span className="text-[9px] font-mono text-neutral-500 uppercase">Master</span>
          </div>
        </div>
      </div>
    </div>
  );
}

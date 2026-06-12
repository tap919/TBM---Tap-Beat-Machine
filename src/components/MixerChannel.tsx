import React from "react";

interface MixerChannelProps {
  label: string;
  volume: number;
  pan: number;
  isMuted: boolean;
  isSolo: boolean;
  meterLevel?: number;
  meterPeak?: number;
  color?: string;
  onVolume: (v: number) => void;
  onPan: (v: number) => void;
  onMute: (v: boolean) => void;
  onSolo: (v: boolean) => void;
  children?: React.ReactNode;
}

export function MixerChannel({
  label, volume, pan, isMuted, isSolo, meterLevel = 0, meterPeak = 0,
  color = "#3b82f6", onVolume, onPan, onMute, onSolo, children,
}: MixerChannelProps) {
  return (
    <div className="flex flex-col items-center gap-1 w-full bg-neutral-900/50 rounded-lg p-2 border border-neutral-800/60">
      <div className="text-[10px] font-mono text-neutral-500 uppercase truncate w-full text-center">{label}</div>
      {children}
      <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden" title={`${(meterLevel * 100).toFixed(0)}%`}>
        <div className="h-full rounded-full transition-all duration-75"
          style={{ width: `${Math.min(meterLevel * 100, 100)}%`, backgroundColor: meterPeak > 0.95 ? "#ef4444" : meterPeak > 0.8 ? "#f59e0b" : color }}
        />
      </div>
      <input type="range" min="0" max="100" value={volume}
        onChange={(e) => onVolume(parseInt(e.target.value))}
        className="w-full h-1.5 accent-brand cursor-pointer" aria-label={`${label} volume`}
      />
      <div className="flex items-center gap-1">
        <input type="range" min="-50" max="50" value={pan}
          onChange={(e) => onPan(parseInt(e.target.value))}
          className="w-12 h-1 accent-brand cursor-pointer" aria-label={`${label} pan`}
        />
        <span className="text-[9px] font-mono text-neutral-600 w-6 text-right">{pan === 0 ? "C" : pan < 0 ? `L${Math.abs(pan)}` : `R${pan}`}</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onMute(!isMuted)}
          className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase transition-colors ${isMuted ? "bg-red-600/30 text-red-400" : "text-neutral-500 hover:text-neutral-300"}`}>
          M
        </button>
        <button onClick={() => onSolo(!isSolo)}
          className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase transition-colors ${isSolo ? "bg-yellow-600/30 text-yellow-400" : "text-neutral-500 hover:text-neutral-300"}`}>
          S
        </button>
      </div>
    </div>
  );
}

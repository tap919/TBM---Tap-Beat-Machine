import React from "react";
import { Scissors, Repeat, Sliders } from "lucide-react";

interface QuickActionsSectionProps {
  onExportClip: () => void;
  onSavePreset: () => void;
  onExportMidi: () => void;
}

export function QuickActionsSection({ onExportClip, onSavePreset, onExportMidi }: QuickActionsSectionProps) {
  return (
    <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-2">
      <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Quick Actions</span>
      <button onClick={onExportClip}
        className="w-full py-2 bg-bg-main hover:bg-neutral-800 text-neutral-300 text-[13px] font-bold uppercase rounded-lg transition-colors border border-border-main flex items-center justify-center gap-2">
        <Scissors size={12} /> Export Clip
      </button>
      <button onClick={onSavePreset}
        className="w-full py-2 bg-bg-main hover:bg-neutral-800 text-neutral-300 text-[13px] font-bold uppercase rounded-lg transition-colors border border-border-main flex items-center justify-center gap-2">
        <Repeat size={12} /> Save as Preset
      </button>
      <button onClick={onExportMidi}
        className="w-full py-2 bg-bg-main hover:bg-neutral-800 text-neutral-300 text-[13px] font-bold uppercase rounded-lg transition-colors border border-border-main flex items-center justify-center gap-2">
        <Sliders size={12} /> Export MIDI
      </button>
    </div>
  );
}

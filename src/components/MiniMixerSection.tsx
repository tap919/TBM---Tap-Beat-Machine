import React from "react";
import { ListMusic } from "lucide-react";

interface MiniMixerSectionProps {
  deckALevel: number;
  deckBLevel: number;
  masterLevel: number;
  onDeckAChange: (v: number) => void;
  onDeckBChange: (v: number) => void;
  onMasterChange: (v: number) => void;
}

export function MiniMixerSection({
  deckALevel, deckBLevel, masterLevel,
  onDeckAChange, onDeckBChange, onMasterChange,
}: MiniMixerSectionProps) {
  return (
    <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ListMusic size={12} className="text-brand" />
        <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Minimal Mixer</span>
      </div>
      <div className="flex flex-col gap-2 text-xs font-mono text-neutral-500 uppercase">
        <label className="flex items-center gap-2">
          Deck A{" "}
          <input type="range" min="0" max="100" value={deckALevel}
            onChange={(e) => onDeckAChange(parseInt(e.target.value))}
            className="flex-1 accent-brand" />
        </label>
        <label className="flex items-center gap-2">
          Deck B{" "}
          <input type="range" min="0" max="100" value={deckBLevel}
            onChange={(e) => onDeckBChange(parseInt(e.target.value))}
            className="flex-1 accent-brand" />
        </label>
        <label className="flex items-center gap-2">
          Master{" "}
          <input type="range" min="0" max="100" value={masterLevel}
            onChange={(e) => onMasterChange(parseInt(e.target.value))}
            className="flex-1 accent-brand" />
        </label>
      </div>
    </div>
  );
}

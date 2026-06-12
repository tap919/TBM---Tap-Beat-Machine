import React from "react";

interface CrossfaderSectionProps {
  faderPosition: number;
  faderCurve: string;
  onFaderChange: (v: number) => void;
  onCurveChange: (v: string) => void;
}

export function CrossfaderSection({ faderPosition, faderCurve, onFaderChange, onCurveChange }: CrossfaderSectionProps) {
  return (
    <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3 vignette">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Crossfader</span>
        <select
          value={faderCurve}
          onChange={(e) => onCurveChange(e.target.value)}
          className="bg-bg-main border border-border-main text-xs text-neutral-400 rounded px-1.5 py-0.5 outline-none"
        >
          <option value="linear">Linear</option>
          <option value="exponential">Exponential</option>
          <option value="s_curve">S-Curve</option>
          <option value="hard_cut">Hard Cut</option>
        </select>
      </div>
      <input
        type="range" min="0" max="100"
        value={faderPosition}
        onChange={(e) => onFaderChange(parseInt(e.target.value))}
        className="w-full h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-brand"
      />
      <div className="flex justify-between text-xs font-mono text-neutral-600">
        <span>Cut</span>
        <span className="text-brand font-bold">{faderPosition}%</span>
        <span>Open</span>
      </div>
    </div>
  );
}

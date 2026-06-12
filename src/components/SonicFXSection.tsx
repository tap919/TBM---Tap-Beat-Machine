import React from "react";
import { Knob } from "./Knob";

interface SonicFXSectionProps {
  echoWet: number;
  reverbWet: number;
  drive: number;
  wear: number;
  crackle: number;
  lofiTone: number;
  onEchoChange: (v: number) => void;
  onReverbChange: (v: number) => void;
  onDriveChange: (v: number) => void;
  onWearChange: (v: number) => void;
  onCrackleChange: (v: number) => void;
  onLofiChange: (v: number) => void;
}

export function SonicFXSection({
  echoWet, reverbWet, drive, wear, crackle, lofiTone,
  onEchoChange, onReverbChange, onDriveChange, onWearChange, onCrackleChange, onLofiChange,
}: SonicFXSectionProps) {
  return (
    <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
      <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Sonic Degradation FX</span>
      <div className="grid grid-cols-2 gap-y-4 gap-x-2 place-items-center">
        <Knob label="Echo" value={echoWet} onChange={onEchoChange} color="#3b82f6" />
        <Knob label="Reverb" value={reverbWet} onChange={onReverbChange} color="#3b82f6" />
        <Knob label="Drive" value={drive} onChange={onDriveChange} color="#f97316" />
        <Knob label="Wear" value={wear} onChange={onWearChange} color="#f97316" />
        <Knob label="Crackle" value={crackle} onChange={onCrackleChange} color="#f97316" />
        <Knob label="Lo-Fi" value={lofiTone} onChange={onLofiChange} color="#f97316" />
      </div>
    </div>
  );
}

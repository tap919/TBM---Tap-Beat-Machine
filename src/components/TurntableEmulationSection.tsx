import React from "react";
import { Knob } from "./Knob";

interface TurntableEmulationSectionProps {
  inertia: number;
  friction: number;
  vinylNoise: number;
  pitchDrift: number;
  onInertiaChange: (v: number) => void;
  onFrictionChange: (v: number) => void;
  onNoiseChange: (v: number) => void;
  onDriftChange: (v: number) => void;
}

export function TurntableEmulationSection({
  inertia, friction, vinylNoise, pitchDrift,
  onInertiaChange, onFrictionChange, onNoiseChange, onDriftChange,
}: TurntableEmulationSectionProps) {
  return (
    <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-3">
      <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Turntable Emulation</span>
      <div className="grid grid-cols-2 gap-y-4 gap-x-2 place-items-center">
        <Knob label="Inertia" value={inertia} onChange={onInertiaChange} color="#FFC72C" />
        <Knob label="Friction" value={friction} onChange={onFrictionChange} color="#FFC72C" />
        <Knob label="Noise" value={vinylNoise} onChange={onNoiseChange} color="#39FF14" />
        <Knob label="Drift" value={pitchDrift} onChange={onDriftChange} color="#39FF14" />
      </div>
    </div>
  );
}

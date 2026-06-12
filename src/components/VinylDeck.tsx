import React from "react";
import { UploadCloud } from "lucide-react";

interface VinylDeckProps {
  isPlaying: boolean;
  activeMode: string;
  isDragging: boolean;
  selectedSample: string | null;
  liveDirection: "forward" | "reverse" | "stopped";
  platAngleRef: React.MutableRefObject<number>;
  platterDomRef: React.RefObject<HTMLDivElement | null>;
  vinylRpm: number;
  speedMult: number;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export function VinylDeck({
  isPlaying,
  activeMode,
  isDragging,
  selectedSample,
  liveDirection,
  platAngleRef,
  platterDomRef,
  vinylRpm,
  speedMult,
  onDragOver,
  onDragLeave,
  onDrop,
}: VinylDeckProps) {
  return (
    <div
      className={`relative aspect-square rounded-2xl border-2 transition-all overflow-hidden flex items-center justify-center noise-texture ${
        isDragging
          ? "border-brand border-dashed bg-brand/5"
          : "border-border-main bg-bg-main/50"
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2 bg-bg-main/90 z-10">
          <UploadCloud className="w-10 h-10 text-brand animate-pulse" />
          <span className="text-sm font-bold text-brand uppercase tracking-widest">Drop Audio File</span>
          <span className="text-xs text-neutral-500">Left side → Deck A • Right side → Deck B</span>
        </div>
      )}
      <div
        ref={platterDomRef}
        className="w-56 h-56 rounded-full border-4 border-neutral-700/50 flex items-center justify-center"
        style={{
          transform: activeMode === "turntable" ? `rotate(${platAngleRef.current}deg)` : undefined,
          transition: activeMode === "turntable" ? "none" : undefined,
          animation: isPlaying && activeMode !== "turntable" ? "spin 2s linear infinite" : "none",
        }}
      >
        <div className="w-44 h-44 rounded-full border-2 border-neutral-700/30 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full border border-neutral-700/20 flex items-center justify-center bg-bg-surface/30">
            <div className="w-16 h-16 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-brand shadow-[0_0_12px_var(--brand-primary-glow)]"></div>
            </div>
          </div>
        </div>
      </div>
      {activeMode === "turntable" && (
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1 pointer-events-none">
          <div className="text-xs font-mono text-brand uppercase">{vinylRpm} RPM</div>
          <div className="text-xs font-mono text-neutral-500 uppercase">{speedMult.toFixed(2)}×</div>
        </div>
      )}
      {!selectedSample && !isDragging && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
          <UploadCloud className="w-7 h-7 text-neutral-600 opacity-50" />
          <span className="text-[13px] font-bold text-neutral-600 uppercase tracking-widest">Drop Audio File</span>
        </div>
      )}
      {isPlaying && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indicator animate-pulse shadow-[0_0_8px_var(--indicator-glow)] dot-glow"></div>
      )}
      {activeMode === "live" && liveDirection !== "stopped" && (
        <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-xs font-bold uppercase ${
          liveDirection === "forward" ? "bg-indicator/20 text-indicator" : "bg-red-500/20 text-red-400"
        }`}>
          {liveDirection === "forward" ? "▶ Forward" : "◀ Reverse"}
        </div>
      )}
    </div>
  );
}

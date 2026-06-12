import React from "react";
import { Upload, Ban, Filter } from "lucide-react";
import type { Pad } from "../lib/TBMAudioEngine";

interface PadItem {
  id: number;
  trackId: number;
  label: string;
  color: string;
  chokeColor: string | null;
  chokeGroup: number | null;
  filterType: string | undefined;
}

interface PadGridProps {
  pads: PadItem[];
  activeTrack: number;
  triggeredPads: Set<number>;
  heldPads: Set<number>;
  mutedPads: Set<number>;
  sixteenLevels: boolean;
  enginePads: Pad[];
  activePadBank: "A" | "B" | "C" | "D";
  setActivePadBank: (bank: "A" | "B" | "C" | "D") => void;
  globalSwing: number;
  onPadTrigger: (trackId: number, event?: React.MouseEvent) => void;
  onPadRelease: (trackId: number) => void;
  onOpenSampleLoader: (padIndex: number) => void;
}

export function PadGrid({
  pads,
  activeTrack,
  triggeredPads,
  heldPads,
  mutedPads,
  sixteenLevels,
  enginePads,
  activePadBank,
  setActivePadBank,
  globalSwing,
  onPadTrigger,
  onPadRelease,
  onOpenSampleLoader,
}: PadGridProps) {
  return (
    <>
      {/* 4x4 Pad Grid */}
      <div className="grid grid-cols-4 gap-2">
        {pads.map((pad) => {
          const isFlashing = triggeredPads.has(pad.trackId);
          const isHeld = heldPads.has(pad.trackId);
          const isMuted = mutedPads.has(pad.trackId);
          const level = pad.id + 1;
          return (
            <button
              key={pad.trackId}
              onMouseDown={(e) => onPadTrigger(pad.trackId, e)}
              onMouseUp={() => onPadRelease(pad.trackId)}
              onMouseLeave={() => onPadRelease(pad.trackId)}
              className={`relative group aspect-square bg-neutral-800 rounded-md border-b-4 border-neutral-950 active:border-b-0 active:translate-y-1 transition-all flex flex-col items-center justify-center overflow-hidden hover:shadow-[0_0_12px_rgba(255,199,44,0.08)] ${
                activeTrack === pad.trackId ? "ring-1 ring-brand" : ""
              } ${isFlashing ? "pad-flash" : ""} ${isHeld ? "pad-held" : ""} ${isMuted ? "opacity-40 saturate-0" : ""}`}
              style={{ borderTop: `2px solid ${pad.color}44`, "--pad-glow": pad.color + "80" } as React.CSSProperties}
            >
              {isMuted && (
                <div className="absolute inset-0 bg-red-900/40 z-10 rounded-md flex items-center justify-center">
                  <Ban size={20} className="text-red-500" />
                </div>
              )}
              <div className="absolute inset-0 bg-linear-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="text-xs font-bold text-neutral-400 group-hover:text-white transition-colors leading-tight text-center px-1">
                {sixteenLevels ? `Lv.${level}` : pad.label}
              </span>
              {enginePads[pad.trackId]?.sample && !sixteenLevels && (
                <span className="text-[6px] font-mono text-emerald-500 mt-0.5 truncate max-w-[90%]">
                  {enginePads[pad.trackId].sample!.name.slice(0, 12)}
                </span>
              )}
              <div
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onOpenSampleLoader(pad.trackId); }}
              >
                <Upload size={9} className="text-neutral-400 hover:text-white" />
              </div>
              {pad.chokeColor && (
                <div
                  className="absolute top-1 left-1 w-2 h-2 rounded-full border border-black/40"
                  style={{ backgroundColor: pad.chokeColor }}
                  title={`Choke ${pad.chokeGroup}`}
                ></div>
              )}
              {pad.filterType !== "off" && (
                <div className="absolute top-1 right-1 group-hover:hidden">
                  <Filter size={7} className="text-cyan-400" />
                </div>
              )}
              <div
                className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full opacity-40"
                style={{ backgroundColor: pad.color }}
              ></div>
            </button>
          );
        })}
      </div>

      {/* Pad Bank Selector */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-xs font-mono text-neutral-600 uppercase">
          <span>Pad Bank</span>
        </div>
        <div className="flex gap-1">
          {(["A", "B", "C", "D"] as const).map((bank) => (
            <button
              key={bank}
              onClick={() => setActivePadBank(bank)}
              className={`flex-1 py-1.5 text-[13px] font-bold uppercase border rounded transition-all ${
                activePadBank === bank
                  ? "bg-brand border-brand text-white shadow-lg shadow-brand/20"
                  : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
              }`}
            >
              {bank}
            </button>
          ))}
        </div>
      </div>

      {/* Groove / Swing Visualizer */}
      <div className="flex flex-col gap-1">
        <span className="text-[9px] font-mono text-neutral-600 uppercase">Groove</span>
        <div className="flex justify-between items-center px-1 h-3">
          {Array.from({ length: 8 }, (_, i) => {
            const isEven = i % 2 === 1;
            const shiftPx = isEven ? (globalSwing / 100) * 6 : 0;
            return (
              <div
                key={i}
                className="groove-dot w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: isEven ? "var(--brand-primary, #ffc72c)" : "rgba(255,255,255,0.2)",
                  transform: `translateX(${shiftPx}px)`,
                  boxShadow: isEven && globalSwing > 30 ? "0 0 4px var(--brand-primary-glow, rgba(255,199,44,0.4))" : "none",
                }}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

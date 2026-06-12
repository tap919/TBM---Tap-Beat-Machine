import React from "react";

const TRACK_LABEL_W = "w-36";

interface AutomationLaneProps {
  showAutomation: boolean;
  automationParam: string;
  setAutomationParam: (param: "Volume" | "Pan" | "Filter Cutoff") => void;
  activeTrack: number;
  automationData: Record<number, number[]>;
  onAutomationPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function AutomationLane({
  showAutomation,
  automationParam,
  setAutomationParam,
  activeTrack,
  automationData,
  onAutomationPointerMove,
}: AutomationLaneProps) {
  if (!showAutomation) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-neutral-800 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`${TRACK_LABEL_W} text-xs font-bold text-neutral-500 uppercase tracking-wider`}>
            Automation
          </span>
          <div className="flex gap-1">
            {(["Volume", "Pan", "Filter Cutoff"] as const).map((param) => (
              <button
                key={param}
                onClick={() => setAutomationParam(param)}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase border rounded transition-all ${
                  automationParam === param
                    ? "bg-red-600/20 text-red-400 border-red-500/50"
                    : "bg-neutral-800 text-neutral-600 border-neutral-700 hover:border-neutral-600"
                }`}
              >
                {param}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Automation visualization */}
      <div
        className="relative h-24 bg-neutral-950 rounded border border-neutral-800 cursor-crosshair"
        onPointerMove={onAutomationPointerMove}
        onPointerDown={onAutomationPointerMove}
      >
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          {/* Grid lines */}
          {Array.from({ length: 16 }, (_, i) => (
            <line
              key={i}
              x1={`${(i / 16) * 100}%`}
              y1="0"
              x2={`${(i / 16) * 100}%`}
              y2="100%"
              stroke="#262626"
              strokeWidth="1"
            />
          ))}
          {/* Automation points */}
          {(() => {
            const lane = automationData[activeTrack] ?? Array(16).fill(0.5);
            const pts = lane.map((v, i) => {
              const x = ((i + 0.5) / 16) * 100;
              const y = (1 - v) * 100;
              return { x, y };
            });
            const pathD = pts
              .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x}% ${p.y}%`)
              .join(" ");
            return (
              <>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />
                {pts.map((p, i) => (
                  <circle
                    key={i}
                    cx={`${p.x}%`}
                    cy={`${p.y}%`}
                    r="3"
                    fill="#ef4444"
                  />
                ))}
              </>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

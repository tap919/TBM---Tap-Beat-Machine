import React from "react";
import { Music, Download } from "lucide-react";
import { StepCell } from "./StepCell";

const TRACK_COLORS: string[] = ["#FF4C4C", "#4C83FF", "#FFD700", "#00FF00"];
const TRACK_LABEL_W = "w-36";

interface TrackItem {
  id: number;
  name: string;
  settings: { muted: boolean; solo: boolean };
}

interface StepSequencerGridProps {
  tracks: TrackItem[];
  pattern: Record<number, number[]>;
  stepCount: 16 | 32 | 64;
  currentStep: number;
  activeTrack: number;
  setActiveTrack: (track: number) => void;
  activePatternSlot: number;
  showAutomation: boolean;
  showVelocity: boolean;
  toggleStep: (trackId: number, step: number) => void;
  velocityMap: Record<number, Record<number, number>>;
  handlePatternSlotChange: (slot: number) => void;
  setShowAutomation: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowVelocity: (v: boolean | ((prev: boolean) => boolean)) => void;
  onSxqLoad: () => void;
  patternBank: Record<number, Record<number, number[]>>;
}

export function StepSequencerGrid({
  tracks,
  pattern,
  stepCount,
  currentStep,
  activeTrack,
  setActiveTrack,
  activePatternSlot,
  showAutomation,
  showVelocity,
  toggleStep,
  velocityMap,
  handlePatternSlotChange,
  setShowAutomation,
  setShowVelocity,
  onSxqLoad,
  patternBank,
}: StepSequencerGridProps) {
  return (
    <>
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
          <Music size={14} /> Step Sequencer
        </h3>
        <div className="flex items-center gap-2">
          {/* FL-style Pattern Slots 1-8 */}
          <div className="flex items-center gap-1 mr-2">
            <span className="text-[9px] font-mono text-neutral-600 uppercase mr-1">Pat</span>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((slot) => (
              <button
                key={slot}
                onClick={() => handlePatternSlotChange(slot)}
                className={`w-6 h-6 text-[10px] font-bold rounded border transition-all ${
                  activePatternSlot === slot
                    ? "pattern-active bg-brand/20 border-brand text-white"
                    : patternBank[slot]
                      ? "bg-neutral-800 border-neutral-600 text-neutral-400 hover:border-neutral-500"
                      : "bg-neutral-800/50 border-neutral-700 text-neutral-600 hover:border-neutral-600"
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAutomation(!showAutomation)}
            className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase border rounded transition-all ${
              showAutomation
                ? "bg-red-600/20 text-red-400 border-red-500/50"
                : "bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600"
            }`}
          >
            Automation
          </button>
          <button
            onClick={() => setShowVelocity(!showVelocity)}
            className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase border rounded transition-all ${
              showVelocity
                ? "bg-orange-600/20 text-orange-400 border-orange-500/50"
                : "bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600"
            }`}
          >
            Velocity
          </button>
          <button
            onClick={onSxqLoad}
            className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase border rounded bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600 transition-all"
          >
            <Download size={10} /> Load .SXQ
          </button>
        </div>
      </div>

      {/* Sequencer Rows */}
      <div className="flex flex-col gap-0.5">
        {/* Step number header */}
        <div className="flex items-center gap-0">
          <div className={`${TRACK_LABEL_W} shrink-0`}></div>
          <div className="flex-1 flex">
            {Array.from({ length: stepCount }, (_, i) => (
              <div
                key={i}
                className={`flex-1 text-center text-[9px] font-mono ${
                  i % 4 === 0 ? "text-neutral-500" : "text-neutral-700"
                }`}
              >
                {i % 4 === 0 ? i + 1 : ""}
              </div>
            ))}
          </div>
        </div>

        {/* Track rows */}
        {tracks.map((track) => {
          const trackColor = TRACK_COLORS[track.id % TRACK_COLORS.length];
          const isActive = activeTrack === track.id;
          const activeSteps = new Set(pattern[track.id] ?? []);
          return (
            <div
              key={track.id}
              className={`flex items-center gap-0 group/row rounded transition-colors ${
                isActive ? "bg-neutral-800/50" : "hover:bg-neutral-800/30"
              }`}
              onClick={() => setActiveTrack(track.id)}
            >
              {/* Track label */}
              <div className={`${TRACK_LABEL_W} shrink-0 flex items-center gap-2 px-2 py-1`}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: trackColor }}></div>
                <span className={`text-[11px] font-bold uppercase truncate ${
                  isActive ? "text-white" : "text-neutral-500"
                }`}>
                  {track.name}
                </span>
                {track.settings.muted && (
                  <div className="led led-mute shrink-0" title="Muted"></div>
                )}
                {track.settings.solo && (
                  <div className="led led-solo shrink-0" title="Solo"></div>
                )}
              </div>

              {/* Step cells */}
              <div className="flex-1 relative h-7 bg-neutral-950/50 rounded-sm overflow-hidden">
                {Array.from({ length: stepCount }, (_, step) => (
                  <StepCell
                    key={step}
                    trackId={track.id}
                    step={step}
                    isActive={activeSteps.has(step)}
                    trackColor={trackColor}
                    isCurrent={currentStep === step}
                    onToggle={toggleStep}
                    stepCount={stepCount}
                    velocity={velocityMap[track.id]?.[step]}
                    showVelocity={showVelocity}
                  />
                ))}
                {/* Beat dividers */}
                {Array.from({ length: Math.floor(stepCount / 4) }, (_, i) => (
                  <div
                    key={`div-${i}`}
                    className="absolute top-0 bottom-0 border-l border-neutral-700/30"
                    style={{ left: `${((i * 4) / stepCount) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

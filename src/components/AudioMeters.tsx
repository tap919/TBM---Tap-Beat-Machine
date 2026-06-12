import React, { memo } from "react";
import { useAudioAnalysis } from "../lib/audioAnalysis";

// ─────────────────────────────────────────────────────────────────────────────
// Self-contained audio meter components.
//
// These call useAudioAnalysis internally so that the ~30 fps setState updates
// stay scoped to this subtree and never propagate up to App.tsx.
// ─────────────────────────────────────────────────────────────────────────────

interface AudioMetersProps {
  analyserNode: AnalyserNode | null;
}

/**
 * Compact I/O level meters for the header bar.
 * Renders two horizontal bars (In / Out) that animate with real audio levels.
 */
export const HeaderIOMeters = memo(function HeaderIOMeters({
  analyserNode,
}: AudioMetersProps) {
  const analysis = useAudioAnalysis(analyserNode);

  const meters = [
    { label: "In", level: analysis.inputLevel, color: "bg-emerald-500" },
    { label: "Out", level: analysis.outputLevel, color: "bg-emerald-500" },
  ];

  return (
    <div className="flex items-center gap-4 bg-bg-main/50 px-3 py-1.5 rounded-lg border border-border-main">
      {meters.map((m) => (
        <div key={m.label} className="flex flex-col gap-1">
          <span className="text-xs font-bold font-mono text-neutral-500 uppercase leading-none">
            {m.label}
          </span>
          <div className="w-20 h-1.5 bg-neutral-800/80 rounded-full overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all duration-100 ${
                m.level > 90
                  ? "bg-red-500 meter-glow-red"
                  : m.level > 70
                    ? "bg-amber-500"
                    : `${m.color} meter-glow-green`
              }`}
              style={{ width: `${m.level}%` }}
            />
            {/* Clip indicator notch */}
            <div className="absolute right-0 top-0 bottom-0 w-0.75 bg-red-900/40 rounded-r-full" />
          </div>
        </div>
      ))}
    </div>
  );
});

/**
 * Detailed mixer meters panel: master limiter, stereo width, phase correlation.
 * Used inside the Mixer tab so its 30 fps updates don't touch App state.
 */
export const MixerDetailMeters = memo(function MixerDetailMeters({
  analyserNode,
}: AudioMetersProps) {
  const analysis = useAudioAnalysis(analyserNode);

  return (
    <div className="flex justify-center gap-12">
      {/* Master Limiter */}
      <div className="flex flex-col items-center gap-4">
        <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
          Master Limiter
        </span>
        <div className="w-2 h-24 bg-neutral-900 rounded-full relative overflow-hidden">
          <div
            className="absolute bottom-0 w-full bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)] transition-all duration-100"
            style={{
              height: `${analysis.limiterGainReduction}%`,
            }}
          />
        </div>
        <span className="text-[13px] font-mono text-neutral-600 uppercase">
          {analysis.limiterGainReduction > 0
            ? `-${Math.round(analysis.limiterGainReduction)}dB`
            : "No GR"}
        </span>
      </div>

      {/* Stereo Width */}
      <div className="flex flex-col items-center gap-4">
        <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
          Stereo Width
        </span>
        <div className="w-2 h-24 bg-neutral-900 rounded-full relative overflow-hidden">
          <div
            className="absolute bottom-0 w-full bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-100"
            style={{ height: `${analysis.stereoWidth}%` }}
          />
        </div>
        <span className="text-[13px] font-mono text-neutral-600 uppercase">
          {Math.round(analysis.stereoWidth)}%
        </span>
      </div>

      {/* Phase Correlation */}
      <div className="flex flex-col items-center gap-4">
        <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
          Phase Correlation
        </span>
        <div className="w-48 h-2 bg-neutral-900 rounded-full relative overflow-hidden">
          <div className="absolute inset-0 flex justify-between px-1 text-xs font-mono text-neutral-600 -top-4">
            <span>-1</span>
            <span>0</span>
            <span>+1</span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 w-1 h-full bg-neutral-700 z-10" />
          <div
            className="absolute w-2 h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-100"
            style={{
              left: `${(analysis.phaseCorrelation + 1) * 50}%`,
            }}
          />
        </div>
        <span className="text-[13px] font-mono text-neutral-600 uppercase">
          {analysis.phaseCorrelation > 0.9
            ? "Mono Compatible"
            : analysis.phaseCorrelation > 0.7
              ? "Good"
              : analysis.phaseCorrelation > 0.5
                ? "Fair"
                : "Phase Issues"}
        </span>
      </div>
    </div>
  );
});

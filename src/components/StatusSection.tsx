import React from "react";

interface StatusSectionProps {
  audioLatencyMs: number;
  audioCpuPercent: number;
  sampleRate: string;
  activeMode: string;
}

export function StatusSection({ audioLatencyMs, audioCpuPercent, sampleRate, activeMode }: StatusSectionProps) {
  return (
    <div className="mt-auto bg-bg-main/60 rounded-lg border border-border-main p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-neutral-600 uppercase">Latency</span>
        <span className={`text-xs font-mono ${audioLatencyMs < 15 ? "text-indicator" : audioLatencyMs < 30 ? "text-brand" : "text-red-400"}`}>
          {audioLatencyMs}ms
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-neutral-600 uppercase">CPU</span>
        <span className={`text-xs font-mono ${audioCpuPercent < 50 ? "text-indicator" : audioCpuPercent < 80 ? "text-brand" : "text-red-400"}`}>
          {audioCpuPercent}%
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-neutral-600 uppercase">Sample Rate</span>
        <span className="text-xs font-mono text-indicator">{sampleRate}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-neutral-600 uppercase">Mode</span>
        <span className="text-xs font-mono text-brand uppercase">{activeMode}</span>
      </div>
    </div>
  );
}

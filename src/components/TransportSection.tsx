import React from "react";
import { Play, Square, Circle, Zap } from "lucide-react";

interface TransportSectionProps {
  isPlaying: boolean;
  isRecording: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleRecording: () => void;
  onAutoScratch: () => void;
}

export function TransportSection({
  isPlaying, isRecording, onTogglePlay, onStop, onToggleRecording, onAutoScratch,
}: TransportSectionProps) {
  return (
    <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex items-center justify-center gap-3 vignette">
      <button
        onClick={onTogglePlay}
        className={`p-3 rounded-lg transition-all ${
          isPlaying
            ? "bg-indicator/20 text-indicator border border-indicator/50 shadow-[0_0_10px_var(--indicator-glow)]"
            : "bg-bg-main text-neutral-400 hover:text-white border border-border-main"
        }`}
      >
        <Play size={18} fill={isPlaying ? "currentColor" : "none"} />
      </button>
      <button
        onClick={onStop}
        className="p-3 rounded-lg bg-bg-main text-neutral-400 hover:text-white border border-border-main transition-all"
      >
        <Square size={18} fill="currentColor" />
      </button>
      <button
        onClick={onToggleRecording}
        className={`p-3 rounded-lg transition-all ${
          isRecording
            ? "bg-red-600/20 text-red-400 border border-red-500/50 animate-pulse"
            : "bg-bg-main text-neutral-400 hover:text-red-400 border border-border-main"
        }`}
      >
        <Circle size={18} fill={isRecording ? "currentColor" : "none"} />
      </button>
      <div className="h-6 w-px bg-border-main"></div>
      <button
        onClick={onAutoScratch}
        className="flex items-center gap-2 px-4 py-2.5 bg-brand hover:opacity-90 text-white rounded-lg font-bold text-[13px] uppercase transition-all shadow-lg shadow-brand/20"
      >
        <Zap size={14} /> Auto-Scratch
      </button>
    </div>
  );
}

interface Props {
  audioContext: AudioContext | null;
}

export function StatusBar({ audioContext }: Props) {
  return (
    <div className="relative shrink-0">
      <div className="separator-glow"></div>
      <div className="h-6 bg-bg-surface border-t border-border-main flex items-center px-4 gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-indicator dot-glow pulse-slow"></div>
        <span className="text-xs font-mono text-neutral-600 uppercase tracking-wider">
          Audio Engine: Web Audio @{" "}
          {audioContext ? `${(audioContext.sampleRate / 1000).toFixed(1)} kHz` : "44.1 kHz"}{" "}
          · 32-bit float
        </span>
        <div className="flex-1"></div>
        <span className="text-xs font-mono text-neutral-700 uppercase tracking-wider">
          Hover a control for details
        </span>
      </div>
    </div>
  );
}

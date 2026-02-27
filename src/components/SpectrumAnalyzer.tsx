import React, { useMemo } from 'react';

export function SpectrumAnalyzer() {
  // Generate fake spectrum data
  const bars = useMemo(() => {
    return Array.from({ length: 64 }, (_, i) => {
      // Create a "musical" looking spectrum curve
      const base = Math.sin(i * 0.1) * 20 + 40;
      const noise = Math.random() * 15;
      const falloff = 1 - (i / 64);
      return Math.max(5, (base + noise) * falloff);
    });
  }, []);

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Spectrum Analysis</h3>
        <div className="flex gap-2 text-[8px] font-mono text-neutral-600">
          <span>20Hz</span>
          <span>1kHz</span>
          <span>20kHz</span>
        </div>
      </div>
      <div className="flex-1 bg-black/40 rounded border border-neutral-800 flex items-end gap-[1px] p-1 overflow-hidden">
        {bars.map((height, i) => (
          <div 
            key={i}
            className="flex-1 bg-gradient-to-t from-red-900/40 via-red-600/60 to-red-400 rounded-t-[1px] transition-all duration-75"
            style={{ 
              height: `${height}%`,
              opacity: 0.3 + (height / 100) * 0.7
            }}
          ></div>
        ))}
      </div>
    </div>
  );
}

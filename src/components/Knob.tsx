import React, { useState, useRef, useEffect } from 'react';

interface KnobProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  color?: string;
}

export function Knob({ label, value, onChange, min = 0, max = 100, color = '#4C83FF' }: KnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(value);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startVal.current = value;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startY.current - e.clientY;
      const range = max - min;
      const newVal = Math.max(min, Math.min(max, startVal.current + (deltaY / 100) * range));
      onChange(newVal);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, max, min, onChange]);

  const percentage = (value - min) / (max - min);
  const rotation = -135 + percentage * 270;

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        className={`relative w-14 h-14 rounded-full cursor-ns-resize flex items-center justify-center transition-shadow duration-150 ${
          isDragging ? 'shadow-[0_0_16px_var(--knob-glow)]' : ''
        }`}
        style={{ '--knob-glow': color + '66' } as React.CSSProperties & { '--knob-glow': string }}
        onMouseDown={handleMouseDown}
      >
        {/* Outer ring track */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
          {/* Track groove */}
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth="7"
            strokeDasharray="197.9 263.9"
            strokeLinecap="round"
            transform="rotate(135 50 50)"
          />
          {/* Track background */}
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="5"
            strokeDasharray="197.9 263.9"
            strokeLinecap="round"
            transform="rotate(135 50 50)"
          />
          {/* Active arc */}
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={`${percentage * 197.9} 263.9`}
            strokeLinecap="round"
            transform="rotate(135 50 50)"
            style={{ filter: `drop-shadow(0 0 3px ${color}88)` }}
          />
        </svg>

        {/* Inner cap */}
        <div
          className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-600 to-neutral-800 shadow-[0_2px_6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1)] relative"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          {/* Indicator dot */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-2.5 rounded-full" style={{ backgroundColor: color }}></div>
        </div>
      </div>
      <span className="text-[9px] font-bold font-mono text-neutral-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

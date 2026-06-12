import React, { useState, useRef, useEffect, useCallback, memo } from 'react';

interface KnobProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  color?: string;
}

export const Knob = memo(function Knob({ label, value, onChange, min = 0, max = 100, color = '#4C83FF' }: KnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(value);
  const rafId = useRef<number | null>(null);
  const pendingVal = useRef<number | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startVal.current = value;
  }, [value]);

  useEffect(() => {
    if (!isDragging) return;

    const flush = () => {
      if (pendingVal.current !== null) {
        onChange(pendingVal.current);
        pendingVal.current = null;
      }
      rafId.current = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startY.current - e.clientY;
      const range = max - min;
      pendingVal.current = Math.max(min, Math.min(max, startVal.current + (deltaY / 100) * range));
      // Throttle updates to once per animation frame (~16ms)
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(flush);
      }
    };

    const handleMouseUp = () => {
      // Flush any pending value before releasing
      if (pendingVal.current !== null) {
        onChange(pendingVal.current);
        pendingVal.current = null;
      }
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [isDragging, max, min, onChange]);

  const range = max - min;
  const percentage = range === 0 ? 0 : (value - min) / range;
  const rotation = -135 + percentage * 270;

  // Keyboard support
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = (max - min) / 100; // 1% step
    let newValue = value;
    
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        e.preventDefault();
        newValue = Math.min(max, value + step);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        e.preventDefault();
        newValue = Math.max(min, value - step);
        break;
      case 'Home':
        e.preventDefault();
        newValue = min;
        break;
      case 'End':
        e.preventDefault();
        newValue = max;
        break;
      case 'PageUp':
        e.preventDefault();
        newValue = Math.min(max, value + step * 10);
        break;
      case 'PageDown':
        e.preventDefault();
        newValue = Math.max(min, value - step * 10);
        break;
      default:
        return;
    }
    
    if (newValue !== value) {
      onChange(newValue);
    }
  }, [value, min, max, onChange]);

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${Math.round(value)}%`}
        tabIndex={0}
        className={`relative w-14 h-14 rounded-full cursor-ns-resize flex items-center justify-center transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
          isDragging ? 'shadow-[0_0_16px_var(--knob-glow)]' : ''
        }`}
        style={{ '--knob-glow': color + '66' } as React.CSSProperties & { '--knob-glow': string }}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
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
            style={{ filter: `drop-shadow(0 0 3px ${color}88)`, willChange: 'stroke-dasharray' }}
          />
        </svg>

        {/* Inner cap */}
        <div
          className="w-9 h-9 rounded-full bg-linear-to-br from-neutral-600 to-neutral-800 shadow-[0_2px_6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1)] relative"
          style={{ transform: `rotate(${rotation}deg)`, willChange: 'transform' }}
        >
          {/* Indicator dot */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-2.5 rounded-full" style={{ backgroundColor: color }}></div>
        </div>
      </div>
      <span className="text-xs font-bold font-mono text-contrast-medium uppercase tracking-wider">{label}</span>
    </div>
  );
});

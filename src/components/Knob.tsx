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
    <div className="flex flex-col items-center gap-3">
      <div 
        className="relative w-16 h-16 rounded-full bg-neutral-800 border-2 border-neutral-700 shadow-inner cursor-ns-resize flex items-center justify-center"
        onMouseDown={handleMouseDown}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
          <circle 
            cx="50" cy="50" r="40" 
            fill="none" 
            stroke="#1a1a1a" 
            strokeWidth="6"
            strokeDasharray="188.5 251.3"
            strokeLinecap="round"
            transform="rotate(135 50 50)"
          />
          <circle 
            cx="50" cy="50" r="40" 
            fill="none" 
            stroke={color} 
            strokeWidth="6"
            strokeDasharray={`${percentage * 188.5} 251.3`}
            strokeLinecap="round"
            transform="rotate(135 50 50)"
          />
        </svg>
        
        <div 
          className="w-10 h-10 rounded-full bg-neutral-700 shadow-md relative"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-3 bg-white rounded-full"></div>
        </div>
      </div>
      <div className="text-xs font-mono text-neutral-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}

import React, { useState } from 'react';

const OCTAVES = [
  { range: 'C1-B2', color: '#FF4C4C', label: 'Chops', count: 2 },
  { range: 'C3-B4', color: '#4C83FF', label: '808s', count: 2 },
  { range: 'C5-C6', color: '#FFD700', label: 'Chords', count: 2 },
];

export function VirtualKeyboard() {
  const [activeKey, setActiveKey] = useState<number | null>(null);

  const renderOctave = (octaveIndex: number, color: string) => {
    const keys = [];
    // 7 white keys per octave
    for (let i = 0; i < 7; i++) {
      const isBlackKeyAfter = [0, 1, 3, 4, 5].includes(i); // C, D, F, G, A have sharp
      const keyIndex = octaveIndex * 12 + i * 2 - (i > 2 ? 1 : 0); // rough index for active state
      
      keys.push(
        <div key={`w-${i}`} className="relative flex-1 group">
          {/* White Key */}
          <div 
            className={`w-full h-full border-r border-neutral-900 rounded-b-md transition-colors ${
              activeKey === keyIndex ? 'bg-neutral-300' : 'bg-neutral-100'
            }`}
            onMouseDown={() => setActiveKey(keyIndex)}
            onMouseUp={() => setActiveKey(null)}
            onMouseLeave={() => setActiveKey(null)}
            style={{ 
              boxShadow: activeKey === keyIndex ? `inset 0 0 10px ${color}` : 'inset 0 -4px 6px rgba(0,0,0,0.2)' 
            }}
          >
            {/* Color indicator at bottom */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full opacity-50" style={{ backgroundColor: color }}></div>
          </div>
          
          {/* Black Key */}
          {isBlackKeyAfter && (
            <div 
              className={`absolute top-0 -right-[25%] w-[50%] h-[60%] z-10 rounded-b-sm border-x border-b border-black transition-colors ${
                activeKey === keyIndex + 1 ? 'bg-neutral-700' : 'bg-neutral-900'
              }`}
              onMouseDown={(e) => { e.stopPropagation(); setActiveKey(keyIndex + 1); }}
              onMouseUp={(e) => { e.stopPropagation(); setActiveKey(null); }}
              onMouseLeave={() => setActiveKey(null)}
              style={{ 
                boxShadow: activeKey === keyIndex + 1 ? `inset 0 0 10px ${color}` : 'inset -2px -4px 4px rgba(0,0,0,0.5)' 
              }}
            ></div>
          )}
        </div>
      );
    }
    return <div className="flex flex-1 h-full">{keys}</div>;
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Labels */}
      <div className="flex justify-between px-2 mb-2">
        {OCTAVES.map((oct, i) => (
          <div key={i} className="flex items-center gap-2" style={{ width: `${(oct.count / 6) * 100}%` }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: oct.color }}></div>
            <span className="text-xs font-mono text-neutral-500 uppercase">{oct.label} ({oct.range})</span>
          </div>
        ))}
      </div>
      
      {/* Keys Container */}
      <div className="flex-1 flex w-full bg-black rounded-t-sm rounded-b-lg p-1 pb-2 shadow-2xl">
        {OCTAVES.map((oct, i) => (
          <React.Fragment key={i}>
            {renderOctave(i * 2, oct.color)}
            {renderOctave(i * 2 + 1, oct.color)}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

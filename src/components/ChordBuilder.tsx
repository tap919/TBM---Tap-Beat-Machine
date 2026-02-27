import React, { useState } from 'react';
import { GripVertical, FileJson, Music, Clock, Activity } from 'lucide-react';

const CHORD_PALETTE = [
  'Cmaj13', 'Dm11', 'E7#9', 'F6/9', 
  'G13', 'Am9', 'Bbmaj7', 'Bdim7',
  'C#m7b5', 'Ebmaj9', 'F#7b13', 'G#m11',
  'D7#11', 'A7b9', 'Cmin(maj7)'
];

const RHYTHM_TEMPLATES = [
  { id: 'staccato', label: 'Staccato', icon: <Activity size={12} /> },
  { id: 'syncopated', label: 'Syncopated', icon: <Clock size={12} /> },
  { id: 'lush', label: 'Lush Pad', icon: <Music size={12} /> },
  { id: 'triplet', label: 'Triplet Feel', icon: <Activity size={12} /> },
];

export function ChordBuilder() {
  const [slots, setSlots] = useState<string[]>(['', '', '', '']);
  const [draggedChord, setDraggedChord] = useState<string | null>(null);
  const [activeRhythm, setActiveRhythm] = useState('lush');

  const handleDrop = (index: number) => {
    if (draggedChord) {
      const newSlots = [...slots];
      newSlots[index] = draggedChord;
      setSlots(newSlots);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Progression Builder</h2>
        <div className="flex items-center gap-3">
          <div 
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', 'MIDI_DATA')}
            className="flex items-center gap-1 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded cursor-grab active:cursor-grabbing hover:bg-neutral-700 transition-colors group"
          >
            <GripVertical className="w-3 h-3 text-neutral-500 group-hover:text-yellow-500" />
            <span className="text-[10px] font-bold text-neutral-400 uppercase">MIDI</span>
          </div>
          <button onClick={() => setSlots(['', '', '', ''])} className="text-[10px] font-mono text-neutral-500 hover:text-neutral-300 uppercase">
            [Clear]
          </button>
        </div>
      </div>
      
      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* Left: Slots & Templates */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 h-32">
            {slots.map((slot, i) => (
              <div
                key={i}
                className={`border-2 border-dashed rounded-md flex items-center justify-center transition-colors relative group ${
                  slot ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-500'
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
              >
                {slot ? (
                  <span className="text-[#FFD700] font-bold font-mono text-sm">{slot}</span>
                ) : (
                  <span className="text-neutral-600 text-[10px] font-mono uppercase">Slot {i+1}</span>
                )}
                {slot && (
                  <button 
                    onClick={() => { const n = [...slots]; n[i] = ''; setSlots(n); }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-neutral-700 rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Rhythm Movement</span>
            <div className="grid grid-cols-2 gap-2">
              {RHYTHM_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  onClick={() => setActiveRhythm(template.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-[10px] font-bold uppercase transition-all border ${
                    activeRhythm === template.id 
                      ? 'bg-yellow-600/20 text-yellow-500 border-yellow-600/50' 
                      : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:bg-neutral-700'
                  }`}
                >
                  {template.icon}
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Palette */}
        <div className="w-48 flex flex-col gap-2">
          <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Jazzy Palette</div>
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar flex flex-wrap gap-1.5 content-start">
            {CHORD_PALETTE.map(chord => (
              <div
                key={chord}
                draggable
                onDragStart={() => setDraggedChord(chord)}
                onDragEnd={() => setDraggedChord(null)}
                className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded cursor-grab active:cursor-grabbing text-[10px] font-mono text-neutral-300 hover:bg-neutral-700 hover:border-[#FFD700] transition-colors"
              >
                {chord}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

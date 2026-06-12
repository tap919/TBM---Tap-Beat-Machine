import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { useTBMAudio } from '../contexts/TBMAudioContext';
import { useMidi } from '../contexts/MidiContext';

const OCTAVES = [
  { range: 'C1-B2', color: '#FF4C4C', label: 'Chops', count: 2 },
  { range: 'C3-B4', color: '#4C83FF', label: '808s', count: 2 },
  { range: 'C5-B6', color: '#FFD700', label: 'Chords', count: 2 },
];

// Base offset: keyIndex 0 = first key on keyboard = pad 0
const MIDI_BASE = 0;

// Helper function to get note name from MIDI note number
function getNoteName(note: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  const noteIndex = note % 12;
  return `${noteNames[noteIndex]}${octave}`;
}

// Memoized single octave to avoid re-rendering all octaves on key press
const Octave = React.memo(function Octave({
  octaveIndex,
  color,
  activeNotes,
  onKeyDown,
  onKeyUp,
}: {
  octaveIndex: number;
  color: string;
  activeNotes: Set<number>;
  onKeyDown: (key: number, velocity: number) => void;
  onKeyUp: (key: number) => void;
}) {
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const isBlackKeyAfter = [0, 1, 3, 4, 5].includes(i);
    const whiteKeyIndex = octaveIndex * 12 + i * 2 - (i > 2 ? 1 : 0);
    const blackKeyIndex = whiteKeyIndex + 1;

    const isWhiteKeyActive = activeNotes.has(whiteKeyIndex);
    const isBlackKeyActive = activeNotes.has(blackKeyIndex);

    keys.push(
      <div key={`w-${i}`} className="relative flex-1 group">
        {/* White Key */}
        <button
          className={`w-full h-full border-r border-neutral-900 rounded-b-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
            isWhiteKeyActive ? 'bg-neutral-300' : 'bg-neutral-100'
          }`}
          onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const velocity = 1 - Math.min(1, y / rect.height * 1.5); // Higher on key = higher velocity
            onKeyDown(whiteKeyIndex, velocity);
          }}
          onMouseUp={() => onKeyUp(whiteKeyIndex)}
          onMouseLeave={() => onKeyUp(whiteKeyIndex)}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            const rect = e.currentTarget.getBoundingClientRect();
            const y = touch.clientY - rect.top;
            const velocity = 1 - Math.min(1, y / rect.height * 1.5);
            onKeyDown(whiteKeyIndex, velocity);
          }}
          onTouchEnd={() => onKeyUp(whiteKeyIndex)}
          aria-label={`White key ${whiteKeyIndex}, note ${getNoteName(whiteKeyIndex)}`}
          aria-pressed={isWhiteKeyActive}
          tabIndex={0}
          style={{
            boxShadow: isWhiteKeyActive ? `inset 0 0 10px ${color}` : 'inset 0 -4px 6px rgba(0,0,0,0.2)',
          }}
        >
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full opacity-50" style={{ backgroundColor: color }}></div>
        </button>
        
        {/* Black Key (if applicable) */}
        {isBlackKeyAfter && (
          <button
            className={`absolute top-0 -right-[25%] w-[50%] h-[60%] z-10 rounded-b-sm border-x border-b border-black transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
              isBlackKeyActive ? 'bg-neutral-700' : 'bg-neutral-900'
            }`}
            onMouseDown={(e) => { 
              e.stopPropagation(); 
              const rect = e.currentTarget.getBoundingClientRect();
              const y = e.clientY - rect.top;
              const velocity = 1 - Math.min(1, y / rect.height * 1.5);
              onKeyDown(blackKeyIndex, velocity);
            }}
            onMouseUp={(e) => { 
              e.stopPropagation(); 
              onKeyUp(blackKeyIndex); 
            }}
            onMouseLeave={() => onKeyUp(blackKeyIndex)}
            onTouchStart={(e) => {
              e.stopPropagation();
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              const y = touch.clientY - rect.top;
              const velocity = 1 - Math.min(1, y / rect.height * 1.5);
              onKeyDown(blackKeyIndex, velocity);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onKeyUp(blackKeyIndex);
            }}
            aria-label={`Black key ${blackKeyIndex}, note ${getNoteName(blackKeyIndex)}`}
            aria-pressed={isBlackKeyActive}
            tabIndex={0}
            style={{
              boxShadow: isBlackKeyActive ? `inset 0 0 10px ${color}` : 'inset -2px -4px 4px rgba(0,0,0,0.5)',
            }}
          ></button>
        )}
      </div>,
    );
  }
  return <div className="flex flex-1 h-full">{keys}</div>;
}, (prevProps, nextProps) => {
  // Custom comparator: avoid re-rendering octaves when the active note set
  // hasn't actually changed.  The default shallow compare always fails because
  // activeNotes is a new Set on every render (Map → Set conversion).
  if (prevProps.octaveIndex !== nextProps.octaveIndex) return false;
  if (prevProps.color !== nextProps.color) return false;
  if (prevProps.onKeyDown !== nextProps.onKeyDown) return false;
  if (prevProps.onKeyUp !== nextProps.onKeyUp) return false;

  // Compare Sets by size + content (only notes in this octave's range matter)
  const prevSet = prevProps.activeNotes;
  const nextSet = nextProps.activeNotes;
  if (prevSet.size !== nextSet.size) return false;
  for (const n of prevSet) {
    if (!nextSet.has(n)) return false;
  }
  return true;
});

export const VirtualKeyboard = React.memo(function VirtualKeyboard() {
  const { noteOn, noteOff, activeNotes, isSustainPedalActive, isComputerKeyboardEnabled, setSustainPedal } = useMidi();
  const { engine, pads } = useTBMAudio();
  
  // Memoize the Set of active note numbers so Octave's React.memo comparison
  // receives a stable reference when activeNotes hasn't changed.  Without this,
  // a new Set object is allocated on every render of VirtualKeyboard (e.g. from
  // the parent's CPU-meter RAF loop), causing all six Octave instances to
  // re-render unconditionally, even when no notes are active or changing.
  const activeNoteNumbers = useMemo(
    () => new Set(Array.from(activeNotes.keys())),
    [activeNotes],
  );
  
  // Track mouse state for velocity calculation
  const isMouseDownRef = useRef(false);
  const currentKeyRef = useRef<number | null>(null);

  const handleKeyDown = useCallback((key: number, velocity: number) => {
    if (!engine || !pads.length) return;
    
    // Map MIDI key index to pad: key 0 = MIDI_BASE (C3) = pad 0, ascending chromatically
    const padIndex = Math.max(0, Math.min(pads.length - 1, key - MIDI_BASE));
    const pad = pads[padIndex];
    
    if (pad) {
      // Use the MidiContext to trigger the note
      noteOn(key, velocity);
    }
    
    isMouseDownRef.current = true;
    currentKeyRef.current = key;
  }, [engine, pads, noteOn]);

  const handleKeyUp = useCallback((key: number) => {
    // Only release the note if sustain pedal is not active
    if (!isSustainPedalActive) {
      noteOff(key);
    }
    
    if (currentKeyRef.current === key) {
      isMouseDownRef.current = false;
      currentKeyRef.current = null;
    }
  }, [noteOff, isSustainPedalActive]);

  // Add keyboard shortcuts for computer keyboard
  useEffect(() => {
    if (!isComputerKeyboardEnabled) return;

    const keyMap: { [key: string]: number } = {
      'a': 60, // C4
      'w': 61, // C#4
      's': 62, // D4
      'e': 63, // D#4
      'd': 64, // E4
      'f': 65, // F4
      't': 66, // F#4
      'g': 67, // G4
      'y': 68, // G#4
      'h': 69, // A4
      'u': 70, // A#4
      'j': 71, // B4
      'k': 72, // C5
      'o': 73, // C#5
      'l': 74, // D5
      'p': 75, // D#5
      ';': 76, // E5
      "'": 77, // F5
    };

    const handleComputerKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      
      const note = keyMap[e.key.toLowerCase()];
      if (note !== undefined) {
        e.preventDefault();
        // Only call noteOn — it already triggers the pad sound via MidiContext.
        // Previously engine.triggerPad was also called here, causing double audio.
        const normalizedVelocity = 0.8;
        noteOn(note, normalizedVelocity);
      }
      
      // Sustain pedal simulation with Shift key
      if (e.key === 'Shift') {
        setSustainPedal(true);
      }
    };

    const handleComputerKeyUp = (e: KeyboardEvent) => {
      const note = keyMap[e.key.toLowerCase()];
      if (note !== undefined) {
        e.preventDefault();
        // Respect sustain pedal — only release if sustain is not active
        if (!isSustainPedalActive) {
          noteOff(note);
        }
      }
      
      // Sustain pedal simulation with Shift key
      if (e.key === 'Shift') {
        setSustainPedal(false);
      }
    };

    window.addEventListener('keydown', handleComputerKeyDown);
    window.addEventListener('keyup', handleComputerKeyUp);

    return () => {
      window.removeEventListener('keydown', handleComputerKeyDown);
      window.removeEventListener('keyup', handleComputerKeyUp);
    };
  }, [isComputerKeyboardEnabled, noteOn, noteOff, setSustainPedal, isSustainPedalActive]);

  return (
    <div 
      className="w-full h-full flex flex-col gap-1" 
      role="application"
      aria-label="Virtual MIDI Keyboard"
      aria-describedby="keyboard-instructions"
    >
      {/* Instructions for screen readers */}
      <div id="keyboard-instructions" className="sr-only">
        Use mouse or touch to play notes. Computer keyboard shortcuts are also available.
        Press Shift key to activate sustain pedal. Use Tab to navigate between keys.
      </div>
      
      {/* Labels */}
      <div className="flex justify-between px-1">
        {OCTAVES.map((oct, i) => (
          <div key={i} className="flex items-center gap-1.5" style={{ width: `${(oct.count / 6) * 100}%` }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: oct.color }}></div>
            <span className="text-xs font-bold font-mono text-neutral-600 uppercase tracking-wider">{oct.label} <span className="text-neutral-700 font-normal">{oct.range}</span></span>
          </div>
        ))}
      </div>

      {/* Keys Container */}
      <div 
        className="flex-1 flex w-full bg-black rounded-sm overflow-hidden shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]"
        role="group"
        aria-label="Piano keys"
      >
        {OCTAVES.map((oct, i) => (
          <React.Fragment key={i}>
            <Octave 
              octaveIndex={i * 2} 
              color={oct.color} 
              activeNotes={activeNoteNumbers} 
              onKeyDown={handleKeyDown} 
              onKeyUp={handleKeyUp} 
            />
            <Octave 
              octaveIndex={i * 2 + 1} 
              color={oct.color} 
              activeNotes={activeNoteNumbers} 
              onKeyDown={handleKeyDown} 
              onKeyUp={handleKeyUp} 
            />
          </React.Fragment>
        ))}
      </div>
      
      {/* Status Bar */}
      <div className="flex items-center justify-between px-1 text-xs font-mono text-contrast-medium">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isSustainPedalActive ? 'bg-green-500' : 'bg-neutral-700'}`} aria-hidden="true"></div>
          <span>Sustain: {isSustainPedalActive ? 'ON' : 'OFF'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isComputerKeyboardEnabled ? 'bg-blue-500' : 'bg-neutral-700'}`} aria-hidden="true"></div>
          <span>Keyboard: {isComputerKeyboardEnabled ? 'ON' : 'OFF'}</span>
        </div>
        <span>Active: {activeNotes.size} notes</span>
      </div>
    </div>
  );
});

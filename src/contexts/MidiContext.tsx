import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import {
  getGlobalMidiHandler,
  type MidiHandlerCallbacks,
} from "../lib/midiHandler";
import { initMidiMappings } from "../lib/midiMapping";
import { useTBMAudio } from "./TBMAudioContext";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MidiNoteState {
  note: number;
  velocity: number;
  channel: number;
  timestamp: number;
}

export interface MidiContextValue {
  // Active notes state
  activeNotes: Map<number, MidiNoteState>; // note -> state
  isSustainPedalActive: boolean;

  // MIDI connection state
  isMidiConnected: boolean;
  midiDevices: Array<{ id: string; name: string }>;

  // Methods
  noteOn: (note: number, velocity: number, channel?: number) => void;
  noteOff: (note: number, channel?: number) => void;
  allNotesOff: () => void;
  setSustainPedal: (active: boolean) => void;

  // MIDI device management
  refreshMidiDevices: () => void;

  // Keyboard shortcuts
  isComputerKeyboardEnabled: boolean;
  toggleComputerKeyboard: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const MidiContext = createContext<MidiContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider Component
// ─────────────────────────────────────────────────────────────────────────────

export function MidiProvider({ children }: { children: React.ReactNode }) {
  // Hydrate persisted MIDI mappings once on first mount
  useEffect(() => { initMidiMappings(); }, []);

  const { engine, pads, triggerPad } = useTBMAudio();
  const [activeNotes, setActiveNotes] = useState<Map<number, MidiNoteState>>(
    new Map(),
  );
  const [isSustainPedalActive, setIsSustainPedalActive] = useState(false);
  const [isMidiConnected, setIsMidiConnected] = useState(false);
  const [midiDevices, setMidiDevices] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [isComputerKeyboardEnabled, setIsComputerKeyboardEnabled] =
    useState(true);

  const activeNotesRef = useRef(activeNotes);
  const isSustainPedalActiveRef = useRef(isSustainPedalActive);
  const padsRef = useRef(pads);
  const engineRef = useRef(engine);

  const triggerPadRef = useRef(triggerPad);

  // Keep refs in sync with state
  useEffect(() => {
    activeNotesRef.current = activeNotes;
    isSustainPedalActiveRef.current = isSustainPedalActive;
    padsRef.current = pads;
    engineRef.current = engine;
    triggerPadRef.current = triggerPad;
  }, [activeNotes, isSustainPedalActive, pads, engine, triggerPad]);

  // ── MIDI Note Management ──────────────────────────────────────────────────

  const noteOn = useCallback(
    (note: number, velocity: number, channel: number = 0) => {
      const normalizedVelocity = Math.max(0, Math.min(1, velocity));
      const noteState: MidiNoteState = {
        note,
        velocity: normalizedVelocity,
        channel,
        timestamp: Date.now(),
      };

      setActiveNotes((prev) => {
        const newMap = new Map(prev);
        newMap.set(note, noteState);
        return newMap;
      });

      // Trigger the pad using the context's triggerPad (which handles AudioContext resume)
      // Map MIDI note to pad index (0-15 for 16 pads)
      const MIDI_BASE = 0; // Same as VirtualKeyboard.tsx:11
      const padIndex = Math.max(
        0,
        Math.min(padsRef.current.length - 1, note - MIDI_BASE),
      );

      // Use triggerPad from TBMAudioContext — this ensures the AudioContext is resumed
      // Must pass the actual Pad object, not the numeric index
      const pad = padsRef.current[padIndex];
      if (triggerPadRef.current && pad) {
        triggerPadRef.current(pad, normalizedVelocity);
      }
    },
    [],
  );

  const noteOff = useCallback((note: number, _channel: number = 0) => {
    setActiveNotes((prev) => {
      const newMap = new Map(prev);
      newMap.delete(note);
      return newMap;
    });
  }, []);

  const allNotesOff = useCallback(() => {
    setActiveNotes(new Map());
  }, []);

  const setSustainPedal = useCallback(
    (active: boolean) => {
      setIsSustainPedalActive(active);

      // If sustain pedal is released, release all notes that were held by sustain
      if (!active) {
        // In a more advanced implementation, we would track which notes
        // were held by sustain vs manually held. For now, just release all.
        allNotesOff();
      }
    },
    [allNotesOff],
  );

  // ── MIDI Device Management ────────────────────────────────────────────────

  const refreshMidiDevices = useCallback(() => {
    const midiHandler = getGlobalMidiHandler();
    const devices = midiHandler.getConnectedDevices();
    setMidiDevices(devices);
    setIsMidiConnected(devices.length > 0);
  }, []);

  // ── Computer Keyboard Toggle ──────────────────────────────────────────────

  const toggleComputerKeyboard = useCallback(() => {
    setIsComputerKeyboardEnabled((prev) => !prev);
  }, []);

  // ── Setup MIDI Callbacks ─────────────────────────────────────────────────

  useEffect(() => {
    const midiHandler = getGlobalMidiHandler();
    const timeoutIds = new Set<ReturnType<typeof setTimeout>>();

    // Register callbacks for sustain pedal and MIDI activity
    const callbacks: MidiHandlerCallbacks = {
      // Sustain pedal is CC 64
      onMidiActivity: (type, channel, number, value) => {
        if (type === "cc" && number === 64) {
          // CC 64: Sustain pedal (value >= 64 = on, < 64 = off)
          setSustainPedal(value >= 64);
        }
      },

      // Also handle note messages from external MIDI devices
      onDrumPad: (padIndex, velocity) => {
        // Convert pad index back to MIDI note for visual feedback
        const MIDI_BASE = 0;
        const note = padIndex + MIDI_BASE;
        // MIDI velocity is always 0-127 from raw MIDI data; normalize to 0-1
        const normalizedVelocity = Math.max(0, Math.min(1, velocity / 127));

        // Trigger audio — use the same path as noteOn / computer keyboard
        const pad = padsRef.current[padIndex];
        if (triggerPadRef.current && pad) {
          triggerPadRef.current(pad, normalizedVelocity);
        }

        // Update active notes for visual feedback
        setActiveNotes((prev) => {
          const newMap = new Map(prev);
          newMap.set(note, {
            note,
            velocity: normalizedVelocity,
            channel: 9, // Default pad channel
            timestamp: Date.now(),
          });
          return newMap;
        });

        // Auto-release after a short delay (simulating note off)
        const timeoutId = setTimeout(() => {
          setActiveNotes((prev) => {
            const newMap = new Map(prev);
            newMap.delete(note);
            return newMap;
          });
          timeoutIds.delete(timeoutId);
        }, 300); // 300ms note duration

        timeoutIds.add(timeoutId);
      },
    };

    midiHandler.setCallbacks(callbacks);

    // Initial device refresh
    refreshMidiDevices();

    // Subscribe to device changes
    const unsubscribe = midiHandler.onDeviceChange(() => {
      refreshMidiDevices();
    });

    return () => {
      // Clear all pending timeouts
      timeoutIds.forEach((id) => clearTimeout(id));
      timeoutIds.clear();

      // Unsubscribe from device changes
      unsubscribe();

      // Clear callbacks to prevent memory leaks
      midiHandler.setCallbacks({});
    };
  }, [refreshMidiDevices, setSustainPedal]);

  // ── Context Value ────────────────────────────────────────────────────────
  // Memoize context value to avoid creating a new object on every render.
  // Note: activeNotes changes on every MIDI event, so consumers that read it
  // will still re-render — but consumers that only use methods won't.
  const contextValue = useMemo<MidiContextValue>(
    () => ({
      activeNotes,
      isSustainPedalActive,
      isMidiConnected,
      midiDevices,
      noteOn,
      noteOff,
      allNotesOff,
      setSustainPedal,
      refreshMidiDevices,
      isComputerKeyboardEnabled,
      toggleComputerKeyboard,
    }),
    [
      activeNotes,
      isSustainPedalActive,
      isMidiConnected,
      midiDevices,
      noteOn,
      noteOff,
      allNotesOff,
      setSustainPedal,
      refreshMidiDevices,
      isComputerKeyboardEnabled,
      toggleComputerKeyboard,
    ],
  );

  return (
    <MidiContext.Provider value={contextValue}>{children}</MidiContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useMidi() {
  const context = useContext(MidiContext);
  if (!context) {
    throw new Error("useMidi must be used within a MidiProvider");
  }
  return context;
}

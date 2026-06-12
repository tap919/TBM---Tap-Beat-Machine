/**
 * Gemini Slate 4 Integration Component
 *
 * Connects the physical Gemini Slate 4 DJ controller to TBM via Web MIDI.
 * - Routes CC / note messages through configurable mappings (midiMapping.ts)
 * - Dispatches actions to the DJ engine, sequencer, pad system, and mixer
 * - Shows a floating connection-status badge
 * - Provides a useGeminiSlate4 hook for other components
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useTBMAudio } from '../contexts/TBMAudioContext';
import {
  getGlobalMidiHandler,
  initializeGlobalMidiHandler,
  disposeGlobalMidiHandler,
} from '../lib/midiHandler';
import type { MidiHandlerCallbacks } from '../lib/midiHandler';
import {
  setControllerMode,
  getCurrentMode,
  onControllerModeChange,
} from '../lib/midiMapping';
import { Disc, Square, Music, Zap } from 'lucide-react';

interface ExtendedSequencer {
  play(): void;
  stop(): void;
  setSwing?(value: number): void;
  setQuantize?(level: number): void;
  setGridDivision?(division: number): void;
  toggleRecord?(): void;
  getLoop?(): boolean;
  setLoop?(loop: boolean): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface GeminiSlate4IntegrationProps {
  children?: React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function GeminiSlate4Integration({ children }: GeminiSlate4IntegrationProps) {
  const {
    // DJ engine
    djEngine,
    djPlay,
    djStop,
    setCrossfaderPosition,
    setDeckVolume,
    setDeckBpm,
    setDeckEQ,
    setDeckPlaybackRate,
    setDJMasterVolume,
    setDeckCuePoint,
    enableSync,
    processScratch,
    setDeckEffect,
    setDeckEffectEnabled,
    setDeckEffectWetDry,

    // Sequencer / drum machine
    sequencer,
    triggerPad,
    pads,
    bpm,
    setBpm,
    
    // Audio engine and pad management
    engine,
    updatePad,
  } = useTBMAudio();

  const [currentMode, setCurrentMode] = useState(() => getCurrentMode().id);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [padOffset, setPadOffset] = useState(0);
  const [keyLock, setKeyLock] = useState(false);
  const [midiActivity, setMidiActivity] = useState(false);
  const [quantizeLevel, setQuantizeLevel] = useState(0.25); // 1/4 notes by default
  const [gridDivision, setGridDivision] = useState(4); // 4 steps per beat
  const [selectedPadIndex, _setSelectedPadIndex] = useState(0); // Currently selected pad for sample editing

  const activityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep stable refs so the MIDI callback closures always see current values
  const padsRef = useRef(pads);
  padsRef.current = pads;
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const keyLockRef = useRef(keyLock);
  keyLockRef.current = keyLock;
  const quantizeLevelRef = useRef(quantizeLevel);
  quantizeLevelRef.current = quantizeLevel;
  const gridDivisionRef = useRef(gridDivision);
  gridDivisionRef.current = gridDivision;
  const selectedPadIndexRef = useRef(selectedPadIndex);
  selectedPadIndexRef.current = selectedPadIndex;

  // Per-deck EQ state, keyed by deck string ('A' | 'B').
  // Stored in a ref (not state) so the MIDI callback can read and write the
  // current band values without triggering re-renders or stale-closure issues.
  const eqStateRef = useRef<Record<string, { lo: number; mid: number; hi: number }>>({
    A: { lo: 0, mid: 0, hi: 0 },
    B: { lo: 0, mid: 0, hi: 0 },
  });

  // ── Build callbacks (stable — captures refs, not values) ──────────────────

  const buildCallbacks = useCallback((): MidiHandlerCallbacks => ({
    // ── Activity indicator ──
    onMidiActivity: () => {
      setMidiActivity(true);
      if (activityTimer.current) clearTimeout(activityTimer.current);
      activityTimer.current = setTimeout(() => setMidiActivity(false), 120);
    },

    // ── Mode switching ──
    onModeTurntable: () => {
      setCurrentMode('turntable');
      setControllerMode('turntable');
    },
    onModePad: () => {
      setCurrentMode('pad');
      setControllerMode('pad');
    },
    onModeSampling: () => {
      setCurrentMode('sampling');
      setControllerMode('sampling');
    },
    onKeyLockToggle: () => {
      const wasLocked = keyLockRef.current;
      const nowLocked = !wasLocked;
      setKeyLock(nowLocked);
      const handler = getGlobalMidiHandler();
      const newOffset = nowLocked ? 8 : 0;
      handler.setPadOffset(newOffset);
      setPadOffset(newOffset);
    },

    // ── Vinyl Scratch / DJ transport ──
    onVinylScratchJog: (deck, value) => {
      if (!djEngine) return;
      // value is 0-1 from CC. Convert to a relative scratch delta:
      // CC relative encoding: 0.5 = no movement, <0.5 = ccw, >0.5 = cw
      const delta = (value - 0.5) * 2; // -1..+1
      const deckId = deck === 'left' ? 'A' : 'B';
      // Feed into scratch engine
      processScratch(deckId, delta, 1 / 60);
    },
    onVinylScratchCrossfader: (value) => {
      setCrossfaderPosition(value);
    },
    onVinylScratchPlay: (deck) => {
      djPlay(deck);
    },
    onVinylScratchStop: () => {
      djStop('A');
    },
    onVinylScratchCue: (deck) => {
      setDeckCuePoint(deck);
    },
    onVinylScratchSync: (deck) => {
      // Sync the target deck to the other deck's BPM
      enableSync(deck === 'A' ? 'A' : 'B');
    },

    // ── Stem queues (FX buttons) ──
    onStemQueueDrums: () => {
      // Toggle drum stem mute — implementation depends on stem separation engine
      // For now trigger pad 0 as a drum one-shot
      const p = padsRef.current;
      if (p.length > 0) triggerPad(p[0], 1);
    },
    onStemQueueBass: () => {
      const p = padsRef.current;
      if (p.length > 1) triggerPad(p[1], 1);
    },
    onStemQueueVocals: () => {
      const p = padsRef.current;
      if (p.length > 2) triggerPad(p[2], 1);
    },
    onStemQueueOther: () => {
      const p = padsRef.current;
      if (p.length > 3) triggerPad(p[3], 1);
    },

    // ── Drum pads ──
    onDrumPad: (padIndex, velocity) => {
      const p = padsRef.current;
      if (padIndex >= 0 && padIndex < p.length && velocity > 0) {
        // velocity comes as note velocity 0-127 raw (for notes) — normalise
        const vel = velocity > 1 ? velocity / 127 : velocity;
        triggerPad(p[padIndex], vel);
      }
    },

    // ── Grid timing ──
    onGridTempo: (value) => {
      if (!sequencer) return;
      // Map 0-1 → 60-200 BPM
      const newBpm = Math.round(60 + value * 140);
      setBpm(newBpm);
    },
    onGridSwing: (value) => {
      sequencer?.setSwing?.(value * 100);
    },
    onGridQuantize: (value) => {
      // Map 0-1 to quantize levels: 0=off, 0.25=1/4, 0.5=1/8, 0.75=1/16, 1=1/32
      const levels = [0, 0.25, 0.125, 0.0625, 0.03125]; // off, 1/4, 1/8, 1/16, 1/32
      const index = Math.min(Math.floor(value * levels.length), levels.length - 1);
      const newLevel = levels[index];
      setQuantizeLevel(newLevel);
      quantizeLevelRef.current = newLevel;
      
      // Apply to sequencer if available
      if (sequencer && (sequencer as ExtendedSequencer).setQuantize) {
        (sequencer as ExtendedSequencer).setQuantize!(newLevel);
      }
    },
    onGridDivision: (value) => {
      // Map 0-1 to grid divisions: 1, 2, 3, 4, 6, 8, 12, 16 steps per beat
      const divisions = [1, 2, 3, 4, 6, 8, 12, 16];
      const index = Math.min(Math.floor(value * divisions.length), divisions.length - 1);
      const newDivision = divisions[index];
      setGridDivision(newDivision);
      gridDivisionRef.current = newDivision;
      
      // Apply to sequencer if available
      if (sequencer && (sequencer as ExtendedSequencer).setGridDivision) {
        (sequencer as ExtendedSequencer).setGridDivision!(newDivision);
      }
    },

    // ── Sample editor ──
    onSampleStart: (value) => {
      // Set sample start point on currently selected pad
      const padIndex = selectedPadIndexRef.current;
      // Use engine.setPadStartOffset if available
      if (engine?.setPadStartOffset) {
        engine.setPadStartOffset(padIndex, value);
      }
      // Also update the pad state in context
      updatePad(padIndex, { start: value });
    },
    onSampleEnd: (value) => {
      // Set sample end point on currently selected pad
      const padIndex = selectedPadIndexRef.current;
      // Update pad end property in context (no engine method exists for end offset)
      updatePad(padIndex, { end: value });
    },
    onSampleVolume: (value) => {
      // Adjust volume of currently selected pad
      const padIndex = selectedPadIndexRef.current;
      updatePad(padIndex, { volume: value });
    },
    onSamplePitch: (value) => {
      // Map 0-1 to pitch adjustment -12 to +12 semitones
      const pitch = (value * 24) - 12;
      const padIndex = selectedPadIndexRef.current;
      updatePad(padIndex, { pitch });
    },
    onSampleLoop: (value) => {
      // Toggle loop on/off for the selected pad (value > 0.5 = on)
      const padIndex = selectedPadIndexRef.current;
      updatePad(padIndex, { loop: value > 0.5 });
    },
    onSampleFilter: (value) => {
      // Map 0-1 to filter cutoff (0-127) on the selected pad
      const padIndex = selectedPadIndexRef.current;
      const cutoff = Math.round(value * 127);
      updatePad(padIndex, { filterCutoff: cutoff });
      // Also push to engine real-time path if available
      if (engine?.setPadFilterCutoff) {
        engine.setPadFilterCutoff(padIndex, cutoff);
      }
    },
    onSampleReverb: (value) => {
      // Route reverb wet/dry to deck A effect slot 1
      setDeckEffect('A', 1, 'reverb', { decay: 1.5 + value * 3, mix: value });
      setDeckEffectEnabled('A', 1, value > 0.05);
    },
    onSampleDelay: (value) => {
      // Route delay (echo) wet/dry to deck A effect slot 2
      setDeckEffect('A', 2, 'echo', { delayMs: 250, feedback: 0.3, mix: value });
      setDeckEffectEnabled('A', 2, value > 0.05);
    },

    // ── Transport ──
    onTransportPlay: () => {
      sequencer?.play();
    },
    onTransportStop: () => {
      sequencer?.stop();
    },
    onTransportRecord: () => {
      // Toggle record arm — sequencer record API if available, else start playback
      if (sequencer && (sequencer as ExtendedSequencer).toggleRecord) {
        (sequencer as ExtendedSequencer).toggleRecord!();
      } else {
        sequencer?.play();
      }
    },
    onTransportLoop: () => {
      // Toggle loop mode
      if (sequencer) {
        const currentLoop = (sequencer as ExtendedSequencer).getLoop?.() ?? false;
        (sequencer as ExtendedSequencer).setLoop?.(!currentLoop);
      }
    },

    // ── Mixer ──
    onMixerMaster: (value) => {
      setDJMasterVolume(value);
    },
    onMixerChannel: (channel, value) => {
      const deck = channel === 0 ? 'A' : 'B';
      setDeckVolume(deck, value);
    },
    onMixerEQ: (deck, band, value) => {
      // EQ value 0-1 → gain in dB roughly -12 to +12; centre (0.5) = 0 dB
      const gain = (value - 0.5) * 24;
      // Patch only the changed band; leave the other two at their current values
      // so adjusting bass doesn't silently zero out mid/hi and vice-versa.
      const deckEq = eqStateRef.current[deck] ?? { lo: 0, mid: 0, hi: 0 };
      if (band === 'high') deckEq.hi = gain;
      else if (band === 'mid') deckEq.mid = gain;
      else deckEq.lo = gain;
      eqStateRef.current[deck] = deckEq;
      setDeckEQ(deck, deckEq.lo, deckEq.mid, deckEq.hi);
    },

    // ── Pitch fader ──
    onPitchFader: (deck, value) => {
      // Map 0-1 → BPM adjustment ±10%
      const baseBpm = bpmRef.current;
      const adjusted = baseBpm * (0.9 + value * 0.2);
      setDeckBpm(deck, adjusted);
    },

    // ── Fallback for unmapped functions ──
    onUnhandledFunction: (functionId, _value) => {
      console.debug(`[GeminiSlate4] Unhandled MIDI function: ${functionId}`);
    },
  }), [
    djEngine, djPlay, djStop, setCrossfaderPosition, setDeckVolume,
    setDeckBpm, setDeckEQ, setDJMasterVolume,
    setDeckCuePoint, enableSync, processScratch, sequencer, triggerPad,
    setBpm, engine, updatePad, setDeckEffect, setDeckEffectEnabled,
  ]);

  // ── Initialise MIDI handler ──────────────────────────────────────────────

  useEffect(() => {
    let disposed = false;

    const init = async () => {
      try {
        const callbacks = buildCallbacks();
        const success = await initializeGlobalMidiHandler(callbacks);
        if (disposed) return;

        setIsConnected(success);
        if (success) {
          const handler = getGlobalMidiHandler();
          setDeviceCount(handler.getConnectedDevices().length);
          setCurrentMode(getCurrentMode().id);

          // Track hot-plug
          handler.onDeviceChange(() => {
            if (!disposed) {
              setDeviceCount(handler.getConnectedDevices().length);
              setIsConnected(handler.isConnected());
            }
          });
        }
      } catch {
        if (!disposed) setIsConnected(false);
      }
    };

    init();

    // Subscribe to mode changes from other sources (e.g. Settings page)
    const unsub = onControllerModeChange((modeId) => {
      if (!disposed) setCurrentMode(modeId);
    });

    return () => {
      disposed = true;
      unsub();
      if (activityTimer.current) clearTimeout(activityTimer.current);
      disposeGlobalMidiHandler();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update callbacks when dependencies change (without re-initialising MIDI)
  useEffect(() => {
    const handler = getGlobalMidiHandler();
    handler.setCallbacks(buildCallbacks());
  }, [buildCallbacks]);

  // ── Render helpers ──────────────────────────────────────────────────────

  const getModeIcon = () => {
    switch (currentMode) {
      case 'turntable': return <Disc size={16} />;
      case 'pad':       return <Square size={16} />;
      case 'sampling':  return <Music size={16} />;
      default:          return <Zap size={16} />;
    }
  };

  const getModeDescription = () => {
    switch (currentMode) {
      case 'turntable': return 'Jog wheels control vinyl scratch, buttons act as turntable controls';
      case 'pad':       return '8 pads become drum triggers (key lock toggles between halves)';
      case 'sampling':  return 'Sliders control sample editor, knobs adjust effects';
      default:          return 'Controller mode';
    }
  };

  if (!isConnected) {
    return <>{children}</>;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-neutral-900/90 backdrop-blur-sm border border-neutral-700 rounded-xl p-3 shadow-2xl min-w-[220px] vignette noise-texture relative">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${midiActivity ? 'bg-yellow-400' : 'bg-green-500'} animate-pulse dot-glow`} />
            <span className="text-[13px] font-bold uppercase text-neutral-300">Gemini Slate 4</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {getModeIcon()}
            <span className="text-[13px] font-mono text-purple-400 uppercase">{currentMode}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-neutral-500">Mode</span>
            <span className="text-neutral-300 text-right max-w-[150px] truncate">{getModeDescription()}</span>
          </div>

          {currentMode === 'pad' && (
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-neutral-500">Pad Bank</span>
              <span className="text-neutral-300">
                Pads {padOffset + 1}-{padOffset + 8} of 16
                {keyLock && <span className="text-green-400 ml-1">(Key Lock ON)</span>}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-[13px]">
            <span className="text-neutral-500">Devices</span>
            <span className="text-green-400">{deviceCount} connected</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-neutral-800 separator-glow">
          <div className="text-xs text-neutral-600 font-mono">
            Use mode buttons on controller to switch.
            FX buttons = stem queues.
            Key lock toggles pad banks.
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook for using Gemini Slate 4 in other components
// ─────────────────────────────────────────────────────────────────────────────

export function useGeminiSlate4() {
  const [mode, setMode] = useState(() => getCurrentMode().id);
  const [isInitialized, setIsInitialized] = useState(false);
  const [slate4Detected, setSlate4Detected] = useState(false);

  useEffect(() => {
    const handler = getGlobalMidiHandler();
    if (handler.isConnected()) {
      // Use setTimeout to avoid cascading renders
      setTimeout(() => {
        setMode(handler.getCurrentMode());
        setIsInitialized(true);
        setSlate4Detected(handler.hasSlate4Device());
      }, 0);
    }

    const unsub = onControllerModeChange((modeId) => {
      setMode(modeId);
    });
    const unsubSlate4 = handler.onSlate4Change((detected) => {
      setSlate4Detected(detected);
      if (detected) setIsInitialized(true);
    });
    // Also check on device change (hot-plug)
    const unsubDevice = handler.onDeviceChange(() => {
      setSlate4Detected(handler.hasSlate4Device());
      if (handler.isConnected()) setIsInitialized(true);
    });
    return () => {
      unsub();
      unsubSlate4();
      unsubDevice();
    };
  }, []);

  const switchMode = useCallback((modeId: string) => {
    setControllerMode(modeId);
    setMode(modeId);
  }, []);

  return {
    mode,
    isInitialized,
    slate4Detected,
    switchMode,
    getHandler: getGlobalMidiHandler,
  };
}

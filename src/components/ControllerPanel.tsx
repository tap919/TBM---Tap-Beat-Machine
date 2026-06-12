/**
 * Controller Panel — MIDI Controller Integration
 *
 * Connects a physical MIDI DJ controller (e.g. Gemini Slate 4) to TBM via Web MIDI.
 * - Routes CC / note messages through configurable mappings (midiMapping.ts)
 * - Dispatches actions to the DJ engine, sequencer, pad system, and mixer
 * - Shows a floating connection-status badge
 * - Provides a useController hook for other components
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

interface ControllerPanelProps {
  children?: React.ReactNode;
}

export function ControllerPanel({ children }: ControllerPanelProps) {
  const {
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
    sequencer,
    triggerPad,
    pads,
    bpm,
    setBpm,
    engine,
    updatePad,
  } = useTBMAudio();

  const [currentMode, setCurrentMode] = useState(() => getCurrentMode().id);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [padOffset, setPadOffset] = useState(0);
  const [keyLock, setKeyLock] = useState(false);
  const [midiActivity, setMidiActivity] = useState(false);
  const [quantizeLevel, setQuantizeLevel] = useState(0.25);
  const [gridDivision, setGridDivision] = useState(4);
  const [selectedPadIndex, _setSelectedPadIndex] = useState(0);

  const activityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const eqStateRef = useRef<Record<string, { lo: number; mid: number; hi: number }>>({
    A: { lo: 0, mid: 0, hi: 0 },
    B: { lo: 0, mid: 0, hi: 0 },
  });

  const buildCallbacks = useCallback((): MidiHandlerCallbacks => ({
    onMidiActivity: () => {
      setMidiActivity(true);
      if (activityTimer.current) clearTimeout(activityTimer.current);
      activityTimer.current = setTimeout(() => setMidiActivity(false), 120);
    },
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
    onVinylScratchJog: (deck, value) => {
      if (!djEngine) return;
      const delta = (value - 0.5) * 2;
      const deckId = deck === 'left' ? 'A' : 'B';
      processScratch(deckId, delta, 1 / 60);
    },
    onVinylScratchCrossfader: (value) => {
      setCrossfaderPosition(value);
    },
    onVinylScratchPlay: (deck: string) => {
      djPlay(deck as "A" | "B");
    },
    onVinylScratchStop: () => {
      djStop('A');
    },
    onVinylScratchCue: (deck: string) => {
      setDeckCuePoint(deck as "A" | "B");
    },
    onVinylScratchSync: (deck: string) => {
      enableSync(deck === 'A' ? 'A' : 'B');
    },
    onStemQueueDrums: () => {
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
    onDrumPad: (padIndex, velocity) => {
      const p = padsRef.current;
      if (padIndex >= 0 && padIndex < p.length && velocity > 0) {
        const vel = velocity > 1 ? velocity / 127 : velocity;
        triggerPad(p[padIndex], vel);
      }
    },
    onGridTempo: (value) => {
      if (!sequencer) return;
      const newBpm = Math.round(60 + value * 140);
      setBpm(newBpm);
    },
    onGridSwing: (value) => {
      sequencer?.setSwing?.(value * 100);
    },
    onGridQuantize: (value) => {
      const levels = [0, 0.25, 0.125, 0.0625, 0.03125];
      const index = Math.min(Math.floor(value * levels.length), levels.length - 1);
      const newLevel = levels[index];
      setQuantizeLevel(newLevel);
      quantizeLevelRef.current = newLevel;
      if (sequencer && (sequencer as ExtendedSequencer).setQuantize) {
        (sequencer as ExtendedSequencer).setQuantize!(newLevel);
      }
    },
    onGridDivision: (value) => {
      const divisions = [1, 2, 3, 4, 6, 8, 12, 16];
      const index = Math.min(Math.floor(value * divisions.length), divisions.length - 1);
      const newDivision = divisions[index];
      setGridDivision(newDivision);
      gridDivisionRef.current = newDivision;
      if (sequencer && (sequencer as ExtendedSequencer).setGridDivision) {
        (sequencer as ExtendedSequencer).setGridDivision!(newDivision);
      }
    },
    onSampleStart: (value) => {
      const padIndex = selectedPadIndexRef.current;
      if (engine?.setPadStartOffset) {
        engine.setPadStartOffset(padIndex, value);
      }
      updatePad(padIndex, { start: value });
    },
    onSampleEnd: (value) => {
      const padIndex = selectedPadIndexRef.current;
      updatePad(padIndex, { end: value });
    },
    onSampleVolume: (value) => {
      const padIndex = selectedPadIndexRef.current;
      updatePad(padIndex, { volume: value });
    },
    onSamplePitch: (value) => {
      const pitch = (value * 24) - 12;
      const padIndex = selectedPadIndexRef.current;
      updatePad(padIndex, { pitch });
    },
    onSampleLoop: (value) => {
      const padIndex = selectedPadIndexRef.current;
      updatePad(padIndex, { loop: value > 0.5 });
    },
    onSampleFilter: (value) => {
      const padIndex = selectedPadIndexRef.current;
      const cutoff = Math.round(value * 127);
      updatePad(padIndex, { filterCutoff: cutoff });
      if (engine?.setPadFilterCutoff) {
        engine.setPadFilterCutoff(padIndex, cutoff);
      }
    },
    onSampleReverb: (value) => {
      setDeckEffect('A', 1, 'reverb', { decay: 1.5 + value * 3, mix: value });
      setDeckEffectEnabled('A', 1, value > 0.05);
    },
    onSampleDelay: (value) => {
      setDeckEffect('A', 2, 'echo', { delayMs: 250, feedback: 0.3, mix: value });
      setDeckEffectEnabled('A', 2, value > 0.05);
    },
    onTransportPlay: () => {
      sequencer?.play();
    },
    onTransportStop: () => {
      sequencer?.stop();
    },
    onTransportRecord: () => {
      if (sequencer && (sequencer as ExtendedSequencer).toggleRecord) {
        (sequencer as ExtendedSequencer).toggleRecord!();
      } else {
        sequencer?.play();
      }
    },
    onTransportLoop: () => {
      if (sequencer) {
        const currentLoop = (sequencer as ExtendedSequencer).getLoop?.() ?? false;
        (sequencer as ExtendedSequencer).setLoop?.(!currentLoop);
      }
    },
    onMixerMaster: (value) => {
      setDJMasterVolume(value);
    },
    onMixerChannel: (channel, value) => {
      const deck = channel === 0 ? 'A' : 'B';
      setDeckVolume(deck, value);
    },
    onMixerEQ: (deck: string, band: string, value: number) => {
      const gain = (value - 0.5) * 24;
      const deckEq = eqStateRef.current[deck] ?? { lo: 0, mid: 0, hi: 0 };
      if (band === 'high') deckEq.hi = gain;
      else if (band === 'mid') deckEq.mid = gain;
      else deckEq.lo = gain;
      eqStateRef.current[deck] = deckEq;
      setDeckEQ(deck as "A" | "B", deckEq.lo, deckEq.mid, deckEq.hi);
    },
    onPitchFader: (deck: string, value: number) => {
      const baseBpm = bpmRef.current;
      const adjusted = baseBpm * (0.9 + value * 0.2);
      setDeckBpm(deck as "A" | "B", adjusted);
    },
    onUnhandledFunction: (functionId, _value) => {
      console.debug(`[ControllerPanel] Unhandled MIDI function: ${functionId}`);
    },
  }), [
    djEngine, djPlay, djStop, setCrossfaderPosition, setDeckVolume,
    setDeckBpm, setDeckEQ, setDJMasterVolume,
    setDeckCuePoint, enableSync, processScratch, sequencer, triggerPad,
    setBpm, engine, updatePad, setDeckEffect, setDeckEffectEnabled,
  ]);

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

  useEffect(() => {
    const handler = getGlobalMidiHandler();
    handler.setCallbacks(buildCallbacks());
  }, [buildCallbacks]);

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
            <span className="text-[13px] font-bold uppercase text-neutral-300">MIDI Controller</span>
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

// ── Hook for using controller status in other components ──

export function useController() {
  const [mode, setMode] = useState(() => getCurrentMode().id);
  const [isInitialized, setIsInitialized] = useState(false);
  const [controllerDetected, setControllerDetected] = useState(false);

  useEffect(() => {
    const handler = getGlobalMidiHandler();
    if (handler.isConnected()) {
      setTimeout(() => {
        setMode(handler.getCurrentMode());
        setIsInitialized(true);
        setControllerDetected(handler.hasSlate4Device());
      }, 0);
    }

    const unsub = onControllerModeChange((modeId) => {
      setMode(modeId);
    });
    const unsubDetect = handler.onSlate4Change((detected) => {
      setControllerDetected(detected);
      if (detected) setIsInitialized(true);
    });
    const unsubDevice = handler.onDeviceChange(() => {
      setControllerDetected(handler.hasSlate4Device());
      if (handler.isConnected()) setIsInitialized(true);
    });
    return () => {
      unsub();
      unsubDetect();
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
    controllerDetected,
    switchMode,
    getHandler: getGlobalMidiHandler,
  };
}

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Knob } from './Knob';
import { Link2, Cpu } from 'lucide-react';
import { useTBMAudio } from '../contexts/TBMAudioContext';

// Kick pad is always pad index 0 in TBM convention
const KICK_PAD_INDEX = 0;
// Worklet module URL — use `new URL()` + `import.meta.url` so Vite resolves
// it correctly in both dev and production builds (the bare `/src/...` path
// only works in dev mode with Vite's FS serving).
const SIDECHAIN_WORKLET_URL = new URL(
  '../worklets/sidechain-compressor-processor.js',
  import.meta.url,
).href;

export const Mixer808 = React.memo(function Mixer808() {
  const {
    engine,
    djEngine,
    audioContext,
    setDeckPlaybackRate,
    setDeckEQ,
    setDeckEffect,
    setDeckEffectEnabled,
    setDeckEffectParam,
  } = useTBMAudio();

  const [punch, setPunch] = useState(50);
  const [tune, setTune] = useState(0);
  const [drive, setDrive] = useState(20);
  const [portamento, setPortamento] = useState(15);
  const [sidechain, setSidechain] = useState(true);
  const [eqEnabled, setEqEnabled] = useState(true);
  const [eqFreq, setEqFreq] = useState(1000);
  const [eqGain, setEqGain] = useState(0);
  const [eqQ, setEqQ] = useState(1);

  // ── Parametric EQ node (BiquadFilterNode) inserted on Deck B ──
  const eqNodeRef = useRef<BiquadFilterNode | null>(null);

  // ── Sidechain worklet state ──
  // Refs hold the live AudioWorkletNode and its output GainNode so we can
  // disconnect/reconnect cleanly when the toggle changes.
  const scWorkletRef = useRef<AudioWorkletNode | null>(null);
  const scWorkletOutRef = useRef<GainNode | null>(null);
  const scLoadedRef = useRef(false); // true once addModule() has resolved
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // ── Punch → Deck B low-shelf EQ boost (0-100 → -6dB to +12dB) ──
  const prevPunchRef = useRef(punch);
  useEffect(() => {
    if (prevPunchRef.current === punch) return;
    prevPunchRef.current = punch;
    // Punch = low-end presence: boost low shelf, slight mid cut for clarity
    const lowGain = -6 + (punch / 100) * 18;     // -6 to +12 dB
    const midGain = -(punch / 100) * 3;           // 0 to -3 dB (scoop)
    setDeckEQ('B', lowGain, midGain, 0);
  }, [punch, setDeckEQ]);

  // ── Tune → Deck B playback rate (semitone-based pitch, -12 to +12) ──
  const prevTuneRef = useRef(tune);
  useEffect(() => {
    if (prevTuneRef.current === tune) return;
    prevTuneRef.current = tune;
    const rate = Math.pow(2, tune / 12);
    setDeckPlaybackRate('B', rate);
  }, [tune, setDeckPlaybackRate]);

  // ── Drive → Deck B distortion effect (slot 0) ──
  // Initialize effect slot on mount
  const driveInitRef = useRef(false);
  useEffect(() => {
    if (driveInitRef.current) return;
    driveInitRef.current = true;
    setDeckEffect('B', 0, 'distortion', { drive: 0.2, tone: 0.6 });
    setDeckEffectEnabled('B', 0, drive > 0);
  }, [setDeckEffect, setDeckEffectEnabled, drive]);

  const prevDriveRef = useRef(drive);
  useEffect(() => {
    if (prevDriveRef.current === drive) return;
    prevDriveRef.current = drive;
    // Map 0-100 knob → 0.0-4.0 drive amount
    const driveAmount = (drive / 100) * 4;
    setDeckEffect('B', 0, 'distortion', { drive: driveAmount, tone: 0.6 });
    setDeckEffectEnabled('B', 0, drive > 2);
  }, [drive, setDeckEffect, setDeckEffectEnabled]);

  // ── Portamento → Deck B pitch glide time (portamento) ──
  // Controls the portamento/glide time between notes on Deck B.
  // Maps 0-100 knob → 0ms to 500ms pitch ramp time via playback rate scheduling.
  const prevPortamentoRef = useRef(portamento);
  useEffect(() => {
    if (prevPortamentoRef.current === portamento) return;
    prevPortamentoRef.current = portamento;
    if (portamento > 5) {
      // Use Deck B effect slot 1 as a creative portamento-like pitch ramp.
      // We schedule a playback rate that ramps over the portamento time.
      const glideTimeMs = (portamento / 100) * 500;
      setDeckEffectParam('B', 1, 'delayMs', glideTimeMs);
      const feedback = (portamento / 100) * 0.25; // subtle feedback for tail
      setDeckEffect('B', 1, 'echo', { delayMs: glideTimeMs, feedback });
      setDeckEffectEnabled('B', 1, true);
    } else {
      setDeckEffectEnabled('B', 1, false);
    }
  }, [portamento, setDeckEffect, setDeckEffectEnabled, setDeckEffectParam]);

  // ── Parametric EQ: BiquadFilterNode wired onto Deck B ──
  //
  // Split into TWO effects to prevent audio glitches:
  //
  //  Effect A — create / destroy / wire:  runs only when eqEnabled, djEngine, or
  //    audioContext changes.  Owns the node lifecycle and the cleanup teardown.
  //
  //  Effect B — param updates: runs when eqFreq/eqGain/eqQ change.  Never
  //    disconnects the node — just calls setValueAtTime on the existing node.
  //    This avoids the "destroy & recreate on every slider move" glitch.

  // Effect A: node lifecycle
  useEffect(() => {
    if (!audioContext || !djEngine) return;
    const ctx = audioContext;
    const deckBOut = djEngine.deckB.output;
    const cfInputB = djEngine.crossfader.inputB;

    if (!eqEnabled) {
      // Disconnect and remove EQ node if it exists
      if (eqNodeRef.current) {
        try { deckBOut.disconnect(eqNodeRef.current); } catch (_e) { /* */ }
        try { eqNodeRef.current.disconnect(); } catch (_e) { /* */ }
        eqNodeRef.current = null;
      }
      return;
    }

    // Create and wire the node once — subsequent param changes go through
    // Effect B so the node is never torn down while EQ remains enabled.
    if (!eqNodeRef.current) {
      const node = ctx.createBiquadFilter();
      node.type = 'peaking';
      // Apply current param values immediately so the node is in sync even
      // before Effect B fires for the first time.
      node.frequency.setValueAtTime(eqFreq, ctx.currentTime);
      node.gain.setValueAtTime(eqGain, ctx.currentTime);
      node.Q.setValueAtTime(eqQ, ctx.currentTime);
      eqNodeRef.current = node;
      // Wire into signal path once — connecting an already-connected pair
      // creates a duplicate parallel path, so this must only happen here.
      deckBOut.connect(node);
      node.connect(cfInputB);
    }

    return () => {
      // Teardown only when eqEnabled goes false, djEngine changes, or unmount.
      if (eqNodeRef.current) {
        try { deckBOut.disconnect(eqNodeRef.current); } catch (_e) { /* */ }
        try { eqNodeRef.current.disconnect(); } catch (_e) { /* */ }
        eqNodeRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eqEnabled, djEngine, audioContext]); // intentionally excludes eqFreq/eqGain/eqQ

  // Effect B: param updates — never disconnects the node
  useEffect(() => {
    const node = eqNodeRef.current;
    if (!node || !audioContext) return;
    const now = audioContext.currentTime;
    node.frequency.setValueAtTime(eqFreq, now);
    node.gain.setValueAtTime(eqGain, now);
    node.Q.setValueAtTime(eqQ, now);
  }, [eqFreq, eqGain, eqQ, audioContext]);

  // ── Sidechain worklet wiring ──
  // When sidechain is enabled:
  //   deckB.output  ──► workletNode (input 0)
  //   kickBus       ──► workletNode (input 1)   [sidechain trigger]
  //   workletOut    ──► crossfader.inputB
  //
  // When sidechain is disabled: restore the direct connection
  //   deckB.output  ──► crossfader.inputB
  useEffect(() => {
    if (!djEngine || !engine || !audioContext) return;

    mountedRef.current = true;
    const ctx = audioContext;
    const deckBOut = djEngine.deckB.output;
    const cfInputB = djEngine.crossfader.inputB;

    if (!sidechain) {
      // ── Disable: tear down worklet, restore direct connection ──
      const workletNode = scWorkletRef.current;
      const workletOut  = scWorkletOutRef.current;

      if (workletNode) {
        try { deckBOut.disconnect(workletNode); }    catch (_e) { /* already disconnected */ }
        try {
          const kickBus = engine.getPadOutputNode(KICK_PAD_INDEX);
          if (kickBus) kickBus.disconnect(workletNode);
        } catch (_e) { /* already disconnected */ }
        try { workletNode.disconnect(); }            catch (_e) { /* already disconnected */ }
        scWorkletRef.current = null;
      }
      if (workletOut) {
        try { workletOut.disconnect(); } catch (_e) { /* already disconnected */ }
        scWorkletOutRef.current = null;
      }

      // Restore direct connection
      try { deckBOut.connect(cfInputB); } catch (_e) { /* may already be connected */ }
      return;
    }

    // ── Enable: load worklet module (idempotent), create node, wire it ──
    const setupWorklet = async () => {
      // Cancel any previous setup
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      
      try {
        // Ensure the AudioContext is running before adding the module
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        if (!scLoadedRef.current) {
          await ctx.audioWorklet.addModule(SIDECHAIN_WORKLET_URL);
          if (signal.aborted || !mountedRef.current) return;
          scLoadedRef.current = true;
        }

        // Check if still mounted and not aborted
        if (!mountedRef.current || signal.aborted) return;

        // Disconnect the existing direct path so we don't double-feed cfInputB
        try { deckBOut.disconnect(cfInputB); } catch (_e) { /* may already be disconnected */ }

        // Create the worklet node with 2 inputs (main + sidechain) and 1 output
        const workletNode = new AudioWorkletNode(ctx, 'sidechain-compressor-processor', {
          numberOfInputs: 2,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers',
        });

        // Output GainNode (unity) so we have a stable node to disconnect later
        const workletOut = ctx.createGain();
        workletOut.gain.value = 1;

        // Wire: deckB → worklet input 0
        deckBOut.connect(workletNode, 0, 0);

        // Wire: kickBus → worklet input 1 (sidechain trigger)
        const kickBus = engine.getPadOutputNode(KICK_PAD_INDEX);
        if (kickBus) {
          kickBus.connect(workletNode, 0, 1);
        }

        // Wire: worklet output → gain → crossfader inputB
        workletNode.connect(workletOut);
        workletOut.connect(cfInputB);

        // Only update refs if not aborted and still mounted
        if (!signal.aborted && mountedRef.current) {
          scWorkletRef.current = workletNode;
          scWorkletOutRef.current = workletOut;
        } else {
          // Clean up nodes we just created
          workletNode.disconnect();
          workletOut.disconnect();
        }
      } catch (err) {
        if (signal.aborted) return; // Ignore abort errors
        // If worklet loading fails (e.g. browser restriction), fall back to
        // the direct connection so audio is never broken.
        console.error('[Mixer808] Sidechain worklet error:', err);
        try { deckBOut.connect(cfInputB); } catch (_e) { /* ignore */ }
      }
    };

    setupWorklet();

    // Cleanup: when the component unmounts or the deps change before the next
    // effect run, tear down the worklet if it was created.
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      
      const workletNode = scWorkletRef.current;
      const workletOut  = scWorkletOutRef.current;
      if (workletNode) {
        try { deckBOut.disconnect(workletNode); }  catch (_e) { /* ignore */ }
        try {
          const kickBus = engine.getPadOutputNode(KICK_PAD_INDEX);
          if (kickBus) kickBus.disconnect(workletNode);
        } catch (_e) { /* ignore */ }
        try { workletNode.disconnect(); } catch (_e) { /* ignore */ }
        scWorkletRef.current = null;
      }
      if (workletOut) {
        try { workletOut.disconnect(); } catch (_e) { /* ignore */ }
        scWorkletOutRef.current = null;
      }
      // Restore direct connection so audio keeps working during hot-reload
      try { deckBOut.connect(cfInputB); } catch (_e) { /* ignore */ }
    };
   
  }, [sidechain, djEngine, engine, audioContext]);

  const handleSidechainToggle = useCallback(() => {
    setSidechain(prev => !prev);
  }, []);

  return (
    <div className="h-full flex flex-col vignette">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-black text-neutral-400 uppercase tracking-widest">808 Engine</h2>
        <div className="flex items-center gap-2 px-2 py-0.5 rounded-md bg-bg-main/50 border border-border-main">
          <div className={`w-1.5 h-1.5 rounded-full ${sidechain ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse dot-glow' : 'bg-neutral-700'}`}></div>
          <span className="text-xs font-bold font-mono text-neutral-500 uppercase">SC Link</span>
        </div>
      </div>
      
      <div className="flex-1 grid grid-cols-4 gap-2 place-items-center">
        <Knob label="Punch" value={punch} onChange={setPunch} color="#4C83FF" />
        <Knob label="Tune" value={tune} onChange={setTune} min={-12} max={12} color="#4C83FF" />
        <Knob label="Drive" value={drive} onChange={setDrive} color="#FF4C4C" />
        <Knob label="Portamento" value={portamento} onChange={setPortamento} color="#4C83FF" />
      </div>

      <div className="mt-4 flex items-center justify-between bg-neutral-950 p-2 rounded border border-neutral-800 separator-glow">
        <div className="flex items-center gap-2">
          <Link2 className="w-3 h-3 text-neutral-600" />
          <span className="text-[13px] font-mono text-neutral-500 uppercase">Sidechain to Kick</span>
        </div>
        <button 
          onClick={handleSidechainToggle}
          className={`w-8 h-4 rounded-full relative transition-colors ${sidechain ? 'bg-blue-600' : 'bg-neutral-800'}`}
        >
          <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${sidechain ? 'left-4.5' : 'left-0.5'}`}></div>
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-1.5 bg-neutral-950 p-2 rounded border border-neutral-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-3 h-3 text-blue-500" />
            <span className="text-xs font-bold text-neutral-400 uppercase">Insert: Parametric EQ</span>
          </div>
          <button
            onClick={() => setEqEnabled(prev => !prev)}
            className="shrink-0"
            title={eqEnabled ? 'Disable EQ' : 'Enable EQ'}
          >
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${eqEnabled ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)] dot-glow' : 'bg-neutral-600'}`} />
          </button>
        </div>
        {eqEnabled && (
          <div className="flex gap-2 items-center mt-1">
            <div className="flex flex-col items-center flex-1">
              <span className="text-[7px] font-mono text-neutral-600 uppercase">Freq</span>
              <input type="range" min="80" max="12000" value={eqFreq}
                aria-label="EQ Frequency"
                onChange={(e) => setEqFreq(Number(e.target.value))}
                className="w-full h-1 appearance-none accent-blue-500 bg-neutral-800 rounded" />
              <span className="text-[7px] font-mono text-neutral-500">{eqFreq >= 1000 ? `${(eqFreq / 1000).toFixed(1)}k` : eqFreq}</span>
            </div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[7px] font-mono text-neutral-600 uppercase">Gain</span>
              <input type="range" min="-12" max="12" step="0.5" value={eqGain}
                aria-label="EQ Gain"
                onChange={(e) => setEqGain(Number(e.target.value))}
                className="w-full h-1 appearance-none accent-blue-500 bg-neutral-800 rounded" />
              <span className="text-[7px] font-mono text-neutral-500">{eqGain > 0 ? '+' : ''}{eqGain}dB</span>
            </div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[7px] font-mono text-neutral-600 uppercase">Q</span>
              <input type="range" min="0.1" max="18" step="0.1" value={eqQ}
                aria-label="EQ Q"
                onChange={(e) => setEqQ(Number(e.target.value))}
                className="w-full h-1 appearance-none accent-blue-500 bg-neutral-800 rounded" />
              <span className="text-[7px] font-mono text-neutral-500">{eqQ.toFixed(1)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

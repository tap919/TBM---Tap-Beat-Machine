import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { logger } from "../lib/logger";
import {
  TRACK_NAMES,
  DEFAULT_BPM,
  TOTAL_PADS,
  PADS_PER_BANK,
} from "../lib/constants";
import {
  TBMAudioEngine,
  SynthEngine,
  Sequencer,
  Pad,
  PadFilterType,
  Sample,
  createTBMAudioEngine,
  createSynthEngine,
  createSequencer,
  getTBMContext,
  disposeTBMContext,
  NativeAudioOutput,
  DJEngine,
  DJDeck,
  DeckState,
  CrossfaderCurve,
  DJEffectType,
  VinylSimConfig,
  ScratchEvent,
  BPMDetector,
  createDJEngine,
} from "../lib/TBMAudioEngine";
import { TrackRouter } from "../lib/trackRouter";
import { SoundPreviewEngine } from "../lib/soundPreview";
import { disposeGlobalMidiHandler, initializeGlobalMidiHandler } from "../lib/midiHandler";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Context value type
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface TBMAudioContextValue {
  /** Shared TBMAudioEngine â€” sample playback, trigger, analyser */
  engine: TBMAudioEngine | null;
  /** Shared SynthEngine â€” piano roll synth voices */
  synth: SynthEngine | null;
  /** Shared Sequencer â€” step-sequencer clock + pattern playback */
  sequencer: Sequencer | null;
  /** Raw AudioContext for components that need direct access (HatSequencer) */
  audioContext: AudioContext | null;

  // â”€â”€ Pad state (single source of truth for all 64 pads across 4 banks) â”€â”€
  pads: Pad[];
  setPads: (pads: Pad[]) => void;
  updatePad: (padIndex: number, patch: Partial<Pad>) => void;

  // â”€â”€ Sample loading (loads into the shared engine + updates the pad) â”€â”€
  loadSampleToPad: (padIndex: number, file: File) => Promise<void>;

  // â”€â”€ Transport â”€â”€
  triggerPad: (pad: Pad, velocity?: number) => void;

  // â”€â”€ BPM (single source of truth for sequencer clock) â”€â”€
  bpm: number;
  setBpm: (bpm: number) => void;

  // â”€â”€ AudioContext error state â”€â”€
  audioError: string | null;
  /** Attempt to resume a suspended AudioContext (iOS autoplay, etc.) */
  resumeAudio: () => Promise<void>;

  // â”€â”€ Mute / Solo â†’ Sequencer â”€â”€
  /** Push mute/solo state from DrumMachine to Sequencer for playback gating */
  setSequencerMuteState: (muteMap: boolean[], soloSet: Set<number>) => void;

  // â”€â”€ Engine analyser access (for SpectrumAnalyzer) â”€â”€
  /** Returns the engine's persistent AnalyserNode, or null if engine not ready */
  getEngineAnalyser: () => AnalyserNode | null;

  // â”€â”€ MIDI access (shared across components) â”€â”€
  midiAccess: MIDIAccess | null;

  // â”€â”€ Project key (e.g. "Cm", "G#M") â”€â”€
  projectKey: string;
  setProjectKey: (key: string) => void;

  // â”€â”€ Engine log â”€â”€
  engineLog: string[];
  addLog: (entry: string) => void;

  // â”€â”€ Engine reinitialization (after sample rate / buffer size change) â”€â”€
  reinitializeEngine: () => void;

  // â”€â”€ Native audio output (ASIO/WASAPI/DirectSound/CoreAudio via RtAudio) â”€â”€
  /** NativeAudioOutput manager â€” null if not yet initialized */
  nativeOutput: NativeAudioOutput | null;

  // â”€â”€ DJ Engine â”€â”€
  /** DJ Engine instance â€” dual decks, crossfader, effects, scratch, vinyl sim */
  djEngine: DJEngine | null;

  // â”€â”€ Shared Track Router (mixer channel assignments) â”€â”€
  /** TrackRouter â€” shared registry for mixer channel slot assignments */
  trackRouter: TrackRouter;

  // â”€â”€ Shared Sound Preview Engine (audition synthesizer) â”€â”€
  /** SoundPreviewEngine â€” audition synth for chords/melodies before committing */
  previewEngine: SoundPreviewEngine | null;

  /** Load an audio file into a DJ deck */
  loadFileToDeck: (deck: "A" | "B", file: File) => Promise<AudioBuffer | null>;
  /** Load an audio URL into a DJ deck */
  loadUrlToDeck: (deck: "A" | "B", url: string) => Promise<AudioBuffer | null>;

  /** DJ deck transport controls */
  // CTX-5: djPlay is async (needs context resume) â€” interface updated to match
  djPlay: (deck: "A" | "B") => Promise<void>;
  djPause: (deck: "A" | "B") => void;
  djStop: (deck: "A" | "B") => void;

  /** DJ deck state (call from rAF for live position) */
  getDeckState: (deck: "A" | "B") => DeckState | null;

  /** Crossfader: position 0-1 (0=A, 1=B) */
  setCrossfaderPosition: (position: number) => void;
  setCrossfaderCurve: (curve: CrossfaderCurve) => void;

  /** DJ deck volume/EQ */
  setDeckVolume: (deck: "A" | "B", volume: number) => void;
  setDeckEQ: (deck: "A" | "B", low: number, mid: number, high: number) => void;
  setDeckBpm: (deck: "A" | "B", bpm: number) => void;
  setDeckPlaybackRate: (deck: "A" | "B", rate: number) => void;

  /** Scratch control */
  startScratch: (deck: "A" | "B") => void;
  endScratch: (deck: "A" | "B") => void;
  processScratch: (deck: "A" | "B", measurement: number, dt: number) => void;

  /** Vinyl simulation config */
  setVinylConfig: (deck: "A" | "B", config: Partial<VinylSimConfig>) => void;

  /** Effects chain */
  setDeckEffect: (
    deck: "A" | "B",
    slot: number,
    type: DJEffectType,
    params?: Record<string, number>,
  ) => void;
  setDeckEffectEnabled: (
    deck: "A" | "B",
    slot: number,
    enabled: boolean,
  ) => void;
  setDeckEffectWetDry: (deck: "A" | "B", slot: number, wetDry: number) => void;
  setDeckEffectParam: (
    deck: "A" | "B",
    slot: number,
    param: string,
    value: number,
  ) => void;

  /** Sync */
  enableSync: (leader?: "A" | "B") => void;
  disableSync: () => void;

  /** Auto-scratch */
  renderAutoScratch: (
    sourceBuffer: AudioBuffer,
    events: ScratchEvent[],
    bpm: number,
    intensity?: "low" | "medium" | "high",
    swing?: number,
  ) => Promise<AudioBuffer | null>;

  /** BPM detection */
  detectBpm: (buffer: AudioBuffer) => number;

  /** Master volume */
  setDJMasterVolume: (volume: number) => void;

  /** Cue points */
  setDeckCuePoint: (deck: "A" | "B", time?: number) => void;
  jumpToDeckCue: (deck: "A" | "B", index: number) => void;

  /** Loop */
  setDeckLoop: (deck: "A" | "B", start: number, end: number) => void;
  clearDeckLoop: (deck: "A" | "B") => void;
}

const TBMAudioCtx = createContext<TBMAudioContextValue | null>(null);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Hook for consumers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function useTBMAudio(): TBMAudioContextValue {
  const ctx = useContext(TBMAudioCtx);
  if (!ctx)
    throw new Error("useTBMAudio must be used inside <TBMAudioProvider>");
  return ctx;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Build default 64 pads (4 banks x 16)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildDefaultPads(count: number = TOTAL_PADS): Pad[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: TRACK_NAMES[i % PADS_PER_BANK] ?? `Pad ${i + 1}`,
    sample: null,
    volume: 0.8,
    pan: 0,
    pitch: 0,
    attack: 0.001,
    release: 0.1,
    reverse: false,
    start: 0,
    end: 1,
    loop: false,
    filterType: "off" as PadFilterType,
    filterCutoff: 64,
    filterResonance: 20,
    chokeGroup: null,
    swing: 0,
    timeStretch: 1,
    pitchShift: 0,
  }));
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Provider
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function TBMAudioProvider({ children }: { children: React.ReactNode }) {
  const [engine, setEngine] = useState<TBMAudioEngine | null>(null);
  const [synth, setSynth] = useState<SynthEngine | null>(null);
  const [sequencer, setSequencer] = useState<Sequencer | null>(null);
  const [djEngine, setDjEngine] = useState<DJEngine | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [nativeOutput, setNativeOutput] = useState<NativeAudioOutput | null>(null);
  const [pads, setPadsState] = useState<Pad[]>(buildDefaultPads);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
  const [projectKey, setProjectKey] = useState<string>("Cm");
  const [engineLog, setEngineLog] = useState<string[]>([]);
  const [bpm, setBpmState] = useState(DEFAULT_BPM);

  const initialized = useRef(false);
  // Keep a ref to pads so callbacks always see the latest
  const padsRef = useRef(pads);

  // â”€â”€ Shared TrackRouter (singleton, no AudioContext dependency) â”€â”€
  const trackRouterRef = useRef<TrackRouter>(new TrackRouter());

  // â”€â”€ Shared SoundPreviewEngine (recreated when AudioContext changes) â”€â”€
  const [previewEngine, setPreviewEngine] = useState<SoundPreviewEngine | null>(null);
  const previewEngineRef = useRef<SoundPreviewEngine | null>(null);

  // DJ engine ref for stable callback access
  const djEngineRef = useRef<DJEngine | null>(null);
  // Native audio output ref for cleanup
  const nativeOutputRef = useRef<NativeAudioOutput | null>(null);
  // Master bus GainNode ref â€” shared tap point for all engines
  const masterBusRef = useRef<GainNode | null>(null);

  // â”€â”€ Refs for engine instances â€” used in cleanup to avoid stale closures â”€â”€
  // CTX-1 fix: store the actual instances in refs so the cleanup effect
  // can dispose precisely what it created, regardless of React re-render order
  const engineRef = useRef<TBMAudioEngine | null>(null);
  const synthRef = useRef<SynthEngine | null>(null);
  const sequencerRef2 = useRef<Sequencer | null>(null);

  // â”€â”€ Sync pads to sequencer outside of setState updater (avoids double-render) â”€â”€
  const sequencerRef = useRef(sequencer);

  // Update refs after render to avoid updating during render
  useEffect(() => {
    padsRef.current = pads;
  }, [pads]);
  useEffect(() => {
    sequencerRef.current = sequencer;
  }, [sequencer]);

  useEffect(() => {
    sequencerRef.current?.setPads(pads);
  }, [pads]);

  // â”€â”€ Init engine + sequencer + synth + DJ engine once â”€â”€
  useEffect(() => {
    // CTX-4: In React StrictMode, effects run twice (mount â†’ unmount â†’ mount).
    // The initialized.current guard prevents the second mount from creating
    // duplicate engines, but we also need the CLEANUP to run on the FIRST
    // unmount so the second mount starts clean. We track whether this specific
    // effect invocation created the engines so only that invocation cleans them up.
    let thisInvocationOwnsEngines = false;

    if (initialized.current) return;
    initialized.current = true;
    thisInvocationOwnsEngines = true;

    try {
      const eng = createTBMAudioEngine();
      const seq = createSequencer(eng);
      const syn = createSynthEngine();
      const ctx = getTBMContext();
      const dj = createDJEngine();

      // â”€â”€ Master bus: shared GainNode that all engines route through â”€â”€
      // This enables NativeAudioOutput to capture the combined mix from
      // a single tap point rather than intercepting each engine individually.
      const bus = ctx.createGain();
      bus.gain.value = 1.0;
      bus.connect(ctx.destination);

      // Reroute each engine's final output through the master bus
      eng.rerouteOutput(bus);
      syn.rerouteOutput(bus);
      dj.rerouteOutput(bus);

      masterBusRef.current = bus;

      // Wire TrackRouter audio nodes to the master bus so each mixer
      // channel slot has a real GainNode â†’ StereoPannerNode â†’ master path
      trackRouterRef.current.connectAudio(ctx, bus);

      // â”€â”€ NativeAudioOutput: manages Web Audio â†’ IPC â†’ native driver â”€â”€
      const natOut = new NativeAudioOutput(ctx, bus);
      nativeOutputRef.current = natOut;

      djEngineRef.current = dj;
      // CTX-1/CTX-3: store in refs so cleanup always disposes the right instances
      engineRef.current = eng;
      synthRef.current = syn;
      sequencerRef2.current = seq;

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEngine(eng);
      setSequencer(seq);
      setSynth(syn);
      setDjEngine(dj);
      setAudioContext(ctx);
      setNativeOutput(natOut);
      setAudioError(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "AudioContext creation failed";
      setAudioError(msg);
      logger.error("[TBMAudioProvider] Init error:", err instanceof Error ? err : new Error(String(err)));
    }

    // â”€â”€ MIDI access bootstrap â”€â”€
    // CTX-11: track mount state so we don't call setState after unmount
    let midiMounted = true;
    if (typeof navigator !== "undefined" && "requestMIDIAccess" in navigator) {
      navigator
        .requestMIDIAccess({ sysex: false })
        .then((access) => {
          if (midiMounted) setMidiAccess(access);
        })
        .catch((err) => {
          logger.warn("[TBMAudioProvider] MIDI access denied:", undefined, err instanceof Error ? err : new Error(String(err)));
          // Surface MIDI denial to the user via audioError state so the UI
          // can display a meaningful message instead of silently failing.
          if (midiMounted) {
            setAudioError(`MIDI access denied: ${err instanceof Error ? err.message : String(err)}`);
          }
        });
    }

    return () => {
      midiMounted = false;
      // CTX-4: only dispose if this invocation created the engines
      if (!thisInvocationOwnsEngines) return;
      initialized.current = false;
      // CTX-1: dispose via refs, not stale closure state values
      // NativeAudioOutput.dispose() is async â€” fire-and-forget with error logging
      // (React cleanup callbacks must be synchronous).
      nativeOutputRef.current?.dispose().catch((e: unknown) => {
        console.warn('[TBMAudio] cleanup: nativeOutput dispose error', e);
      });
      sequencerRef2.current?.dispose();
      engineRef.current?.dispose();
      synthRef.current?.dispose();
      djEngineRef.current?.dispose();
      disposeGlobalMidiHandler();
      nativeOutputRef.current = null;
      masterBusRef.current = null;
      sequencerRef2.current = null;
      engineRef.current = null;
      synthRef.current = null;
      djEngineRef.current = null;
    };
  }, []);  

  // â”€â”€ Create / recreate SoundPreviewEngine when AudioContext or masterBus changes â”€â”€
  useEffect(() => {
    if (!audioContext) return;
    // Dispose previous engine if any
    previewEngineRef.current?.dispose();
    const output = masterBusRef.current ?? audioContext.destination;
    const pe = new SoundPreviewEngine(audioContext, output);
    previewEngineRef.current = pe;
    setPreviewEngine(pe);
    return () => {
      pe.dispose();
      if (previewEngineRef.current === pe) {
        previewEngineRef.current = null;
      }
    };
  }, [audioContext]);

  // â”€â”€ Cleanup on true unmount â”€â”€
  // CTX-1: The individual cleanup effect with [engine, sequencer, synth, djEngine]
  // deps was firing whenever ANY one changed, disposing ALL four. Removed in favour
  // of the ref-based cleanup inside the init effect above.

  // â”€â”€ Engine log helper (ring buffer of last 50 entries) â”€â”€
  // CTX-17: avoid double-allocation; build the new entry string once and
  // use a single slice instead of spread-then-slice.
  const addLog = useCallback((entry: string) => {
    const line = `[${new Date().toISOString().slice(11, 23)}] ${entry}`;
    setEngineLog((prev) => {
      // Ring buffer: keep at most 50 entries. Single concat + slice avoids
      // two allocations (spread + slice).
      const next = prev.concat(line);
      return next.length > 50 ? next.slice(-50) : next;
    });
  }, []);

  // â”€â”€ BPM callback + sync to sequencer â”€â”€
  // CTX-16: validate bpm â€” reject NaN, zero, negative, and unreasonable values
  const setBpm = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0 || value > 999) return;
    setBpmState(value);
  }, []);

  useEffect(() => {
    sequencer?.setBpm(bpm);
  }, [bpm, sequencer]);

  // â”€â”€ Engine reinitialization â”€â”€
  // CTX-2/CTX-3: Use refs (not stale closure captures) to dispose, and also
  // reinitialize synth + djEngine which were previously left on a dead AudioContext.
  const reinitializeEngine = useCallback(() => {
    try {
      // â”€â”€ Phase 1: capture sample data before disposing old instances â”€â”€
      const sampleSnapshots = engineRef.current?.exportSampleBuffers() ?? [];
      const currentPads = padsRef.current;

      // Dispose ALL old instances via refs (CTX-3: avoid stale `engine` closure)
      // NativeAudioOutput.dispose() is async â€” fire-and-forget with error logging.
      nativeOutputRef.current?.dispose().catch((e: unknown) => {
        console.warn('[TBMAudio] reinit: nativeOutput dispose error', e);
      });
      sequencerRef2.current?.dispose();
      engineRef.current?.dispose();
      synthRef.current?.dispose();
      djEngineRef.current?.dispose();
      disposeGlobalMidiHandler();

      // Close the old AudioContext singleton so getTBMContext() creates a
      // fresh one with the latest audio options (sampleRate, latencyHint).
      disposeTBMContext();

      const eng = createTBMAudioEngine();
      const seq = createSequencer(eng);
      const syn = createSynthEngine();
      const ctx = getTBMContext();
      const dj = createDJEngine();

      // â”€â”€ Phase 2: restore sample data into new engine â”€â”€
      if (sampleSnapshots.length > 0) {
        eng.restoreSampleBuffers(sampleSnapshots);
      }

      // â”€â”€ Phase 3: update pad state to reference restored buffers â”€â”€
      const sampleMap = eng.getSamples();
      const restoredPads = currentPads.map(pad => {
        if (pad.sample?.id && sampleMap.has(pad.sample.id)) {
          return { ...pad, sample: { ...pad.sample, buffer: sampleMap.get(pad.sample.id)! } };
        }
        return pad;
      });

      // â”€â”€ Master bus: reroute all engines through shared tap point â”€â”€
      const bus = ctx.createGain();
      bus.gain.value = 1.0;
      bus.connect(ctx.destination);
      eng.rerouteOutput(bus);
      syn.rerouteOutput(bus);
      dj.rerouteOutput(bus);
      masterBusRef.current = bus;

      // Wire TrackRouter audio nodes to the new master bus
      trackRouterRef.current.connectAudio(ctx, bus);

      // â”€â”€ NativeAudioOutput â”€â”€
      const natOut = new NativeAudioOutput(ctx, bus);
      nativeOutputRef.current = natOut;

      seq.setPads(restoredPads);

      // Update refs first (CTX-3: keep refs current before state updates)
      engineRef.current = eng;
      sequencerRef2.current = seq;
      synthRef.current = syn;
      djEngineRef.current = dj;

      // CTX-2: set ALL four engines so none are left on the dead AudioContext
      setEngine(eng);
      setSequencer(seq);
      setSynth(syn);
      setDjEngine(dj);
      setAudioContext(ctx);
      setNativeOutput(natOut);
      setAudioError(null);
      setPadsState(restoredPads);
      // Re-initialize MIDI handler after engine reinit (fixes M5)
      initializeGlobalMidiHandler().catch((e: unknown) => {
        console.warn('[TBMAudio] reinit: MIDI init error', e);
      });
      addLog("Engine reinitialized");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Engine reinitialization failed";
      setAudioError(msg);
      addLog(`Engine reinitialization error: ${msg}`);
    }
  }, [addLog]); // CTX-3: no longer depends on stale `engine` â€” uses refs instead

  // â”€â”€ Keep sequencer pad references in sync â”€â”€
  // NOTE: sequencer sync is handled by the useEffect above watching `pads`,
  // so we do NOT call sequencer.setPads() inside state updaters (avoids double-render).
  const setPads = useCallback((newPads: Pad[]) => {
    setPadsState(newPads);
  }, []);

  const updatePad = useCallback((padIndex: number, patch: Partial<Pad>) => {
    // CTX-6: bounds check â€” silently ignore out-of-range indices
    if (padIndex < 0 || padIndex >= TOTAL_PADS) {
      logger.warn(`[TBMAudioContext] updatePad: index ${padIndex} out of range`);
      return;
    }
    setPadsState((prev) => {
      const next = [...prev];
      // Guard against sparse array: if the pad at this index doesn't exist
      // (e.g. array was truncated), skip the update to prevent spreading undefined.
      if (!next[padIndex]) return prev;
      next[padIndex] = { ...next[padIndex], ...patch };
      return next;
    });
  }, []);

  // â”€â”€ Load a sample file into a specific pad â”€â”€
  const loadSampleToPad = useCallback(
    async (padIndex: number, file: File) => {
      // CTX-7: bounds check
      if (padIndex < 0 || padIndex >= TOTAL_PADS) {
        logger.warn(`[TBMAudioContext] loadSampleToPad: index ${padIndex} out of range`);
        return;
      }
      // CTX-12: capture engine from ref to avoid stale closure during reinit race
      const eng = engineRef.current;
      if (!eng) return;

      const ctx = eng.getContext();
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch (err) {
          // CTX-15: log resume failure instead of silently ignoring
          logger.warn("[TBMAudioContext] loadSampleToPad: failed to resume AudioContext:", undefined, err instanceof Error ? err : new Error(String(err)));
        }
      }

      let buffer: AudioBuffer | null = null;
      try {
        const sampleId = `pad-${padIndex}-${Date.now()}`;
        buffer = await eng.loadSampleFromFile(sampleId, file);
        if (!buffer) return;

        const sample: Sample = {
          id: sampleId,
          name: file.name,
          buffer,
          category: "user",
        };

        setPadsState((prev) => {
          const next = [...prev];
          next[padIndex] = { ...next[padIndex], sample };
          return next;
        });
      } catch (err) {
        // CTX-7: surface errors instead of silently ignoring
        logger.error("[TBMAudioContext] loadSampleToPad failed:", err instanceof Error ? err : new Error(String(err)));
      }
    },
    [], // CTX-12: no dependency on `engine` state â€” uses ref to avoid stale closures
  );

  // â”€â”€ Trigger a pad through the shared engine â”€â”€
  const triggerPad = useCallback(
    (pad: Pad, velocity: number = 1) => {
      const eng = engineRef.current;
      if (!eng) return;
      const ctx = eng.getContext();
      // CTX-13: handle "interrupted" state (iOS Safari) in addition to "suspended"
      if (ctx.state === "suspended" || (ctx.state as string) === "interrupted") {
        ctx
          .resume()
          .then(() => {
            eng.triggerPad(pad, velocity);
          })
          .catch((err) => {
            logger.warn(
              "[TBMAudioContext] Failed to resume AudioContext before triggerPad:",
              undefined,
              err instanceof Error ? err : new Error(String(err)),
            );
          });
      } else {
        eng.triggerPad(pad, velocity);
      }
    },
    [],
  );

  // â”€â”€ Resume suspended AudioContext â”€â”€
  const resumeAudio = useCallback(async () => {
    if (!audioContext) return;
    try {
      await audioContext.resume();
      setAudioError(null);
    } catch (err) {
      // CTX-14: surface resume errors to the user via audioError state
      const msg =
        err instanceof Error ? err.message : "Failed to resume AudioContext";
      setAudioError(msg);
      logger.error("[TBMAudioContext] resumeAudio failed:", err instanceof Error ? err : new Error(String(err)));
    }
  }, [audioContext]);

  // â”€â”€ Mute/Solo â†’ Sequencer â”€â”€
  const setSequencerMuteState = useCallback(
    (muteMap: boolean[], soloSet: Set<number>) => {
      sequencerRef.current?.setMuteState(muteMap, soloSet);
    },
    [],
  );

  // â”€â”€ Engine analyser access â”€â”€
  const getEngineAnalyser = useCallback((): AnalyserNode | null => {
    return engineRef.current?.getAnalyser() ?? null;
  }, []);

  // â”€â”€ DJ Engine helpers â”€â”€

  const getDeck = useCallback((deck: "A" | "B"): DJDeck | null => {
    const dj = djEngineRef.current;
    if (!dj) return null;
    return deck === "A" ? dj.deckA : dj.deckB;
  }, []);

  const ensureContextRunning = useCallback(async () => {
    const dj = djEngineRef.current;
    if (!dj) return;
    const ctx = dj.getContext();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (err) {
        logger.warn(
          "[TBMAudioContext] ensureContextRunning failed to resume AudioContext:",
          undefined,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }, []);

  // â”€â”€ DJ Load â”€â”€

  const loadFileToDeck = useCallback(
    async (deck: "A" | "B", file: File): Promise<AudioBuffer | null> => {
      const d = getDeck(deck);
      if (!d) return null;
      await ensureContextRunning();
      return d.loadFile(file);
    },
    [getDeck, ensureContextRunning],
  );

  const loadUrlToDeck = useCallback(
    async (deck: "A" | "B", url: string): Promise<AudioBuffer | null> => {
      const d = getDeck(deck);
      if (!d) return null;
      await ensureContextRunning();
      return d.loadUrl(url);
    },
    [getDeck, ensureContextRunning],
  );

  // â”€â”€ DJ Transport â”€â”€

  const djPlay = useCallback(
    async (deck: "A" | "B") => {
      await ensureContextRunning();
      getDeck(deck)?.play();
    },
    [getDeck, ensureContextRunning],
  );

  const djPause = useCallback(
    (deck: "A" | "B") => {
      getDeck(deck)?.pause();
    },
    [getDeck],
  );

  const djStop = useCallback(
    (deck: "A" | "B") => {
      getDeck(deck)?.stop();
    },
    [getDeck],
  );

  const getDeckState = useCallback(
    (deck: "A" | "B"): DeckState | null => {
      return getDeck(deck)?.getState() ?? null;
    },
    [getDeck],
  );

  // â”€â”€ Crossfader â”€â”€

  const setCrossfaderPosition = useCallback((position: number) => {
    djEngineRef.current?.crossfader.setPosition(position);
  }, []);

  const setCrossfaderCurve = useCallback((curve: CrossfaderCurve) => {
    djEngineRef.current?.crossfader.setCurve(curve);
  }, []);

  // â”€â”€ Deck Volume / EQ / Rate â”€â”€

  const setDeckVolume = useCallback(
    (deck: "A" | "B", volume: number) => {
      getDeck(deck)?.setVolume(volume);
    },
    [getDeck],
  );

  const setDeckEQ = useCallback(
    (deck: "A" | "B", low: number, mid: number, high: number) => {
      getDeck(deck)?.eq.setGains(low, mid, high);
    },
    [getDeck],
  );

  const setDeckBpm = useCallback(
    (deck: "A" | "B", bpm: number) => {
      getDeck(deck)?.setBpm(bpm);
    },
    [getDeck],
  );

  const setDeckPlaybackRate = useCallback(
    (deck: "A" | "B", rate: number) => {
      getDeck(deck)?.setPlaybackRate(rate);
    },
    [getDeck],
  );

  // â”€â”€ Scratch â”€â”€

  const startScratchCb = useCallback(
    (deck: "A" | "B") => {
      getDeck(deck)?.startScratch();
    },
    [getDeck],
  );

  const endScratchCb = useCallback(
    (deck: "A" | "B") => {
      getDeck(deck)?.endScratch();
    },
    [getDeck],
  );

  const processScratchCb = useCallback(
    (deck: "A" | "B", measurement: number, dt: number) => {
      getDeck(deck)?.processScratch(measurement, dt);
    },
    [getDeck],
  );

  // â”€â”€ Vinyl Simulation â”€â”€

  const setVinylConfig = useCallback(
    (deck: "A" | "B", config: Partial<VinylSimConfig>) => {
      getDeck(deck)?.vinyl.setConfig(config);
    },
    [getDeck],
  );

  // â”€â”€ Effects â”€â”€

  const setDeckEffect = useCallback(
    (
      deck: "A" | "B",
      slot: number,
      type: DJEffectType,
      params?: Record<string, number>,
    ) => {
      getDeck(deck)?.effects.setSlotEffect(slot, type, params);
    },
    [getDeck],
  );

  const setDeckEffectEnabled = useCallback(
    (deck: "A" | "B", slot: number, enabled: boolean) => {
      getDeck(deck)?.effects.setSlotEnabled(slot, enabled);
    },
    [getDeck],
  );

  const setDeckEffectWetDry = useCallback(
    (deck: "A" | "B", slot: number, wetDry: number) => {
      getDeck(deck)?.effects.setSlotWetDry(slot, wetDry);
    },
    [getDeck],
  );

  const setDeckEffectParam = useCallback(
    (deck: "A" | "B", slot: number, param: string, value: number) => {
      getDeck(deck)?.effects.setSlotParam(slot, param, value);
    },
    [getDeck],
  );

  // â”€â”€ Sync â”€â”€

  const enableSyncCb = useCallback((leader: "A" | "B" = "A") => {
    djEngineRef.current?.enableSync(leader);
  }, []);

  const disableSyncCb = useCallback(() => {
    djEngineRef.current?.disableSync();
  }, []);

  // â”€â”€ Auto-Scratch â”€â”€

  const renderAutoScratch = useCallback(
    async (
      sourceBuffer: AudioBuffer,
      events: ScratchEvent[],
      bpm: number,
      intensity: "low" | "medium" | "high" = "medium",
      swing: number = 0,
    ): Promise<AudioBuffer | null> => {
      const dj = djEngineRef.current;
      if (!dj) return null;
      try {
        return await dj.autoScratch.render(
          sourceBuffer,
          events,
          bpm,
          intensity,
          swing,
        );
      } catch (err) {
        logger.error("[TBMAudioContext] Auto-scratch render failed:", err instanceof Error ? err : new Error(String(err)));
        return null;
      }
    },
    [],
  );

  // â”€â”€ BPM Detection â”€â”€

  const detectBpm = useCallback((buffer: AudioBuffer): number => {
    return BPMDetector.detect(buffer);
  }, []);

  // â”€â”€ DJ Master Volume â”€â”€

  const setDJMasterVolume = useCallback((volume: number) => {
    djEngineRef.current?.setMasterVolume(volume);
  }, []);

  // â”€â”€ Cue Points â”€â”€

  const setDeckCuePoint = useCallback(
    (deck: "A" | "B", time?: number) => {
      getDeck(deck)?.setCuePoint(time);
    },
    [getDeck],
  );

  const jumpToDeckCue = useCallback(
    (deck: "A" | "B", index: number) => {
      getDeck(deck)?.jumpToCue(index);
    },
    [getDeck],
  );

  // â”€â”€ Loop â”€â”€

  const setDeckLoop = useCallback(
    (deck: "A" | "B", start: number, end: number) => {
      getDeck(deck)?.setLoop(start, end);
    },
    [getDeck],
  );

  const clearDeckLoop = useCallback(
    (deck: "A" | "B") => {
      getDeck(deck)?.clearLoop();
    },
    [getDeck],
  );

  const trackRouter = trackRouterRef.current;

  const value = useMemo<TBMAudioContextValue>(
    () => ({
      engine,
      synth,
      sequencer,
      audioContext,
      pads,
      setPads,
      updatePad,
      loadSampleToPad,
      triggerPad,
      audioError,
      resumeAudio,
      setSequencerMuteState,
      getEngineAnalyser,
      midiAccess,
      projectKey,
      setProjectKey,
      engineLog,
      addLog,
      reinitializeEngine,
      nativeOutput,
      bpm,
      setBpm,
      // DJ Engine
      djEngine,
      // Track Router & Sound Preview
      trackRouter,
      previewEngine,
      loadFileToDeck,
      loadUrlToDeck,
      djPlay,
      djPause,
      djStop,
      getDeckState,
      setCrossfaderPosition,
      setCrossfaderCurve,
      setDeckVolume,
      setDeckEQ,
      setDeckBpm,
      setDeckPlaybackRate,
      startScratch: startScratchCb,
      endScratch: endScratchCb,
      processScratch: processScratchCb,
      setVinylConfig,
      setDeckEffect,
      setDeckEffectEnabled,
      setDeckEffectWetDry,
      setDeckEffectParam,
      enableSync: enableSyncCb,
      disableSync: disableSyncCb,
      renderAutoScratch,
      detectBpm,
      setDJMasterVolume,
      setDeckCuePoint,
      jumpToDeckCue,
      setDeckLoop,
      clearDeckLoop,
    }),
    [
      engine,
      synth,
      sequencer,
      audioContext,
      pads,
      setPads,
      updatePad,
      loadSampleToPad,
      triggerPad,
      audioError,
      resumeAudio,
      setSequencerMuteState,
      getEngineAnalyser,
      midiAccess,
      projectKey,
      setProjectKey,
      engineLog,
      addLog,
      reinitializeEngine,
      nativeOutput,
      bpm,
      setBpm,
      djEngine,
      previewEngine,
      loadFileToDeck,
      loadUrlToDeck,
      djPlay,
      djPause,
      djStop,
      getDeckState,
      setCrossfaderPosition,
      setCrossfaderCurve,
      setDeckVolume,
      setDeckEQ,
      setDeckBpm,
      setDeckPlaybackRate,
      startScratchCb,
      endScratchCb,
      processScratchCb,
      setVinylConfig,
      setDeckEffect,
      setDeckEffectEnabled,
      setDeckEffectWetDry,
      setDeckEffectParam,
      enableSyncCb,
      disableSyncCb,
      renderAutoScratch,
      detectBpm,
      setDJMasterVolume,
      setDeckCuePoint,
      jumpToDeckCue,
      setDeckLoop,
      clearDeckLoop,
    ],
  );

  return <TBMAudioCtx.Provider value={value}>{children}</TBMAudioCtx.Provider>;
}





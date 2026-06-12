import { logger } from "../lib/logger";

// ── Re-exports from audio submodules ───────────────────────────────────────
export type {
  BounceFormat,
  Mp3Bitrate,
  BounceConfig,
  BounceResult,
} from "../lib/audio/bounceEngine";
export { BounceEngine } from "../lib/audio/bounceEngine";

export type { BeatMarker, BeatGrid } from "../lib/audio/bpmDetector";
export { BPMDetector } from "../lib/audio/bpmDetector";

export type { CrossfaderCurve } from "../lib/audio/crossfaderEngine";
export { CrossfaderEngine } from "../lib/audio/crossfaderEngine";

export type { DeckState } from "../lib/audio/djDeck";
export { DJDeck } from "../lib/audio/djDeck";

export type { DJEffectType, DJEffectSlot } from "../lib/audio/djEffectsChain";
export { DJEffectsChain, DJEffectSlotNode } from "../lib/audio/djEffectsChain";

export { DJEngine, createDJEngine } from "../lib/audio/djEngine";

export { NativeAudioOutput } from "../lib/audio/nativeOutput";
export type { NativeOutputMode } from "../lib/audio/nativeOutput";

export type { ScratchEvent } from "../lib/audio/scratchEngine";
export { ScratchEngineCore } from "../lib/audio/scratchEngine";

export type { SequencerState } from "../lib/audio/sequencer";
export { Sequencer, createSequencer } from "../lib/audio/sequencer";

export type { SynthSettings, VoiceState, VoiceStealStrategy } from "../lib/audio/synthEngine";
export { VoicePool, SynthEngine } from "../lib/audio/synthEngine";

export { ThreeBandEQ } from "../lib/audio/threeBandEQ";

export type { VinylSimConfig } from "../lib/audio/vinylSimulation";
export { VinylSimulation } from "../lib/audio/vinylSimulation";

export { VstInsertChain } from "../lib/audio/vstInsertChain";

export { AutoScratchRenderer } from "../lib/audio/autoScratch";

export type { BusFXSlot } from "../lib/audio/busFxRack";
export { BusFXRack } from "../lib/audio/busFxRack";

export type {
  ModSourceType,
  ModDestinationType,
  ModSource,
  ModDestination,
  ModRoute,
  SerializedModRoute,
} from "../lib/audio/modMatrix";
export {
  ModMatrixEngine,
  createDefaultSourceLfo1,
  createDefaultSourceLfo2,
  createDefaultSourceVelocity,
  createDefaultSourceModWheel,
  createDefaultSourcePitchWheel,
  createDefaultSourceAftertouch,
  createDefaultSourceKeyFollow,
  createDefaultSourceRandom,
  createDefaultDestinationOscPitch,
  createDefaultDestinationOscPw,
  createDefaultDestinationFilterCutoff,
  createDefaultDestinationFilterResonance,
  createDefaultDestinationAmpVolume,
  createDefaultDestinationPan,
  createDefaultDestinationLfoRate,
  createDefaultDestinationLfoAmount,
} from "../lib/audio/modMatrix";

export type { AudioDeviceInfo } from "../lib/NativeAudioBridge";

function safeSetParam(param: { value: number; setValueAtTime?: (v: number, t: number) => void }, value: number, time: number): void {
  if (typeof param.setValueAtTime === "function") {
    param.setValueAtTime(value, time);
  } else {
    param.value = value;
  }
}

// ── Core types ────────────────────────────────────────────────────────────

export type PadFilterType = "off" | "lp" | "hp" | "bp";

export interface Sample {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  category: string;
  dataUri?: string;
}

export interface Pad {
  id: number;
  name: string;
  sample: Sample | null;
  volume: number;
  pan: number;
  pitch: number;
  attack: number;
  release: number;
  filterType: PadFilterType;
  filterCutoff: number;
  filterResonance: number;
  start: number;
  end: number;
  loop: boolean;
  reverse: boolean;
  chokeGroup: number | null;
  swing: number;
  timeStretch: number;
  pitchShift: number;
}

export type AudioEventType =
  | "sampleLoaded"
  | "playbackStarted"
  | "playbackStopped"
  | "padTriggered"
  | "bpmChanged"
  | "loopChanged"
  | "recordingStateChanged"
  | "masterVolumeChanged"
  | "error";

// ── TBMAudioEngine class ────────────────────────────────────────────────────

type PolyMode = "mono" | "legato" | "poly";

interface EngineOptions {
  sampleRate?: number;
  latencyHint?: AudioContextLatencyCategory;
}

interface PadRoutingState {
  gain: GainNode;
  panner: StereoPannerNode;
  filter: BiquadFilterNode | null;
  active: Set<AudioBufferSourceNode>;
  lastVolume: number;
  lastPan: number;
  lastFilterCutoff: number;
  lastFilterType: PadFilterType;
}

export class TBMAudioEngine {
  private _context: AudioContext;
  masterGain: GainNode;
  private masterCompressor: DynamicsCompressorNode;
  private analyser: AnalyserNode;
  private analyserData: Uint8Array;
  private samples: Map<string, AudioBuffer> = new Map();
  private padRoutings: Map<number, PadRoutingState> = new Map();
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private polyMode: PolyMode = "poly";
  private disposed: boolean = false;
  private lastAnalyserTime: number = -999;
  private readonly ANALYSER_THROTTLE_MS: number = 33;
  private reverseBufferCache = new WeakMap<AudioBuffer, AudioBuffer>();
  private lfoNodes: OscillatorNode[] | null = null;
  private _sampleRate: number;
  private padStartOffsets: Map<number, number> = new Map();
  private padAdsrValues: Map<number, { a: number; d: number; s: number; r: number }> = new Map();

  constructor(context: AudioContext) {
    this._context = context;
    this._sampleRate = context.sampleRate;

    this.masterCompressor = context.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -6;
    this.masterCompressor.knee.value = 30;
    this.masterCompressor.ratio.value = 4;

    this.masterGain = context.createGain();
    this.masterGain.gain.value = 0.85;

    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);

    this.masterCompressor.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(context.destination);
  }

  getContext(): AudioContext {
    return this._context;
  }

  get sampleRate(): number {
    return this._sampleRate;
  }

  rerouteOutput(masterBus: GainNode): void {
    try {
      this.analyser.disconnect();
    } catch { /* not connected */ }
    this.analyser.connect(masterBus);
  }

  addSample(id: string, buffer: AudioBuffer): void {
    this.samples.set(id, buffer);
  }

  getSample(id: string): AudioBuffer | undefined {
    return this.samples.get(id);
  }

  removeSample(id: string): void {
    this.samples.delete(id);
  }

  clearSamples(): void {
    this.samples.clear();
  }

  triggerPad(pad: Pad, velocity: number = 1, when?: number): void {
    if (this.disposed) return;

    const buffer = pad.sample?.buffer ?? this.samples.get(pad.sample?.id ?? "");
    if (!buffer) return;

    let sourceBuffer = buffer;

    if (pad.reverse) {
      sourceBuffer = this.reverseBuffer(buffer);
    }

    const ctx = this._context;
    const source = ctx.createBufferSource();
    source.buffer = sourceBuffer;
    source.playbackRate.value = pad.timeStretch ?? 1;

    const padKey = typeof pad.id === "number" ? pad.id : 0;
    const storedOffset = this.padStartOffsets.get(padKey) ?? pad.start ?? 0;
    const startOffset = storedOffset * buffer.duration;
    const endPos = (pad.end ?? 1) * buffer.duration;
    const duration = endPos - startOffset;
    const scheduledTime = when ?? ctx.currentTime;

    const routing = this.getOrCreatePadRouting(padKey);
    routing.lastVolume = pad.volume;
    routing.lastPan = pad.pan;
    routing.lastFilterCutoff = pad.filterCutoff;
    routing.lastFilterType = pad.filterType;

    const gainValue = pad.volume * velocity;
    safeSetParam(routing.gain.gain, gainValue, scheduledTime);
    safeSetParam(routing.panner.pan, pad.pan, scheduledTime);

    // Apply ADSR envelope: insert per-source GainNode with scheduled ramps
    const adsr = this.padAdsrValues.get(padKey) ?? {
      a: pad.attack ?? 0.001,
      d: 0.1,
      s: 1.0,
      r: pad.release ?? 0.1,
    };
    const voiceGain = ctx.createGain();
    const startTime = scheduledTime;
    const endTime = startTime + duration;

    voiceGain.gain.setValueAtTime(0, startTime);
    voiceGain.gain.linearRampToValueAtTime(1, startTime + adsr.a);
    voiceGain.gain.setValueAtTime(Math.max(0.001, adsr.s), startTime + adsr.a + adsr.d);
    // Release phase: ramp to 0 at end of sample duration
    voiceGain.gain.linearRampToValueAtTime(0.0001, endTime);
    voiceGain.gain.linearRampToValueAtTime(0, endTime + adsr.r);

    source.connect(voiceGain);
    voiceGain.connect(routing.gain);

    if (pad.loop) {
      source.loop = true;
      source.loopStart = startOffset;
      source.loopEnd = startOffset + duration;
      source.start(scheduledTime, startOffset);
    } else {
      source.start(scheduledTime, startOffset, duration);
    }

    routing.active.add(source);
    this.activeSources.add(source);

    source.onended = () => {
      routing.active.delete(source);
      this.activeSources.delete(source);
    };

    if (this.polyMode === "mono") {
      routing.active.forEach((s) => {
        if (s !== source) {
          try { s.stop(); } catch { /* already stopped */ }
        }
      });
    }
  }

  private getOrCreatePadRouting(padIndex: number): PadRoutingState {
    let routing = this.padRoutings.get(padIndex);
    if (routing) return routing;

    const ctx = this._context;
    const gain = ctx.createGain();
    gain.gain.value = 0.8;

    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;

    gain.connect(panner);

    // Connect panner to analyser (skip filter node if filter is off)
    panner.connect(this.analyser);

    routing = {
      gain,
      panner,
      filter: null,
      active: new Set(),
      lastVolume: 0.8,
      lastPan: 0,
      lastFilterCutoff: 64,
      lastFilterType: "off",
    };

    this.padRoutings.set(padIndex, routing);
    return routing;
  }

  private applyPadFilter(routing: PadRoutingState, pad: Pad): void {
    const ctx = this._context;

    if (routing.filter) {
      try {
        routing.panner.disconnect();
        routing.filter.disconnect();
      } catch { /* */ }
      routing.filter = null;
    }

    routing.panner.connect(this.analyser);

    if (pad.filterType !== "off") {
      const filter = ctx.createBiquadFilter();
      const biquadMap: Record<string, BiquadFilterType> = {
        lp: "lowpass",
        hp: "highpass",
        bp: "bandpass",
      };
      filter.type = biquadMap[pad.filterType] ?? "lowpass";
      filter.frequency.value = 20000 * Math.pow(pad.filterCutoff / 127, 2);
      filter.Q.value = pad.filterResonance ?? 32;

      try {
        routing.panner.disconnect();
      } catch { /* */ }
      routing.panner.connect(filter);
      filter.connect(this.analyser);

      routing.filter = filter;
    }
  }

  getPadOutputNode(padIndex: number): GainNode {
    return this.getOrCreatePadRouting(padIndex).gain;
  }

  setPadPan(padIndex: number, pan: number): void {
    const routing = this.getOrCreatePadRouting(padIndex);
    const clamped = Math.max(-1, Math.min(1, pan));
    routing.lastPan = clamped;
    safeSetParam(routing.panner.pan, clamped, this._context.currentTime);
  }

  setPadVolume(padIndex: number, volume: number): void {
    const routing = this.getOrCreatePadRouting(padIndex);
    const clamped = Math.max(0, Math.min(1, volume));
    routing.lastVolume = clamped;
    safeSetParam(routing.gain.gain, clamped, this._context.currentTime);
  }

  setPadStartOffset(padIndex: number, offset: number): void {
    this.padStartOffsets.set(padIndex, Math.max(0, Math.min(1, offset)));
  }

  setPadFilterCutoff(padIndex: number, cutoff: number): void {
    const routing = this.getOrCreatePadRouting(padIndex);
    routing.lastFilterCutoff = cutoff;
  }

  setPadFilterType(padIndex: number, type: PadFilterType): void {
    const routing = this.getOrCreatePadRouting(padIndex);
    routing.lastFilterType = type;
    // Rebuild filter chain on next trigger
  }

  setPolyMode(mode: PolyMode): void {
    this.polyMode = mode;
  }

  stopAll(): void {
    this.activeSources.forEach((source) => {
      try { source.stop(); } catch { /* already stopped */ }
    });
    this.activeSources.clear();
    this.padRoutings.forEach((r) => r.active.clear());
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  async loadSampleFromFile(sampleId: string, file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this._context.decodeAudioData(arrayBuffer);
    this.samples.set(sampleId, audioBuffer);
    return audioBuffer;
  }

  replacePadBuffer(padIndex: number, buffer: AudioBuffer): void {
    this.addSample(`pad-${padIndex}`, buffer);
  }

  loadSample(id: string, url: string): Promise<AudioBuffer> {
    return fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => this._context.decodeAudioData(data))
      .then((buffer) => {
        this.samples.set(id, buffer);
        return buffer;
      });
  }

  updatePadADSR(padIndex: number, adsr: { a: number; d: number; s: number; r: number }): void {
    this.padAdsrValues.set(padIndex, {
      a: Math.max(0, adsr.a),
      d: Math.max(0, adsr.d),
      s: Math.max(0, Math.min(1, adsr.s)),
      r: Math.max(0, adsr.r),
    });
    // Full ADSR envelope application requires per-source GainNode routing
    // which is not yet implemented. The values are stored here for future use.
    logger.debug(`updatePadADSR pad=${padIndex} a=${adsr.a} d=${adsr.d} s=${adsr.s} r=${adsr.r}`);
  }

  setLfoShape(index: number, shape: OscillatorType): void {
    if (this.lfoNodes && this.lfoNodes[index]) {
      this.lfoNodes[index].type = shape;
    }
  }

  getActiveSourceCount(): number {
    return this.activeSources.size;
  }

  getSamples(): Map<string, AudioBuffer> {
    return new Map(this.samples);
  }

  exportSampleBuffers(): Array<{ id: string; channels: Float32Array[]; sampleRate: number; length: number }> {
    const result: Array<{ id: string; channels: Float32Array[]; sampleRate: number; length: number }> = [];
    this.samples.forEach((buffer, id) => {
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        channels.push(new Float32Array(buffer.getChannelData(ch)));
      }
      result.push({ id, channels, sampleRate: buffer.sampleRate, length: buffer.length });
    });
    return result;
  }

  restoreSampleBuffers(snapshots: Array<{ id: string; channels: Float32Array[]; sampleRate: number; length: number }>): void {
    const ctx = this._context;
    for (const snap of snapshots) {
      const buffer = ctx.createBuffer(snap.channels.length, snap.length, snap.sampleRate);
      for (let ch = 0; ch < snap.channels.length; ch++) {
        buffer.copyToChannel(snap.channels[ch], ch, 0);
      }
      this.samples.set(snap.id, buffer);
    }
  }

  getAnalyserData(): Uint8Array {
    const now = performance.now();
    if (now - this.lastAnalyserTime >= this.ANALYSER_THROTTLE_MS) {
      this.analyser.getByteFrequencyData(this.analyserData);
      this.lastAnalyserTime = now;
    }
    return this.analyserData;
  }

  getLfoPhase(index: number): number {
    if (!this.lfoNodes) {
      this.lfoNodes = [];
    }
    // Lazily initialize LFO nodes
    while (this.lfoNodes.length <= index) {
      const osc = this._context.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 1;
      osc.start();
      this.lfoNodes.push(osc);
    }
    return (this._context.currentTime * (this.lfoNodes[index]?.frequency.value ?? 1)) % 1;
  }

  private reverseBuffer(buffer: AudioBuffer): AudioBuffer {
    const cached = this.reverseBufferCache.get(buffer);
    if (cached) return cached;

    const ctx = this._context;
    const channelCount = buffer.numberOfChannels;
    const length = buffer.length;
    const reversed = ctx.createBuffer(channelCount, length, buffer.sampleRate);

    for (let ch = 0; ch < channelCount; ch++) {
      const input = buffer.getChannelData(ch);
      const output = reversed.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        output[i] = input[length - 1 - i];
      }
    }

    this.reverseBufferCache.set(buffer, reversed);
    return reversed;
  }

  private cleanupAudioNode(node: AudioNode & { stop?: () => void }): void {
    try {
      if (node.stop) node.stop();
    } catch { /* already stopped */ }
    try {
      node.disconnect();
    } catch { /* already disconnected */ }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Stop all active sources
    this.activeSources.forEach((source) => {
      this.cleanupAudioNode(source);
    });
    this.activeSources.clear();

    // Disconnect pad routings
    this.padRoutings.forEach((routing) => {
      routing.active.forEach((source) => this.cleanupAudioNode(source));
      routing.active.clear();
      try { routing.gain.disconnect(); } catch { /* */ }
      try { routing.panner.disconnect(); } catch { /* */ }
      if (routing.filter) {
        try { routing.filter.disconnect(); } catch { /* */ }
      }
    });
    this.padRoutings.clear();

    // Stop LFO nodes
    if (this.lfoNodes) {
      this.lfoNodes.forEach((osc) => {
        try { osc.stop(); } catch { /* */ }
        try { osc.disconnect(); } catch { /* */ }
      });
      this.lfoNodes = null;
    }

    // Disconnect master chain
    try { this.masterCompressor.disconnect(); } catch { /* */ }
    try { this.masterGain.disconnect(); } catch { /* */ }
    try { this.analyser.disconnect(); } catch { /* */ }

    this.samples.clear();
  }
}

// ── Module-level state and helpers ─────────────────────────────────────────

let _tbmContext: AudioContext | null = null;
let _tbmOptions: EngineOptions = {};

export function getTBMContext(): AudioContext {
  if (!_tbmContext) {
    _tbmContext = new AudioContext(_tbmOptions);
  }
  return _tbmContext;
}

export function disposeTBMContext(): void {
  if (_tbmContext) {
    _tbmContext.close().catch(() => {});
    _tbmContext = null;
  }
}

export function createTBMAudioEngine(): TBMAudioEngine {
  return new TBMAudioEngine(getTBMContext());
}

import { SynthEngine as _SynthEngine } from "../lib/audio/synthEngine";

export function createSynthEngine(): _SynthEngine {
  return new _SynthEngine(getTBMContext());
}

export function setTBMAudioOptions(options: EngineOptions): void {
  _tbmOptions = { ..._tbmOptions, ...options };
}

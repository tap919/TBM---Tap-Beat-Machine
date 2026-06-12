import { MIXER_CHANNELS, TRACK_NAMES } from "../lib/constants";

export type TrackContentType =
  | "audio" | "synth" | "sampler" | "drum" | "fx" | "group" | "midi"
  | "drums" | "chords" | "hats" | "melody" | "session" | "empty";

export interface TrackSlot {
  index: number;
  name: string;
  type: TrackContentType;
  occupied: boolean;
  gainNode: GainNode | null;
  panNode: StereoPannerNode | null;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  color: string;
  hpfFrequency: number;
  eqHigh: { gain: number };
  eqMid: { gain: number };
  eqLow: { gain: number };
  sourceId?: string;
}

export const TRACK_TYPE_LABELS: Record<string, string> = {
  audio: "Audio",
  synth: "Synth",
  sampler: "Sampler",
  drum: "Drum",
  fx: "FX",
  group: "Group",
  midi: "MIDI",
  drums: "Drums",
  chords: "Chords",
  hats: "Hats",
  melody: "Melody",
  session: "Session",
  empty: "Empty",
};

type SlotListener = (slots: TrackSlot[]) => void;

export class TrackRouter {
  readonly slots: TrackSlot[];
  private listeners: Set<SlotListener> = new Set();
  private slotNodes: Map<number, { gain: GainNode; pan: StereoPannerNode; analyser: AnalyserNode }> = new Map();
  private masterGain: GainNode | null = null;

  constructor() {
    this.slots = Array.from({ length: MIXER_CHANNELS }, (_, i) => ({
      index: i,
      name: TRACK_NAMES[i] ?? `Track ${i + 1}`,
      type: "empty" as TrackContentType,
      occupied: false,
      gainNode: null,
      panNode: null,
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      color: "#666666",
      hpfFrequency: 20,
      eqHigh: { gain: 0 },
      eqMid: { gain: 0 },
      eqLow: { gain: 0 },
    }));
  }

  get occupiedCount(): number {
    return this.slots.filter((s) => s.occupied).length;
  }

  subscribe(listener: SlotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = [...this.slots];
    this.listeners.forEach((fn) => fn(snapshot));
  }

  setSlot(index: number, partial: Partial<TrackSlot>): void {
    if (index < 0 || index >= this.slots.length) return;
    this.slots[index] = { ...this.slots[index], ...partial };
    this.notify();
  }

  getSlot(index: number): TrackSlot {
    return this.slots[index];
  }

  connectAudio(ctx: AudioContext, masterBus: GainNode): void {
    // Dispose any previously created slot nodes before reconnecting
    this.slotNodes.forEach((nodes) => {
      try { nodes.gain.disconnect(); } catch { /* */ }
      try { nodes.pan.disconnect(); } catch { /* */ }
      try { nodes.analyser.disconnect(); } catch { /* */ }
    });
    this.slotNodes.clear();

    this.masterGain = masterBus;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.occupied) continue;

      const gain = ctx.createGain();
      gain.gain.value = slot.volume;
      const pan = ctx.createStereoPanner();
      pan.pan.value = slot.pan;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      gain.connect(pan);
      pan.connect(analyser);
      analyser.connect(masterBus);

      this.slotNodes.set(i, { gain, pan, analyser });
      slot.gainNode = gain;
      slot.panNode = pan;
    }
  }

  setVolume(index: number, value: number): void {
    this.slots[index].volume = value;
    const node = this.slotNodes.get(index)?.gain;
    if (node) node.gain.value = Math.max(0, Math.min(1, value));
  }

  setPan(index: number, value: number): void {
    this.slots[index].pan = value;
    const node = this.slotNodes.get(index)?.pan;
    if (node) node.pan.value = Math.max(-1, Math.min(1, value));
  }

  setMuted(index: number, muted: boolean): void {
    this.slots[index].muted = muted;
    const node = this.slotNodes.get(index)?.gain;
    if (node) node.gain.value = muted ? 0 : this.slots[index].volume;
  }

  setSolo(index: number, solo: boolean): void {
    this.slots[index].solo = solo;
    const hasSolo = this.slots.some((s) => s.solo);
    this.slots.forEach((s, i) => {
      const node = this.slotNodes.get(i)?.gain;
      if (node) {
        node.gain.value = hasSolo ? (s.solo ? s.volume : 0) : (s.muted ? 0 : s.volume);
      }
    });
  }

  setArmed(index: number, armed: boolean): void {
    this.slots[index].armed = armed;
  }

  setHPF(index: number, freq: number): void {
    this.slots[index].hpfFrequency = freq;
  }

  setEQBand(index: number, band: "low" | "mid" | "high", value: { gain: number }): void {
    if (band === "low") this.slots[index].eqLow = value;
    else if (band === "mid") this.slots[index].eqMid = value;
    else if (band === "high") this.slots[index].eqHigh = value;
  }

  getSlotAnalyser(index: number): AnalyserNode | null {
    return this.slotNodes.get(index)?.analyser ?? null;
  }

  getSlotInput(index: number): GainNode | null {
    return this.slotNodes.get(index)?.gain ?? null;
  }

  getAudioNodes(index: number): { gainNode: GainNode; panNode: StereoPannerNode } | null {
    const n = this.slotNodes.get(index);
    return n ? { gainNode: n.gain, panNode: n.pan } : null;
  }

  getMasterBus(): GainNode | null {
    return this.masterGain;
  }

  getByType(type: TrackContentType): TrackSlot[] {
    return this.slots.filter((s) => s.type === type && s.occupied);
  }

  assignToNextFree(type: TrackContentType, source: unknown, name: string): { index: number } {
    const idx = this.slots.findIndex((s) => !s.occupied);
    if (idx === -1) return { index: -1 };
    this.slots[idx].occupied = true;
    this.slots[idx].type = type;
    this.slots[idx].name = name;
    this.slots[idx].sourceId = String(source);
    this.notify();
    return { index: idx };
  }

  assignToChannel(channel: number, type: string, name: string, _sourceName?: string): void {
    if (channel >= 0 && channel < this.slots.length) {
      this.slots[channel].occupied = true;
      this.slots[channel].type = type as TrackContentType;
      this.slots[channel].name = name;
      this.notify();
    }
  }

  releaseBySource(source: unknown): void {
    const sourceStr = String(source);
    const idx = this.slots.findIndex((s) => s.sourceId === sourceStr && s.occupied);
    if (idx === -1) return;

    // Disconnect audio nodes for this slot
    const nodes = this.slotNodes.get(idx);
    if (nodes) {
      try { nodes.gain.disconnect(); } catch { /* */ }
      try { nodes.pan.disconnect(); } catch { /* */ }
      try { nodes.analyser.disconnect(); } catch { /* */ }
      this.slotNodes.delete(idx);
    }

    this.slots[idx].occupied = false;
    this.slots[idx].type = "empty";
    this.slots[idx].sourceId = undefined;
    this.slots[idx].gainNode = null;
    this.slots[idx].panNode = null;

    this.notify();
  }

  setSlotVolume(index: number, volume: number): void {
    this.setVolume(index, volume);
  }

  setSlotPan(index: number, pan: number): void {
    this.setPan(index, pan);
  }
}

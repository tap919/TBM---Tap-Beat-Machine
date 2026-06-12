export interface MidiMapping {
  function?: string;
  control?: number;
  channel?: number;
  mode?: string;
  min?: number;
  max?: number;
  type?: "cc" | "note";
  number?: number;
}

export interface ControllerModeInfo {
  id: string;
  name: string;
  description: string;
}

type ModeChangeCallback = (modeId: string) => void;
type MappingsChangeCallback = (custom: Record<string, MidiMapping>) => void;

const TBM_FUNCTION_IDS = [
  "pad_00", "pad_01", "pad_02", "pad_03",
  "pad_04", "pad_05", "pad_06", "pad_07",
  "pad_08", "pad_09", "pad_10", "pad_11",
  "pad_12", "pad_13", "pad_14", "pad_15",
  "bank_a", "bank_b", "bank_c", "bank_d",
  "volume", "pan", "filter", "pitch",
  "play", "stop", "record", "tap_tempo",
  "crossfader", "deck_a_vol", "deck_b_vol",
  "master_vol", "sync", "quantize", "swing",
  "fx_1", "fx_2", "fx_3", "fx_4",
  "cue_a", "cue_b", "loop", "reverse",
  "scratch", "transport_prev", "transport_next",
  "transport_loop", "transport_autoscroll",
];

export const TBM_FUNCTION_LABELS: Record<string, string> = {
  pad_00: "Pad 1", pad_01: "Pad 2", pad_02: "Pad 3", pad_03: "Pad 4",
  pad_04: "Pad 5", pad_05: "Pad 6", pad_06: "Pad 7", pad_07: "Pad 8",
  pad_08: "Pad 9", pad_09: "Pad 10", pad_10: "Pad 11", pad_11: "Pad 12",
  pad_12: "Pad 13", pad_13: "Pad 14", pad_14: "Pad 15", pad_15: "Pad 16",
  bank_a: "Bank A", bank_b: "Bank B", bank_c: "Bank C", bank_d: "Bank D",
  volume: "Volume", pan: "Pan", filter: "Filter Cutoff", pitch: "Pitch Shift",
  play: "Play", stop: "Stop", record: "Record", tap_tempo: "Tap Tempo",
  crossfader: "Crossfader", deck_a_vol: "Deck A Volume", deck_b_vol: "Deck B Volume",
  master_vol: "Master Volume", sync: "Sync", quantize: "Quantize", swing: "Swing",
  fx_1: "FX 1", fx_2: "FX 2", fx_3: "FX 3", fx_4: "FX 4",
  cue_a: "Cue A", cue_b: "Cue B", loop: "Loop", reverse: "Reverse",
  scratch: "Scratch", transport_prev: "Previous", transport_next: "Next",
  transport_loop: "Loop", transport_autoscroll: "Auto Scroll",
};

const MODE_INFOS: ControllerModeInfo[] = [
  { id: "drum", name: "Drum", description: "16 pad drum grid" },
  { id: "deck", name: "Deck", description: "DJ deck controls" },
  { id: "mixer", name: "Mixer", description: "Mixer channel control" },
  { id: "effects", name: "Effects", description: "FX controls" },
  { id: "transport", name: "Transport", description: "Transport controls" },
  { id: "turntable", name: "Turntable", description: "Vinyl scratch mode" },
  { id: "pad", name: "Pad", description: "Pad mode" },
  { id: "sampling", name: "Sampling", description: "Sampling mode" },
];

const MODE_MAPPINGS: Record<string, MidiMapping[]> = {
  drum: TBM_FUNCTION_IDS.filter((f) => f.startsWith("pad_") || f.startsWith("bank_")).map((f, i) => ({
    control: i,
    function: f,
  })),
  deck: [
    { control: 0, function: "crossfader", min: 0, max: 127 },
    { control: 1, function: "deck_a_vol" },
    { control: 2, function: "deck_b_vol" },
    { control: 3, function: "sync" },
    { control: 4, function: "cue_a" },
    { control: 5, function: "cue_b" },
  ],
  mixer: [
    { control: 0, function: "master_vol" },
    { control: 1, function: "volume" },
    { control: 2, function: "pan" },
    { control: 3, function: "filter" },
  ],
  effects: [
    { control: 0, function: "fx_1" },
    { control: 1, function: "fx_2" },
    { control: 2, function: "fx_3" },
    { control: 3, function: "fx_4" },
    { control: 4, function: "swing" },
    { control: 5, function: "quantize" },
  ],
  transport: [
    { control: 0, function: "play" },
    { control: 1, function: "stop" },
    { control: 2, function: "record" },
    { control: 3, function: "tap_tempo" },
    { control: 4, function: "loop" },
    { control: 5, function: "reverse" },
  ],
};

let currentModeId: string = "drum";
let customMappings: Record<string, MidiMapping> = {};
const modeChangeListeners = new Set<ModeChangeCallback>();
const mappingsChangeListeners = new Set<MappingsChangeCallback>();

export function initMidiMappings(): void {
  const raw = localStorage.getItem("tbm_midi_mappings");
  if (raw) {
    try { customMappings = JSON.parse(raw); } catch { /* */ }
  }
  const modeRaw = localStorage.getItem("tbm_midi_mode");
  if (modeRaw) {
    currentModeId = modeRaw;
  }
}

export function getAvailableModes(): ControllerModeInfo[] {
  return [...MODE_INFOS];
}

export function getCurrentMode(): ControllerModeInfo {
  return MODE_INFOS.find((m) => m.id === currentModeId) ?? MODE_INFOS[0];
}

export function setControllerMode(modeId: string): void {
  currentModeId = modeId;
  localStorage.setItem("tbm_midi_mode", modeId);
  modeChangeListeners.forEach((fn) => fn(modeId));
}

export function onControllerModeChange(cb: ModeChangeCallback): () => void {
  modeChangeListeners.add(cb);
  return () => modeChangeListeners.delete(cb);
}

export function getModeMappings(modeId?: string): Record<string, MidiMapping> {
  const id = modeId ?? currentModeId;
  const mappings = MODE_MAPPINGS[id] ?? [];
  const result: Record<string, MidiMapping> = {};
  mappings.forEach((m, i) => {
    result[`cc_${i}`] = m;
  });
  return result;
}

export function getModeFunctionIds(_modeId?: string): string[] {
  return [...TBM_FUNCTION_IDS];
}

export function formatMapping(m: MidiMapping): string {
  return `${m.function ?? "?"} (CC ${m.control ?? "?"})`;
}

export function setCustomMapping(functionId: string, mapping: MidiMapping): void {
  customMappings[functionId] = mapping;
  localStorage.setItem("tbm_midi_mappings", JSON.stringify(customMappings));
  mappingsChangeListeners.forEach((fn) => fn({ ...customMappings }));
}

export function removeCustomMapping(functionId: string): void {
  delete customMappings[functionId];
  localStorage.setItem("tbm_midi_mappings", JSON.stringify(customMappings));
  mappingsChangeListeners.forEach((fn) => fn({ ...customMappings }));
}

export function resetAllCustomMappings(): void {
  customMappings = {};
  localStorage.removeItem("tbm_midi_mappings");
  mappingsChangeListeners.forEach((fn) => fn({}));
}

export function getCustomMappings(): Record<string, MidiMapping> {
  return { ...customMappings };
}

export function onCustomMappingsChange(cb: MappingsChangeCallback): () => void {
  mappingsChangeListeners.add(cb);
  return () => mappingsChangeListeners.delete(cb);
}

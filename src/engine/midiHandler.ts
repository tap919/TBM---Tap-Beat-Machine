export type MidiMessageType = "noteon" | "noteoff" | "cc" | "pc" | "pitchbend";

export interface MidiHandlerCallbacks {
  onDrumPad?: (padIndex: number, velocity: number) => void;
  onMidiActivity?: (type: MidiMessageType, channel: number, number: number, value: number) => void;
  onModeTurntable?: () => void;
  onModePad?: () => void;
  onModeSampling?: () => void;
  onKeyLockToggle?: () => void;
  onVinylScratchJog?: (deck: string, value: number) => void;
  onVinylScratchCrossfader?: (value: number) => void;
  onVinylScratchPlay?: (deck: string) => void;
  onVinylScratchStop?: () => void;
  onVinylScratchCue?: (deck: string) => void;
  onVinylScratchSync?: (deck: string) => void;
  onStemQueueDrums?: () => void;
  onStemQueueBass?: () => void;
  onStemQueueVocals?: () => void;
  onStemQueueOther?: () => void;
  onGridTempo?: (value: number) => void;
  onGridSwing?: (value: number) => void;
  onGridQuantize?: (value: number) => void;
  onGridDivision?: (value: number) => void;
  onSampleStart?: (value: number) => void;
  onSampleEnd?: (value: number) => void;
  onSampleVolume?: (value: number) => void;
  onSamplePitch?: (value: number) => void;
  onSampleLoop?: (value: number) => void;
  onSampleFilter?: (value: number) => void;
  onSampleReverb?: (value: number) => void;
  onSampleDelay?: (value: number) => void;
  onTransportPlay?: () => void;
  onTransportStop?: () => void;
  onTransportRecord?: () => void;
  onTransportLoop?: () => void;
  onMixerMaster?: (value: number) => void;
  onMixerChannel?: (channel: number, value: number) => void;
  onMixerEQ?: (deck: string, band: string, value: number) => void;
  onPitchFader?: (deck: string, value: number) => void;
  onUnhandledFunction?: (functionId: string, value: number) => void;
}

type DeviceChangeCallback = () => void;

class MidiHandler {
  private callbacks: MidiHandlerCallbacks = {};
  private deviceChangeListeners: Set<DeviceChangeCallback> = new Set();
  private midiAccess: MIDIAccess | null = null;
  private _isConnected: boolean = false;
  private padOffset: number = 0;
  private _slate4Listeners: Set<(detected: boolean) => void> = new Set();

  isConnected(): boolean {
    return this._isConnected;
  }

  async initialize(): Promise<void> {
    if (!navigator.requestMIDIAccess) return;
    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.setupListeners();
      this.refreshDevices();
    } catch {
      // MIDI not available
    }
  }

  private setupListeners(): void {
    if (!this.midiAccess) return;
    this.midiAccess.onstatechange = () => this.refreshDevices();
  }

  private refreshDevices(): void {
    const prevConnected = this._isConnected;
    this._isConnected = false;
    this.midiAccess?.inputs?.forEach(() => {
      this._isConnected = true;
    });
    if (prevConnected !== this._isConnected) {
      this.notifyDeviceChange();
    }
    if (this._isConnected && !prevConnected) {
      this._slate4Listeners.forEach((fn) => fn(true));
    } else if (!this._isConnected && prevConnected) {
      this._slate4Listeners.forEach((fn) => fn(false));
    }
  }

  hasSlate4Device(): boolean {
    if (!this.midiAccess) return false;
    let found = false;
    this.midiAccess.inputs?.forEach((input) => {
      if (input.name?.toLowerCase().includes("slate") || input.name?.toLowerCase().includes("gemini")) {
        found = true;
      }
    });
    return found;
  }

  onSlate4Change(cb: (detected: boolean) => void): () => void {
    this._slate4Listeners.add(cb);
    return () => this._slate4Listeners.delete(cb);
  }

  setPadOffset(offset: number): void {
    this.padOffset = offset;
  }

  getCurrentMode(): string {
    return "drum";
  }

  /** Called by components when a MIDI message is received */
  handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 3) return;
    const [status, number, value] = data;
    const channel = status & 0x0f;
    const messageType = status & 0xf0;

    let type: MidiMessageType;
    switch (messageType) {
      case 0x90:
        type = "noteon";
        this.callbacks.onDrumPad?.(number + this.padOffset, value);
        break;
      case 0x80:
        type = "noteoff";
        break;
      case 0xb0:
        type = "cc";
        break;
      case 0xc0:
        type = "pc";
        return;
      case 0xe0:
        type = "pitchbend";
        break;
      default:
        return;
    }

    this.callbacks.onMidiActivity?.(type, channel, number, value);
  }

  setCallbacks(cbs: MidiHandlerCallbacks): void {
    this.callbacks = cbs;
  }

  getConnectedDevices(): Array<{ id: string; name: string }> {
    const devices: Array<{ id: string; name: string }> = [];
    this.midiAccess?.inputs?.forEach((input) => {
      devices.push({ id: input.id, name: input.name ?? "Unknown" });
    });
    return devices;
  }

  onDeviceChange(cb: DeviceChangeCallback): () => void {
    this.deviceChangeListeners.add(cb);
    return () => this.deviceChangeListeners.delete(cb);
  }

  private notifyDeviceChange(): void {
    this.deviceChangeListeners.forEach((fn) => fn());
  }

  dispose(): void {
    this.callbacks = {};
    this.deviceChangeListeners.clear();
    this._slate4Listeners.clear();
    this.midiAccess = null;
  }
}

let globalHandler: MidiHandler | null = null;

export function getGlobalMidiHandler(): MidiHandler {
  if (!globalHandler) {
    globalHandler = new MidiHandler();
  }
  return globalHandler;
}

export async function initializeGlobalMidiHandler(callbacks?: MidiHandlerCallbacks): Promise<boolean> {
  const handler = getGlobalMidiHandler();
  if (callbacks) handler.setCallbacks(callbacks);
  await handler.initialize();
  return handler.isConnected();
}

export function disposeGlobalMidiHandler(): void {
  globalHandler?.dispose();
  globalHandler = null;
}

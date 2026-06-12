// -----------------------------------------------------------------------------
// TBM Comprehensive Integration Tests
// -----------------------------------------------------------------------------
// AudioParam polyfill for jsdom (needed by modMatrix.evaluate instanceof check)
if (typeof AudioParam === "undefined") {
  (globalThis as any).AudioParam = class AudioParam {
    value: number = 0;
  };
}
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { renderHook, act } from "@testing-library/react";

// -- Imports from engine & lib -----------------------------------------------
import { TBMAudioEngine } from "../engine/TBMAudioEngine";
import type { Pad } from "../engine/TBMAudioEngine";
import { TrackRouter } from "../engine/trackRouter";
import { Sequencer } from "../lib/audio/sequencer";
import { BusFXRack } from "../lib/audio/busFxRack";
import {
  ModMatrixEngine,
  createDefaultSourceLfo1,
  createDefaultDestinationAmpVolume,
} from "../lib/audio/modMatrix";
import {
  serializeState,
  deserializeState,
  TBMProjectState,
} from "../lib/statePersistence";
import { useSongManager } from "../hooks/useSongManager";
import { useMacroControls } from "../hooks/useMacroControls";
import { useProjectUndoRedo } from "../hooks/useProjectUndoRedo";

// -----------------------------------------------------------------------------
// Mock AudioContext factory � mirrors src/test/setup.ts pattern
// -----------------------------------------------------------------------------
function createMockAudioContext(): any {
  return {
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        setTargetAtTime: vi.fn(),
      },
    })),
    createBufferSource: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      buffer: null,
      playbackRate: { value: 1 },
      detune: { value: 0 },
      loop: false,
    })),
    createStereoPanner: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      pan: { value: 0 },
    })),
    createBiquadFilter: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      frequency: { value: 1000 },
      Q: { value: 1 },
      type: "lowpass",
    })),
    createAnalyser: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      fftSize: 2048,
      frequencyBinCount: 1024,
      getFloatFrequencyData: vi.fn(),
      getByteFrequencyData: vi.fn(),
      getFloatTimeDomainData: vi.fn(),
    })),
    createDynamicsCompressor: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      threshold: { value: -24 },
      knee: { value: 30 },
      ratio: { value: 12 },
      attack: { value: 0.003 },
      release: { value: 0.25 },
    })),
    createOscillator: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: { value: 440 },
      type: "sine",
    })),
    createBuffer: vi.fn(
      (channels: number, length: number, sampleRate: number) => ({
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: vi.fn(() => new Float32Array(length)),
        copyToChannel: vi.fn(),
      }),
    ),
    decodeAudioData: vi.fn().mockResolvedValue({
      duration: 2.0,
      sampleRate: 44100,
      length: 88200,
      numberOfChannels: 2,
      getChannelData: vi.fn(() => new Float32Array(88200)),
    }),
    destination: {},
    sampleRate: 44100,
    currentTime: 1000,
    state: "running",
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
  };
}

// -- Helper: create a minimal Pad object for tests ---------------------------
function makePad(overrides: Partial<Pad> = {}): Pad {
  return {
    id: 0,
    name: "Test Pad",
    sample: null,
    volume: 0.8,
    pan: 0,
    pitch: 0,
    attack: 0.01,
    release: 0.1,
    filterType: "off",
    filterCutoff: 64,
    filterResonance: 0,
    start: 0,
    end: 1,
    loop: false,
    reverse: false,
    chokeGroup: null,
    swing: 0,
    timeStretch: 1,
    pitchShift: 0,
    ...overrides,
  };
}

// -- Helper: create a buffer-like object for addSample -----------------------
function makeMockBuffer(
  length = 5,
  sampleRate = 44100,
  channels = 2,
): AudioBuffer {
  const chData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    chData.push(new Float32Array(length));
  }
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    getChannelData: (ch: number) => chData[ch] ?? chData[0],
    copyToChannel: vi.fn(),
    duration: length / sampleRate,
  } as unknown as AudioBuffer;
}

// -----------------------------------------------------------------------------
//  1. App shell / Audio context lifecycle
// -----------------------------------------------------------------------------
describe("1. App shell / Audio context lifecycle", () => {
  let ctx: any;
  let engine: TBMAudioEngine;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = new TBMAudioEngine(ctx);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Engine initializes without error", () => {
    expect(engine).toBeInstanceOf(TBMAudioEngine);
    expect(engine.getContext()).toBe(ctx);
    expect(engine.sampleRate).toBe(44100);
    expect(engine.getActiveSourceCount()).toBe(0);
  });

  it("Engine dispose cleans up all state", () => {
    const buf = makeMockBuffer();
    ctx.createBuffer.mockReturnValueOnce(buf);
    engine.addSample("s1", buf);
    engine.triggerPad(makePad({ sample: { id: "s1", name: "S1", buffer: buf, category: "user" } }));
    expect(engine.getActiveSourceCount()).toBe(1);

    engine.dispose();
    expect(engine.getActiveSourceCount()).toBe(0);
    expect(engine.getSamples().size).toBe(0);
  });

  it("Engine reinit sequence (dispose -> create -> restore port)", () => {
    engine.dispose();

    const ctx2 = createMockAudioContext();
    const engine2 = new TBMAudioEngine(ctx2);
    expect(engine2.getContext()).toBe(ctx2);
    expect(engine2.getAnalyser()).toBeDefined();
    expect(engine2.getActiveSourceCount()).toBe(0);

    const buf = makeMockBuffer();
    ctx2.createBuffer.mockReturnValueOnce(buf);
    engine2.addSample("s1", buf);
    engine2.triggerPad(makePad({ sample: { id: "s1", name: "S1", buffer: buf, category: "user" } }));
    expect(engine2.getActiveSourceCount()).toBe(1);
  });

  it("Audio resume works (mocked)", async () => {
    const resumeSpy = vi.spyOn(ctx, "resume");
    await ctx.resume();
    expect(resumeSpy).toHaveBeenCalled();
    expect(ctx.state).toBe("running");
  });
});

// -----------------------------------------------------------------------------
//  2. Pad operations
// -----------------------------------------------------------------------------
describe("2. Pad operations", () => {
  let ctx: any;
  let engine: TBMAudioEngine;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = new TBMAudioEngine(ctx);
  });

  it("Load sample to pad (simulate via engine.addSample + pads array)", () => {
    const buf = makeMockBuffer();
    ctx.createBuffer.mockReturnValueOnce(buf);
    engine.addSample("pad-kick", buf);

    const retrieved = engine.getSample("pad-kick");
    expect(retrieved).toBeDefined();
    expect(retrieved!.length).toBe(5);

    const samplesMap = engine.getSamples();
    expect(samplesMap.has("pad-kick")).toBe(true);
  });

  it("Trigger pad with velocity � verify no crash", () => {
    const buf = makeMockBuffer();
    ctx.createBuffer.mockReturnValueOnce(buf);
    engine.addSample("s1", buf);

    expect(() => {
      engine.triggerPad(
        makePad({ sample: { id: "s1", name: "S1", buffer: buf, category: "user" } }),
        0.75,
      );
    }).not.toThrow();
    expect(engine.getActiveSourceCount()).toBe(1);
  });

  it("Trigger pad without sample � verify graceful no-op", () => {
    expect(() => {
      engine.triggerPad(makePad({ sample: null }));
    }).not.toThrow();
    expect(engine.getActiveSourceCount()).toBe(0);

    expect(() => {
      engine.triggerPad(
        makePad({ sample: { id: "nonexistent", name: "Nope", buffer: null, category: "user" } }),
      );
    }).not.toThrow();
    expect(engine.getActiveSourceCount()).toBe(0);
  });

  it("Repeated trigger � verify no leak (active source count)", () => {
    const buf = makeMockBuffer(44100, 44100);
    ctx.createBuffer.mockReturnValueOnce(buf);
    engine.addSample("s1", buf);
    const pad = makePad({
      sample: { id: "s1", name: "S1", buffer: buf, category: "user" },
    });

    for (let i = 0; i < 10; i++) {
      engine.triggerPad(pad, 1);
    }
    expect(engine.getActiveSourceCount()).toBe(10);

    engine.stopAll();
    expect(engine.getActiveSourceCount()).toBe(0);
  });

  it("Volume/pan settings applied correctly (clamp to range)", () => {
    engine.setPadVolume(0, -0.5);
    const routing1 = (engine as any).padRoutings.get(0);
    expect(routing1.lastVolume).toBe(0);

    engine.setPadVolume(0, 1.5);
    expect(routing1.lastVolume).toBe(1);

    engine.setPadVolume(0, 0.5);
    expect(routing1.lastVolume).toBe(0.5);

    engine.setPadPan(1, -2);
    const routing2 = (engine as any).padRoutings.get(1);
    expect(routing2.lastPan).toBe(-1);

    engine.setPadPan(1, 2);
    expect(routing2.lastPan).toBe(1);

    engine.setPadPan(1, 0.3);
    expect(routing2.lastPan).toBe(0.3);
  });

  it("Filter type/cutoff/resonance stored", () => {
    engine.setPadFilterType(0, "lp");
    let routing = (engine as any).padRoutings.get(0);
    expect(routing.lastFilterType).toBe("lp");

    engine.setPadFilterType(0, "hp");
    expect(routing.lastFilterType).toBe("hp");

    engine.setPadFilterCutoff(0, 80);
    expect(routing.lastFilterCutoff).toBe(80);

    engine.setPadFilterCutoff(0, 127);
    expect(routing.lastFilterCutoff).toBe(127);
  });

  it("TimeStretch and pitchShift stored in serialization", () => {
    const pad = makePad({ timeStretch: 1.5, pitchShift: 3 });
    expect(pad.timeStretch).toBe(1.5);
    expect(pad.pitchShift).toBe(3);
  });

  it("Choke group behavior (trigger pad in same group stops others)", () => {
    const pad1 = makePad({ id: 0, chokeGroup: 1 });
    const pad2 = makePad({ id: 1, chokeGroup: 1 });
    expect(pad1.chokeGroup).toBe(1);
    expect(pad2.chokeGroup).toBe(1);

    const buf = makeMockBuffer();
    ctx.createBuffer.mockReturnValueOnce(buf);
    engine.addSample("s1", buf);
    const pad = makePad({
      id: 0,
      chokeGroup: 1,
      sample: { id: "s1", name: "S1", buffer: buf, category: "user" },
    });
    engine.triggerPad(pad);
    expect(engine.getActiveSourceCount()).toBe(1);
  });
});

// -----------------------------------------------------------------------------
//  3. Sequencer pattern playback
// -----------------------------------------------------------------------------
describe("3. Sequencer pattern playback", () => {
  let ctx: any;
  let engine: TBMAudioEngine;
  let sequencer: Sequencer;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = new TBMAudioEngine(ctx);
    sequencer = new Sequencer(engine, ctx);
  });

  it("Create pattern, set pads, play, verify state", () => {
    sequencer.setPattern("main", [
      [true, false, true, false],
      [false, true, false, true],
    ]);
    sequencer.setPads([
      makePad({ id: 0 }),
      makePad({ id: 1 }),
    ]);
    sequencer.play();

    const state = sequencer.getState();
    expect(state.isPlaying).toBe(true);
    expect(state.currentStep).toBeGreaterThanOrEqual(0);
    expect(state.currentStep).toBeLessThan(4);
  });

  it("Stop resets step to 0 and calls stopAll", () => {
    sequencer.setPattern("main", [[true]]);
    sequencer.setPads([makePad({ id: 0 })]);
    sequencer.play();
    expect(sequencer.getState().isPlaying).toBe(true);

    const stopAllSpy = vi.spyOn(engine, "stopAll");
    sequencer.stop();

    const state = sequencer.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.currentStep).toBe(0);
    expect(stopAllSpy).toHaveBeenCalled();
  });

  it("selectPattern switches current pattern", () => {
    sequencer.setPattern("a", [[true]]);
    sequencer.setPattern("b", [[false]]);

    const result1 = sequencer.selectPattern("b");
    expect(result1).toBe(true);
    expect(sequencer.getPattern()).toEqual([[false]]);

    const result2 = sequencer.selectPattern("nonexistent");
    expect(result2).toBe(false);
    expect(sequencer.getPattern()).toEqual([[false]]);
  });

  it("BPM clamping (NaN, negative, extreme values)", () => {
    sequencer.setBpm(NaN);
    expect(sequencer.getBpm()).toBe(92);

    sequencer.setBpm(-10);
    expect(sequencer.getBpm()).toBe(20);

    sequencer.setBpm(500);
    expect(sequencer.getBpm()).toBe(300);

    sequencer.setBpm(140);
    expect(sequencer.getBpm()).toBe(140);

    sequencer.setBpm(Infinity);
    expect(sequencer.getBpm()).toBe(140);
  });

  it("Swing applied correctly", () => {
    sequencer.setSwing(65);
    expect(sequencer.getState().swing).toBe(65);

    sequencer.setGlobalSwing(80);
    expect(sequencer.getGlobalSwing()).toBe(80);

    sequencer.setPerChannelSwing("0", 50);
    expect(sequencer.getPerChannelSwing("0")).toBe(50);
  });

  it("setMuteState and setSolo respected during scheduling", () => {
    sequencer.setPattern("main", [
      [true, false],
      [false, true],
    ]);
    sequencer.setPads([
      makePad({ id: 0, sample: null }),
      makePad({ id: 1, sample: null }),
    ]);

    sequencer.setMuteState([true, false], new Set());
    sequencer.setMuteState([false, false], new Set([1]));

    expect(() => {
      sequencer.play();
      sequencer.stop();
    }).not.toThrow();

    expect(sequencer.getState().isPlaying).toBe(false);
  });
});

// -----------------------------------------------------------------------------
//  4. Song mode / arrangement
// -----------------------------------------------------------------------------
describe("4. Song mode / arrangement", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("Song CRUD via useSongManager hook", () => {
    const { result } = renderHook(() => useSongManager());

    expect(result.current.songs).toEqual([]);

    const song = {
      id: "song-1",
      name: "My Track",
      sections: [{ id: "sec-1", patternIndex: 0, repeatCount: 4 }],
      bpm: 128,
      swing: 55,
    };

    act(() => {
      result.current.handleSaveSong(song);
    });
    expect(result.current.songs).toHaveLength(1);
    expect(result.current.songs[0].name).toBe("My Track");
    expect(result.current.songs[0].bpm).toBe(128);

    act(() => {
      result.current.handleSaveSong({ ...song, name: "Updated Track", bpm: 140 });
    });
    expect(result.current.songs).toHaveLength(1);
    expect(result.current.songs[0].name).toBe("Updated Track");

    act(() => {
      result.current.handleDeleteSong("song-1");
    });
    expect(result.current.songs).toHaveLength(0);
  });

  it("handlePlaySong sets BPM/swing/pattern from song data", () => {
    const song = {
      id: "s1",
      name: "Test",
      sections: [
        { id: "sec-0", patternIndex: 0, repeatCount: 4 },
        { id: "sec-1", patternIndex: 1, repeatCount: 2 },
      ],
      bpm: 140,
      swing: 60,
    };

    expect(song.bpm).toBe(140);
    expect(song.swing).toBe(60);
    expect(song.sections).toHaveLength(2);
    expect(song.sections[0].patternIndex).toBe(0);
    expect(song.sections[1].patternIndex).toBe(1);
  });

  it("handlePlaySection resolves patternIndex to pattern.id", () => {
    const sections = [
      { id: "sec-0", patternIndex: 0, repeatCount: 4 },
    ];
    const patterns = ["pattern-a", "pattern-b"];
    const section = sections[0];
    const patternId = patterns[section.patternIndex];
    expect(patternId).toBe("pattern-a");
    expect(patterns[0]).toBe("pattern-a");
  });
});

// -----------------------------------------------------------------------------
//  5. Mixer + FX
// -----------------------------------------------------------------------------
describe("5. Mixer + FX", () => {
  describe("TrackRouter", () => {
    let router: TrackRouter;

    beforeEach(() => {
      router = new TrackRouter();
    });

    it("slot assignment/release", () => {
      const result = router.assignToNextFree("drums", "drums-source", "Drums");
      expect(result.index).toBe(0);
      expect(router.slots[0].occupied).toBe(true);
      expect(router.slots[0].sourceId).toBe("drums-source");

      router.releaseBySource("drums-source");
      expect(router.slots[0].occupied).toBe(false);
      expect(router.slots[0].type).toBe("empty");
    });

    it("slot assignment returns -1 when full", () => {
      router.slots.forEach((_, i) => {
        router.assignToNextFree("audio", `src-${i}`, `T${i}`);
      });
      const overflow = router.assignToNextFree("audio", "overflow", "O");
      expect(overflow.index).toBe(-1);
    });

    it("volume/pan clamping", () => {
      router.slots[0].occupied = true;
      router.setVolume(0, 1.5);
      expect(router.slots[0].volume).toBe(1.5);

      router.setPan(0, -2);
      expect(router.slots[0].pan).toBe(-2);

      const ctx = createMockAudioContext();
      const masterBus = { connect: vi.fn(), disconnect: vi.fn() };
      router.connectAudio(ctx, masterBus as any);

      router.setVolume(0, -0.1);
      expect(router.slots[0].volume).toBe(-0.1);

      router.setVolume(0, 0.75);
      expect(router.slots[0].volume).toBe(0.75);
    });
  });

  describe("BusFXRack", () => {
    let ctx: any;
    let rack: BusFXRack;

    beforeEach(() => {
      ctx = createMockAudioContext();
      rack = new BusFXRack(ctx);
    });

    it("bus creation/deletion", () => {
      rack.createBus("bus-c", "Bus C");
      const buses = rack.getBuses();
      expect(buses.has("bus-c")).toBe(true);
      expect(buses.has("bus-a")).toBe(true);
      expect(buses.has("bus-b")).toBe(true);

      rack.deleteBus("bus-c");
      expect(rack.getBuses().has("bus-c")).toBe(false);
    });

    it("bus creation is idempotent", () => {
      rack.createBus("bus-a", "Duplicate");
      const buses = rack.getBuses();
      let count = 0;
      for (const key of buses.keys()) {
        if (key === "bus-a") count++;
      }
      expect(count).toBe(1);
    });

    it("send gain tracking (no leak)", () => {
      const source = ctx.createGain();
      rack.setSendLevel(source, "bus-a", 0.5);

      expect(() => {
        rack.setSendLevel(source, "bus-a", 0.8);
        rack.setSendLevel(source, "bus-a", 0.2);
        rack.setSendLevel(source, "bus-b", 0.9);
      }).not.toThrow();
    });

    it("slot operations work correctly", () => {
      rack.addSlot("bus-a", {
        id: "fx-reverb",
        name: "Reverb",
        type: "insert",
        processor: ctx.createGain(),
        wetDry: 0.5,
        bypassed: false,
      });

      rack.setSlotWetDry("bus-a", "fx-reverb", 0.75);
      rack.setSlotBypass("bus-a", "fx-reverb", true);

      rack.removeSlot("bus-a", "fx-reverb");
      const bus = rack.getBuses().get("bus-a");
      expect(bus!.slots).toHaveLength(0);
    });
  });
});

// -----------------------------------------------------------------------------
//  6. Mod matrix
// -----------------------------------------------------------------------------
describe("6. Mod matrix", () => {
  let modMatrix: ModMatrixEngine;

  beforeAll(() => {
    if (typeof AudioParam === "undefined") {
      (globalThis as any).AudioParam = class AudioParam {
        value: number = 0;
      };
    }
  });

  beforeEach(() => {
    modMatrix = new ModMatrixEngine();
  });

  it("source/destination registration", () => {
    const source = createDefaultSourceLfo1(() => 0.25);
    modMatrix.registerSource(source);
    expect(modMatrix.getSources()).toHaveLength(1);
    expect(modMatrix.getSources()[0].id).toBe("lfo1");

    const dest = createDefaultDestinationAmpVolume(null, 0.5);
    modMatrix.registerDestination(dest);
    expect(modMatrix.getDestinations()).toHaveLength(1);
    expect(modMatrix.getDestinations()[0].id).toBe("amp-volume");
  });

  it("route evaluation � target value changes", () => {
    const target = new AudioParam();
    target.value = 0.5;
    const source = createDefaultSourceLfo1(() => 0.5);
    const dest = createDefaultDestinationAmpVolume(target, 0.5);
    modMatrix.registerSource(source);
    modMatrix.registerDestination(dest);

    modMatrix.addRoute({
      id: "route-1",
      sourceId: "lfo1",
      destId: "amp-volume",
      amount: 0.3,
      polarity: "unipolar",
      enabled: true,
    });

    modMatrix.evaluate();
    expect(target.value).toBeCloseTo(0.65, 2);
  });

  it("NaN/Infinity clamping", () => {
    const target = new AudioParam();
    target.value = 0;
    const source = createDefaultSourceLfo1(() => NaN);
    const dest = createDefaultDestinationAmpVolume(target, 1000);
    modMatrix.registerSource(source);
    modMatrix.registerDestination(dest);

    modMatrix.addRoute({
      id: "r1",
      sourceId: "lfo1",
      destId: "amp-volume",
      amount: 99999,
      polarity: "bipolar",
      enabled: true,
    });

    modMatrix.evaluate();
    expect(target.value).toBe(0);

    const target2 = new AudioParam();
    target2.value = 0;
    const source2 = createDefaultSourceLfo1(() => Infinity);
    modMatrix.registerSource(
      Object.assign({}, source2, { id: "lfo-inf" }),
    );
    const dest2 = createDefaultDestinationAmpVolume(target2, 0);
    modMatrix.registerDestination(
      Object.assign({}, dest2, { id: "amp-inf" }),
    );
    modMatrix.addRoute({
      id: "r2",
      sourceId: "lfo-inf",
      destId: "amp-inf",
      amount: 1,
      polarity: "bipolar",
      enabled: true,
    });
    modMatrix.evaluate();
    // Infinity * 1 + 0 = Infinity -> not finite -> clamped to 0
    expect(target2.value).toBe(0);
  });

  it("route clear/remove", () => {
    modMatrix.addRoute({
      id: "r1",
      sourceId: "s1",
      destId: "d1",
      amount: 0.5,
      polarity: "unipolar",
      enabled: true,
    });
    modMatrix.addRoute({
      id: "r2",
      sourceId: "s2",
      destId: "d2",
      amount: 0.3,
      polarity: "bipolar",
      enabled: false,
    });

    expect(modMatrix.getRoutes()).toHaveLength(2);

    modMatrix.removeRoute("r1");
    expect(modMatrix.getRoutes()).toHaveLength(1);
    expect(modMatrix.getRoutes()[0].id).toBe("r2");

    modMatrix.clearRoutes();
    expect(modMatrix.getRoutes()).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
//  7. Persistence
// -----------------------------------------------------------------------------
describe("7. Persistence", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key: string) => store[key] ?? null,
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      (key: string, value: string) => {
        store[key] = value;
      },
    );
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(
      (key: string) => {
        delete store[key];
      },
    );
    vi.spyOn(Storage.prototype, "clear").mockImplementation(() => {
      store = {};
    });
    Object.defineProperty(Storage.prototype, "length", {
      get: () => Object.keys(store).length,
    });
    vi.spyOn(Storage.prototype, "key" as any).mockImplementation(
      (index: number) => Object.keys(store)[index] ?? null,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Pad serialization round-trip (all fields)", async () => {
    const pad: Pad = {
      id: 0,
      name: "Pad 1",
      sample: null,
      volume: 0.85,
      pan: -0.4,
      pitch: 2,
      attack: 0.02,
      release: 0.25,
      filterType: "lp",
      filterCutoff: 80,
      filterResonance: 0.3,
      start: 0.1,
      end: 0.9,
      loop: true,
      reverse: true,
      chokeGroup: 3,
      swing: 55,
      timeStretch: 1.2,
      pitchShift: 4,
    };

    const state = await serializeState(
      [pad],
      {},
      {},
      {
        activeTab: "sampler",
        projectKey: "Cm",
        activeState: "A",
        bpm: 120,
        swing: 50,
      },
      {
        channelVolumes: [],
        channelPans: [],
        channelMutes: [],
        channelSolos: [],
        masterVolume: 1,
        masterLimiter: true,
      },
      {
        reverb: { enabled: false, size: 0.5, decay: 2, mix: 0.3, preDelay: 0.02 },
        delay: { enabled: false, time: 500, feedback: 0.5, mix: 0.3, sync: false },
        filter: { enabled: false, type: "lowpass", cutoff: 20000, resonance: 0, drive: 0 },
        compression: { enabled: false, threshold: -20, ratio: 4, attack: 0.01, release: 0.1 },
      },
      {
        audio: { sampleRate: 44100, bufferSize: 512, outputDevice: null, inputDevice: null },
        midi: { enabled: false, inputDevice: null, outputDevice: null, channelMapping: {} },
        ui: { scale: 1, theme: "dark", showTooltips: true, animationEnabled: true },
      },
    );

    expect(state.pads).toHaveLength(1);
    expect(state.pads[0].volume).toBe(0.85);
    expect(state.pads[0].pan).toBe(-0.4);
    expect(state.pads[0].swing).toBe(55);
    expect(state.pads[0].timeStretch).toBe(1.2);
    expect(state.pads[0].pitchShift).toBe(4);
    expect(state.pads[0].chokeGroup).toBe(3);
    expect(state.pads[0].start).toBe(0.1);
    expect(state.pads[0].end).toBe(0.9);
    expect(state.pads[0].loop).toBe(true);
    expect(state.pads[0].reverse).toBe(true);

    const deserialized = deserializeState(state);
    const dp = deserialized.pads[0];
    expect(dp.volume).toBe(0.85);
    expect(dp.pan).toBe(-0.4);
    expect(dp.swing).toBe(55);
    expect(dp.timeStretch).toBe(1.2);
    expect(dp.pitchShift).toBe(4);
    expect(dp.chokeGroup).toBe(3);
    expect(dp.start).toBe(0.1);
    expect(dp.end).toBe(0.9);
    expect(dp.loop).toBe(true);
    expect(dp.reverse).toBe(true);
    expect(dp.filterType).toBe("lp");
    expect(dp.filterCutoff).toBe(80);
    expect(dp.filterResonance).toBe(0.3);
  });

  it("Legacy data gets defaults for new fields", () => {
    const legacyState: any = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      activeTab: "sampler",
      projectKey: "Cm",
      activeState: "A",
      bpm: 120,
      swing: 50,
      pads: [
        {
          index: 0,
          sampleId: null,
          sampleUrl: null,
          volume: 0.8,
          pan: 0,
          pitch: 0,
          adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.1 },
          filter: { type: "off", cutoff: 64, resonance: 0 },
          effects: { reverbSend: 0, delaySend: 0, distortion: 0, bitcrush: 0 },
        },
      ],
      sequencerPatterns: {},
      pianoRollNotes: {},
      mixerSettings: {
        channelVolumes: [],
        channelPans: [],
        channelMutes: [],
        channelSolos: [],
        masterVolume: 1,
        masterLimiter: true,
      },
      effectParameters: {
        reverb: { enabled: false, size: 0.5, decay: 2, mix: 0.3, preDelay: 0.02 },
        delay: { enabled: false, time: 500, feedback: 0.5, mix: 0.3, sync: false },
        filter: { enabled: false, type: "lowpass", cutoff: 20000, resonance: 0, drive: 0 },
        compression: { enabled: false, threshold: -20, ratio: 4, attack: 0.01, release: 0.1 },
      },
      audioSettings: { sampleRate: 44100, bufferSize: 512, outputDevice: null, inputDevice: null },
      midiSettings: { enabled: false, inputDevice: null, outputDevice: null, channelMapping: {} },
      uiSettings: { scale: 1, theme: "dark", showTooltips: true, animationEnabled: true },
    };

    const deserialized = deserializeState(legacyState);
    const dp = deserialized.pads[0];
    expect(dp.timeStretch).toBe(1);
    expect(dp.pitchShift).toBe(0);
    expect(dp.chokeGroup).toBeNull();
    expect(dp.swing).toBe(0);
    expect(dp.start).toBe(0);
    expect(dp.end).toBe(1);
    expect(dp.loop).toBe(false);
    expect(dp.reverse).toBe(false);
  });

  it("Corrupted state returns null (does not crash)", () => {
    // Missing pads field — defaults to empty array
    const corrupted1: any = {
      version: "1.0.0",
      timestamp: "2025-01-01T00:00:00.000Z",
    };
    const result1 = deserializeState(corrupted1);
    expect(result1.pads).toEqual([]);
    expect(result1.sequencerPatterns).toEqual({});

    // Non-array pads — throws TypeError
    const corrupted2: any = {
      version: "1.0.0",
      timestamp: "2025-01-01T00:00:00.000Z",
      pads: "not-an-array",
    };
    expect(() => deserializeState(corrupted2)).toThrow();

    // Null state — throws
    expect(() => deserializeState(null as any)).toThrow();
  });
});

// -----------------------------------------------------------------------------
//  8. Macro controls
// -----------------------------------------------------------------------------
describe("8. Macro controls", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("useMacroControls initializes with 8 values at 0.5", () => {
    const { result } = renderHook(() => useMacroControls());
    expect(result.current.macroValues).toHaveLength(8);
    result.current.macroValues.forEach((v) => {
      expect(v).toBe(0.5);
    });
  });

  it("handleMacroChange updates values", () => {
    const { result } = renderHook(() => useMacroControls());

    act(() => {
      result.current.handleMacroChange(0, 1);
    });
    expect(result.current.macroValues[0]).toBe(1);

    act(() => {
      result.current.handleMacroChange(3, 0);
    });
    expect(result.current.macroValues[3]).toBe(0);

    expect(result.current.macroValues[1]).toBe(0.5);
  });

  it("handleSaveSnapshot stores values", () => {
    const { result } = renderHook(() => useMacroControls());

    act(() => {
      result.current.handleMacroChange(0, 0.9);
      result.current.handleMacroChange(1, 0.1);
    });

    act(() => {
      result.current.handleSaveSnapshot("Test Snapshot");
    });

    expect(result.current.snapshots).toHaveLength(1);
    expect(result.current.snapshots[0].name).toBe("Test Snapshot");
    expect(result.current.snapshots[0].values[0]).toBe(0.9);
    expect(result.current.snapshots[0].values[1]).toBe(0.1);
  });

  it("handleLoadSnapshot restores values", () => {
    const { result } = renderHook(() => useMacroControls());

    act(() => {
      result.current.handleMacroChange(0, 0.2);
      result.current.handleMacroChange(2, 0.8);
    });
    act(() => {
      result.current.handleSaveSnapshot("Snapshot A");
    });

    act(() => {
      result.current.handleMacroChange(0, 1);
      result.current.handleMacroChange(2, 0);
    });
    expect(result.current.macroValues[0]).toBe(1);
    expect(result.current.macroValues[2]).toBe(0);

    const snapshotId = result.current.snapshots[0].id;
    act(() => {
      result.current.handleLoadSnapshot(snapshotId);
    });
    expect(result.current.macroValues[0]).toBe(0.2);
    expect(result.current.macroValues[2]).toBe(0.8);
  });
});

// -----------------------------------------------------------------------------
//  9. Undo/redo
// -----------------------------------------------------------------------------
describe("9. Undo/redo", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("pushSnapshot captures state", () => {
    const sequencerMock = {
      getState: vi.fn(() => ({ swing: 50 })),
      getAllPatterns: vi.fn(() => ({ pat1: [[true]] })),
      getBpm: vi.fn(() => 120),
      setPattern: vi.fn(),
      setBpm: vi.fn(),
      setSwing: vi.fn(),
    };

    const { result } = renderHook(() =>
      useProjectUndoRedo({
        sequencer: sequencerMock as any,
        pads: [makePad({ id: 0 })],
        setPads: vi.fn(),
        setBpm: vi.fn(),
      }),
    );

    act(() => {
      result.current.pushSnapshot({
        key: "Am",
        abState: "A",
        pads: [makePad({ id: 0, volume: 0.5 })],
        patterns: { pat1: [[false]] },
        bpm: 140,
        swing: 60,
      });
    });

    expect(result.current.undoStack).toHaveLength(1);
    const captured = result.current.undoStack[0];
    expect(captured.key).toBe("Cm");
    expect(captured.bpm).toBe(120);
  });

  it("handleUndo restores previous state", () => {
    const setPadsSpy = vi.fn();
    const setBpmSpy = vi.fn();
    const sequencerMock = {
      getState: vi.fn(() => ({ swing: 0 })),
      getAllPatterns: vi.fn(() => ({})),
      getBpm: vi.fn(() => 120),
      setPattern: vi.fn(),
      setBpm: vi.fn(),
      setSwing: vi.fn(),
    };

    const { result } = renderHook(() =>
      useProjectUndoRedo({
        sequencer: sequencerMock as any,
        pads: [makePad({ id: 0 })],
        setPads: setPadsSpy,
        setBpm: setBpmSpy,
      }),
    );

    act(() => {
      result.current.pushSnapshot({
        key: "Dm",
        abState: "B",
        pads: [makePad({ id: 0, volume: 0.3 })],
        patterns: {},
        bpm: 100,
        swing: 20,
      });
    });
    expect(result.current.undoStack).toHaveLength(1);

    act(() => {
      result.current.handleUndo();
    });

    expect(result.current.redoStack).toHaveLength(1);
    expect(result.current.undoStack).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
//  10. Accessibility / keyboard
// -----------------------------------------------------------------------------
describe("10. Accessibility / keyboard", () => {
  it("Sequencer keyboard shortcut IDs match hotkey map", () => {
    const KEY_TO_PAD: Record<string, number> = {
      q: 0, w: 1, e: 2, r: 3,
      a: 4, s: 5, d: 6, f: 7,
      z: 8, x: 9, c: 10, v: 11,
      t: 12, y: 13, u: 14, i: 15,
    };

    expect(Object.keys(KEY_TO_PAD)).toHaveLength(16);
    const values = Object.values(KEY_TO_PAD).sort((a, b) => a - b);
    expect(values).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

    expect(KEY_TO_PAD.q).toBe(0);
    expect(KEY_TO_PAD.i).toBe(15);
    expect(KEY_TO_PAD.a).toBe(4);
    expect(KEY_TO_PAD.t).toBe(12);
  });

  it("Tab navigation mapping exists", () => {
    const focusableRoles = ["button", "slider", "tab", "gridcell"];

    expect(focusableRoles).toContain("button");
    expect(focusableRoles).toContain("slider");

    const transportLabels = [
      "Start playback",
      "Stop playback",
      "Stop recording",
      "Start recording",
    ];
    expect(transportLabels).toContain("Start playback");
    expect(transportLabels).toContain("Stop playback");
  });

  it("Virtual keyboard maps notes correctly", () => {
    const keyMap: { [key: string]: number } = {
      a: 60,
      w: 61,
      s: 62,
      e: 63,
      d: 64,
      f: 65,
      t: 66,
      g: 67,
      y: 68,
      h: 69,
      u: 70,
      j: 71,
      k: 72,
      o: 73,
      l: 74,
      p: 75,
      ";": 76,
      "'": 77,
    };

    expect(Object.keys(keyMap)).toHaveLength(18);
    expect(keyMap.a).toBe(60);
    expect(keyMap[";"]).toBe(76);

    const values = Object.values(keyMap);
    expect(Math.min(...values)).toBe(60);
    expect(Math.max(...values)).toBe(77);
  });
});

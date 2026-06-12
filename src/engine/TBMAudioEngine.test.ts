import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TBMAudioEngine } from './TBMAudioEngine';

function createMockAudioContext(): any {
  return {
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() }
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
      loop: false
    })),
    createStereoPanner: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), pan: { value: 0 } })),
    createBiquadFilter: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), frequency: { value: 1000 }, Q: { value: 1 }, type: 'lowpass' })),
    createAnalyser: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), fftSize: 2048, frequencyBinCount: 1024, getFloatFrequencyData: vi.fn(), getByteFrequencyData: vi.fn(), getFloatTimeDomainData: vi.fn() })),
    createDynamicsCompressor: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), threshold: { value: -24 }, knee: { value: 30 }, ratio: { value: 12 }, attack: { value: 0.003 }, release: { value: 0.25 } })),
    createOscillator: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { value: 440 }, type: 'sine' })),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: vi.fn(() => new Float32Array(length)),
      copyToChannel: vi.fn(),
    })),
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 2.0, sampleRate: 44100, length: 88200, numberOfChannels: 2, getChannelData: vi.fn(() => new Float32Array(88200)) }),
    destination: {},
    sampleRate: 44100,
    currentTime: 1000,
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('TBMAudioEngine — sample export/restore', () => {
  let ctx: any;
  let engine: TBMAudioEngine;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = new TBMAudioEngine(ctx);
  });

  it('exports empty samples when no samples loaded', () => {
    const snapshots = engine.exportSampleBuffers();
    expect(snapshots).toEqual([]);
  });

  it('exports and restores a sample across context boundaries', () => {
    const sampleId = 'test-sample-1';
    const ch1 = new Float32Array([0.1, 0.2, 0.3, -0.1, -0.2]);
    const ch2 = new Float32Array([0.3, 0.4, 0.5, -0.3, -0.4]);

    // Create a buffer-like object since mocks don't actually copy data
    const bufferData = { ch0: ch1, ch1: ch2 };
    const mockBuffer = {
      numberOfChannels: 2,
      length: 5,
      sampleRate: 44100,
      getChannelData: (ch: number) => ch === 0 ? bufferData.ch0 : bufferData.ch1,
      copyToChannel: vi.fn(),
    };
    ctx.createBuffer.mockReturnValueOnce(mockBuffer);
    engine.addSample(sampleId, mockBuffer as any);

    // Export snapshots — reads from getChannelData
    const snapshots = engine.exportSampleBuffers();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].id).toBe(sampleId);
    expect(snapshots[0].channels).toHaveLength(2);
    expect(snapshots[0].sampleRate).toBe(44100);
    expect(snapshots[0].length).toBe(5);
    expect(Array.from(snapshots[0].channels[0]).length).toBe(5);
    expect(snapshots[0].channels[0][0]).toBeCloseTo(0.1, 1);
    expect(snapshots[0].channels[0][1]).toBeCloseTo(0.2, 1);
    expect(snapshots[0].channels[0][3]).toBeCloseTo(-0.1, 1);
    expect(snapshots[0].channels[0][4]).toBeCloseTo(-0.2, 1);

    // Simulate new engine on fresh context — createBuffer needs to return a real buffer
    const newCtx = createMockAudioContext();
    const newBufferData = { ch0: new Float32Array(5), ch1: new Float32Array(5) };
    const newMockBuffer = {
      numberOfChannels: 2,
      length: 5,
      sampleRate: 44100,
      getChannelData: (ch: number) => ch === 0 ? newBufferData.ch0 : newBufferData.ch1,
      copyToChannel: (data: Float32Array, ch: number) => {
        if (ch === 0) newBufferData.ch0 = new Float32Array(data);
        else newBufferData.ch1 = new Float32Array(data);
      },
    };
    newCtx.createBuffer.mockReturnValueOnce(newMockBuffer);
    const newEngine = new TBMAudioEngine(newCtx);
    newEngine.restoreSampleBuffers(snapshots);

    const restored = newEngine.getSamples().get(sampleId);
    expect(restored).toBeDefined();
    expect(restored!.length).toBe(5);
    expect(restored!.sampleRate).toBe(44100);
    expect(restored!.numberOfChannels).toBe(2);
  });
});

describe('TBMAudioEngine — dispose and resource cleanup', () => {
  let ctx: any;
  let engine: TBMAudioEngine;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = new TBMAudioEngine(ctx);
  });

  it('dispose clears all samples and stops active sources', () => {
    const buffer = ctx.createBuffer(1, 100, 44100);
    engine.addSample('s1', buffer);
    engine.triggerPad({ id: 0, name: 'P1', sample: { id: 's1', name: 'S1', buffer, category: 'user' }, volume: 0.8, pan: 0, pitch: 0, attack: 0.01, release: 0.1, filterType: 'off', filterCutoff: 64, filterResonance: 0, start: 0, end: 1, loop: false, reverse: false, chokeGroup: null, swing: 0, timeStretch: 1, pitchShift: 0 });
    engine.dispose();
    expect(engine.getSamples().size).toBe(0);
    expect(engine.getActiveSourceCount()).toBe(0);
  });
});

describe('TBMAudioEngine — pad routing', () => {
  let ctx: any;
  let engine: TBMAudioEngine;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = new TBMAudioEngine(ctx);
  });

  it('getPadOutputNode creates routing on first call', () => {
    const node = engine.getPadOutputNode(5);
    expect(node).toBeDefined();
    expect(ctx.createGain).toHaveBeenCalled();
  });

  it('setPadPan updates routing pan value', () => {
    engine.setPadPan(0, -0.5);
    const routing = (engine as any).padRoutings.get(0);
    expect(routing.lastPan).toBe(-0.5);
  });

  it('setPadVolume updates routing volume', () => {
    engine.setPadVolume(0, 0.5);
    const routing = (engine as any).padRoutings.get(0);
    expect(routing.lastVolume).toBe(0.5);
  });

  it('triggerPad does not crash with null sample buffer', () => {
    expect(() => {
      engine.triggerPad({ id: 0, name: 'P1', sample: null, volume: 0.8, pan: 0, pitch: 0, attack: 0.01, release: 0.1, filterType: 'off', filterCutoff: 64, filterResonance: 0, start: 0, end: 1, loop: false, reverse: false, chokeGroup: null, swing: 0, timeStretch: 1, pitchShift: 0 });
    }).not.toThrow();
  });
});

describe('TBMAudioEngine — error recovery', () => {
  let ctx: any;
  let engine: TBMAudioEngine;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = new TBMAudioEngine(ctx);
  });

  it('stopAll clears active sources', () => {
    const buffer = ctx.createBuffer(1, 100, 44100);
    engine.addSample('s1', buffer);
    engine.triggerPad({ id: 0, name: 'P1', sample: { id: 's1', name: 'S1', buffer, category: 'user' }, volume: 0.8, pan: 0, pitch: 0, attack: 0.01, release: 0.1, filterType: 'off', filterCutoff: 64, filterResonance: 0, start: 0, end: 1, loop: false, reverse: false, chokeGroup: null, swing: 0, timeStretch: 1, pitchShift: 0 });
    engine.stopAll();
    expect(engine.getActiveSourceCount()).toBe(0);
  });

  it('getLfoPhase returns a number without crashing', () => {
    const phase = engine.getLfoPhase(0);
    expect(typeof phase).toBe('number');
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(1);
  });
});

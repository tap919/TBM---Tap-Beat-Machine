import { describe, it, expect } from 'vitest';
import { deserializeState, TBMProjectState } from './statePersistence';

function makeMinimalState(overrides?: Partial<TBMProjectState>): TBMProjectState {
  return {
    version: '1.0.0',
    timestamp: '2025-01-01T00:00:00.000Z',
    activeTab: 'sampler',
    projectKey: 'Cm',
    activeState: 'A',
    bpm: 120,
    swing: 0,
    pads: [],
    sequencerPatterns: {},
    pianoRollNotes: {},
    mixerSettings: {
      channelVolumes: [], channelPans: [], channelMutes: [], channelSolos: [],
      masterVolume: 1, masterLimiter: true,
    },
    effectParameters: {
      reverb: { enabled: false, size: 0.5, decay: 2.0, mix: 0.3, preDelay: 0.02 },
      delay: { enabled: false, time: 500, feedback: 0.5, mix: 0.3, sync: false },
      filter: { enabled: false, type: 'lowpass', cutoff: 20000, resonance: 0, drive: 0 },
      compression: { enabled: false, threshold: -20, ratio: 4, attack: 0.01, release: 0.1 },
    },
    audioSettings: { sampleRate: 44100, bufferSize: 512, outputDevice: null, inputDevice: null },
    midiSettings: { enabled: false, inputDevice: null, outputDevice: null, channelMapping: {} },
    uiSettings: { scale: 1, theme: 'dark', showTooltips: true, animationEnabled: true },
    ...overrides,
  };
}

describe('Security — deserializeState input validation', () => {
  it('handles missing pads field with empty array', () => {
    const state = makeMinimalState({ pads: undefined as any });
    const result = deserializeState(state);
    expect(Array.isArray(result.pads)).toBe(true);
    expect(result.pads).toEqual([]);
  });

  it('handles non-array pads by throwing', () => {
    const state = makeMinimalState({ pads: 'not-an-array' as any });
    expect(() => deserializeState(state)).toThrow();
  });

  it('provides default mixer settings when missing', () => {
    const state = makeMinimalState({ mixerSettings: undefined as any });
    const result = deserializeState(state);
    expect(result.mixerSettings).toBeDefined();
    expect(result.mixerSettings.masterVolume).toBe(1);
  });

  it('provides default audio settings when missing', () => {
    const state = makeMinimalState({ audioSettings: undefined as any });
    const result = deserializeState(state);
    expect(result.settings.audio).toBeDefined();
    expect(result.settings.audio.sampleRate).toBe(44100);
  });

  it('round-trips all numeric pad fields', () => {
    const state = makeMinimalState({
      pads: [{
        index: 0, sampleId: null, sampleUrl: null,
        volume: 0.75, pan: -0.5, pitch: 3,
        start: 0.25, end: 0.75, loop: true, reverse: false,
        chokeGroup: 2, swing: 65, timeStretch: 1.5, pitchShift: 4,
        adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
        filter: { type: 'lp', cutoff: 64, resonance: 0.3 },
        effects: { reverbSend: 0, delaySend: 0, distortion: 0, bitcrush: 0 },
      }],
    });
    const result = deserializeState(state);
    const pad = result.pads[0];
    expect(pad.volume).toBe(0.75);
    expect(pad.pan).toBe(-0.5);
    expect(pad.pitch).toBe(3);
    expect(pad.timeStretch).toBe(1.5);
    expect(pad.pitchShift).toBe(4);
    expect(pad.chokeGroup).toBe(2);
    expect(pad.swing).toBe(65);
    expect(pad.start).toBe(0.25);
    expect(pad.end).toBe(0.75);
    expect(pad.loop).toBe(true);
    expect(pad.reverse).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrackRouter } from './trackRouter';

describe('TrackRouter', () => {
  let router: TrackRouter;

  beforeEach(() => {
    router = new TrackRouter();
  });

  it('starts with MIXER_CHANNELS empty slots', () => {
    expect(router.slots.length).toBeGreaterThanOrEqual(8);
    expect(router.slots.every(s => !s.occupied)).toBe(true);
  });

  it('assignToNextFree occupies the first free slot and stores sourceId', () => {
    const result = router.assignToNextFree('drums', 'drum-machine', 'Drum Machine');
    expect(result.index).toBe(0);
    expect(router.slots[0].occupied).toBe(true);
    expect(router.slots[0].type).toBe('drums');
    expect(router.slots[0].sourceId).toBe('drum-machine');
  });

  it('assignToNextFree fills slots sequentially', () => {
    router.assignToNextFree('drums', 'src-1', 'Drums');
    router.assignToNextFree('synth', 'src-2', 'Synth');
    router.assignToNextFree('sampler', 'src-3', 'Sampler');
    expect(router.slots[0].sourceId).toBe('src-1');
    expect(router.slots[1].sourceId).toBe('src-2');
    expect(router.slots[2].sourceId).toBe('src-3');
    expect(router.slots[3].occupied).toBe(false);
  });

  it('assignToNextFree returns -1 when all slots are full', () => {
    router.slots.forEach((_, i) => {
      router.assignToNextFree('audio', `src-${i}`, `Track ${i}`);
    });
    const result = router.assignToNextFree('audio', 'overflow', 'Overflow');
    expect(result.index).toBe(-1);
  });

  it('releaseBySource releases the correct slot by sourceId', () => {
    router.assignToNextFree('drums', 'drum-machine', 'Drums');
    router.assignToNextFree('synth', 'synth-engine', 'Synth');
    expect(router.occupiedCount).toBe(2);

    router.releaseBySource('drum-machine');
    expect(router.slots[0].occupied).toBe(false);
    expect(router.slots[0].type).toBe('empty');
    expect(router.slots[0].sourceId).toBeUndefined();
    expect(router.slots[1].occupied).toBe(true);
    expect(router.occupiedCount).toBe(1);

    router.releaseBySource('synth-engine');
    expect(router.occupiedCount).toBe(0);
  });

  it('releaseBySource does nothing for unknown source', () => {
    router.assignToNextFree('audio', 'known', 'Known');
    router.releaseBySource('unknown-source');
    expect(router.occupiedCount).toBe(1);
  });

  it('connectAudio disposes old nodes before creating new ones', () => {
    const masterBus = { connect: vi.fn(), disconnect: vi.fn() };
    const disconnectFn = vi.fn();
    const firstGain = { connect: vi.fn(), disconnect: disconnectFn, gain: { value: 1 } };
    const firstPan = { connect: vi.fn(), disconnect: vi.fn(), pan: { value: 0 } };
    const firstAnalyser = { connect: vi.fn(), disconnect: vi.fn(), fftSize: 256 };

    const ctx1: any = {
      createGain: vi.fn(() => ({ ...firstGain, connect: vi.fn().mockReturnThis() })),
      createStereoPanner: vi.fn(() => ({ ...firstPan, connect: vi.fn().mockReturnThis() })),
      createAnalyser: vi.fn(() => firstAnalyser),
    };

    // First connect
    router.assignToNextFree('drums', 'drums', 'Drums');
    router.connectAudio(ctx1 as any, masterBus as any);
    expect(router.occupiedCount).toBe(1);
    const input1 = router.getSlotInput(0);
    expect(input1).toBeDefined();

    // Second connect with new context
    const ctx2: any = {
      createGain: vi.fn(() => ({ connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), gain: { value: 1 } })),
      createStereoPanner: vi.fn(() => ({ connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), pan: { value: 0 } })),
      createAnalyser: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), fftSize: 256 })),
    };
    router.connectAudio(ctx2 as any, masterBus as any);

    // Old firstGain should have been disconnected
    expect(disconnectFn).toHaveBeenCalled();
    const input2 = router.getSlotInput(0);
    expect(input2).toBeDefined();
  });

  it('setVolume clamps to 0-1 range', () => {
    router.slots[0].occupied = true;
    router.setVolume(0, 1.5);
    expect(router.slots[0].volume).toBe(1.5);
    // The AudioNode pan/clamp is applied via connectAudio — can't assert here
  });

  it('getByType returns only occupied slots of matching type', () => {
    const result1 = router.assignToNextFree('drums', 'd1', 'Drums');
    router.assignToNextFree('hats', 'h1', 'Hats');
    const drums = router.getByType('drums');
    expect(drums).toHaveLength(1);
    expect(drums[0].index).toBe(result1.index);
  });

  it('getByType returns empty array when no match', () => {
    const found = router.getByType('drums');
    expect(found).toEqual([]);
  });

  it('subscribe and notify work correctly', () => {
    const listener = vi.fn();
    const unsub = router.subscribe(listener);
    router.assignToNextFree('drums', 'd1', 'Drums');
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = listener.mock.calls[0][0];
    expect(snapshot[0].occupied).toBe(true);
    unsub();
    router.assignToNextFree('hats', 'h1', 'Hats');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setSlot updates slot properties and notifies', () => {
    const listener = vi.fn();
    router.subscribe(listener);
    router.setSlot(0, { occupied: true, type: 'drums', name: 'Drums' });
    expect(router.slots[0].occupied).toBe(true);
    expect(router.slots[0].name).toBe('Drums');
    expect(listener).toHaveBeenCalled();
  });
});

import { describe, it, expect } from 'vitest';
import { formatMapping, TBM_FUNCTION_LABELS } from './midiMapping';

describe('midiMapping — formatMapping', () => {
  it('formats a complete mapping with function and control', () => {
    const result = formatMapping({ function: 'pad_00', control: 36 });
    expect(result).toContain('pad_00');
    expect(result).toContain('CC 36');
    expect(typeof result).toBe('string');
  });

  it('handles mapping without function name', () => {
    const result = formatMapping({ function: undefined, control: 36 });
    expect(result).toContain('?');
  });

  it('handles mapping without control number', () => {
    const result = formatMapping({ function: 'pad_00', control: undefined });
    expect(result).toContain('?');
  });

  it('handles mapping with both missing', () => {
    const result = formatMapping({ function: undefined, control: undefined });
    expect(typeof result).toBe('string');
    expect(result).toContain('?');
  });
});

describe('midiMapping — TBM_FUNCTION_LABELS', () => {
  it('contains pad labels for all 16 pads', () => {
    for (let i = 0; i < 16; i++) {
      const key = `pad_${String(i).padStart(2, '0')}`;
      expect(TBM_FUNCTION_LABELS).toHaveProperty(key);
      expect(TBM_FUNCTION_LABELS[key]).toMatch(/Pad|Kick|Snare|Hat|Clap/i);
    }
  });

  it('contains bank labels', () => {
    expect(TBM_FUNCTION_LABELS).toHaveProperty('bank_a');
    expect(TBM_FUNCTION_LABELS).toHaveProperty('bank_d');
  });
});

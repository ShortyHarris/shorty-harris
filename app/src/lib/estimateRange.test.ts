import { describe, expect, it } from 'vitest';
import { estimateRange } from './estimateRange';

describe('estimateRange', () => {
  it('shows a plain range when both ends differ', () => {
    expect(estimateRange(40, 80)).toBe('40–80');
  });
  it('never shows a zero-width or zero range', () => {
    expect(estimateRange(50, 50)).toBe('About 50');
    expect(estimateRange(0, 0)).toBe('Fewer than 1');
    expect(estimateRange(0, 3)).toBe('Up to 3');
  });
  it('says when the campaign maximum is the ceiling', () => {
    expect(estimateRange(200, 200, 200)).toBe('Up to 200');
    expect(estimateRange(120, 200, 200)).toBe('120–200 (max)');
    expect(estimateRange(120, 180, 200)).toBe('120–180');
  });
  it('waits for numbers it does not have yet', () => {
    expect(estimateRange(undefined, 10)).toBe('…');
    expect(estimateRange(null, null)).toBe('…');
  });
  it('tolerates swapped ends', () => {
    expect(estimateRange(80, 40)).toBe('40–80');
  });
});

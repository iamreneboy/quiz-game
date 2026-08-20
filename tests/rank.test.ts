import { describe, it, expect } from 'vitest';
import { speedPoints, estimateDurationSeconds } from '@/lib/rank';

describe('speedPoints', () => {
  it('matches SQL formula floor(remaining/total*100)*tier', () => {
    expect(speedPoints(5000, 10000, 1)).toBe(50);
    expect(speedPoints(5000, 10000, 4)).toBe(200);
    expect(speedPoints(9999, 10000, 2)).toBe(198); // floor(99.99) = 99
    expect(speedPoints(0, 10000, 3)).toBe(0);
  });
});

describe('estimateDurationSeconds', () => {
  it('sums countdown + per-round read/answer/reveal/track', () => {
    // 3s countdown + N * (3 read + timer + 5 reveal + 4 track)
    expect(estimateDurationSeconds(12, 10)).toBe(3 + 12 * (3 + 10 + 5 + 4));
  });
});

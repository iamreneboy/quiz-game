import { describe, it, expect } from 'vitest';
import { quirkOffset } from '@/lib/world/quirk';

describe('quirkOffset', () => {
  it('bobs vertically at 14x amount, never rotates', () => {
    expect(quirkOffset('bob', 1, 0.5)).toEqual({ y: 7, rotation: 0 });
    expect(quirkOffset('bob', -1, 0.5)).toEqual({ y: -7, rotation: 0 });
  });

  it('pulses vertically at 5x amount, never rotates', () => {
    expect(quirkOffset('pulse', 1, 0.5)).toEqual({ y: 2.5, rotation: 0 });
    expect(quirkOffset('pulse', -1, 0.5)).toEqual({ y: -2.5, rotation: 0 });
  });

  it('tilts rotationally at 0.28x amount, never moves vertically', () => {
    expect(quirkOffset('tilt', 1, 0.5)).toEqual({ y: 0, rotation: 0.14 });
    expect(quirkOffset('tilt', -1, 0.5)).toEqual({ y: 0, rotation: -0.14 });
  });

  it('sways rotationally at 0.5x amount, never moves vertically', () => {
    // Matches P2's live measurement: amount 0.06 -> +-0.0300 rad.
    expect(quirkOffset('sway', 1, 0.06).rotation).toBeCloseTo(0.03, 10);
    expect(quirkOffset('sway', 1, 0.06)).toEqual({ y: 0, rotation: expect.any(Number) });
  });

  it('returns zero offset at phase zero for every kind', () => {
    for (const kind of ['bob', 'sway', 'tilt', 'pulse'] as const) {
      expect(quirkOffset(kind, 0, 1)).toEqual({ y: 0, rotation: 0 });
    }
  });
});

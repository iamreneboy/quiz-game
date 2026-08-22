import { describe, it, expect } from 'vitest';
import { TENSION_WINDOW_MS, tensionAt, tensionStep } from '@/lib/staging/tension';

describe('tensionAt', () => {
  it('stays flat until the window opens on a long timer', () => {
    expect(tensionAt(30_000, 30_000)).toBe(0);
    expect(tensionAt(TENSION_WINDOW_MS, 30_000)).toBe(0);
  });

  it('ramps linearly across the window', () => {
    expect(tensionAt(4000, 30_000)).toBeCloseTo(0.5, 5);
    expect(tensionAt(2000, 30_000)).toBeCloseTo(0.75, 5);
    expect(tensionAt(0, 30_000)).toBe(1);
  });

  it('uses the whole beat when the timer is shorter than the window', () => {
    // A 5s timer is under pressure throughout, but must still OPEN at zero.
    expect(tensionAt(5000, 5000)).toBe(0);
    expect(tensionAt(2500, 5000)).toBeCloseTo(0.5, 5);
    expect(tensionAt(0, 5000)).toBe(1);
  });

  it('clamps rather than overshooting when time has already run out', () => {
    expect(tensionAt(-500, 30_000)).toBe(1);
    expect(tensionAt(40_000, 30_000)).toBe(0);
  });

  it('is calm when the deadline or the total is unknown', () => {
    expect(tensionAt(null, 30_000)).toBe(0);
    expect(tensionAt(1000, 0)).toBe(0);
    expect(tensionAt(1000, -1)).toBe(0);
  });
});

describe('tensionStep', () => {
  it('quantizes the ramp for the values React genuinely re-renders on', () => {
    expect(tensionStep(0)).toBe(0);
    expect(tensionStep(0.01)).toBe(1);
    expect(tensionStep(0.49)).toBe(1);
    expect(tensionStep(0.5)).toBe(2);
    expect(tensionStep(0.84)).toBe(2);
    expect(tensionStep(0.85)).toBe(3);
    expect(tensionStep(1)).toBe(3);
  });
});

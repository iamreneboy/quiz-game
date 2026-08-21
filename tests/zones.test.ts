import { describe, it, expect } from 'vitest';
import { trackMetrics } from '@/lib/world/geometry';
import { ZONE_ORDER, gradeState, quantizeZoneWeights, zoneWeights } from '@/lib/world/zones';

const metrics = trackMetrics(12);
const at = (fraction: number) => zoneWeights(fraction * metrics.length, metrics);
const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

describe('zoneWeights', () => {
  it('names the three zones in track order', () => {
    expect(ZONE_ORDER).toEqual(['officePark', 'neonCity', 'stadium']);
  });

  it('always sums to one', () => {
    for (let f = -0.2; f <= 1.2; f += 0.02) expect(sum(at(f))).toBeCloseTo(1, 6);
  });

  it('is pure office park at the start line', () => {
    expect(at(0)).toEqual({ officePark: 1, neonCity: 0, stadium: 0 });
  });

  it('is pure stadium at the finish line', () => {
    expect(at(1)).toEqual({ officePark: 0, neonCity: 0, stadium: 1 });
  });

  it('clamps past the run-off at either end', () => {
    expect(at(-0.5)).toEqual(at(0));
    expect(at(1.5)).toEqual(at(1));
  });

  it('is pure neon city midway', () => {
    expect(at(0.5)).toEqual({ officePark: 0, neonCity: 1, stadium: 0 });
  });

  it('blends exactly half and half on each boundary', () => {
    const first = at(1 / 3);
    expect(first.officePark).toBeCloseTo(0.5, 6);
    expect(first.neonCity).toBeCloseTo(0.5, 6);

    const second = at(2 / 3);
    expect(second.neonCity).toBeCloseTo(0.5, 6);
    expect(second.stadium).toBeCloseTo(0.5, 6);
  });

  it('never mixes the first and last zone', () => {
    for (let f = 0; f <= 1; f += 0.01) {
      const w = at(f);
      expect(Math.min(w.officePark, w.stadium)).toBe(0);
    }
  });

  it('visits all three zones even on a one-question track', () => {
    const short = trackMetrics(1);
    expect(zoneWeights(0, short).officePark).toBe(1);
    expect(zoneWeights(short.length, short).stadium).toBe(1);
  });
});

describe('gradeState', () => {
  it('starts subdued and deepens across the game', () => {
    const start = gradeState(0, 0);
    const end = gradeState(1, 0);
    expect(start.intensity).toBeLessThan(end.intensity);
    expect(start.hue).toBe('neutral');
  });

  it('goes neon and near-maximum for the final question', () => {
    const final = gradeState(0.9, 1);
    expect(final.hue).toBe('neon');
    expect(final.intensity).toBeGreaterThan(gradeState(0.9, 0).intensity);
    expect(final.intensity).toBeLessThanOrEqual(1);
  });

  it('is monotonic in escalation', () => {
    let previous = -1;
    for (let e = 0; e <= 1; e += 0.1) {
      const value = gradeState(0.4, e).intensity;
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('clamps inputs outside 0..1', () => {
    expect(gradeState(-3, -3)).toEqual(gradeState(0, 0));
    expect(gradeState(9, 9)).toEqual(gradeState(1, 1));
  });
});

describe('quantizeZoneWeights', () => {
  it('collapses a blend to its dominant zone', () => {
    expect(quantizeZoneWeights({ officePark: 0.4, neonCity: 0.6, stadium: 0 }))
      .toEqual({ officePark: 0, neonCity: 1, stadium: 0 });
  });

  it('leaves an already-pure zone untouched', () => {
    const pure = { officePark: 0, neonCity: 0, stadium: 1 };
    expect(quantizeZoneWeights(pure)).toEqual(pure);
  });

  it('breaks an exact tie toward the earlier zone', () => {
    expect(quantizeZoneWeights({ officePark: 0.5, neonCity: 0.5, stadium: 0 }))
      .toEqual({ officePark: 1, neonCity: 0, stadium: 0 });
  });
});

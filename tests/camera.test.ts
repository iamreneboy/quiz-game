import { describe, it, expect } from 'vitest';
import { EASE, DURATION } from '@/lib/presentation/tokens';
import { SEGMENT_WIDTH, trackMetrics } from '@/lib/world/geometry';
import {
  MAX_SPAN_SEGMENTS,
  MIN_SPAN_SEGMENTS,
  beginMove,
  clampCamera,
  cubicBezierEase,
  driftOffset,
  isMoveComplete,
  sampleMove,
  spanLimits,
} from '@/lib/world/camera';

describe('spanLimits', () => {
  it('caps the widest shot at the track length for a short game', () => {
    const limits = spanLimits(trackMetrics(8));
    expect(limits.max).toBe(8 * SEGMENT_WIDTH);
    expect(limits.min).toBe(MIN_SPAN_SEGMENTS * SEGMENT_WIDTH);
  });

  it('caps the widest shot at MAX_SPAN_SEGMENTS for a long game', () => {
    const limits = spanLimits(trackMetrics(40));
    expect(limits.max).toBe(MAX_SPAN_SEGMENTS * SEGMENT_WIDTH);
  });

  it('never lets min exceed max on a one-segment track', () => {
    const limits = spanLimits(trackMetrics(1));
    expect(limits.min).toBeLessThanOrEqual(limits.max);
  });
});

describe('clampCamera', () => {
  const metrics = trackMetrics(12);

  it('keeps the view inside the track bounds', () => {
    const clamped = clampCamera({ centerX: -9999, span: 4 * SEGMENT_WIDTH }, metrics);
    expect(clamped.centerX).toBe(metrics.minX + 2 * SEGMENT_WIDTH);
  });

  it('clamps the far edge too', () => {
    const clamped = clampCamera({ centerX: 99999, span: 4 * SEGMENT_WIDTH }, metrics);
    expect(clamped.centerX).toBe(metrics.maxX - 2 * SEGMENT_WIDTH);
  });

  it('clamps the span into its limits before centring', () => {
    const clamped = clampCamera({ centerX: 1000, span: 999999 }, metrics);
    expect(clamped.span).toBe(spanLimits(metrics).max);
  });

  it('centres the whole track when the span exceeds the bounds width', () => {
    const metricsShort = trackMetrics(1);
    const clamped = clampCamera({ centerX: 0, span: spanLimits(metricsShort).max }, metricsShort);
    expect(clamped.centerX).toBeCloseTo((metricsShort.minX + metricsShort.maxX) / 2, 5);
  });
});

describe('cubicBezierEase', () => {
  it('pins the endpoints', () => {
    expect(cubicBezierEase(EASE.drift, 0)).toBe(0);
    expect(cubicBezierEase(EASE.drift, 1)).toBe(1);
    expect(cubicBezierEase(EASE.drift, -0.5)).toBe(0);
    expect(cubicBezierEase(EASE.drift, 2)).toBe(1);
  });

  it('is monotonic for a non-overshooting curve', () => {
    let previous = 0;
    for (let p = 0.1; p <= 1; p += 0.1) {
      const value = cubicBezierEase(EASE.snap, p);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('overshoots past 1 for the settle curve', () => {
    const samples = Array.from({ length: 19 }, (_, i) => cubicBezierEase(EASE.settle, (i + 1) / 20));
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });
});

describe('moves', () => {
  const metrics = trackMetrics(12);
  const from = clampCamera({ centerX: 500, span: 4 * SEGMENT_WIDTH }, metrics);
  const to = clampCamera({ centerX: 2500, span: 6 * SEGMENT_WIDTH }, metrics);

  it('uses the cut duration and snap curve for a cut', () => {
    const move = beginMove(from, to, 'cut', 'high', 1000);
    expect(move.durationMs).toBe(DURATION.cut);
    expect(move.ease).toEqual(EASE.snap);
  });

  it('uses the drift duration and drift curve for a drift', () => {
    const move = beginMove(from, to, 'drift', 'high', 1000);
    expect(move.durationMs).toBe(DURATION.drift);
    expect(move.ease).toEqual(EASE.drift);
  });

  it('collapses a drift to the cut duration under the reduced profile', () => {
    const move = beginMove(from, to, 'drift', 'reduced', 1000);
    expect(move.durationMs).toBe(DURATION.cut);
  });

  it('samples the start and the end exactly', () => {
    const move = beginMove(from, to, 'drift', 'high', 1000);
    expect(sampleMove(move, 1000)).toEqual(from);
    expect(sampleMove(move, 1000 + DURATION.drift)).toEqual(to);
    expect(sampleMove(move, 9_999_999)).toEqual(to);
  });

  it('moves partway through the middle of a move', () => {
    const move = beginMove(from, to, 'drift', 'high', 1000);
    const mid = sampleMove(move, 1000 + DURATION.drift / 2);
    expect(mid.centerX).toBeGreaterThan(from.centerX);
    expect(mid.centerX).toBeLessThan(to.centerX);
  });

  it('reports completion only after the duration elapses', () => {
    const move = beginMove(from, to, 'cut', 'high', 1000);
    expect(isMoveComplete(move, 1000 + DURATION.cut - 1)).toBe(false);
    expect(isMoveComplete(move, 1000 + DURATION.cut)).toBe(true);
  });
});

describe('driftOffset', () => {
  const camera = { centerX: 1000, span: 4 * SEGMENT_WIDTH };

  it('is zero under the reduced profile', () => {
    expect(driftOffset(1234, camera, 'reduced')).toBe(0);
  });

  it('stays small relative to the visible span under the high profile', () => {
    for (let t = 0; t < 20_000; t += 137) {
      expect(Math.abs(driftOffset(t, camera, 'high'))).toBeLessThanOrEqual(camera.span * 0.02);
    }
  });

  it('oscillates rather than drifting away', () => {
    const samples = Array.from({ length: 400 }, (_, i) => driftOffset(i * 100, camera, 'high'));
    expect(Math.min(...samples)).toBeLessThan(0);
    expect(Math.max(...samples)).toBeGreaterThan(0);
  });
});

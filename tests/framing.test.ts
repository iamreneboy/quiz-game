import { describe, it, expect } from 'vitest';
import { SEGMENT_WIDTH, markerAnchors, trackMetrics, gridAnchors, type MarkerAnchor } from '@/lib/world/geometry';
import { spanLimits } from '@/lib/world/camera';
import { frameTarget, offscreenPlayerIds, type FramingInput } from '@/lib/world/framing';

const viewport = { width: 1280, height: 720 };

function input(anchors: MarkerAnchor[], segments: number, overrides: Partial<FramingInput> = {}): FramingInput {
  return {
    anchors,
    metrics: trackMetrics(segments),
    viewport,
    localPlayerId: null,
    emphasisIds: [],
    ...overrides,
  };
}

function anchorsFor(pairs: [string, number][], segments: number): MarkerAnchor[] {
  return markerAnchors(
    pairs.map(([player_id, correct]) => ({ player_id, correct, speed_points: 0 })),
    trackMetrics(segments),
  );
}

describe('frameTarget', () => {
  it('parks at the start line for the lobby', () => {
    const target = frameTarget('startLine', input([], 12));
    expect(target.centerX).toBeLessThan(6 * SEGMENT_WIDTH);
    expect(target.span).toBeLessThanOrEqual(spanLimits(trackMetrics(12)).max);
  });

  it('shows the whole track when establishing a short game', () => {
    const target = frameTarget('establishing', input([], 8));
    expect(target.span).toBe(spanLimits(trackMetrics(8)).max);
  });

  it('falls back to establishing when there are no anchors', () => {
    expect(frameTarget('pack', input([], 10))).toEqual(frameTarget('establishing', input([], 10)));
  });

  it('frames the pack between last place and the leader', () => {
    const anchors = anchorsFor([['a', 2], ['b', 5]], 12);
    const target = frameTarget('pack', input(anchors, 12));
    expect(target.centerX).toBeCloseTo(3.5 * SEGMENT_WIDTH, 5);
    expect(target.span).toBeGreaterThan(3 * SEGMENT_WIDTH);
  });

  it('does not push closer than the minimum span when everyone is tied', () => {
    const anchors = anchorsFor([['a', 4], ['b', 4], ['c', 4]], 12);
    const target = frameTarget('pack', input(anchors, 12));
    expect(target.span).toBeGreaterThanOrEqual(spanLimits(trackMetrics(12)).min);
  });

  it('keeps the local player in frame when the field outruns the max span', () => {
    const anchors = anchorsFor([['tail', 0], ['leader', 30]], 32);
    const target = frameTarget('pack', input(anchors, 32, { localPlayerId: 'tail' }));
    const limits = spanLimits(trackMetrics(32));
    expect(target.span).toBe(limits.max);
    const left = target.centerX - target.span / 2;
    const right = target.centerX + target.span / 2;
    expect(left).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(0);
  });

  it('favours the leader when the field fits but is wide', () => {
    const anchors = anchorsFor([['tail', 0], ['leader', 30]], 32);
    const target = frameTarget('pack', input(anchors, 32, { localPlayerId: 'leader' }));
    const right = target.centerX + target.span / 2;
    expect(right).toBeGreaterThanOrEqual(30 * SEGMENT_WIDTH);
  });

  it('pushes in tight on the players named for emphasis', () => {
    const anchors = anchorsFor([['a', 1], ['b', 2], ['c', 9]], 12);
    const target = frameTarget('emphasis', input(anchors, 12, { emphasisIds: ['a', 'b'] }));
    expect(target.span).toBeLessThan(frameTarget('pack', input(anchors, 12)).span);
    expect(target.centerX).toBeCloseTo(1.5 * SEGMENT_WIDTH, 5);
  });

  it('falls back to the pack shot when the emphasised ids are unknown', () => {
    const anchors = anchorsFor([['a', 1], ['b', 2]], 12);
    expect(frameTarget('emphasis', input(anchors, 12, { emphasisIds: ['ghost'] })))
      .toEqual(frameTarget('pack', input(anchors, 12)));
  });

  it('produces the same shot regardless of viewport aspect', () => {
    const anchors = anchorsFor([['a', 2], ['b', 5]], 12);
    const wide = frameTarget('pack', input(anchors, 12));
    const tall = frameTarget('pack', input(anchors, 12, { viewport: { width: 390, height: 844 } }));
    expect(tall).toEqual(wide);
  });

  it('always returns a camera inside the track bounds', () => {
    for (const segments of [1, 2, 12, 40]) {
      for (const mode of ['startLine', 'establishing', 'pack', 'emphasis'] as const) {
        const anchors = anchorsFor([['a', 0], ['b', segments]], segments);
        const target = frameTarget(mode, input(anchors, segments, { emphasisIds: ['a'] }));
        const metrics = trackMetrics(segments);
        expect(target.span).toBeLessThanOrEqual(spanLimits(metrics).max);
        expect(target.centerX).toBeGreaterThanOrEqual(metrics.minX);
        expect(target.centerX).toBeLessThanOrEqual(metrics.maxX);
      }
    }
  });
});

describe('offscreenPlayerIds', () => {
  it('reports nobody when everyone fits', () => {
    const anchors = anchorsFor([['a', 2], ['b', 4]], 12);
    const camera = frameTarget('pack', input(anchors, 12));
    expect(offscreenPlayerIds(anchors, camera, viewport)).toEqual([]);
  });

  it('reports players outside the visible span', () => {
    const anchors = anchorsFor([['tail', 0], ['leader', 30]], 32);
    const camera = frameTarget('pack', input(anchors, 32, { localPlayerId: 'leader' }));
    expect(offscreenPlayerIds(anchors, camera, viewport)).toContain('tail');
  });
});

describe('startLine framing', () => {
  it('frames the grid formation when one is present', () => {
    const anchors = gridAnchors([{ id: 'a' }, { id: 'b' }, { id: 'c' }], trackMetrics(12));
    const shot = frameTarget('startLine', input(anchors, 12, { localPlayerId: 'a' }));
    const fallback = frameTarget('startLine', input([], 12, { localPlayerId: 'a' }));

    // The whole formation is inside the shot...
    const lo = Math.min(...anchors.map(a => a.x));
    expect(shot.centerX - shot.span / 2).toBeLessThanOrEqual(lo);
    // ...and the shot is tighter and further back than the fixed establishing one.
    expect(shot.span).toBeLessThan(fallback.span);
    expect(shot.centerX).toBeLessThan(fallback.centerX);
  });

  it('falls back to a fixed shot with an empty grid', () => {
    expect(frameTarget('startLine', input([], 12)).span).toBeGreaterThan(0);
  });
});

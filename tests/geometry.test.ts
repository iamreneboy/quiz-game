import { describe, it, expect } from 'vitest';
import {
  SEGMENT_WIDTH,
  TRACK_MARGIN,
  MARKER_ROW_HEIGHT,
  trackMetrics,
  segmentToWorldX,
  worldScale,
  worldXToScreen,
  horizonY,
  markerAnchors,
  gridAnchors,
  type GridPlayer,
} from '@/lib/world/geometry';

describe('trackMetrics', () => {
  it('lays the track out from a question count', () => {
    expect(trackMetrics(12)).toEqual({
      segments: 12,
      length: 12 * SEGMENT_WIDTH,
      minX: -TRACK_MARGIN,
      maxX: 12 * SEGMENT_WIDTH + TRACK_MARGIN,
    });
  });

  it('supports a one-question game', () => {
    const m = trackMetrics(1);
    expect(m.segments).toBe(1);
    expect(m.length).toBe(SEGMENT_WIDTH);
  });

  it('clamps a zero or negative question count to one segment', () => {
    expect(trackMetrics(0).segments).toBe(1);
    expect(trackMetrics(-4).segments).toBe(1);
  });
});

describe('segmentToWorldX', () => {
  it('places segment 0 at the origin and scales linearly', () => {
    expect(segmentToWorldX(0)).toBe(0);
    expect(segmentToWorldX(3)).toBe(3 * SEGMENT_WIDTH);
  });
});

describe('screen transform', () => {
  const viewport = { width: 800, height: 400 };
  const camera = { centerX: 1000, span: 2000 };

  it('maps the camera centre to the middle of the viewport', () => {
    expect(worldXToScreen(1000, camera, viewport)).toBe(400);
  });

  it('maps world units to pixels through the visible span', () => {
    expect(worldScale(camera, viewport)).toBe(0.4);
    expect(worldXToScreen(0, camera, viewport)).toBe(0);
    expect(worldXToScreen(2000, camera, viewport)).toBe(800);
  });

  it('puts the horizon below the vertical middle', () => {
    expect(horizonY(viewport)).toBeCloseTo(288, 5);
  });
});

describe('markerAnchors', () => {
  const metrics = trackMetrics(10);

  it('places each player at their correct-answer segment', () => {
    const anchors = markerAnchors(
      [{ player_id: 'a', correct: 3, speed_points: 10 }],
      metrics,
    );
    expect(anchors[0]).toMatchObject({ playerId: 'a', segment: 3, row: 0, y: 0 });
    expect(anchors[0].x).toBe(3 * SEGMENT_WIDTH);
  });

  it('stacks players tied on a segment, highest speed points on the edge', () => {
    const anchors = markerAnchors(
      [
        { player_id: 'slow', correct: 2, speed_points: 40 },
        { player_id: 'fast', correct: 2, speed_points: 90 },
        { player_id: 'mid', correct: 2, speed_points: 65 },
      ],
      metrics,
    );
    expect(anchors.map(a => a.playerId)).toEqual(['slow', 'fast', 'mid']);
    const rows = Object.fromEntries(anchors.map(a => [a.playerId, a.row]));
    expect(rows).toEqual({ fast: 0, mid: 1, slow: 2 });
    expect(anchors.find(a => a.playerId === 'mid')!.y).toBe(-MARKER_ROW_HEIGHT);
  });

  it('keeps players on different segments in their own stacks', () => {
    const anchors = markerAnchors(
      [
        { player_id: 'a', correct: 1, speed_points: 10 },
        { player_id: 'b', correct: 4, speed_points: 10 },
      ],
      metrics,
    );
    expect(anchors.every(a => a.row === 0)).toBe(true);
  });

  it('clamps a correct count beyond the finish line onto the last segment', () => {
    const anchors = markerAnchors(
      [{ player_id: 'a', correct: 99, speed_points: 0 }],
      trackMetrics(6),
    );
    expect(anchors[0].segment).toBe(6);
    expect(anchors[0].x).toBe(6 * SEGMENT_WIDTH);
  });

  it('returns an empty list for no standings', () => {
    expect(markerAnchors([], metrics)).toEqual([]);
  });
});

describe('gridAnchors', () => {
  const players = (n: number): GridPlayer[] =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

  it('places everyone behind the start line', () => {
    for (const a of gridAnchors(players(8), trackMetrics(12))) {
      expect(a.x).toBeLessThan(0);
      expect(a.x).toBeGreaterThanOrEqual(-TRACK_MARGIN);
    }
  });

  it('staggers into two rows', () => {
    const anchors = gridAnchors(players(4), trackMetrics(12));
    expect(anchors[0].row).toBe(0);
    expect(anchors[1].row).toBe(1);
    expect(anchors[2].row).toBe(0);
    expect(anchors[1].y).toBeLessThan(anchors[0].y);
  });

  it('puts each pair further back than the last', () => {
    const anchors = gridAnchors(players(6), trackMetrics(12));
    expect(anchors[2].x).toBeLessThan(anchors[0].x);
    expect(anchors[4].x).toBeLessThan(anchors[2].x);
  });

  it('handles an empty lobby', () => {
    expect(gridAnchors([], trackMetrics(12))).toEqual([]);
  });

  it('keeps a single player on the front row', () => {
    const [only] = gridAnchors(players(1), trackMetrics(12));
    expect(only.row).toBe(0);
    expect(only.y).toBe(0);
  });

  it('compresses the formation to fit the run-off for a full field', () => {
    const anchors = gridAnchors(players(20), trackMetrics(12));
    for (const a of anchors) {
      expect(a.x).toBeLessThan(0);
      expect(a.x).toBeGreaterThanOrEqual(-TRACK_MARGIN);
    }
    // Every column gets its own x — no two pairs stack on the same spot.
    const columnXs = anchors.filter(a => a.row === 0).map(a => a.x);
    expect(new Set(columnXs).size).toBe(columnXs.length);
  });
});

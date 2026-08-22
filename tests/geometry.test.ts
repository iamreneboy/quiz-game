import { describe, it, expect } from 'vitest';
import {
  SEGMENT_WIDTH,
  TRACK_MARGIN,
  MARKER_ROW_HEIGHT,
  MAX_STACK_RISE,
  GRID_EDGE_MARGIN,
  RIG_HALF_WIDTH,
  RIG_TOP,
  RIG_BOTTOM,
  trackMetrics,
  segmentToWorldX,
  worldScale,
  worldXToScreen,
  worldYToScreen,
  horizonY,
  stackPitch,
  markerAnchors,
  startLineAnchors,
  gridAnchors,
  type GridPlayer,
} from '@/lib/world/geometry';
import {
  AVATAR_HALF_WIDTH,
  AVATAR_HEIGHT,
  AVATAR_RIG_HEIGHT,
} from '@/lib/world/content/roster';

/**
 * P1's `MARKER_ROW_HEIGHT = 74` was sized for a 52-unit puck and never revisited
 * when P2 replaced it with a rig two and a bit rows tall, which put stacked
 * avatars off the top of the canvas with nothing reporting it. These assert the
 * DERIVATION rather than the numbers, so the two cannot drift apart again.
 */
describe('the row pitch is derived from the rig', () => {
  it('is a fraction of the rig body, not an unrelated literal', () => {
    expect(MARKER_ROW_HEIGHT).toBe(AVATAR_HEIGHT * 0.5);
    expect(MARKER_ROW_HEIGHT).toBeLessThan(AVATAR_RIG_HEIGHT);
  });

  it('exposes the rig half-width the formations keep clear of the frame edge', () => {
    expect(RIG_HALF_WIDTH).toBe(AVATAR_HALF_WIDTH);
    expect(GRID_EDGE_MARGIN).toBeGreaterThan(RIG_HALF_WIDTH);
  });

  it('holds full pitch while the stack fits, then compresses to the cap', () => {
    expect(stackPitch(1)).toBe(MARKER_ROW_HEIGHT);
    expect(stackPitch(2)).toBe(MARKER_ROW_HEIGHT);
    expect(stackPitch(3)).toBe(MARKER_ROW_HEIGHT);
    // Eight tied players would rise 7 * MARKER_ROW_HEIGHT unchecked.
    expect(stackPitch(8)).toBeLessThan(MARKER_ROW_HEIGHT);
    expect(stackPitch(8) * 7).toBeCloseTo(MAX_STACK_RISE, 5);
  });

  it('never lets a stack rise past the cap, however deep the tie', () => {
    for (const n of [2, 3, 5, 8, 12, 20]) {
      expect(stackPitch(n) * (n - 1)).toBeLessThanOrEqual(MAX_STACK_RISE + 1e-9);
    }
  });
});

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

  it('compresses a deep stack instead of growing it off the frame', () => {
    const tied = Array.from({ length: 8 }, (_, i) => ({
      player_id: `p${i}`, correct: 4, speed_points: 100 - i,
    }));
    const anchors = markerAnchors(tied, metrics);

    // Ordering survives compression: one row each, ranked by speed points.
    expect(anchors.map(a => a.row)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(anchors.map(a => a.y)).size).toBe(8);
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i].y).toBeLessThan(anchors[i - 1].y);
    }

    const top = Math.min(...anchors.map(a => a.y));
    expect(-top).toBeLessThanOrEqual(MAX_STACK_RISE + 1e-9);
    // ...which is strictly tighter than the uncompressed stack would have been.
    expect(-top).toBeLessThan(7 * MARKER_ROW_HEIGHT);
  });

  it('leaves a shallow stack at full pitch — only deep ties pay', () => {
    const anchors = markerAnchors(
      [
        { player_id: 'a', correct: 2, speed_points: 90 },
        { player_id: 'b', correct: 2, speed_points: 40 },
        { player_id: 'c', correct: 5, speed_points: 10 },
      ],
      metrics,
    );
    expect(anchors.find(a => a.playerId === 'b')!.y).toBe(-MARKER_ROW_HEIGHT);
  });

  it('compresses each segment independently', () => {
    const crowd = Array.from({ length: 8 }, (_, i) => ({
      player_id: `crowd${i}`, correct: 3, speed_points: 100 - i,
    }));
    const anchors = markerAnchors(
      [...crowd, { player_id: 'pair', correct: 6, speed_points: 5 },
        { player_id: 'pair2', correct: 6, speed_points: 4 }],
      metrics,
    );
    // The two-way tie keeps the full pitch even though another segment holds 8.
    expect(anchors.find(a => a.playerId === 'pair2')!.y).toBe(-MARKER_ROW_HEIGHT);
    expect(anchors.find(a => a.playerId === 'crowd1')!.y).toBeGreaterThan(-MARKER_ROW_HEIGHT);
  });

  it('keeps every rig of a fully tied field inside a 1280x720 frame', () => {
    // The C1 regression, expressed where it is cheapest to check: the minimum
    // camera span is the tightest the world ever gets, so it is the worst case.
    const viewport = { width: 1280, height: 720 };
    const camera = { centerX: 4 * SEGMENT_WIDTH, span: 800 };
    const tied = Array.from({ length: 8 }, (_, i) => ({
      player_id: `p${i}`, correct: 4, speed_points: 100 - i,
    }));
    const scale = worldScale(camera, viewport);
    for (const anchor of markerAnchors(tied, metrics)) {
      const y = worldYToScreen(anchor.y, camera, viewport);
      expect(y + RIG_TOP * scale).toBeGreaterThan(0);
      expect(y + RIG_BOTTOM * scale).toBeLessThan(viewport.height);
    }
  });
});

// `standings` is null until the first round resolves (lib/store.ts:19), but the
// race has already started and the countdown renders at the FULL band
// (components/PixiStage.tsx:10) — so the field has to be standing somewhere.
describe('startLineAnchors', () => {
  const metrics = trackMetrics(10);
  const roster = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('puts every player on segment 0', () => {
    const anchors = startLineAnchors(roster, metrics);
    expect(anchors.map(a => a.playerId)).toEqual(['a', 'b', 'c']);
    expect(anchors.every(a => a.segment === 0)).toBe(true);
    expect(anchors.every(a => a.x === segmentToWorldX(0))).toBe(true);
  });

  it('lays the field out exactly as markerAnchors does for an all-zero field', () => {
    // The real contract: round 1's own reveal produces a level field, so the
    // start line must be the same shape and nothing novel enters the layout.
    expect(startLineAnchors(roster, metrics)).toEqual(
      markerAnchors(
        roster.map(p => ({ player_id: p.id, correct: 0, speed_points: 0 })),
        metrics,
      ),
    );
  });

  it('row-stacks the field, since everyone is tied on the line', () => {
    const anchors = startLineAnchors(roster, metrics);
    expect(anchors.map(a => a.row)).toEqual([0, 1, 2]);
    expect(anchors.map(a => a.y)).toEqual([0, -MARKER_ROW_HEIGHT, -2 * MARKER_ROW_HEIGHT]);
  });

  it('returns an empty list for an empty roster', () => {
    expect(startLineAnchors([], metrics)).toEqual([]);
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

  it('keeps the rearmost column clear of the camera bound', () => {
    // `clampCamera` pins the camera's left edge to `metrics.minX`, so a column
    // that reaches it is drawn half off-canvas. Strictly greater, not equal —
    // and with the rig's own half-width still to spare.
    for (const n of [7, 8, 12, 20]) {
      const metrics = trackMetrics(12);
      const anchors = gridAnchors(players(n), metrics);
      const rear = Math.min(...anchors.map(a => a.x));
      expect(rear).toBeGreaterThan(metrics.minX);
      expect(rear - RIG_HALF_WIDTH).toBeGreaterThan(metrics.minX);
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

  it('stacks its second row on the same derived pitch as a tie', () => {
    const anchors = gridAnchors(players(2), trackMetrics(12));
    expect(anchors[1].y).toBe(-stackPitch(2));
  });
});

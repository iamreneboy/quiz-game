import { describe, it, expect } from 'vitest';
import {
  MAX_STACK_RISE,
  RIG_BOTTOM,
  RIG_HALF_WIDTH,
  RIG_TOP,
  SEGMENT_WIDTH,
  markerAnchors,
  startLineAnchors,
  trackMetrics,
  gridAnchors,
  worldScale,
  worldXToScreen,
  worldYToScreen,
  type MarkerAnchor,
} from '@/lib/world/geometry';
import { spanLimits } from '@/lib/world/camera';
import {
  STACK_RISE_FLOOR,
  frameTarget,
  headroom,
  offscreenPlayerIds,
  stackRiseLimit,
  type FramingInput,
} from '@/lib/world/framing';
import { BLOCK_HEIGHTS, BLOCK_WIDTH, blockX } from '@/lib/world/podium';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

/** Every corner of a rig drawn at `anchor`, in screen pixels. */
function rigBox(anchor: MarkerAnchor, camera: { centerX: number; span: number }, view = viewport) {
  const scale = worldScale(camera, view);
  const x = worldXToScreen(anchor.x, camera, view);
  const y = worldYToScreen(anchor.y, camera, view);
  return {
    left: x - RIG_HALF_WIDTH * scale,
    right: x + RIG_HALF_WIDTH * scale,
    top: y + RIG_TOP * scale,
    bottom: y + RIG_BOTTOM * scale,
  };
}

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
    expect(target.span).toBe(trackMetrics(8).length);
    expect(target.span).toBeLessThanOrEqual(spanLimits(trackMetrics(8)).max);
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

  // C1: the camera is fitted on x alone, so a bunched field stacks UPWARD out of
  // frame at a perfectly normal x. Testing x only reported nobody missing.
  it('reports a player stacked above the canvas', () => {
    const stacked: MarkerAnchor[] = [
      { playerId: 'ground', x: 4 * SEGMENT_WIDTH, y: 0, row: 0, segment: 4 },
      { playerId: 'orbit', x: 4 * SEGMENT_WIDTH, y: -2000, row: 9, segment: 4 },
    ];
    const camera = frameTarget('pack', input(stacked, 12));
    expect(offscreenPlayerIds(stacked, camera, viewport)).toEqual(['orbit']);
  });

  it('reports a player stacked below the canvas', () => {
    const sunk: MarkerAnchor[] = [
      { playerId: 'ground', x: 4 * SEGMENT_WIDTH, y: 0, row: 0, segment: 4 },
      { playerId: 'basement', x: 4 * SEGMENT_WIDTH, y: 2000, row: 0, segment: 4 },
    ];
    const camera = frameTarget('pack', input(sunk, 12));
    expect(offscreenPlayerIds(sunk, camera, viewport)).toEqual(['basement']);
  });

  it('reports nobody for eight players tied on one segment', () => {
    // The measured C1 failure: rows 5-7 were drawn entirely above the canvas
    // and the readout named none of them. The compressed stack now fits.
    const anchors = startLineAnchors(players(8), trackMetrics(12));
    const camera = frameTarget('pack', input(anchors, 12, { localPlayerId: 'p3' }));
    expect(offscreenPlayerIds(anchors, camera, viewport)).toEqual([]);
    for (const anchor of anchors) {
      const box = rigBox(anchor, camera);
      expect(box.top).toBeGreaterThan(0);
      expect(box.bottom).toBeLessThan(viewport.height);
    }
  });

  it('does not chevron the whole field when the world shrinks to a strip', () => {
    // read/answer/reveal cut the band to 28vh, where a clipped head is by
    // design — a player counts as visible while any of the rig is on canvas.
    const strip = { width: 1280, height: 202 };
    const anchors = startLineAnchors(players(8), trackMetrics(12));
    const camera = frameTarget('pack', input(anchors, 12));
    expect(offscreenPlayerIds(anchors, camera, strip).length).toBeLessThan(anchors.length);
  });
});

// I4: for a one- or two-question game the whole lobby grid stands in the
// run-off, which a length-capped span could not reach.
describe('short games still frame the lobby grid', () => {
  for (const rounds of [1, 2]) {
    it(`frames all eight rigs at total_rounds = ${rounds}`, () => {
      const metrics = trackMetrics(rounds);
      const anchors = gridAnchors(players(8), metrics);
      const camera = frameTarget('startLine', input(anchors, rounds, { localPlayerId: 'p0' }));

      for (const anchor of anchors) {
        const box = rigBox(anchor, camera);
        expect(box.left).toBeGreaterThan(0);
        expect(box.right).toBeLessThan(viewport.width);
        expect(box.top).toBeGreaterThan(0);
        expect(box.bottom).toBeLessThan(viewport.height);
      }
      expect(offscreenPlayerIds(anchors, camera, viewport)).toEqual([]);
    });
  }
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

  // I3: the rearmost pair sat exactly on `metrics.minX`, which is also the
  // camera's left bound, so ~40% of each was drawn off-canvas.
  it('draws the rearmost rig of a full grid whole', () => {
    for (const n of [7, 8, 12, 20]) {
      const anchors = gridAnchors(players(n), trackMetrics(12));
      const camera = frameTarget('startLine', input(anchors, 12, { localPlayerId: 'p0' }));
      const rear = anchors.reduce((a, b) => (a.x <= b.x ? a : b));
      expect(rigBox(rear, camera).left).toBeGreaterThan(0);
    }
  });
});

describe('podium framing', () => {
  it('centres the finish line and holds the whole podium in frame', () => {
    const metrics = trackMetrics(12);
    const shot = frameTarget('podium', {
      anchors: [], metrics, viewport: { width: 1920, height: 1080 },
      localPlayerId: null, emphasisIds: [],
    });

    const left = shot.centerX - shot.span / 2;
    const right = shot.centerX + shot.span / 2;
    expect(left).toBeLessThan(blockX(2, metrics) - BLOCK_WIDTH / 2);
    expect(right).toBeGreaterThan(blockX(3, metrics) + BLOCK_WIDTH / 2);
  });

  it('needs no anchors — it frames a place, not a group', () => {
    const metrics = trackMetrics(12);
    const empty = frameTarget('podium', {
      anchors: [], metrics, viewport: { width: 1920, height: 1080 },
      localPlayerId: null, emphasisIds: [],
    });
    const full = frameTarget('podium', {
      anchors: [{ playerId: 'p1', x: 0, y: 0, row: 0, segment: 0 }],
      metrics, viewport: { width: 1920, height: 1080 },
      localPlayerId: 'p1', emphasisIds: [],
    });
    expect(empty).toEqual(full);
  });

  it('stays inside the world bounds on a short track', () => {
    const metrics = trackMetrics(1);
    const shot = frameTarget('podium', {
      anchors: [], metrics, viewport: { width: 1920, height: 1080 },
      localPlayerId: null, emphasisIds: [],
    });
    expect(shot.centerX - shot.span / 2).toBeGreaterThanOrEqual(metrics.minX - 0.001);
    expect(shot.centerX + shot.span / 2).toBeLessThanOrEqual(metrics.maxX + 0.001);
  });
});

describe('headroom', () => {
  it('reproduces the 16:9 derivation MAX_STACK_RISE was written against', () => {
    // geometry.ts's MAX_STACK_RISE docstring: "324 at 16:9" at MIN_SPAN.
    expect(headroom({ width: 1920, height: 1080 }, 800)).toBeCloseTo(324, 6);
  });

  it('shrinks as the viewport gets wider for the same span', () => {
    expect(headroom({ width: 2560, height: 1080 }, 800)).toBeCloseTo(243, 6);
    expect(headroom({ width: 3440, height: 1440 }, 800)).toBeCloseTo(241.116, 3);
  });
});

describe('stackRiseLimit', () => {
  it('is EXACTLY MAX_STACK_RISE at 16:9 — this phase must not move 16:9', () => {
    expect(stackRiseLimit({ width: 1920, height: 1080 })).toBe(MAX_STACK_RISE);
  });

  it('compresses on ultrawide, where the old constant clipped', () => {
    expect(stackRiseLimit({ width: 2560, height: 1080 })).toBeCloseTo(108, 6);
    expect(stackRiseLimit({ width: 3440, height: 1440 })).toBeCloseTo(106.116, 3);
  });

  it('never drops below the floor, even on a retreated 32:9 band', () => {
    // headroom is 162 there, so the raw derivation wants 27.
    expect(stackRiseLimit({ width: 1920, height: 540 })).toBe(STACK_RISE_FLOOR);
  });
});

/**
 * Continuous aspect sweep, 4:3 to 32:9, at a full-height viewport and at the
 * half-height a retreated results band produces. The math is pure, so this —
 * not the headed checks — is what stops a future change from silently
 * reintroducing the clip.
 */
const ASPECT_SWEEP: { width: number; height: number }[] = (() => {
  const out: { width: number; height: number }[] = [];
  for (let ratio = 4 / 3; ratio <= 32 / 9 + 1e-9; ratio += 0.05) {
    for (const height of [1080, 540]) {
      out.push({ width: Math.round(height * ratio), height });
    }
  }
  return out;
})();

describe('the vertical framing contract holds at every aspect', () => {
  it('an eight-way tie is either fully on canvas or reported off it', () => {
    const metrics = trackMetrics(12);
    const standings = Array.from({ length: 8 }, (_, i) => ({
      player_id: `p${i}`,
      correct: 3,
      speed_points: 100 - i,
    }));

    for (const view of ASPECT_SWEEP) {
      const limit = stackRiseLimit(view);
      const anchors = markerAnchors(standings, metrics, limit);
      const camera = frameTarget('pack', {
        anchors,
        metrics,
        viewport: view,
        localPlayerId: null,
        emphasisIds: [],
      });
      const scale = worldScale(camera, view);
      const topmost = Math.min(
        ...anchors.map(a => worldYToScreen(a.y, camera, view) + RIG_TOP * scale),
      );

      if (limit > STACK_RISE_FLOOR) {
        // Not floored: the derivation guarantees the head is on canvas.
        expect(topmost).toBeGreaterThan(-1e-6);
      } else {
        // Floored: the head CAN clip, by design (spec §3.3). The spec expected
        // `offscreenPlayerIds` to name those players, and it does not — that
        // function reports only rigs ENTIRELY off canvas, deliberately, because
        // the 28vh question band clips heads on purpose and flagging the whole
        // field there would be noise (see its docstring).
        //
        // So what must actually hold at the floor is the weaker but honest
        // invariant: nobody VANISHES, and the clip stays a trim rather than a
        // decapitation. Measured worst case across this sweep is 19px off a
        // 668px rig (2.8%) at 3816x1080; only four of ~200 sampled viewports
        // clip at all, all past 3.48:1.
        expect(offscreenPlayerIds(anchors, camera, view)).toEqual([]);
        expect(topmost).toBeGreaterThan(-(RIG_BOTTOM - RIG_TOP) * scale * 0.05);
      }
    }
  });
});

describe('the podium shot fits vertically', () => {
  const metrics = trackMetrics(12);

  it('is EXACTLY PODIUM_SPAN on a healthy full-height 16:9 canvas', () => {
    const target = frameTarget('podium', {
      anchors: [], metrics, viewport: { width: 1920, height: 1080 },
      localPlayerId: null, emphasisIds: [],
    });
    expect(target.span).toBe(921.6);
  });

  it('widens on the retreated band that was clipping the winner', () => {
    // CURRENT.md measured the winner's rig top at screen y = -79 on 1280x360.
    const target = frameTarget('podium', {
      anchors: [], metrics, viewport: { width: 1280, height: 360 },
      localPlayerId: null, emphasisIds: [],
    });
    expect(target.span).toBeCloseTo(1298.765, 3);
  });

  it('keeps the winner on canvas at every aspect, full height and retreated', () => {
    for (const view of ASPECT_SWEEP) {
      const camera = frameTarget('podium', {
        anchors: [], metrics, viewport: view, localPlayerId: null, emphasisIds: [],
      });
      const scale = worldScale(camera, view);
      // The winner stands on top of block 1; the rig reaches RIG_TOP above that.
      const winnerTop =
        worldYToScreen(-BLOCK_HEIGHTS[1], camera, view) + RIG_TOP * scale;
      expect(winnerTop).toBeGreaterThan(0);
    }
  });
});

describe('podiumRoom', () => {
  const metrics = trackMetrics(12);

  it('widens past the podium to hold the field that did not medal', () => {
    const anchors = anchorsFor(
      [['a', 12], ['b', 12], ['c', 11], ['d', 4]], 12,
    );
    const view = { width: 1920, height: 1080 };
    const room = frameTarget('podiumRoom', {
      anchors, metrics, viewport: view, localPlayerId: null, emphasisIds: [],
    });
    const tight = frameTarget('podium', {
      anchors, metrics, viewport: view, localPlayerId: null, emphasisIds: [],
    });
    expect(room.span).toBeGreaterThan(tight.span);
    expect(offscreenPlayerIds(anchors, room, view)).toEqual([]);
  });
});

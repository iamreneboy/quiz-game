import { describe, it, expect } from 'vitest';
import { ceremonyStepsAt, BRONZE_AT, SILVER_AT, GOLD_AT, NO_CEREMONY, RISE_MS } from '@/lib/ceremony/beats';
import { trackMetrics, segmentToWorldX, type AnchorStanding } from '@/lib/world/geometry';
import {
  BLOCK_HEIGHTS, BLOCK_ORDER, blockX, hasRisen, podiumAnchors, podiumBlocks, podiumX,
} from '@/lib/world/podium';

const metrics = trackMetrics(12);
/** Every block fully landed: earliest point after gold's own rise completes. */
const settled = ceremonyStepsAt(GOLD_AT + RISE_MS);

const standing = (id: string, correct: number, speed = 0): AnchorStanding => ({
  player_id: id, correct, speed_points: speed,
});

/** Already ranked, as `standings()` always returns them. */
const field = (n: number): AnchorStanding[] =>
  Array.from({ length: n }, (_, i) => standing(`p${i + 1}`, 10 - i));

describe('podium geometry', () => {
  it('places the podium on the finish line, inside the camera bounds', () => {
    expect(podiumX(metrics)).toBe(segmentToWorldX(metrics.segments));
    // The whole podium must sit left of maxX or clampCamera pushes it off frame.
    const rightmost = blockX(3, metrics);
    expect(rightmost).toBeLessThan(metrics.maxX);
  });

  it('arranges the blocks 2nd, 1st, 3rd from left to right', () => {
    expect(BLOCK_ORDER).toEqual([2, 1, 3]);
    expect(blockX(2, metrics)).toBeLessThan(blockX(1, metrics));
    expect(blockX(1, metrics)).toBeLessThan(blockX(3, metrics));
    expect(blockX(1, metrics)).toBe(podiumX(metrics));
  });

  it('makes the winner\'s block the tallest', () => {
    expect(BLOCK_HEIGHTS[1]).toBeGreaterThan(BLOCK_HEIGHTS[2]);
    expect(BLOCK_HEIGHTS[2]).toBeGreaterThan(BLOCK_HEIGHTS[3]);
  });
});

describe('hasRisen', () => {
  it('raises bronze first and gold last', () => {
    expect(hasRisen(3, ceremonyStepsAt(BRONZE_AT + RISE_MS))).toBe(true);
    expect(hasRisen(2, ceremonyStepsAt(BRONZE_AT + RISE_MS))).toBe(false);
    expect(hasRisen(1, ceremonyStepsAt(BRONZE_AT + RISE_MS))).toBe(false);

    expect(hasRisen(2, ceremonyStepsAt(SILVER_AT + RISE_MS))).toBe(true);
    expect(hasRisen(1, ceremonyStepsAt(SILVER_AT + RISE_MS))).toBe(false);

    expect(hasRisen(1, settled)).toBe(true);
  });

  it('holds every block down before the ceremony starts', () => {
    for (const place of [1, 2, 3] as const) {
      expect(hasRisen(place, NO_CEREMONY)).toBe(false);
    }
  });

  it('is not yet true partway through a rise', () => {
    expect(hasRisen(3, ceremonyStepsAt(BRONZE_AT + RISE_MS / 2))).toBe(false);
  });
});

describe('rise interpolation', () => {
  it('keeps a block and the rig standing on it in lockstep, off the same eased progress', () => {
    const midBronze = ceremonyStepsAt(BRONZE_AT + RISE_MS / 2);
    const bronze = podiumBlocks(field(3), metrics, midBronze).find(b => b.place === 3)!;
    expect(bronze.riseProgress).toBeGreaterThan(0);

    const rig = podiumAnchors(field(3), metrics, midBronze).find(a => a.playerId === 'p3')!;
    expect(rig.y).toBeCloseTo(-bronze.height * bronze.riseProgress, 6);
  });

  it('is already moving the instant a rise starts, not held at zero', () => {
    const justStarted = ceremonyStepsAt(BRONZE_AT + 1);
    const bronze = podiumBlocks(field(3), metrics, justStarted).find(b => b.place === 3)!;
    expect(bronze.riseProgress).toBeGreaterThan(0);
  });

  it('lands exactly at the final height with no residual bounce once settled', () => {
    const bronze = podiumBlocks(field(3), metrics, settled).find(b => b.place === 3)!;
    expect(bronze.riseProgress).toBe(1);
  });
});

describe('podiumBlocks', () => {
  it('builds one block per place for a full field', () => {
    const blocks = podiumBlocks(field(8), metrics, settled);
    expect(blocks.map(b => b.place)).toEqual([1, 2, 3]);
    expect(blocks.map(b => b.playerId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('drops blocks off the top for a short field', () => {
    expect(podiumBlocks(field(2), metrics, settled).map(b => b.place)).toEqual([1, 2]);
    expect(podiumBlocks(field(1), metrics, settled).map(b => b.place)).toEqual([1]);
  });

  it('reports an empty podium for an empty field', () => {
    expect(podiumBlocks([], metrics, settled)).toEqual([]);
  });
});

describe('podiumAnchors', () => {
  it('moves exactly three players onto the podium and leaves the rest behind', () => {
    const standings = field(8);
    const anchors = podiumAnchors(standings, metrics, settled);
    expect(anchors).toHaveLength(8);

    const onPodium = anchors.filter(a => a.x === blockX(1, metrics)
      || a.x === blockX(2, metrics) || a.x === blockX(3, metrics));
    expect(onPodium.map(a => a.playerId).sort()).toEqual(['p1', 'p2', 'p3']);

    // Everyone else holds the finish-line position they raced to.
    const fourth = anchors.find(a => a.playerId === 'p4')!;
    expect(fourth.x).toBe(segmentToWorldX(7));
    expect(fourth.y).toBe(0);
  });

  it('lifts a player only once their own block has risen', () => {
    const standings = field(3);
    const before = podiumAnchors(standings, metrics, NO_CEREMONY);
    expect(before.find(a => a.playerId === 'p1')!.y).toBe(0);

    const bronzeOnly = podiumAnchors(standings, metrics, ceremonyStepsAt(BRONZE_AT + RISE_MS));
    expect(bronzeOnly.find(a => a.playerId === 'p3')!.y).toBe(-BLOCK_HEIGHTS[3]);
    expect(bronzeOnly.find(a => a.playerId === 'p1')!.y).toBe(0);

    const all = podiumAnchors(standings, metrics, settled);
    expect(all.find(a => a.playerId === 'p1')!.y).toBe(-BLOCK_HEIGHTS[1]);
    expect(all.find(a => a.playerId === 'p2')!.y).toBe(-BLOCK_HEIGHTS[2]);
  });

  it('stands a player in front of their block before it rises, not beside it', () => {
    const anchors = podiumAnchors(field(3), metrics, NO_CEREMONY);
    expect(anchors.find(a => a.playerId === 'p2')!.x).toBe(blockX(2, metrics));
  });

  it('preserves row, so two tied podium players do not both hold the edge', () => {
    // p1 and p2 tie on correct; markerAnchors gives them rows 0 and 1 on the
    // same segment. flairFor lights the turbo flame on row 0 only, and forcing
    // row 0 here would light it on both (lib/world/flair.ts:73).
    const tied = [standing('p1', 9, 500), standing('p2', 9, 200), standing('p3', 4)];
    const anchors = podiumAnchors(tied, metrics, settled);
    const rows = anchors.filter(a => a.playerId !== 'p3').map(a => a.row).sort();
    expect(rows).toEqual([0, 1]);
  });

  it('keeps segment intact, so occupancy still describes the race', () => {
    const anchors = podiumAnchors(field(3), metrics, settled);
    expect(anchors.find(a => a.playerId === 'p1')!.segment).toBe(10);
    expect(anchors.find(a => a.playerId === 'p2')!.segment).toBe(9);
  });

  it('handles a one-player game', () => {
    const anchors = podiumAnchors(field(1), metrics, settled);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].x).toBe(blockX(1, metrics));
    expect(anchors[0].y).toBe(-BLOCK_HEIGHTS[1]);
  });
});

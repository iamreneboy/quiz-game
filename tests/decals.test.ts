import { describe, it, expect } from 'vitest';
import { staticDecals } from '@/lib/world/decals';
import { allowanceFor } from '@/lib/world/vfxBudget';
import type { VfxRequest } from '@/lib/world/choreographer';
import { markerAnchors, trackMetrics } from '@/lib/world/geometry';
import { flairFor, type FlairStanding } from '@/lib/world/flair';
import {
  avatarStates,
  beginSequence,
  bufferCue,
  initialChoreographerState,
} from '@/lib/world/choreographer';
import type { Cue } from '@/lib/presentation/cues';

const minimal = allowanceFor('minimal');
const lean = allowanceFor('lean');

const request = (kind: VfxRequest['kind'], intensity = 0.5): VfxRequest => ({
  kind, mount: 'behind', intensity,
});

describe('staticDecals', () => {
  it('draws nothing while particles are allowed — the emitter has the job', () => {
    expect(staticDecals([request('turbo'), request('spark')], lean)).toEqual([]);
    expect(staticDecals([request('turbo')], allowanceFor('full'))).toEqual([]);
  });

  it('stands in for the turbo flame when particles are off (spec §8)', () => {
    const [decal] = staticDecals([request('turbo', 0.5)], minimal);
    expect(decal).toMatchObject({ source: 'turbo', shape: 'flame', mount: 'behind' });
    expect(decal.intensity).toBe(0.5);
    expect(decal.size).toBeGreaterThan(0);
  });

  it('stands in for every streak tier with a glow', () => {
    for (const kind of ['spark', 'flame', 'inferno'] as const) {
      const [decal] = staticDecals([request(kind)], minimal);
      expect(decal).toMatchObject({ source: kind, shape: 'glow' });
    }
  });

  it('scales the streak decal with the tier', () => {
    const size = (kind: 'spark' | 'flame' | 'inferno') =>
      staticDecals([request(kind)], minimal)[0].size;
    expect(size('spark')).toBeLessThan(size('flame'));
    expect(size('flame')).toBeLessThan(size('inferno'));
  });

  it('has no static form for transient effects or the medal glow', () => {
    const transient = ['trail', 'lightning', 'ignition', 'arena', 'pulse', 'glow'] as const;
    expect(staticDecals(transient.map(k => request(k)), minimal)).toEqual([]);
  });

  it('ignores a request at zero intensity', () => {
    expect(staticDecals([request('turbo', 0)], minimal)).toEqual([]);
  });

  it('keeps the mount the request asked for', () => {
    const [decal] = staticDecals([{ kind: 'turbo', mount: 'crown', intensity: 1 }], minimal);
    expect(decal.mount).toBe('crown');
  });
});

/**
 * The reason this module exists: `stepBudget` pins `reduced` at `minimal`
 * unconditionally, so the accessibility profile was the one losing every streak
 * and edge-holder signal to two documented-but-undrawn table rows.
 */
describe('the minimal level still signals streak and edge (spec §8)', () => {
  const metrics = trackMetrics(12);
  const standings: FlairStanding[] = [
    { player_id: 'a', correct: 2, speed_points: 90 },
    { player_id: 'b', correct: 2, speed_points: 40 },
  ];
  const anchors = markerAnchors(standings, metrics);
  const streak8: Cue = { type: 'streak-tier', tier: 'streakMilestone', playerId: 'a', streak: 8 };

  it('gives the edge-holder and the streaking player something to draw', () => {
    let state = bufferCue(initialChoreographerState, streak8, anchors);
    state = beginSequence(state, anchors, 0, 'reduced');

    const [a] = avatarStates(
      state, anchors, flairFor(standings, anchors), minimal, 10_000, 'reduced',
    );
    const decals = staticDecals(a.vfx, minimal);
    expect(decals.map(d => d.source).sort()).toEqual(['spark', 'turbo']);
  });
});

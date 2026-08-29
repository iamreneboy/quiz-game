import { describe, it, expect } from 'vitest';
import { hasPhotoFinish, tallyValue, tieGroups } from '@/lib/ceremony/photoFinish';
import type { Standing } from '@/lib/types';

/**
 * Standings arrive from the server ALREADY sorted by the Fairness Law, so
 * every fixture here is written in the order `standings` would have returned
 * it. The module must never re-sort — it only groups.
 */
const s = (
  id: string,
  correct: number,
  speed_points: number,
  longest_streak = 0,
): Standing => ({
  player_id: id, nickname: id.toUpperCase(), avatar: 'robot', color: '#f59e0b',
  correct, speed_points, longest_streak, current_streak: 0,
});

describe('tieGroups', () => {
  it('finds nothing in an empty or absent field', () => {
    expect(tieGroups({ standings: null })).toEqual([]);
    expect(tieGroups({ standings: [] })).toEqual([]);
  });

  it('finds nothing when every racer has a different correct count', () => {
    expect(tieGroups({ standings: [s('a', 3, 90), s('b', 2, 80), s('c', 1, 70)] })).toEqual([]);
  });

  it('never stages a group of one', () => {
    expect(tieGroups({ standings: [s('a', 3, 90)] })).toEqual([]);
  });

  it('groups an adjacent run sharing a correct count', () => {
    const groups = tieGroups({ standings: [s('a', 3, 90), s('b', 3, 80), s('c', 1, 70)] });
    expect(groups).toHaveLength(1);
    expect(groups[0].players.map(p => p.player_id)).toEqual(['a', 'b']);
  });

  it('reports the 1-based place the group starts at', () => {
    const groups = tieGroups({
      standings: [s('a', 3, 90), s('b', 2, 80), s('c', 2, 70), s('d', 1, 60)],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].place).toBe(2);
  });

  it('finds every tied place, not just the first', () => {
    const groups = tieGroups({
      standings: [s('a', 3, 90), s('b', 3, 80), s('c', 1, 70), s('d', 1, 60)],
    });
    expect(groups.map(g => g.place)).toEqual([1, 3]);
    expect(groups.map(g => g.players.length)).toEqual([2, 2]);
  });

  it('keeps a group of three together rather than splitting it into pairs', () => {
    const groups = tieGroups({ standings: [s('a', 2, 90), s('b', 2, 80), s('c', 2, 70)] });
    expect(groups).toHaveLength(1);
    expect(groups[0].players.map(p => p.player_id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves the order standings arrived in — it groups, it never sorts', () => {
    const groups = tieGroups({ standings: [s('a', 2, 90), s('b', 2, 80)] });
    expect(groups[0].players.map(p => p.player_id)).toEqual(['a', 'b']);
  });

  it('is resolved when speed points separate the group', () => {
    const groups = tieGroups({ standings: [s('a', 2, 90), s('b', 2, 80)] });
    expect(groups[0].resolved).toBe(true);
  });

  it('is resolved when only the streak separates the group', () => {
    const groups = tieGroups({ standings: [s('a', 2, 80, 2), s('b', 2, 80, 1)] });
    expect(groups[0].resolved).toBe(true);
  });

  it('is NOT resolved when the group is perfectly tied — they share the position', () => {
    const groups = tieGroups({ standings: [s('a', 2, 80, 2), s('b', 2, 80, 2)] });
    expect(groups[0].resolved).toBe(false);
  });

  it('resolves a three-way group where only one member is separated', () => {
    const groups = tieGroups({
      standings: [s('a', 2, 90, 1), s('b', 2, 80, 1), s('c', 2, 80, 1)],
    });
    expect(groups[0].resolved).toBe(true);
  });

  it('drops the group sudden death already decided', () => {
    const groups = tieGroups({
      standings: [s('a', 0, 0), s('b', 0, 0)],
      suddenDeathContenders: ['a', 'b'],
      suddenDeathResolved: true,
    });
    expect(groups).toEqual([]);
  });

  it('keeps the group when sudden death produced no winner — the tie really stands', () => {
    const groups = tieGroups({
      standings: [s('a', 0, 0), s('b', 0, 0)],
      suddenDeathContenders: ['a', 'b'],
      suddenDeathResolved: false,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].resolved).toBe(false);
  });

  it('drops only the decided group, never a different place that happens to be tied', () => {
    const groups = tieGroups({
      standings: [s('a', 3, 90), s('b', 3, 90), s('c', 1, 50), s('d', 1, 40)],
      suddenDeathContenders: ['a', 'b'],
      suddenDeathResolved: true,
    });
    expect(groups.map(g => g.place)).toEqual([3]);
  });

  it('ignores a contender list that does not match a whole group', () => {
    // Defensive: a stale contender list must never silently eat a live tie.
    const groups = tieGroups({
      standings: [s('a', 2, 90), s('b', 2, 80), s('c', 2, 70)],
      suddenDeathContenders: ['a', 'b'],
      suddenDeathResolved: true,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].players).toHaveLength(3);
  });
});

describe('hasPhotoFinish', () => {
  it('is false with nothing to stage and true with a group', () => {
    expect(hasPhotoFinish({ standings: null })).toBe(false);
    expect(hasPhotoFinish({ standings: [s('a', 3, 90), s('b', 2, 80)] })).toBe(false);
    expect(hasPhotoFinish({ standings: [s('a', 3, 90), s('b', 3, 80)] })).toBe(true);
  });

  it('is false once sudden death has taken the only tied group', () => {
    expect(hasPhotoFinish({
      standings: [s('a', 0, 0), s('b', 0, 0)],
      suddenDeathContenders: ['a', 'b'],
      suddenDeathResolved: true,
    })).toBe(false);
  });
});

describe('tallyValue', () => {
  it('counts a target out over the tally and lands exactly on it', () => {
    expect(tallyValue(240, 0)).toBe(0);
    expect(tallyValue(240, 0.5)).toBe(120);
    expect(tallyValue(240, 1)).toBe(240);
  });

  it('returns whole numbers — speed points are never fractional', () => {
    expect(Number.isInteger(tallyValue(241, 0.333))).toBe(true);
  });

  it('clamps a tally outside 0..1 rather than overshooting the real score', () => {
    expect(tallyValue(240, -1)).toBe(0);
    expect(tallyValue(240, 2)).toBe(240);
  });

  it('handles a zero target without producing -0', () => {
    expect(Object.is(tallyValue(0, 0.5), 0)).toBe(true);
  });
});

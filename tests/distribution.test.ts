import { describe, it, expect } from 'vitest';
import { STACK_CAP, distributionRows } from '@/lib/staging/distribution';
import type { RevealPayload, Standing } from '@/lib/types';

const OPTIONS = ['Paris', 'Rome', 'Berlin', 'Madrid'];

function standing(id: string, correct: number): Standing {
  return {
    player_id: id, nickname: id.toUpperCase(), avatar: 'duck', color: '#f59e0b',
    correct, speed_points: 0, longest_streak: 0, current_streak: 0,
  };
}

function reveal(over: Partial<RevealPayload> = {}): RevealPayload {
  return {
    correct_index: 0, fun_fact: null, counts: [0, 0, 0, 0], picks: [],
    fastest: null, standings: [], ...over,
  };
}

describe('distributionRows', () => {
  it('returns one row per option and marks the correct one', () => {
    const rows = distributionRows(OPTIONS, reveal({ correct_index: 2 }), [], null);
    expect(rows).toHaveLength(4);
    expect(rows.map(r => r.index)).toEqual([0, 1, 2, 3]);
    expect(rows.map(r => r.correct)).toEqual([false, false, true, false]);
    expect(rows[0].option).toBe('Paris');
  });

  it('counts from picks when the payload carries them', () => {
    const rows = distributionRows(
      OPTIONS,
      reveal({
        counts: [99, 99, 99, 99], // deliberately wrong: picks must win
        picks: [
          { player_id: 'a', choice_index: 0 },
          { player_id: 'b', choice_index: 0 },
          { player_id: 'c', choice_index: 2 },
        ],
      }),
      [standing('a', 1), standing('b', 1), standing('c', 0)],
      null,
    );
    expect(rows.map(r => r.count)).toEqual([2, 0, 1, 0]);
  });

  it('falls back to counts, with empty stacks, on a pre-migration payload', () => {
    const legacy = { ...reveal({ counts: [3, 1, 0, 0] }) } as RevealPayload;
    delete (legacy as Partial<RevealPayload>).picks;

    const rows = distributionRows(OPTIONS, legacy, [], null);
    expect(rows.map(r => r.count)).toEqual([3, 1, 0, 0]);
    expect(rows.every(r => r.avatars.length === 0)).toBe(true);
    expect(rows.every(r => r.overflow === 0)).toBe(true);
  });

  it('scales share against the largest row, and stays at zero when nobody answered', () => {
    const rows = distributionRows(OPTIONS, reveal({ counts: [4, 2, 0, 0] }), [], null);
    expect(rows.map(r => r.share)).toEqual([1, 0.5, 0, 0]);

    const empty = distributionRows(OPTIONS, reveal(), [], null);
    expect(empty.every(r => r.share === 0)).toBe(true);
  });

  it('orders a stack by standings rank, not by pick order', () => {
    const rows = distributionRows(
      OPTIONS,
      reveal({
        picks: [
          { player_id: 'c', choice_index: 0 },
          { player_id: 'a', choice_index: 0 },
          { player_id: 'b', choice_index: 0 },
        ],
      }),
      [standing('a', 3), standing('b', 2), standing('c', 1)],
      null,
    );
    expect(rows[0].avatars.map(a => a.playerId)).toEqual(['a', 'b', 'c']);
  });

  it('caps the stack and reports the overflow', () => {
    const ids = Array.from({ length: STACK_CAP + 3 }, (_, i) => `p${i}`);
    const rows = distributionRows(
      OPTIONS,
      reveal({ picks: ids.map(id => ({ player_id: id, choice_index: 1 })) }),
      ids.map(id => standing(id, 0)),
      null,
    );
    expect(rows[1].count).toBe(STACK_CAP + 3);
    expect(rows[1].avatars).toHaveLength(STACK_CAP);
    expect(rows[1].overflow).toBe(3);
  });

  it('substitutes the local player into the last visible slot rather than cutting them', () => {
    const ids = Array.from({ length: STACK_CAP + 3 }, (_, i) => `p${i}`);
    const local = ids[ids.length - 1]; // ranked last, so normally cut
    const rows = distributionRows(
      OPTIONS,
      reveal({ picks: ids.map(id => ({ player_id: id, choice_index: 1 })) }),
      ids.map((id, i) => standing(id, ids.length - i)),
      local,
    );

    const shown = rows[1].avatars.map(a => a.playerId);
    expect(shown).toHaveLength(STACK_CAP);
    expect(shown[shown.length - 1]).toBe(local);
    expect(rows[1].avatars.find(a => a.playerId === local)!.isLocal).toBe(true);
    // The arithmetic still adds up: substitution replaces, it does not insert.
    expect(rows[1].overflow).toBe(3);
  });

  it('leaves a player who never answered out of every stack', () => {
    const rows = distributionRows(
      OPTIONS,
      reveal({ picks: [{ player_id: 'a', choice_index: 0 }] }),
      [standing('a', 1), standing('silent', 0)],
      null,
    );
    expect(rows.flatMap(r => r.avatars.map(a => a.playerId))).toEqual(['a']);
  });

  it('ignores a pick for an option index that does not exist', () => {
    const rows = distributionRows(
      OPTIONS,
      reveal({ picks: [{ player_id: 'a', choice_index: 7 }] }),
      [standing('a', 0)],
      null,
    );
    expect(rows.every(r => r.count === 0)).toBe(true);
  });
});

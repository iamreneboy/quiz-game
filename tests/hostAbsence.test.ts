import { describe, it, expect } from 'vitest';
import { EMPTY_PRESENCE, applyPresence, electSweeper } from '@/lib/presence';

const snapOf = (ids: string[]) => applyPresence(EMPTY_PRESENCE, ids, 1_000);

describe('electSweeper', () => {
  it('elects the lowest-sorted present player who is not the host', () => {
    const snap = snapOf(['host', 'c', 'a', 'b']);
    expect(electSweeper(snap, 'host', 'a')).toBe(true);
    expect(electSweeper(snap, 'host', 'b')).toBe(false);
    expect(electSweeper(snap, 'host', 'c')).toBe(false);
  });

  it('never elects the host itself — the host has its own resume path', () => {
    expect(electSweeper(snapOf(['a', 'host']), 'host', 'host')).toBe(false);
    // Even when the host would sort first.
    expect(electSweeper(snapOf(['aaa', 'zzz']), 'aaa', 'aaa')).toBe(false);
    expect(electSweeper(snapOf(['aaa', 'zzz']), 'aaa', 'zzz')).toBe(true);
  });

  it('elects nobody without a local player id — a stage view never sweeps', () => {
    expect(electSweeper(snapOf(['a', 'b']), 'host', null)).toBe(false);
  });

  it('elects a player who is not in the presence map at all: nobody', () => {
    expect(electSweeper(snapOf(['a', 'b']), 'host', 'ghost')).toBe(false);
  });

  it('elects the only remaining player', () => {
    expect(electSweeper(snapOf(['solo']), 'host', 'solo')).toBe(true);
  });

  it('elects nobody from an empty map', () => {
    expect(electSweeper(EMPTY_PRESENCE, 'host', 'a')).toBe(false);
  });

  it('works when the host id is unknown — every present client is a candidate', () => {
    expect(electSweeper(snapOf(['a', 'b']), null, 'a')).toBe(true);
    expect(electSweeper(snapOf(['a', 'b']), null, 'b')).toBe(false);
  });

  it('agrees with itself across every client, which is the whole point', () => {
    const snap = snapOf(['m', 'host', 'z', 'd']);
    const elected = ['m', 'z', 'd'].filter(id => electSweeper(snap, 'host', id));
    expect(elected).toEqual(['d']);
  });
});

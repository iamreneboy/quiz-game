import { describe, it, expect } from 'vitest';
import {
  DROP_REPORTS,
  EMPTY_PRESENCE,
  PRESENCE_REPORT_MS,
  RECONNECT_GRACE_MS,
  applyPresence,
  connectionState,
  samePresence,
} from '@/lib/presence';

describe('the thresholds', () => {
  it('mirror the SQL: twenty reports at three seconds is the PRD 60s grace', () => {
    expect(DROP_REPORTS).toBe(20);
    expect(PRESENCE_REPORT_MS).toBe(3_000);
    expect(RECONNECT_GRACE_MS).toBe(60_000);
    expect(DROP_REPORTS * PRESENCE_REPORT_MS).toBe(RECONNECT_GRACE_MS);
  });
});

describe('applyPresence', () => {
  it('records who is here, sorted, from an empty snapshot', () => {
    const next = applyPresence(EMPTY_PRESENCE, ['b', 'a'], 1_000);
    expect(next.present).toEqual(['a', 'b']);
    expect(next.leftAt).toEqual({});
  });

  it('de-duplicates a player tracked from two tabs', () => {
    expect(applyPresence(EMPTY_PRESENCE, ['a', 'a'], 1_000).present).toEqual(['a']);
  });

  it('stamps the moment somebody stops being present', () => {
    const one = applyPresence(EMPTY_PRESENCE, ['a', 'b'], 1_000);
    const two = applyPresence(one, ['a'], 5_000);
    expect(two.present).toEqual(['a']);
    expect(two.leftAt).toEqual({ b: 5_000 });
  });

  it('keeps the ORIGINAL departure time across later syncs', () => {
    const one = applyPresence(EMPTY_PRESENCE, ['a', 'b'], 1_000);
    const two = applyPresence(one, ['a'], 5_000);
    const three = applyPresence(two, ['a'], 9_000);
    expect(three.leftAt).toEqual({ b: 5_000 });
  });

  it('forgets a departure the moment the player comes back', () => {
    const one = applyPresence(EMPTY_PRESENCE, ['a', 'b'], 1_000);
    const two = applyPresence(one, ['a'], 5_000);
    const three = applyPresence(two, ['a', 'b'], 9_000);
    expect(three.leftAt).toEqual({});
  });
});

describe('samePresence', () => {
  it('is true for equal snapshots and false for any difference', () => {
    const a = applyPresence(EMPTY_PRESENCE, ['x', 'y'], 1_000);
    const b = applyPresence(EMPTY_PRESENCE, ['y', 'x'], 2_000);
    expect(samePresence(a, b)).toBe(true);
    expect(samePresence(a, applyPresence(a, ['x'], 3_000))).toBe(false);
  });
});

describe('connectionState', () => {
  const here = applyPresence(EMPTY_PRESENCE, ['a', 'b'], 1_000);

  it('is connected for anyone on the channel, whatever the server last counted', () => {
    expect(connectionState(here, 'a', 0, 2_000)).toBe('connected');
    expect(connectionState(here, 'a', 99, 2_000)).toBe('connected');
  });

  it('is reconnecting inside the grace after a departure this client saw', () => {
    const gone = applyPresence(here, ['a'], 5_000);
    expect(connectionState(gone, 'b', 0, 5_000 + RECONNECT_GRACE_MS - 1)).toBe('reconnecting');
  });

  it('is dropped once the grace has run out', () => {
    const gone = applyPresence(here, ['a'], 5_000);
    expect(connectionState(gone, 'b', 0, 5_000 + RECONNECT_GRACE_MS)).toBe('dropped');
  });

  it('falls back to the server count for a player this client never observed', () => {
    expect(connectionState(here, 'stranger', 0, 2_000)).toBe('connected');
    expect(connectionState(here, 'stranger', 1, 2_000)).toBe('reconnecting');
    expect(connectionState(here, 'stranger', DROP_REPORTS, 2_000)).toBe('dropped');
  });

  it('never claims a drop it cannot support — an empty snapshot says connected', () => {
    expect(connectionState(EMPTY_PRESENCE, 'a', 0, 2_000)).toBe('connected');
  });
});

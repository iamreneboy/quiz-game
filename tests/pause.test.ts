import { describe, it, expect, beforeEach } from 'vitest';
import { noteServerTime } from '@/lib/serverTime';
import { beatRemainingMs, isPaused } from '@/lib/pause';
import type { RoomInfo } from '@/lib/types';

const room = (over: Partial<RoomInfo> = {}): RoomInfo => ({
  id: 'r', code: 'ABCDE', status: 'playing', phase: 'answer', round: 1,
  total_rounds: 3, timer_seconds: 20, ends_at: null,
  server_now: '2026-08-29T10:00:00.000Z', paused_remaining_ms: null,
  ...over,
});

beforeEach(() => {
  // Pin the client/server offset so msUntil is deterministic.
  noteServerTime(new Date(Date.now()).toISOString());
});

describe('beatRemainingMs', () => {
  it('is null with no room at all', () => {
    expect(beatRemainingMs(null)).toBeNull();
  });

  it('is null while playing with no deadline — the beat is settled or unknown', () => {
    expect(beatRemainingMs(room({ ends_at: null }))).toBeNull();
  });

  it('counts down from the live deadline while playing', () => {
    const endsAt = new Date(Date.now() + 5_000).toISOString();
    const left = beatRemainingMs(room({ ends_at: endsAt }))!;
    expect(left).toBeGreaterThan(4_000);
    expect(left).toBeLessThanOrEqual(5_000);
  });

  it('returns the FROZEN remainder while paused, ignoring the null deadline', () => {
    expect(beatRemainingMs(room({ status: 'paused', ends_at: null, paused_remaining_ms: 7_400 })))
      .toBe(7_400);
  });

  it('returns the frozen remainder even if a stale deadline is still attached', () => {
    const endsAt = new Date(Date.now() + 5_000).toISOString();
    expect(beatRemainingMs(room({ status: 'paused', ends_at: endsAt, paused_remaining_ms: 7_400 })))
      .toBe(7_400);
  });

  it('treats a paused room with no stored remainder as zero, never as unknown', () => {
    expect(beatRemainingMs(room({ status: 'paused', paused_remaining_ms: null }))).toBe(0);
  });
});

describe('isPaused', () => {
  it('is true only for the paused status', () => {
    expect(isPaused(null)).toBe(false);
    expect(isPaused(room({ status: 'playing' }))).toBe(false);
    expect(isPaused(room({ status: 'finished' }))).toBe(false);
    expect(isPaused(room({ status: 'paused' }))).toBe(true);
  });
});

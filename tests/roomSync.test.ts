import { describe, it, expect } from 'vitest';
import { createRoomSync, isRoomMissingError } from '@/lib/roomSync';
import type { PhaseEvent, RoomState } from '@/lib/types';

/** Server time, as the wire carries it: whole ms on the DATABASE's clock. */
const at = (ms: number) => new Date(ms).toISOString();

const event = (serverNowMs: number, phase: PhaseEvent['phase'] = 'answer'): PhaseEvent => ({
  phase, round: 1, ends_at: null, server_now: at(serverNowMs), payload: null,
});

const snapshot = (serverNowMs: number): RoomState => ({
  room: {
    id: 'r1', code: 'ABCDE', status: 'playing', phase: 'read', round: 1,
    total_rounds: 3, timer_seconds: 20, ends_at: null, server_now: at(serverNowMs),
  },
  players: [], question: null, reveal: null, standings: null,
});

describe('the first subscribe', () => {
  it('holds broadcasts until the snapshot lands, then replays them on top of it', () => {
    const sync = createRoomSync();
    sync.beginResync();

    const missed = event(2_000);
    expect(sync.receive(missed)).toBe('hold');

    const { apply, replay } = sync.settle(snapshot(1_000));
    expect(apply).toBe(true);
    expect(replay).toEqual([missed]);
  });

  it('applies a broadcast directly once no fetch is in flight', () => {
    const sync = createRoomSync();
    sync.beginResync();
    sync.settle(snapshot(1_000));

    expect(sync.receive(event(2_000))).toBe('apply');
  });
});

describe('a snapshot racing a broadcast', () => {
  it('rejects a snapshot older than an event already applied', () => {
    const sync = createRoomSync();
    sync.beginResync();
    sync.settle(snapshot(1_000));

    // A rejoin: the event lands while the resync fetch is still out.
    expect(sync.receive(event(3_000))).toBe('apply');
    sync.beginResync();

    // ...and the fetch answers with state read BEFORE that event.
    const { apply, replay } = sync.settle(snapshot(2_000));
    expect(apply).toBe(false);
    expect(replay).toEqual([]);
  });

  it('drops a held event the snapshot already contains', () => {
    const sync = createRoomSync();
    sync.beginResync();

    const stale = event(1_000);
    const fresh = event(3_000);
    expect(sync.receive(stale)).toBe('hold');
    expect(sync.receive(fresh)).toBe('hold');

    const { apply, replay } = sync.settle(snapshot(2_000));
    expect(apply).toBe(true);
    // Replaying `stale` would put the surface back a phase.
    expect(replay).toEqual([fresh]);
  });

  it('drops a broadcast older than the newest state applied', () => {
    const sync = createRoomSync();
    sync.beginResync();
    sync.settle(snapshot(5_000));

    expect(sync.receive(event(4_000))).toBe('drop');
    expect(sync.receive(event(5_000))).toBe('apply');
  });
});

describe('a failed snapshot', () => {
  it('releases held events rather than losing them', () => {
    const sync = createRoomSync();
    sync.beginResync();

    const held = event(2_000);
    expect(sync.receive(held)).toBe('hold');
    expect(sync.abandonResync()).toEqual([held]);

    // The retry's snapshot is older than what was released, so it is rejected
    // on its own merits — the hook applies it anyway while `room` is null.
    expect(sync.settle(snapshot(1_000)).apply).toBe(false);
  });

  it('leaves the next fetch free to apply when nothing was held', () => {
    const sync = createRoomSync();
    sync.beginResync();
    expect(sync.abandonResync()).toEqual([]);

    sync.beginResync();
    expect(sync.settle(snapshot(1_000)).apply).toBe(true);
  });
});

describe('unorderable stamps', () => {
  it('never drops state whose server time cannot be read', () => {
    const sync = createRoomSync();
    sync.beginResync();
    sync.settle(snapshot(5_000));

    const undated = { ...event(0), server_now: 'not a date' };
    expect(sync.receive(undated)).toBe('apply');

    const undatedSnapshot = snapshot(0);
    undatedSnapshot.room.server_now = '';
    sync.beginResync();
    expect(sync.settle(undatedSnapshot).apply).toBe(true);
  });
});

describe('isRoomMissingError', () => {
  it('reads a raised "room not found" as a verdict', () => {
    expect(isRoomMissingError({ code: 'P0001', message: 'room not found' })).toBe(true);
    expect(isRoomMissingError({ code: null, message: 'room not found' })).toBe(true);
  });

  it('reads everything else as transient', () => {
    expect(isRoomMissingError(null)).toBe(false);
    expect(isRoomMissingError({ message: 'TypeError: Failed to fetch' })).toBe(false);
    expect(isRoomMissingError({ code: '503', message: 'service unavailable' })).toBe(false);
  });
});

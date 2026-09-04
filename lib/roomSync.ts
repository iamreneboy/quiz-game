/**
 * The order in which room state is allowed to land — pure.
 *
 * A client learns the room's state two ways: the `get_room_state` SNAPSHOT it
 * fetches whenever the channel reports SUBSCRIBED, and the phase EVENTS the
 * host broadcasts. Both are stamped by the same clock — Postgres' `now()` —
 * which is the only reason they can be ordered against each other at all.
 *
 * Neither arrives on time. A snapshot is a round trip (≈100ms against the cloud
 * project), and a broadcast can land at any point inside it — before the join
 * completes, during the fetch, or after it. Left alone that produces two
 * failures, both of which look identical from the outside: the surface sits on
 * stale staging until the next phase event.
 *
 *   1. An event that arrives DURING a fetch and is applied immediately is then
 *      overwritten by the older snapshot when it resolves. Only the very first
 *      subscribe used to hold events; every re-SUBSCRIBED after a socket
 *      reconnect applied them straight into the path of its own in-flight
 *      fetch.
 *   2. A snapshot belonging to a channel that has already been torn down —
 *      React's StrictMode remount in `next dev` guarantees one on every load —
 *      resolves after the live channel has caught up, and puts the client back
 *      where it was. `cancelled` in the hook covers the torn-down case; the
 *      watermark here covers every other ordering.
 *
 * So: hold events while a snapshot is in flight, and never apply anything
 * stamped earlier than what has already been applied. A snapshot carries the
 * whole state, so nothing is lost by dropping an event it already contains.
 *
 * Pure and synchronous by design — the hook owns the network and the store,
 * this owns the ordering, and only this part is worth testing directly.
 */
import type { PhaseEvent, RoomState } from './types';

/** What the caller should do with an incoming broadcast. */
export type EventDisposition =
  /** Newest thing we have seen: apply it now. */
  | 'apply'
  /** A snapshot is in flight; `settle`/`abandon` will hand it back if it is still newer. */
  | 'hold'
  /** Older than state already applied — it can only regress the surface. */
  | 'drop';

export interface RoomSync {
  /** A `get_room_state` has been issued. Events land in the holding pen until it resolves. */
  beginResync(): void;
  /** Where an incoming phase broadcast belongs. */
  receive(event: PhaseEvent): EventDisposition;
  /**
   * A snapshot resolved. `apply` is false when a newer event has already
   * landed; `replay` is the held events that survive it, in arrival order.
   */
  settle(snapshot: RoomState): { apply: boolean; replay: PhaseEvent[] };
  /**
   * A snapshot failed or was given up on. Held events are released rather than
   * dropped — a fetch that never answers must not cost the client the
   * broadcasts it did receive.
   */
  abandonResync(): PhaseEvent[];
}

/**
 * `null` for anything unorderable. An unparseable stamp is never treated as
 * stale: dropping state we cannot place is worse than applying it out of order,
 * because only one of those is recoverable.
 */
function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function isStale(iso: string | null | undefined, watermark: number): boolean {
  const t = timeOf(iso);
  return t !== null && t < watermark;
}

function advance(iso: string | null | undefined, watermark: number): number {
  const t = timeOf(iso);
  return t !== null && t > watermark ? t : watermark;
}

export function createRoomSync(): RoomSync {
  /** The server time of the newest state applied so far. */
  let watermark = Number.NEGATIVE_INFINITY;
  let resyncing = false;
  let held: PhaseEvent[] = [];

  /** Release the holding pen, keeping only what is still newer than the watermark. */
  const release = (): PhaseEvent[] => {
    const replay = held.filter(e => !isStale(e.server_now, watermark));
    held = [];
    for (const e of replay) watermark = advance(e.server_now, watermark);
    return replay;
  };

  return {
    beginResync() {
      resyncing = true;
    },

    receive(event) {
      if (isStale(event.server_now, watermark)) return 'drop';
      if (resyncing) {
        held.push(event);
        return 'hold';
      }
      watermark = advance(event.server_now, watermark);
      return 'apply';
    },

    settle(snapshot) {
      resyncing = false;
      const apply = !isStale(snapshot.room.server_now, watermark);
      if (apply) watermark = advance(snapshot.room.server_now, watermark);
      return { apply, replay: release() };
    },

    abandonResync() {
      resyncing = false;
      return release();
    },
  };
}

/**
 * Did `get_room_state` say this code does not exist, or did the call simply
 * fail?
 *
 * `get_room_state` answers an unknown code with `raise exception 'room not
 * found'`, which PostgREST reports as P0001. Everything else — a dropped
 * connection, a paused project, a 500 — is transient, and treating it as
 * "no such room" tells a player their room is gone when the network merely
 * blinked. The message is checked as well as the code because only the message
 * is guaranteed across PostgREST versions.
 */
export function isRoomMissingError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  return error.code === 'P0001' || /room not found/i.test(error.message ?? '');
}

import { msUntil } from './serverTime';
import type { RoomStatus } from './types';

/**
 * Freeze-and-shift, on the client side (M3 roadmap decision 3).
 *
 * Pure — no store, no React, no DOM — because four different clocks need the
 * same answer: the staging ticker, the audio tension ramp, the timer ring
 * (through `stagingAt`) and the world's grade.
 *
 * `pause_game` clears `phase_ends_at` and stores what was left, so a paused
 * room genuinely HAS no live deadline. That is what keeps ADR-0014's derivation
 * untouched. But `ends_at: null` means "settled or unknown" to every consumer
 * (`elapsedIn`), which would collapse a paused ANSWER to a blank ring and zero
 * tension — the opposite of a freeze. This is the one place that difference is
 * resolved.
 */

/** Structural subset of `RoomInfo`; matched by shape so this module stays decoupled. */
export interface PausableRoom {
  status: RoomStatus;
  ends_at: string | null;
  paused_remaining_ms?: number | null;
  host_absent?: boolean;
}

export function isPaused(room: { status: RoomStatus } | null | undefined): boolean {
  return room?.status === 'paused';
}

/**
 * ms left in the current beat: the frozen remainder while paused, the live
 * deadline otherwise, `null` when there is no deadline to read.
 *
 * A paused room with no stored remainder returns 0, never null: the remainder
 * is absent only against a pre-0005 database, and "the beat is over" is a far
 * better guess there than "unknown", which would leave the ring blank forever.
 */
export function beatRemainingMs(room: PausableRoom | null | undefined): number | null {
  if (!room) return null;
  if (room.status === 'paused') return room.paused_remaining_ms ?? 0;
  return room.ends_at ? msUntil(room.ends_at) : null;
}

/**
 * Paused BECAUSE the host vanished, rather than because the host said so
 * (ADR-0052).
 *
 * Both halves matter. `host_absent` alone is true for a room that is still
 * running while the host's phone is in a tunnel and the sweep has not yet
 * fired — nothing should be announced there. And a paused room with a present
 * host is P0's deliberate pause, which has its own words.
 */
export function isHostAbsent(
  room: { status: RoomStatus; host_absent?: boolean } | null | undefined,
): boolean {
  return room?.status === 'paused' && room.host_absent === true;
}

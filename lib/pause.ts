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

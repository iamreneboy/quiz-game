/**
 * Ceremony beat timing (spec §5) — pure, no React, no store, no DOM.
 *
 * Beat position is derived from the server's `ends_at`, exactly as
 * lib/staging/beats.ts derives it (ADR-0014). Migration 0004 gives the results
 * phase a deadline for precisely this reason: a reload computes a large elapsed
 * and lands on a settled podium, so "jump to the end state rather than replay"
 * needs no storage, no flag and no special case — and the picture stays in step
 * with P4, which already suppresses the `fanfare` sting on a seeded cue batch
 * (ADR-0024).
 *
 * There is no ARRIVE step: the camera's cut to the podium fires on the
 * `phase-results` CUE, in lib/world/director.ts, not on an elapsed threshold.
 *
 * `rise` is deliberately LINEAR, not eased: this module stays pure timing, and
 * `CeremonySteps` is shared with DOM consumers (P5b's results board, via
 * lib/ceremony/useCeremony.ts) where an overshooting curve could push a width
 * or transform past its sensible range. lib/world/podium.ts applies
 * `EASE.settle`'s bounce when it turns this into a world-space position —
 * the same layering lib/world/movement.ts already uses (raw progress in,
 * eased position out), kept local to the one consumer that wants the bounce.
 */

/**
 * Client-side mirror of migration 0004's results interval.
 *
 * Hand-maintained, exactly as lib/staging/beats.ts's NOMINAL_MS mirrors the
 * server's other phase durations — the server values are not importable from
 * the client. The failure mode is graceful: a moved server duration compresses
 * or completes the sequence early; it can never block or lock the surface.
 */
export const CEREMONY_MS = 9000;

export const BRONZE_AT = 1200;
export const SILVER_AT = 2100;
export const GOLD_AT = 3000;
export const SPOTLIGHT_AT = 3800;
export const CONFETTI_AT = 4100;
export const BOARD_AT = 6000;

/**
 * How long a block takes to rise once its own moment starts.
 *
 * 460ms mirrors lib/presentation/tokens.ts's DURATION.settle — the same
 * duration lib/world/movement.ts uses for a travelling avatar's TRAVEL_MS —
 * so the podium's lift reads as the same weight of motion as every other
 * avatar movement in the game, not a bespoke speed. BRONZE_AT/SILVER_AT/
 * GOLD_AT are spaced 900ms apart, so each block finishes with a ~440ms beat
 * of stillness before the next one starts.
 */
export const RISE_MS = 460;

/** Which parts of the ceremony have landed. Derived purely from elapsed. */
export interface CeremonySteps {
  /** Per-place rise progress, linear 0..1. 1 == fully landed. */
  rise: Readonly<Record<1 | 2 | 3, number>>;
  spotlight: boolean;
  confetti: boolean;
  /** The band retreats and the results board rises (P5b consumes this). */
  board: boolean;
}

export const NO_CEREMONY: CeremonySteps = {
  rise: { 1: 0, 2: 0, 3: 0 },
  spotlight: false, confetti: false, board: false,
};

function riseAt(elapsedMs: number, startAt: number): number {
  return Math.min(1, Math.max(0, (elapsedMs - startAt) / RISE_MS));
}

export function ceremonyStepsAt(elapsedMs: number): CeremonySteps {
  return {
    // Bronze first, gold last: withholding the winner longest is the entire
    // point of a podium reveal.
    rise: {
      3: riseAt(elapsedMs, BRONZE_AT),
      2: riseAt(elapsedMs, SILVER_AT),
      1: riseAt(elapsedMs, GOLD_AT),
    },
    spotlight: elapsedMs >= SPOTLIGHT_AT,
    confetti: elapsedMs >= CONFETTI_AT,
    board: elapsedMs >= BOARD_AT,
  };
}

/** Equality guard for the store — without it every consumer re-renders at 60fps. */
export function sameSteps(a: CeremonySteps, b: CeremonySteps): boolean {
  return (
    a.rise[1] === b.rise[1] &&
    a.rise[2] === b.rise[2] &&
    a.rise[3] === b.rise[3] &&
    a.spotlight === b.spotlight &&
    a.confetti === b.confetti &&
    a.board === b.board
  );
}

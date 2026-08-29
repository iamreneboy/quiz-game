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
 *
 * When a photo finish is staged the whole podium sequence shifts by PHOTO_MS
 * and the prelude fills the gap; the ceremony's TOTAL length is flat either
 * way (ADR-0044), so nothing about the deadline depends on the outcome.
 */

/**
 * Client-side mirror of migration 0007's `ceremony_ms()`.
 *
 * FLAT — it does not depend on whether a photo finish is staged (ADR-0044).
 * The server would otherwise have to detect the tie itself to size the
 * deadline, which means a second implementation of the tie rule in a second
 * language; instead the deadline always reserves the prelude, and a ceremony
 * with no tie simply carries a longer settled tail. Nothing waits on this
 * deadline — `useHostDriver` returns early at `results` and `advance_phase`
 * raises once the room is finished (ADR-0027) — so the tail costs nothing.
 *
 * Hand-maintained, exactly as lib/staging/beats.ts's NOMINAL_MS mirrors the
 * server's other phase durations. The failure mode stays graceful: a moved
 * server duration compresses or completes the sequence early; it can never
 * block or lock the surface.
 */
export const CEREMONY_MS = 12400;

/**
 * How long the photo-finish prelude holds the podium back.
 *
 * The podium's own beats are unchanged and simply shift by this much when a
 * prelude is staged, so the no-tie ceremony is byte-identical to the one P5a
 * built.
 */
export const PHOTO_MS = 3400;

/** Elapsed within the prelude at which the speed-point tally starts running. */
export const PHOTO_TALLY_AT = 700;
/** How long the tally takes to count out. */
export const PHOTO_TALLY_MS = 1200;
/** When the order locks and the resolved placing is stated. */
export const PHOTO_RESOLVE_AT = 2200;

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

/** How far the photo-finish prelude has got. All zero when none is staged. */
export interface PhotoSteps {
  /** The prelude card is on screen. False before the ceremony and after PHOTO_MS. */
  open: boolean;
  /** Speed-point tally progress, linear 0..1. 1 == the numbers have landed. */
  tally: number;
  /** The order has locked; each group states its winner or its shared position. */
  resolved: boolean;
}

export const NO_PHOTO: PhotoSteps = { open: false, tally: 0, resolved: false };

/** Which parts of the ceremony have landed. Derived purely from elapsed. */
export interface CeremonySteps {
  /** Per-place rise progress, linear 0..1. 1 == fully landed. */
  rise: Readonly<Record<1 | 2 | 3, number>>;
  spotlight: boolean;
  confetti: boolean;
  /** The band retreats and the results board rises (P5b consumes this). */
  board: boolean;
  /** The photo-finish prelude (M3 P2a). `NO_PHOTO` whenever none is staged. */
  photo: PhotoSteps;
}

export const NO_CEREMONY: CeremonySteps = {
  rise: { 1: 0, 2: 0, 3: 0 },
  spotlight: false, confetti: false, board: false, photo: NO_PHOTO,
};

function riseAt(elapsedMs: number, startAt: number): number {
  return Math.min(1, Math.max(0, (elapsedMs - startAt) / RISE_MS));
}

function photoAt(elapsedMs: number): PhotoSteps {
  return {
    open: elapsedMs < PHOTO_MS,
    tally: Math.min(1, Math.max(0, (elapsedMs - PHOTO_TALLY_AT) / PHOTO_TALLY_MS)),
    resolved: elapsedMs >= PHOTO_RESOLVE_AT,
  };
}

/**
 * `photoFinish` shifts the podium's whole sequence by PHOTO_MS and opens the
 * prelude in the space that makes. It is a parameter rather than state because
 * this module stays a pure function of elapsed: the caller decides whether a
 * tie is worth staging (lib/ceremony/photoFinish.ts), and both the DOM ticker
 * and the renderer ask the same question of the same standings, so the two
 * surfaces cannot disagree by more than a frame.
 */
export function ceremonyStepsAt(elapsedMs: number, photoFinish = false): CeremonySteps {
  const offset = photoFinish ? PHOTO_MS : 0;
  const podium = elapsedMs - offset;

  return {
    // Bronze first, gold last: withholding the winner longest is the entire
    // point of a podium reveal.
    rise: {
      3: riseAt(podium, BRONZE_AT),
      2: riseAt(podium, SILVER_AT),
      1: riseAt(podium, GOLD_AT),
    },
    spotlight: podium >= SPOTLIGHT_AT,
    confetti: podium >= CONFETTI_AT,
    board: podium >= BOARD_AT,
    photo: photoFinish ? photoAt(elapsedMs) : NO_PHOTO,
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
    a.board === b.board &&
    a.photo.open === b.photo.open &&
    a.photo.tally === b.photo.tally &&
    a.photo.resolved === b.photo.resolved
  );
}

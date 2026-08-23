/**
 * The beat clock both domains read (spec §4 seams).
 *
 * Deliberately NOT in lib/presentation/tokens.ts: that file's contract is
 * "hand-mirror of the @theme block in app/globals.css", enforced by
 * tests/tokens.test.ts. These are choreography constants with no CSS
 * counterpart.
 *
 * The world's arena reaction and the DOM's lower third must land on the same
 * frame — announcing one thing while the stadium reacts to another is the
 * failure mode ADR-0010 exists to prevent — so neither domain owns the number.
 */

/** When a beat's reaction lands, measured from sequence start. */
export const ARENA_AT_MS = 1400;

/** How long a beat's drama holds: the camera transient and the callout alike. */
export const DRAMA_HOLD_MS = 1200;

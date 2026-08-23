/**
 * Beat timing (spec §4) — pure, no React, no store, no DOM.
 *
 * Beat position is derived from the server's `ends_at`, never from local
 * arrival (spec decision 2). A late joiner or a reload computes a large
 * elapsed and lands with everything already present, so "jump to the end
 * state rather than replay" needs no flag and no special case.
 */
import type { Phase } from '@/lib/types';

export type Beat = 'idle' | 'countdown' | 'read' | 'answer' | 'reveal' | 'track' | 'results';

/**
 * Client-side mirror of the server's FIXED phase durations
 * (supabase/migrations/0002_rpcs.sql:288-291; the countdown is set at :251).
 *
 * Hand-maintained, exactly as lib/presentation/tokens.ts mirrors globals.css.
 * There is no drift test, because the server values are not importable from
 * the client — the mitigation is that the failure mode is graceful. If a
 * server duration moved, the stagger would compress or complete early; it
 * would never block, break, or lock the surface.
 *
 * ANSWER is absent on purpose: its length is `room.timer_seconds`, which is
 * on the wire and must be read from there.
 */
export const NOMINAL_MS: Record<Exclude<Beat, 'idle' | 'answer'>, number> = {
  countdown: 3000,
  read: 3000,
  reveal: 5000,
  track: 4000,
  results: 0,
};

/** READ stagger, expressed in the P0 token durations (lib/presentation/tokens.ts). */
export const READ_BADGES_AT = 0;
export const READ_QUESTION_AT = 460; // DURATION.settle — badges have locked
export const READ_OPTIONS_AT = 1000;
/** Per-item delay handed to `motion`'s staggerChildren. */
export const READ_OPTION_STAGGER = 70;

/** How the options are being presented. Live only ever means ANSWER. */
export type OptionsMode = 'dim' | 'live' | 'result';

/** Which staged elements are on screen. Derived purely from beat + elapsed. */
export interface StageSteps {
  badges: boolean;
  question: boolean;
  options: boolean;
  optionsMode: OptionsMode;
}

const NOTHING: StageSteps = {
  badges: false, question: false, options: false, optionsMode: 'dim',
};

export function beatFor(phase: Phase | null): Beat {
  if (phase === null || phase === 'lobby') return 'idle';
  return phase;
}

export function beatTotalMs(beat: Beat, timerSeconds: number): number {
  if (beat === 'answer') return timerSeconds * 1000;
  if (beat === 'idle') return 0;
  return NOMINAL_MS[beat];
}

/** `remainingMs === null` means the deadline is unknown: treat the beat as over. */
export function elapsedIn(totalMs: number, remainingMs: number | null): number {
  if (remainingMs === null) return totalMs;
  return Math.max(0, totalMs - remainingMs);
}

export function stepsAt(beat: Beat, elapsedMs: number): StageSteps {
  switch (beat) {
    case 'read':
      return {
        badges: elapsedMs >= READ_BADGES_AT,
        question: elapsedMs >= READ_QUESTION_AT,
        options: elapsedMs >= READ_OPTIONS_AT,
        optionsMode: 'dim',
      };
    case 'answer':
      return { badges: true, question: true, options: true, optionsMode: 'live' };
    case 'reveal':
      // The options do NOT retire: they transform in place into result rows
      // (spec decision 3), which is what keeps the morph continuous.
      return { badges: true, question: true, options: true, optionsMode: 'result' };
    default:
      return NOTHING;
  }
}

/* ── REVEAL stagger (spec §5), in the P0 token durations ─────────────────── */

export const REVEAL_ROWS_AT = 0;
export const REVEAL_STACKS_AT = 300;
export const REVEAL_FASTEST_AT = 900;
export const REVEAL_FACT_AT = 1400;
/** Per-avatar delay handed to `motion`'s staggerChildren. */
export const REVEAL_AVATAR_STAGGER = 60;

/** Which parts of the reveal have landed. Same ends_at derivation as READ. */
export interface RevealSteps {
  rows: boolean;
  stacks: boolean;
  fastest: boolean;
  fact: boolean;
}

export const NO_REVEAL: RevealSteps = {
  rows: false, stacks: false, fastest: false, fact: false,
};

export function revealStepsAt(elapsedMs: number): RevealSteps {
  return {
    rows: elapsedMs >= REVEAL_ROWS_AT,
    stacks: elapsedMs >= REVEAL_STACKS_AT,
    fastest: elapsedMs >= REVEAL_FASTEST_AT,
    fact: elapsedMs >= REVEAL_FACT_AT,
  };
}

/**
 * Camera direction (spec §5) — the pure reducer that turns P0 cues into camera
 * intents. This is where the celebration hierarchy is enforced on the camera:
 * a transient shot preempts a live one only if its tier is strictly higher.
 *
 * P1 consumes the P0 cue vocabulary and adds nothing to it (ADR-0001).
 */
import { tierRank, type CelebrationTier } from '@/lib/presentation/celebration';
import type { Cue } from '@/lib/presentation/cues';
import { DRAMA_HOLD_MS } from '@/lib/presentation/timing';
import type { Phase } from '@/lib/types';
import type { ViewerRole } from '@/lib/viewer';
import type { MoveStyle } from './camera';
import type { FramingMode } from './framing';

/**
 * The camera transient and the DOM callout share ONE hold duration, by
 * construction — they do not overlap in time (the callout deliberately lands
 * ARENA_AT_MS later, on the arena beat), so "expire together" was misleading.
 */
export const OVERTAKE_HOLD_MS = DRAMA_HOLD_MS;

export interface CameraIntent {
  mode: FramingMode;
  style: MoveStyle;
  tier: CelebrationTier;
  emphasisIds: readonly string[];
}

export interface TransientIntent extends CameraIntent {
  expiresAt: number;
}

export interface DirectorState {
  base: CameraIntent;
  transient: TransientIntent | null;
  /** 0..1; 1 during the final question. Drives the grade, not the camera. */
  escalation: number;
  /** Which shot book this client is directed by. Set once, at seed. */
  role: ViewerRole;
}

const intent = (
  mode: FramingMode,
  style: MoveStyle,
  tier: CelebrationTier = 'routine',
  emphasisIds: readonly string[] = [],
): CameraIntent => ({ mode, style, tier, emphasisIds });

/**
 * A room watching a television needs longer to FIND an overtake than a thumb
 * glancing at a 28vh strip does.
 *
 * components/LowerThird.tsx imports this for the stage surface. That sharing is
 * the point: OVERTAKE_HOLD_MS and DRAMA_HOLD_MS are equal so the camera
 * transient and the callout last the SAME LENGTH (they do not overlap — the
 * callout deliberately lands ARENA_AT_MS later, on the arena beat). Give the
 * stage a longer camera hold without giving it the matching callout hold and
 * that relationship silently breaks.
 */
export const STAGE_DRAMA_HOLD_MS = 2200;

export interface ShotBook {
  base: Record<Phase, CameraIntent>;
  /** The shot the `final-question` cue punches in. */
  finalQuestionShot: CameraIntent;
  overtakeHoldMs: number;
  finalQuestionHoldMs: number;
}

const PLAYER_SHOTS: ShotBook = {
  base: {
    lobby: intent('startLine', 'drift'),
    countdown: intent('establishing', 'drift'),
    read: intent('pack', 'drift'),
    answer: intent('pack', 'drift'),
    // The reveal holds whatever shot the answer phase left; see reduceCue.
    reveal: intent('pack', 'drift'),
    track: intent('pack', 'cut'),
    // A cut to the podium is the broadcast move; a drift is a screensaver.
    results: intent('podium', 'cut'),
  },
  finalQuestionShot: intent('pack', 'drift', 'finalQuestion'),
  overtakeHoldMs: DRAMA_HOLD_MS,
  finalQuestionHoldMs: 2000,
};

/**
 * On a phone the world is a strip behind a question card, so a tight pack shot
 * is right. On a TV the world is the entire backdrop with the question laid
 * over it, and the same shot reads as a cropped detail instead of a wide.
 */
const STAGE_SHOTS: ShotBook = {
  base: {
    lobby: intent('startLine', 'drift'),
    countdown: intent('establishing', 'drift'),
    read: intent('packWide', 'drift'),
    answer: intent('packWide', 'drift'),
    reveal: intent('packWide', 'drift'),
    track: intent('packWide', 'cut'),
    results: intent('podiumRoom', 'cut'),
  },
  // Roadmap P1 named a slow push-in for the final question and it was never
  // built: today's transient is pack/drift over a pack base, i.e. a no-op.
  finalQuestionShot: intent('packTight', 'push', 'finalQuestion'),
  overtakeHoldMs: STAGE_DRAMA_HOLD_MS,
  finalQuestionHoldMs: 3200,
};

export const SHOT_BOOKS: Record<ViewerRole, ShotBook> = {
  player: PLAYER_SHOTS,
  stage: STAGE_SHOTS,
};

/** Kept for the player view's own tests; the books are the source of truth. */
export const FINAL_QUESTION_HOLD_MS = PLAYER_SHOTS.finalQuestionHoldMs;

export const initialDirectorState: DirectorState = {
  base: PLAYER_SHOTS.base.lobby,
  transient: null,
  escalation: 0,
  role: 'player',
};

/** Base intent for a client that joined or reloaded mid-game. */
export function seedDirector(phase: Phase, role: ViewerRole = 'player'): DirectorState {
  return { ...initialDirectorState, role, base: SHOT_BOOKS[role].base[phase] };
}

export function reduceCue(state: DirectorState, cue: Cue, now: number): DirectorState {
  const shots = SHOT_BOOKS[state.role];
  switch (cue.type) {
    case 'phase-countdown':
      return { ...state, base: shots.base.countdown, escalation: 0 };

    case 'phase-read':
      return {
        ...state,
        base: shots.base.read,
        // `final-question` arrives alongside this cue and sets escalation to 1.
        escalation: cue.isFinal ? state.escalation : 0,
      };

    case 'phase-answer':
      return { ...state, base: shots.base.answer };

    case 'phase-track':
      return { ...state, base: shots.base.track };

    case 'final-question':
      return {
        ...withTransient(state, shots.finalQuestionShot, shots.finalQuestionHoldMs, now),
        escalation: 1,
      };

    case 'overtake':
      return withTransient(
        state,
        intent('emphasis', 'cut', 'overtake', [cue.playerId, ...cue.passed]),
        shots.overtakeHoldMs,
        now,
      );

    case 'lead-changed':
      return withTransient(
        state,
        intent('emphasis', 'cut', 'overtake', [cue.playerId, cue.previousLeaderId]),
        shots.overtakeHoldMs,
        now,
      );

    case 'phase-results':
      return {
        ...state,
        base: shots.base.results,
        // A live overtake transient outranks nothing here — it would simply
        // fight the cut — so the ceremony takes the frame outright.
        transient: null,
        // DELIBERATELY NOT RESET. `escalation` is still 1 from the final
        // question, and a world dimmed to neon at peak is exactly the grade a
        // spotlight wants. `phase-read` zeroes it; this must not. Do not
        // "fix" this to match the other branches.
        escalation: state.escalation,
      };

    // `phase-reveal` deliberately holds the current shot. Everything else in
    // the P0 vocabulary belongs to a later phase (spec §5).
    default:
      return state;
  }
}

function withTransient(
  state: DirectorState,
  next: CameraIntent,
  holdMs: number,
  now: number,
): DirectorState {
  const live = state.transient && state.transient.expiresAt > now ? state.transient : null;
  if (live && tierRank(next.tier) <= tierRank(live.tier)) return state;
  return { ...state, transient: { ...next, expiresAt: now + holdMs } };
}

/** Drops an expired transient so the camera returns to its base shot. */
export function tickDirector(state: DirectorState, now: number): DirectorState {
  if (!state.transient || state.transient.expiresAt > now) return state;
  return { ...state, transient: null };
}

export function activeIntent(state: DirectorState): CameraIntent {
  return state.transient ?? state.base;
}

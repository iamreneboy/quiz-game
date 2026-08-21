/**
 * Camera direction (spec §5) — the pure reducer that turns P0 cues into camera
 * intents. This is where the celebration hierarchy is enforced on the camera:
 * a transient shot preempts a live one only if its tier is strictly higher.
 *
 * P1 consumes the P0 cue vocabulary and adds nothing to it (ADR-0001).
 */
import { tierRank, type CelebrationTier } from '@/lib/presentation/celebration';
import type { Cue } from '@/lib/presentation/cues';
import type { Phase } from '@/lib/types';
import type { MoveStyle } from './camera';
import type { FramingMode } from './framing';

export const OVERTAKE_HOLD_MS = 1200;
export const FINAL_QUESTION_HOLD_MS = 2000;

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
}

const intent = (
  mode: FramingMode,
  style: MoveStyle,
  tier: CelebrationTier = 'routine',
  emphasisIds: readonly string[] = [],
): CameraIntent => ({ mode, style, tier, emphasisIds });

const BASE_BY_PHASE: Record<Phase, CameraIntent> = {
  lobby: intent('startLine', 'drift'),
  countdown: intent('establishing', 'drift'),
  read: intent('pack', 'drift'),
  answer: intent('pack', 'drift'),
  // The reveal holds whatever shot the answer phase left; see reduceCue.
  reveal: intent('pack', 'drift'),
  track: intent('pack', 'cut'),
  results: intent('establishing', 'drift'),
};

export const initialDirectorState: DirectorState = {
  base: BASE_BY_PHASE.lobby,
  transient: null,
  escalation: 0,
};

/** Base intent for a client that joined or reloaded mid-game. */
export function seedDirector(phase: Phase): DirectorState {
  return { ...initialDirectorState, base: BASE_BY_PHASE[phase] };
}

export function reduceCue(state: DirectorState, cue: Cue, now: number): DirectorState {
  switch (cue.type) {
    case 'phase-countdown':
      return { ...state, base: BASE_BY_PHASE.countdown, escalation: 0 };

    case 'phase-read':
      return {
        ...state,
        base: BASE_BY_PHASE.read,
        // `final-question` arrives alongside this cue and sets escalation to 1.
        escalation: cue.isFinal ? state.escalation : 0,
      };

    case 'phase-answer':
      return { ...state, base: BASE_BY_PHASE.answer };

    case 'phase-track':
      return { ...state, base: BASE_BY_PHASE.track };

    case 'final-question':
      return {
        ...withTransient(state, intent('pack', 'drift', 'finalQuestion'), FINAL_QUESTION_HOLD_MS, now),
        escalation: 1,
      };

    case 'overtake':
      return withTransient(
        state,
        intent('emphasis', 'cut', 'overtake', [cue.playerId, ...cue.passed]),
        OVERTAKE_HOLD_MS,
        now,
      );

    case 'lead-changed':
      return withTransient(
        state,
        intent('emphasis', 'cut', 'overtake', [cue.playerId, cue.previousLeaderId]),
        OVERTAKE_HOLD_MS,
        now,
      );

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

/**
 * Broadcast callouts (spec §5) — pure accumulator, threaded by
 * lib/staging/runtime.ts exactly as lib/world/runtime.ts threads
 * ChoreographerState.
 *
 * Drama cues arrive at the REVEAL transition (ADR-0009) but the world does
 * not react until TRACK, so they are BUFFERED here and resolved on
 * `phase-track`. A callout that fires on cue arrival fires one beat before
 * the stadium it is describing.
 *
 * The queue is deliberately duplicated rather than shared with the
 * choreographer (spec decision 6): both resolve the same cues with the same
 * `resolveTier`, so they cannot disagree, and the readable surface never
 * depends on renderer state (PRD §9).
 */
import { resolveTier, type CelebrationTier } from '@/lib/presentation/celebration';
import type { Cue } from '@/lib/presentation/cues';

export type CalloutKind = 'overtake' | 'lead-changed' | 'streak-tier' | 'final-question';

export interface Callout {
  kind: CalloutKind;
  tier: CelebrationTier;
  /** The broadcast line, already formatted. */
  headline: string;
  playerId: string | null;
}

/** Below-headline drama, subdued into the rail rather than dropped (ADR-0010). */
export interface RailDelta {
  playerId: string;
  placesGained: number;
}

export interface CalloutState {
  pending: Cue[];
  callout: Callout | null;
  deltas: RailDelta[];
  /** True from the final-question run-up until the results beat. */
  escalated: boolean;
}

export const initialCalloutState: CalloutState = {
  pending: [],
  callout: null,
  deltas: [],
  escalated: false,
};

const CALLABLE = new Set<Cue['type']>([
  'overtake', 'lead-changed', 'streak-tier', 'final-question',
]);

/**
 * `player-advanced` is deliberately absent: every correct answer produces one,
 * and a banner for a routine advance is exactly the noise the celebration
 * hierarchy exists to prevent (PRD §8).
 */
export function bufferCallout(state: CalloutState, cue: Cue): CalloutState {
  if (!CALLABLE.has(cue.type)) return state;
  return { ...state, pending: [...state.pending, cue] };
}

export function resolveCallout(
  state: CalloutState,
  nameOf: (playerId: string) => string,
  localPlayerId: string | null,
): CalloutState {
  if (state.pending.length === 0) {
    return { ...state, pending: [], callout: null, deltas: [] };
  }

  const headline = resolveTier(state.pending);
  const contenders = state.pending.filter(c => c.tier === headline);

  // One headline per beat (ADR-0010). Ties break toward the local player,
  // following ADR-0008's precedent for overflow.
  const chosen =
    contenders.find(c => 'playerId' in c && c.playerId === localPlayerId) ?? contenders[0];

  const deltas: RailDelta[] = state.pending
    .filter((c): c is Extract<Cue, { type: 'overtake' }> => c.type === 'overtake')
    .map(c => ({ playerId: c.playerId, placesGained: c.passed.length }));

  const escalated = state.escalated || state.pending.some(c => c.type === 'final-question');

  return { ...state, pending: [], callout: toCallout(chosen, nameOf), deltas, escalated };
}

/** The banner and its marks are one beat's worth; escalation outlives them. */
export function clearCallout(state: CalloutState): CalloutState {
  return { ...state, pending: [], callout: null, deltas: [] };
}

/** Everything goes, escalation included. The results beat is a new act. */
export function resetCallouts(): CalloutState {
  return initialCalloutState;
}

function toCallout(cue: Cue, nameOf: (playerId: string) => string): Callout | null {
  switch (cue.type) {
    case 'overtake':
      return {
        kind: 'overtake',
        tier: cue.tier,
        playerId: cue.playerId,
        headline:
          cue.passed.length === 1
            ? `${nameOf(cue.playerId)} passes ${nameOf(cue.passed[0])}`
            : `${nameOf(cue.playerId)} passes ${cue.passed.length} racers`,
      };

    case 'lead-changed':
      return {
        kind: 'lead-changed',
        tier: cue.tier,
        playerId: cue.playerId,
        headline: `${nameOf(cue.playerId)} takes the lead`,
      };

    case 'streak-tier':
      return {
        kind: 'streak-tier',
        tier: cue.tier,
        playerId: cue.playerId,
        headline: `${nameOf(cue.playerId)} is on fire — ${cue.streak} in a row`,
      };

    case 'final-question':
      return { kind: 'final-question', tier: cue.tier, playerId: null, headline: 'FINAL QUESTION' };

    default:
      return null;
  }
}

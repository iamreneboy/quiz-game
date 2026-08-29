/**
 * The audio state machine (spec §5-§6) — pure. No Howler, no DOM, no store.
 *
 * Two rules carry most of the weight:
 *   - drama buffers to the TRACK beat, so the sound lands with the picture
 *     (ADR-0009), and exactly one headline plays per beat;
 *   - the first cue batch is CATCH-UP: beds apply, stings do not, so a reload
 *     lands in the right sonic state without replaying the show (ADR-0024).
 */
import { resolveTier } from '@/lib/presentation/celebration';
import type { Cue, CueOf, CueType } from '@/lib/presentation/cues';
import { stingFor, TRACK_DEFAULT_STING, type MusicBed } from './design';
import type { SoundId } from './manifest';

export type DramaCue =
  | CueOf<'overtake'>
  | CueOf<'lead-changed'>
  | CueOf<'streak-tier'>
  | CueOf<'final-question'>;

const DRAMA_TYPES = ['overtake', 'lead-changed', 'streak-tier', 'final-question'] as const;
const DRAMA: ReadonlySet<CueType> = new Set(DRAMA_TYPES);

/** Every cue type the audio runtime subscribes to. */
export const AUDIO_CUE_TYPES: readonly CueType[] = [
  'phase-countdown', 'phase-read', 'phase-answer', 'phase-reveal', 'phase-track', 'phase-results',
  'answer-locked', 'answer-resolved', 'player-joined', 'podium',
  'game-paused', 'game-resumed',
  ...DRAMA_TYPES,
];

export interface AudioState {
  bed: MusicBed;
  escalated: boolean;
  /** Drama seen at the reveal, waiting for its TRACK beat. */
  pending: DramaCue[];
  /** True until the runtime has seen a full emission tick; suppresses stings. */
  catchUp: boolean;
  /** True while the host has the room paused; the bed holds a sustained duck. */
  paused: boolean;
}

export const initialAudioState: AudioState = {
  bed: 'lobby',
  escalated: false,
  pending: [],
  catchUp: true,
  paused: false,
};

export interface AudioStep {
  state: AudioState;
  stings: SoundId[];
}

export function endCatchUp(state: AudioState): AudioState {
  return state.catchUp ? { ...state, catchUp: false } : state;
}

export function applyCue(state: AudioState, cue: Cue): AudioStep {
  let next = state;
  let stings: SoundId[] = [];

  switch (cue.type) {
    case 'phase-countdown':
    case 'phase-read':
    case 'phase-answer':
    case 'phase-reveal':
    case 'phase-track':
      if (next.bed !== 'round') next = { ...next, bed: 'round' };
      break;
    case 'phase-results':
      next = { ...next, bed: 'ceremony', pending: [] };
      break;
    default:
      break;
  }

  // Set on SIGHT, never deferred to the beat that resolves it: a reload can
  // seed this cue directly into the final round's READ, ANSWER or REVEAL, none
  // of which reach the arbitration below (ADR-0021).
  if (cue.type === 'final-question') next = { ...next, escalated: true };

  // Set on SIGHT, for the same reason `escalated` is (ADR-0021, ADR-0024): a
  // reload seeds `game-paused` in the catch-up batch, where stings are
  // suppressed but bed state still has to land.
  if (cue.type === 'game-paused') next = { ...next, paused: true };
  else if (cue.type === 'game-resumed') next = { ...next, paused: false };

  if (DRAMA.has(cue.type)) {
    next = { ...next, pending: [...next.pending, cue as DramaCue] };
  } else if (cue.type === 'phase-track') {
    const headline = pickHeadline(next.pending);
    stings = [(headline && stingFor(headline)) || TRACK_DEFAULT_STING];
    next = { ...next, pending: [] };
  } else if (cue.type === 'phase-read') {
    // A READ without an intervening TRACK means the drama's moment has passed.
    if (next.pending.length > 0) next = { ...next, pending: [] };
    const id = stingFor(cue);
    if (id) stings = [id];
  } else {
    const id = stingFor(cue);
    if (id) stings = [id];
  }

  if (next.catchUp) stings = [];
  return { state: next, stings };
}

/** One headline per beat, highest celebration tier wins, ties by arrival. */
function pickHeadline(pending: readonly DramaCue[]): DramaCue | null {
  if (pending.length === 0) return null;
  const top = resolveTier(pending);
  return pending.find(cue => cue.tier === top) ?? null;
}

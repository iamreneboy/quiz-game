/**
 * The discrete staging state (spec §3) — pure.
 *
 * One moment of game state in, everything the question surface renders out.
 * Deliberately a projection rather than an accumulator: because beat position
 * comes from `ends_at` (spec decision 2), nothing here needs to be remembered
 * between frames, which is what makes a reload correct with no special case.
 *
 * Nothing continuous lives here. The tension RAMP and the ring FRACTION go to
 * CSS custom properties in lib/staging/runtime.ts; this carries only the
 * quantized step and the whole second.
 */
import type { Phase } from '@/lib/types';
import { beatFor, beatTotalMs, elapsedIn, stepsAt, type Beat, type StageSteps } from './beats';
import { tensionAt, tensionStep, type TensionStep } from './tension';

export interface StagingInput {
  phase: Phase | null;
  round: number;
  /** ms left in the current phase, or null when the deadline is unknown. */
  remainingMs: number | null;
  timerSeconds: number;
  myAnswer: number | null;
  /** False for a spectator or a non-playing MC host. */
  isPlaying: boolean;
}

export interface StagingState {
  beat: Beat;
  round: number;
  steps: StageSteps;
  tensionStep: TensionStep;
  /** Whole seconds left in ANSWER, for the ring's numeral. Null elsewhere. */
  secondsLeft: number | null;
  lockedChoice: number | null;
  spectating: boolean;
}

export const initialStagingState: StagingState = {
  beat: 'idle',
  round: 0,
  steps: { badges: false, question: false, options: false, optionsLive: false },
  tensionStep: 0,
  secondsLeft: null,
  lockedChoice: null,
  spectating: false,
};

export function stagingAt(input: StagingInput): StagingState {
  const beat = beatFor(input.phase);
  const totalMs = beatTotalMs(beat, input.timerSeconds);
  const elapsed = elapsedIn(totalMs, input.remainingMs);
  const isAnswer = beat === 'answer';

  return {
    beat,
    round: input.round,
    steps: stepsAt(beat, elapsed),
    tensionStep: isAnswer ? tensionStep(tensionAt(input.remainingMs, totalMs)) : 0,
    secondsLeft:
      isAnswer && input.remainingMs !== null
        ? Math.max(0, Math.ceil(input.remainingMs / 1000))
        : null,
    lockedChoice: input.myAnswer,
    spectating: !input.isPlaying,
  };
}

/** Cheap equality so the ticker can skip a publish that changes nothing. */
export function sameStaging(a: StagingState, b: StagingState): boolean {
  return (
    a.beat === b.beat &&
    a.round === b.round &&
    a.tensionStep === b.tensionStep &&
    a.secondsLeft === b.secondsLeft &&
    a.lockedChoice === b.lockedChoice &&
    a.spectating === b.spectating &&
    a.steps.badges === b.steps.badges &&
    a.steps.question === b.steps.question &&
    a.steps.options === b.steps.options &&
    a.steps.optionsLive === b.steps.optionsLive
  );
}

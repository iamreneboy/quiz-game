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
import {
  NO_REVEAL,
  beatFor,
  beatTotalMs,
  elapsedIn,
  revealStepsAt,
  stepsAt,
  type Beat,
  type RevealSteps,
  type StageSteps,
} from './beats';
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
  /** True while the host has the room paused. */
  paused: boolean;
}

export interface StagingState {
  beat: Beat;
  round: number;
  steps: StageSteps;
  /** Which parts of the REVEAL beat have landed. Closed on every other beat. */
  reveal: RevealSteps;
  tensionStep: TensionStep;
  /** Whole seconds left in ANSWER, for the ring's numeral. Null elsewhere. */
  secondsLeft: number | null;
  lockedChoice: number | null;
  spectating: boolean;
}

export const initialStagingState: StagingState = {
  beat: 'idle',
  round: 0,
  steps: { badges: false, question: false, options: false, optionsMode: 'dim' },
  reveal: NO_REVEAL,
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

  // A paused room accepts no answers (submit_answer's status guard), so the
  // options must leave 'live'. This is not staging gating input (ADR-0016): it
  // is the SERVER's authority reaching the surface, and it has to reach it
  // here — AnswerButtons' 1-4 shortcut is a `window` keydown listener, which no
  // overlay or backdrop can intercept.
  const steps = stepsAt(beat, elapsed);
  const staged =
    input.paused && steps.optionsMode === 'live'
      ? { ...steps, optionsMode: 'dim' as const }
      : steps;

  return {
    beat,
    round: input.round,
    steps: staged,
    reveal: beat === 'reveal' ? revealStepsAt(elapsed) : NO_REVEAL,
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
    a.steps.optionsMode === b.steps.optionsMode &&
    a.reveal.rows === b.reveal.rows &&
    a.reveal.stacks === b.reveal.stacks &&
    a.reveal.fastest === b.reveal.fastest &&
    a.reveal.fact === b.reveal.fact
  );
}

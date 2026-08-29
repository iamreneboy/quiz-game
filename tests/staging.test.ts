import { describe, it, expect } from 'vitest';
import {
  initialStagingState,
  sameStaging,
  stagingAt,
  type StagingInput,
} from '@/lib/staging/staging';

const base: StagingInput = {
  phase: 'answer',
  round: 3,
  remainingMs: 20_000,
  timerSeconds: 20,
  myAnswer: null,
  isPlaying: true,
  paused: false,
};

const at = (over: Partial<StagingInput> = {}) => stagingAt({ ...base, ...over });

describe('stagingAt', () => {
  it('is idle in the lobby', () => {
    expect(at({ phase: 'lobby' })).toMatchObject({ beat: 'idle', tensionStep: 0, secondsLeft: null });
  });

  it('places a fresh READ at the top of its stagger', () => {
    const state = at({ phase: 'read', remainingMs: 3000 });
    expect(state.steps).toMatchObject({ badges: true, question: false, options: false });
  });

  it('places a late joiner at the end of the READ stagger', () => {
    const state = at({ phase: 'read', remainingMs: 400 });
    expect(state.steps).toMatchObject({ badges: true, question: true, options: true });
  });

  it('opens ANSWER calm and escalates as the deadline closes', () => {
    expect(at({ remainingMs: 20_000 }).tensionStep).toBe(0);
    expect(at({ remainingMs: 5000 }).tensionStep).toBe(1);
    expect(at({ remainingMs: 3000 }).tensionStep).toBe(2);
    expect(at({ remainingMs: 800 }).tensionStep).toBe(3);
  });

  it('never escalates outside the ANSWER beat', () => {
    expect(at({ phase: 'reveal', remainingMs: 0 }).tensionStep).toBe(0);
    expect(at({ phase: 'read', remainingMs: 0 }).tensionStep).toBe(0);
  });

  it('counts whole seconds down, and only during ANSWER', () => {
    expect(at({ remainingMs: 4200 }).secondsLeft).toBe(5);
    expect(at({ remainingMs: 0 }).secondsLeft).toBe(0);
    expect(at({ phase: 'read', remainingMs: 2000 }).secondsLeft).toBeNull();
    expect(at({ remainingMs: null }).secondsLeft).toBeNull();
  });

  it('carries the committed choice through', () => {
    expect(at({ myAnswer: 2 }).lockedChoice).toBe(2);
    expect(at({ myAnswer: 0 }).lockedChoice).toBe(0);
    expect(at().lockedChoice).toBeNull();
  });

  it('marks a non-playing MC as spectating', () => {
    expect(at({ isPlaying: false }).spectating).toBe(true);
    expect(at().spectating).toBe(false);
  });

  it('is calm and complete when the deadline is unknown', () => {
    const state = at({ phase: 'read', remainingMs: null });
    expect(state.steps).toMatchObject({ badges: true, question: true, options: true });
    expect(state.tensionStep).toBe(0);
  });
});

describe('sameStaging', () => {
  it('recognises an unchanged snapshot so the store can bail', () => {
    expect(sameStaging(at(), at())).toBe(true);
    expect(sameStaging(initialStagingState, initialStagingState)).toBe(true);
  });

  it('notices every field that consumers render', () => {
    expect(sameStaging(at(), at({ phase: 'read' }))).toBe(false);
    expect(sameStaging(at(), at({ round: 4 }))).toBe(false);
    expect(sameStaging(at({ remainingMs: 4200 }), at({ remainingMs: 3200 }))).toBe(false);
    expect(sameStaging(at(), at({ remainingMs: 800 }))).toBe(false);
    expect(sameStaging(at(), at({ myAnswer: 1 }))).toBe(false);
    expect(sameStaging(at(), at({ isPlaying: false }))).toBe(false);
    expect(sameStaging(at({ phase: 'read', remainingMs: 3000 }), at({ phase: 'read', remainingMs: 2000 }))).toBe(false);
  });

  it('ignores a tick that changed nothing discrete', () => {
    // 20.0s vs 19.9s left: same steps, same step, same second.
    expect(sameStaging(at({ remainingMs: 19_400 }), at({ remainingMs: 19_300 }))).toBe(true);
  });
});

describe('stagingAt — the reveal beat', () => {
  it('derives reveal sub-steps from the deadline, so a reload does not replay', () => {
    const midway = stagingAt({
      phase: 'reveal', round: 2, remainingMs: 3000, timerSeconds: 20,
      myAnswer: 1, isPlaying: true, paused: false,
    });
    // 5000 nominal - 3000 remaining = 2000 elapsed: everything has landed.
    expect(midway.reveal).toEqual({ rows: true, stacks: true, fastest: true, fact: true });
    expect(midway.steps.optionsMode).toBe('result');
  });

  it('opens the reveal with the rows alone at the top of the beat', () => {
    const fresh = stagingAt({
      phase: 'reveal', round: 2, remainingMs: 5000, timerSeconds: 20,
      myAnswer: 1, isPlaying: true, paused: false,
    });
    expect(fresh.reveal.rows).toBe(true);
    expect(fresh.reveal.stacks).toBe(false);
  });

  it('closes the reveal steps on every other beat', () => {
    const answering = stagingAt({
      phase: 'answer', round: 2, remainingMs: 8000, timerSeconds: 20,
      myAnswer: null, isPlaying: true, paused: false,
    });
    expect(answering.reveal).toEqual({ rows: false, stacks: false, fastest: false, fact: false });
  });

  it('treats a change of reveal step as a change worth publishing', () => {
    const a = stagingAt({ phase: 'reveal', round: 1, remainingMs: 5000, timerSeconds: 20, myAnswer: 0, isPlaying: true, paused: false });
    const b = stagingAt({ phase: 'reveal', round: 1, remainingMs: 4500, timerSeconds: 20, myAnswer: 0, isPlaying: true, paused: false });
    expect(sameStaging(a, b)).toBe(false);
  });
});

describe('a paused beat', () => {
  it('holds the ANSWER stagger at the frozen remainder', () => {
    const live = at({ remainingMs: 6_000 });
    const frozen = at({ remainingMs: 6_000, paused: true });
    expect(frozen.secondsLeft).toBe(live.secondsLeft);
    expect(frozen.tensionStep).toBe(live.tensionStep);
  });

  it('takes the options out of live mode, which is what disables the 1-4 shortcut', () => {
    expect(at({ remainingMs: 6_000 }).steps.optionsMode).toBe('live');
    expect(at({ remainingMs: 6_000, paused: true }).steps.optionsMode).toBe('dim');
  });

  it('leaves every other beat alone — REVEAL has no input to gate', () => {
    const frozen = at({ phase: 'reveal', remainingMs: 2_000, paused: true });
    expect(frozen.steps.optionsMode).toBe('result');
    expect(frozen.reveal.rows).toBe(true);
  });
});

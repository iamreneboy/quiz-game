import { describe, expect, it } from 'vitest';
import { applyCue, endCatchUp, initialAudioState, type AudioState } from '@/lib/audio/state';
import type { Cue } from '@/lib/presentation/cues';
import type { SoundId } from '@/lib/audio/manifest';

const countdown: Cue = { type: 'phase-countdown', tier: 'routine', endsAt: null };
const read: Cue = { type: 'phase-read', tier: 'routine', round: 1, category: null, questionTier: null, isFinal: false };
const answer: Cue = { type: 'phase-answer', tier: 'routine', round: 1, endsAt: null };
const reveal: Cue = { type: 'phase-reveal', tier: 'routine', round: 1, correctIndex: 0, counts: [], fastest: null };
const track: Cue = { type: 'phase-track', tier: 'routine', round: 1 };
const results: Cue = { type: 'phase-results', tier: 'routine' };
const overtake: Cue = { type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b'] };
const streak3: Cue = { type: 'streak-tier', tier: 'streakMilestone', playerId: 'a', streak: 3 };
const finalQ: Cue = { type: 'final-question', tier: 'finalQuestion', round: 3 };
const podium: Cue = { type: 'podium', tier: 'victory', top: [] };
const resolved = (correct: boolean, answered = true): Cue => ({
  type: 'answer-resolved', tier: 'routine', answered, correct, choiceIndex: answered ? 0 : null, correctIndex: 0,
});

/** Feed cues through the machine, collecting every sting it asked for. */
function run(cues: Cue[], start: AudioState = { ...initialAudioState, catchUp: false }) {
  let state = start;
  const stings: SoundId[] = [];
  for (const cue of cues) {
    const step = applyCue(state, cue);
    state = step.state;
    stings.push(...step.stings);
  }
  return { state, stings };
}

describe('beds', () => {
  it('starts in the lobby and never needs a lobby cue', () => {
    expect(initialAudioState.bed).toBe('lobby');
  });

  it('walks lobby -> round -> ceremony over a game', () => {
    const beds: string[] = [];
    let state: AudioState = { ...initialAudioState, catchUp: false };
    for (const cue of [countdown, read, answer, reveal, track, results]) {
      state = applyCue(state, cue).state;
      beds.push(state.bed);
    }
    expect(beds).toEqual(['round', 'round', 'round', 'round', 'round', 'ceremony']);
  });

  it('enters the round bed from any phase cue, not just the countdown', () => {
    for (const cue of [read, answer, reveal, track]) {
      expect(run([cue]).state.bed).toBe('round');
    }
  });
});

describe('escalation', () => {
  it('sets escalated the instant final-question is seen, without waiting for the track beat', () => {
    const { state } = run([finalQ]);
    expect(state.escalated).toBe(true);
  });

  it('stays escalated when a reload seeds straight into the final READ', () => {
    // deriveCues seeds final-question ahead of the beat; catch-up must still take it.
    let state = initialAudioState; // catchUp: true
    state = applyCue(state, finalQ).state;
    state = applyCue(state, read).state;
    expect(state.escalated).toBe(true);
    expect(state.bed).toBe('round');
  });
});

describe('catch-up', () => {
  it('applies the bed but plays no stings', () => {
    let state = initialAudioState;
    const stings: SoundId[] = [];
    for (const cue of [finalQ, read]) {
      const step = applyCue(state, cue);
      state = step.state;
      stings.push(...step.stings);
    }
    expect(stings).toEqual([]);
    expect(state.bed).toBe('round');
    expect(state.escalated).toBe(true);
  });

  it('plays normally once catch-up has ended', () => {
    const state = endCatchUp(applyCue(initialAudioState, read).state);
    expect(state.catchUp).toBe(false);
    expect(applyCue(state, resolved(true)).stings).toEqual(['correct']);
  });

  it('endCatchUp is idempotent', () => {
    const once = endCatchUp(initialAudioState);
    expect(endCatchUp(once)).toEqual(once);
  });
});

describe('drama buffering', () => {
  it('makes no sound at the reveal and one at the track beat', () => {
    const beforeTrack = run([reveal, overtake, streak3]);
    expect(beforeTrack.stings).toEqual(['reveal-hit']);
    expect(beforeTrack.state.pending).toHaveLength(2);

    const step = applyCue(beforeTrack.state, track);
    expect(step.stings).toEqual(['overtake-whoosh']);
    expect(step.state.pending).toEqual([]);
  });

  it('lets the highest tier win: final-question outranks an overtake', () => {
    const { stings } = run([reveal, overtake, finalQ, track]);
    expect(stings).toEqual(['reveal-hit', 'final-sting']);
  });

  it('falls back to the track whoosh when nothing dramatic happened', () => {
    expect(run([track]).stings).toEqual(['track-whoosh']);
  });

  it('drops stale drama if a READ arrives without an intervening track beat', () => {
    const { state } = run([overtake, read]);
    expect(state.pending).toEqual([]);
    expect(applyCue(state, track).stings).toEqual(['track-whoosh']);
  });

  it('clears the buffer at the results beat', () => {
    expect(run([overtake, results]).state.pending).toEqual([]);
  });
});

describe('one-shot stings', () => {
  it('plays the personal verdict at the reveal, and silence when unanswered', () => {
    expect(run([resolved(true)]).stings).toEqual(['correct']);
    expect(run([resolved(false)]).stings).toEqual(['wrong-soft']);
    expect(run([resolved(false, false)]).stings).toEqual([]);
  });

  it('plays the fanfare on the podium cue, not on phase-results', () => {
    expect(run([results]).stings).toEqual([]);
    expect(run([podium]).stings).toEqual(['fanfare']);
  });
});

const gamePaused: Cue = { type: 'game-paused', tier: 'routine' };
const gameResumed: Cue = { type: 'game-resumed', tier: 'routine' };

describe('pause', () => {
  it('starts un-paused', () => {
    expect(initialAudioState.paused).toBe(false);
  });

  it('holds and releases the duck', () => {
    const held = run([answer, gamePaused]);
    expect(held.state.paused).toBe(true);
    expect(run([answer, gamePaused, gameResumed]).state.paused).toBe(false);
  });

  it('is set on SIGHT, so a seed batch into a paused room still ducks', () => {
    // catchUp true is the reload path: stings are suppressed, state is not.
    const { state, stings } = run([answer, gamePaused], { ...initialAudioState });
    expect(state.paused).toBe(true);
    expect(stings).toEqual([]);
  });

  it('makes no sound of its own — a pause is silence, not a sting', () => {
    expect(run([answer, gamePaused, gameResumed]).stings).toEqual(['answer-open']);
  });

  it('leaves the bed and the pending drama queue untouched', () => {
    const { state } = run([read, answer, reveal, overtake, gamePaused]);
    expect(state.bed).toBe('round');
    expect(state.pending.map(c => c.type)).toEqual(['overtake']);
  });
});

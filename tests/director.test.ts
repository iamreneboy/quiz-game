import { describe, it, expect } from 'vitest';
import type { Cue } from '@/lib/presentation/cues';
import { DURATION } from '@/lib/presentation/tokens';
import {
  FINAL_QUESTION_HOLD_MS,
  OVERTAKE_HOLD_MS,
  SHOT_BOOKS,
  STAGE_DRAMA_HOLD_MS,
  activeIntent,
  initialDirectorState,
  reduceCue,
  seedDirector,
  tickDirector,
} from '@/lib/world/director';

const read = (round: number, isFinal: boolean): Cue => ({
  type: 'phase-read',
  tier: 'routine',
  round,
  category: 'Corporate Survival',
  questionTier: 2,
  isFinal,
});

const overtake: Cue = { type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b', 'c'] };

describe('base intents', () => {
  it('starts parked at the start line', () => {
    expect(activeIntent(initialDirectorState).mode).toBe('startLine');
  });

  it('establishes on the countdown', () => {
    const state = reduceCue(initialDirectorState, { type: 'phase-countdown', tier: 'routine', endsAt: null }, 0);
    expect(activeIntent(state)).toMatchObject({ mode: 'establishing', style: 'drift' });
  });

  it('frames the pack while reading and answering', () => {
    let state = reduceCue(initialDirectorState, read(3, false), 0);
    expect(activeIntent(state).mode).toBe('pack');
    state = reduceCue(state, { type: 'phase-answer', tier: 'routine', round: 3, endsAt: null }, 0);
    expect(activeIntent(state)).toMatchObject({ mode: 'pack', style: 'drift' });
  });

  it('cuts to the pack at the track moment', () => {
    const state = reduceCue(initialDirectorState, { type: 'phase-track', tier: 'routine', round: 3 }, 0);
    expect(activeIntent(state)).toMatchObject({ mode: 'pack', style: 'cut' });
  });

  it('holds the base mode through the reveal', () => {
    const answering = reduceCue(initialDirectorState, { type: 'phase-answer', tier: 'routine', round: 3, endsAt: null }, 0);
    const revealing = reduceCue(answering, {
      type: 'phase-reveal', tier: 'routine', round: 3, correctIndex: 1, counts: [], fastest: null,
    }, 0);
    expect(activeIntent(revealing)).toEqual(activeIntent(answering));
  });

  it('seeds a base intent from a phase, for a mid-game reload', () => {
    expect(activeIntent(seedDirector('answer')).mode).toBe('pack');
    expect(activeIntent(seedDirector('lobby')).mode).toBe('startLine');
    expect(activeIntent(seedDirector('countdown')).mode).toBe('establishing');
  });
});

describe('transients and preemption', () => {
  it('punches in on an overtake and releases back to the base', () => {
    const base = reduceCue(initialDirectorState, { type: 'phase-answer', tier: 'routine', round: 3, endsAt: null }, 0);
    const punched = reduceCue(base, overtake, 1000);
    expect(activeIntent(punched)).toMatchObject({
      mode: 'emphasis',
      style: 'cut',
      tier: 'overtake',
      emphasisIds: ['a', 'b', 'c'],
    });

    const during = tickDirector(punched, 1000 + OVERTAKE_HOLD_MS - 1);
    expect(activeIntent(during).mode).toBe('emphasis');

    const after = tickDirector(punched, 1000 + OVERTAKE_HOLD_MS);
    expect(activeIntent(after)).toEqual(activeIntent(base));
  });

  it('emphasises both players on a lead change', () => {
    const state = reduceCue(initialDirectorState, {
      type: 'lead-changed', tier: 'overtake', playerId: 'new', previousLeaderId: 'old',
    }, 0);
    expect(activeIntent(state).emphasisIds).toEqual(['new', 'old']);
  });

  it('lets a higher tier preempt a live transient', () => {
    const punched = reduceCue(initialDirectorState, overtake, 0);
    const escalated = reduceCue(punched, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 100);
    expect(activeIntent(escalated).tier).toBe('finalQuestion');
  });

  it('does not let an equal-or-lower tier cut a live transient short', () => {
    const escalated = reduceCue(initialDirectorState, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0);
    const attempted = reduceCue(escalated, overtake, 100);
    expect(activeIntent(attempted).tier).toBe('finalQuestion');
    expect(attempted.transient!.expiresAt).toBe(FINAL_QUESTION_HOLD_MS);
  });

  it('accepts a new transient once the previous one has expired', () => {
    const escalated = reduceCue(initialDirectorState, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0);
    const later = reduceCue(escalated, overtake, FINAL_QUESTION_HOLD_MS + 1);
    expect(activeIntent(later).tier).toBe('overtake');
  });

  it('a base cue does not clear a live transient', () => {
    const punched = reduceCue(initialDirectorState, overtake, 0);
    const next = reduceCue(punched, { type: 'phase-answer', tier: 'routine', round: 3, endsAt: null }, 100);
    expect(activeIntent(next).mode).toBe('emphasis');
    expect(activeIntent(tickDirector(next, OVERTAKE_HOLD_MS)).mode).toBe('pack');
  });
});

describe('escalation', () => {
  it('is zero for an ordinary question', () => {
    expect(reduceCue(initialDirectorState, read(3, false), 0).escalation).toBe(0);
  });

  it('rises for the final question and pushes in slowly', () => {
    const state = reduceCue(initialDirectorState, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0);
    expect(state.escalation).toBe(1);
    expect(activeIntent(state)).toMatchObject({ mode: 'pack', style: 'drift' });
  });

  it('resets when a non-final question is read', () => {
    const escalated = reduceCue(initialDirectorState, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0);
    expect(reduceCue(escalated, read(1, false), 5000).escalation).toBe(0);
  });
});

describe('ignored cues', () => {
  it('leaves the state untouched for cues later phases own', () => {
    const base = reduceCue(initialDirectorState, read(3, false), 0);
    const ignored: Cue[] = [
      { type: 'streak-tier', tier: 'streakMilestone', playerId: 'a', streak: 5 },
      { type: 'streak-broken', tier: 'routine', playerId: 'a' },
      { type: 'answer-locked', tier: 'routine', choiceIndex: 2 },
      { type: 'player-advanced', tier: 'routine', playerId: 'a', from: 1, to: 2 },
      { type: 'player-joined', tier: 'routine', playerId: 'a', nickname: 'A', avatar: 'duck', color: '#fff' },
      { type: 'podium', tier: 'victory', top: [] },
    ];
    for (const cue of ignored) expect(reduceCue(base, cue, 500)).toBe(base);
  });
});

describe('phase-results', () => {
  it('cuts to the podium', () => {
    const state = reduceCue(initialDirectorState, { type: 'phase-results', tier: 'routine' }, 0);
    expect(activeIntent(state).mode).toBe('podium');
    expect(activeIntent(state).style).toBe('cut');
  });

  it('HOLDS escalation rather than resetting it', () => {
    // escalation is still 1 from the final question, and a world dimmed to
    // neon at peak is exactly the grade a spotlight wants.
    const escalated = reduceCue(
      initialDirectorState, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0,
    );
    expect(escalated.escalation).toBe(1);

    const results = reduceCue(escalated, { type: 'phase-results', tier: 'routine' }, 5000);
    expect(results.escalation).toBe(1);
  });

  it('drops a live transient so a leftover shot cannot fight the cut', () => {
    const withTransient = reduceCue(
      initialDirectorState,
      { type: 'overtake', tier: 'overtake', playerId: 'p1', passed: ['p2'] },
      0,
    );
    expect(withTransient.transient).not.toBeNull();

    const results = reduceCue(withTransient, { type: 'phase-results', tier: 'routine' }, 10);
    expect(results.transient).toBeNull();
    expect(activeIntent(results).mode).toBe('podium');
  });
});

describe('the stage shot book', () => {
  const stage = (phase: Parameters<typeof seedDirector>[0]) => seedDirector(phase, 'stage');

  it('frames READ and ANSWER wider than the player view does', () => {
    expect(activeIntent(stage('read')).mode).toBe('packWide');
    expect(activeIntent(stage('answer')).mode).toBe('packWide');
    expect(activeIntent(seedDirector('read', 'player')).mode).toBe('pack');
  });

  it('takes a room shot at the ceremony instead of the tight podium', () => {
    expect(activeIntent(stage('results')).mode).toBe('podiumRoom');
    expect(activeIntent(seedDirector('results', 'player')).mode).toBe('podium');
  });

  it('pushes in slowly on the final question rather than holding the pack', () => {
    const state = reduceCue(
      stage('read'), { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0,
    );
    const shot = activeIntent(state);
    expect(shot.mode).toBe('packTight');
    expect(shot.style).toBe('push');

    const player = reduceCue(
      seedDirector('read', 'player'),
      { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0,
    );
    expect(activeIntent(player).style).toBe('drift');
  });

  it('holds a transient longer on stage — a room needs longer than a thumb', () => {
    expect(SHOT_BOOKS.stage.overtakeHoldMs).toBe(STAGE_DRAMA_HOLD_MS);
    expect(SHOT_BOOKS.stage.overtakeHoldMs).toBeGreaterThan(SHOT_BOOKS.player.overtakeHoldMs);
  });

  it('finishes the push-in before the final-question transient expires', () => {
    // Otherwise the escalation reads as a cut that already happened.
    expect(SHOT_BOOKS.stage.finalQuestionHoldMs).toBeGreaterThan(DURATION.push);
  });

  it('defaults to player direction, so existing state is unchanged', () => {
    expect(initialDirectorState.role).toBe('player');
  });
});

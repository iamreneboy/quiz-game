import { describe, expect, it } from 'vitest';
import { BED_STEMS, driveGain, stingFor, urgencyGain } from '@/lib/audio/design';
import { SOUNDS } from '@/lib/audio/manifest';
import type { Cue } from '@/lib/presentation/cues';

describe('stem tables', () => {
  it('names only sounds that exist and are loops', () => {
    for (const stems of Object.values(BED_STEMS)) {
      for (const id of stems) {
        expect(SOUNDS[id]).toBeDefined();
        expect(SOUNDS[id].loop).toBe(true);
      }
    }
  });
});

describe('gain curves', () => {
  it('drive opens from silence and is fully in before the end of the ramp', () => {
    expect(driveGain(0)).toBe(0);
    expect(driveGain(0.3)).toBeGreaterThan(0);
    expect(driveGain(0.3)).toBeLessThan(1);
    expect(driveGain(0.6)).toBe(1);
  });

  it('urgency stays silent through the first half and arrives late', () => {
    expect(urgencyGain(0)).toBe(0);
    expect(urgencyGain(0.4)).toBe(0);
    expect(urgencyGain(0.7)).toBeGreaterThan(0);
    expect(urgencyGain(1)).toBe(1);
  });

  it('urgency never leads drive', () => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      expect(urgencyGain(t)).toBeLessThanOrEqual(driveGain(t) + 1e-9);
    }
  });
});

describe('stingFor', () => {
  it('is silent for the cues that must never make a sound', () => {
    const advanced: Cue = { type: 'player-advanced', tier: 'routine', playerId: 'a', from: 0, to: 1 };
    const broken: Cue = { type: 'streak-broken', tier: 'routine', playerId: 'a' };
    expect(stingFor(advanced)).toBeNull();
    expect(stingFor(broken)).toBeNull();
  });

  it('is silent when the local player did not answer', () => {
    const cue: Cue = {
      type: 'answer-resolved', tier: 'routine',
      answered: false, correct: false, choiceIndex: null, correctIndex: 2,
    };
    expect(stingFor(cue)).toBeNull();
  });

  it('picks the streak sting by milestone', () => {
    const streak = (n: 3 | 5 | 8): Cue => ({ type: 'streak-tier', tier: 'streakMilestone', playerId: 'a', streak: n });
    expect(stingFor(streak(3))).toBe('streak-3');
    expect(stingFor(streak(5))).toBe('streak-5');
    expect(stingFor(streak(8))).toBe('streak-8');
  });

  it('only ever names sounds that exist', () => {
    const samples: Cue[] = [
      { type: 'phase-countdown', tier: 'routine', endsAt: null },
      { type: 'phase-read', tier: 'routine', round: 1, category: null, questionTier: null, isFinal: false },
      { type: 'phase-answer', tier: 'routine', round: 1, endsAt: null },
      { type: 'phase-reveal', tier: 'routine', round: 1, correctIndex: 0, counts: [], fastest: null },
      { type: 'answer-locked', tier: 'routine', choiceIndex: 0 },
      { type: 'answer-resolved', tier: 'routine', answered: true, correct: true, choiceIndex: 0, correctIndex: 0 },
      { type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b'] },
      { type: 'lead-changed', tier: 'overtake', playerId: 'a', previousLeaderId: 'b' },
      { type: 'final-question', tier: 'finalQuestion', round: 3 },
      { type: 'podium', tier: 'victory', top: [] },
      { type: 'player-joined', tier: 'routine', playerId: 'a', nickname: 'A', avatar: 'duck', color: '#fff' },
    ];
    for (const cue of samples) {
      const id = stingFor(cue);
      expect(id, cue.type).not.toBeNull();
      expect(SOUNDS[id!]).toBeDefined();
    }
  });
});

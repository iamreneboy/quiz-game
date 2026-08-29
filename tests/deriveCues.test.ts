import { describe, it, expect } from 'vitest';
import { CELEBRATION_TIERS, resolveTier } from '@/lib/presentation/celebration';
import {
  deriveCues,
  initialDerivationState,
  type CueSource,
  type DerivationState,
} from '@/lib/presentation/deriveCues';
import type { Cue } from '@/lib/presentation/cues';
import type { Phase, Standing } from '@/lib/types';

const A = 'player-a';
const B = 'player-b';
const C = 'player-c';

function player(id: string) {
  return { id, nickname: id.toUpperCase(), avatar: 'duck', color: '#f59e0b' };
}

function standing(id: string, correct: number, speed = 0, streak = 0): Standing {
  return {
    player_id: id,
    nickname: id.toUpperCase(),
    avatar: 'duck',
    color: '#f59e0b',
    correct,
    speed_points: speed,
    longest_streak: streak,
    current_streak: streak,
  };
}

function source(over: Partial<CueSource> & { phase?: Phase; round?: number } = {}): CueSource {
  const { phase = 'lobby', round = 0, ...rest } = over;
  return {
    room: { phase, round, total_rounds: 3, ends_at: null, status: 'playing' },
    players: [player(A), player(B)],
    question: null,
    reveal: null,
    standings: null,
    myAnswer: null,
    ...rest,
  };
}

/** Feed a recorded sequence of snapshots through the deriver, one step at a time. */
function run(steps: CueSource[]): { batches: Cue[][]; state: DerivationState } {
  let state = initialDerivationState;
  const batches: Cue[][] = [];
  for (let i = 0; i < steps.length; i++) {
    const result = deriveCues(i === 0 ? steps[0] : steps[i - 1], steps[i], state);
    state = result.nextState;
    batches.push(result.cues);
  }
  return { batches, state };
}

const types = (cues: Cue[]) => cues.map(c => c.type);

describe('seeding', () => {
  it('emits only the current phase beat on the first snapshot', () => {
    const { batches } = run([source({ phase: 'countdown', round: 1 })]);
    expect(types(batches[0])).toEqual(['phase-countdown']);
  });

  it('emits nothing at all until a room exists', () => {
    const empty: CueSource = { ...source(), room: null };
    const { batches } = run([empty, empty]);
    expect(batches.flat()).toEqual([]);
  });

  it('seeding mid-game does not invent standings drama', () => {
    const mid = source({
      phase: 'reveal',
      round: 2,
      standings: [standing(A, 2), standing(B, 1)],
    });
    const { batches } = run([mid]);
    expect(types(batches[0])).toEqual(['phase-reveal', 'answer-resolved']);
  });
});

describe('phase beats', () => {
  it('walks lobby -> countdown -> read -> answer -> reveal -> track', () => {
    const { batches } = run([
      source(),
      source({ phase: 'countdown', round: 1 }),
      source({
        phase: 'read',
        round: 1,
        question: { category: 'fuel', tier: 2, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
      }),
      source({ phase: 'answer', round: 1 }),
      source({
        phase: 'reveal',
        round: 1,
        reveal: {
          correct_index: 2,
          fun_fact: null,
          counts: [1, 0, 1, 0],
          picks: [],
          fastest: { player_id: A, nickname: 'A', time_remaining_ms: 3200 },
          standings: [],
        },
        standings: [standing(A, 1), standing(B, 0)],
      }),
      source({ phase: 'track', round: 1, standings: [standing(A, 1), standing(B, 0)] }),
    ]);

    expect(batches.map(types)).toEqual([
      [],
      ['phase-countdown'],
      ['phase-read'],
      ['phase-answer'],
      ['phase-reveal', 'answer-resolved', 'player-advanced'],
      ['phase-track'],
    ]);
  });

  it('phase-read carries round, category, question tier and isFinal', () => {
    const { batches } = run([
      source({ phase: 'countdown', round: 1 }),
      source({
        phase: 'read',
        round: 1,
        question: { category: 'ai-tech', tier: 3, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
      }),
    ]);
    expect(batches[1][0]).toEqual({
      type: 'phase-read',
      tier: 'routine',
      round: 1,
      category: 'ai-tech',
      questionTier: 3,
      isFinal: false,
    });
  });

  it('the last round\'s read still carries isFinal, though final-question itself now fires on the run-up', () => {
    const { batches } = run([
      source({ phase: 'track', round: 2 }),
      source({
        phase: 'read',
        round: 3,
        question: { category: 'fuel', tier: 4, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
      }),
    ]);
    expect(types(batches[1])).toEqual(['phase-read']);
    expect(batches[1][0]).toMatchObject({ isFinal: true });
  });

  it('phase-reveal maps the reveal payload into cue shape', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1 }),
      source({
        phase: 'reveal',
        round: 1,
        reveal: {
          correct_index: 1,
          fun_fact: 'fact',
          counts: [0, 2, 0, 0],
          picks: [],
          fastest: { player_id: B, nickname: 'B', time_remaining_ms: 4100 },
          standings: [],
        },
        standings: [standing(A, 1), standing(B, 1)],
      }),
    ]);
    expect(batches[1][0]).toEqual({
      type: 'phase-reveal',
      tier: 'routine',
      round: 1,
      correctIndex: 1,
      counts: [0, 2, 0, 0],
      fastest: { playerId: B, nickname: 'B', timeRemainingMs: 4100 },
    });
  });

  it('results emits the results beat plus a victory-tier podium of the top three', () => {
    const finalStandings = [standing(A, 3), standing(B, 2), standing(C, 1), standing('d', 0)];
    const { batches } = run([
      source({ phase: 'track', round: 3, standings: finalStandings }),
      source({ phase: 'results', round: 3, standings: finalStandings }),
    ]);
    expect(types(batches[1])).toEqual(['phase-results', 'podium']);
    expect(batches[1][1]).toMatchObject({
      tier: 'victory',
      top: [
        { playerId: A, correct: 3 },
        { playerId: B, correct: 2 },
        { playerId: C, correct: 1 },
      ],
    });
  });
});

describe('standings drama', () => {
  const reveal = (round: number, standings: Standing[]) =>
    source({ phase: 'reveal', round, standings });
  const track = (round: number, standings: Standing[]) =>
    source({ phase: 'track', round, standings });

  it('reports advancement as from -> to segments', () => {
    const { batches } = run([
      track(1, [standing(A, 1), standing(B, 1)]),
      reveal(2, [standing(A, 2), standing(B, 1)]),
    ]);
    expect(batches[1]).toContainEqual({
      type: 'player-advanced',
      tier: 'routine',
      playerId: A,
      from: 1,
      to: 2,
    });
    expect(batches[1].filter(c => c.type === 'player-advanced')).toHaveLength(1);
  });

  it('does not re-derive drama on track or results (no double celebration)', () => {
    const after = [standing(A, 2), standing(B, 1)];
    const { batches } = run([
      track(1, [standing(A, 1), standing(B, 1)]),
      reveal(2, after),
      track(2, after),
      source({ phase: 'results', round: 2, standings: after }),
    ]);
    // Round 2 of 3 is the run-up beat, so final-question legitimately rides
    // alongside phase-track here — the assertion this test cares about is
    // that no standings drama (player-advanced etc.) repeats.
    expect(types(batches[2])).toEqual(['final-question', 'phase-track']);
    expect(types(batches[3])).toEqual(['phase-results', 'podium']);
  });

  it('emits overtake with the players that were passed', () => {
    const { batches } = run([
      reveal(1, [standing(A, 1), standing(B, 0), standing(C, 0)]),
      reveal(2, [standing(B, 1), standing(C, 1), standing(A, 1)]),
    ]);
    const overtakes = batches[1].filter(c => c.type === 'overtake');
    expect(overtakes).toContainEqual({ type: 'overtake', tier: 'overtake', playerId: B, passed: [A] });
    expect(overtakes).toContainEqual({ type: 'overtake', tier: 'overtake', playerId: C, passed: [A] });
    expect(overtakes).toHaveLength(2);
  });

  it('emits lead-changed when the top of the order changes', () => {
    const { batches } = run([
      reveal(1, [standing(A, 1), standing(B, 0)]),
      reveal(2, [standing(B, 1), standing(A, 1)]),
    ]);
    expect(batches[1]).toContainEqual({
      type: 'lead-changed',
      tier: 'overtake',
      playerId: B,
      previousLeaderId: A,
    });
  });

  it('never emits overtake or lead-changed on the first reveal of a game', () => {
    const { batches } = run([
      source({ phase: 'countdown', round: 1 }),
      reveal(1, [standing(A, 1), standing(B, 0)]),
    ]);
    expect(types(batches[1])).toEqual(['phase-reveal', 'answer-resolved', 'player-advanced']);
  });
});

describe('streak inference', () => {
  const reveal = (round: number, standings: Standing[]) =>
    source({ phase: 'reveal', round, standings });

  it('fires streak-tier at 3, 5 and 8 consecutive hits and nowhere else', () => {
    const steps = [source({ phase: 'countdown', round: 1 })];
    for (let round = 1; round <= 8; round++) {
      steps.push(reveal(round, [standing(A, round), standing(B, 0)]));
    }
    const { batches } = run(steps);
    const milestones = batches
      .flat()
      .filter(c => c.type === 'streak-tier')
      .map(c => (c.type === 'streak-tier' ? c.streak : null));
    expect(milestones).toEqual([3, 5, 8]);
  });

  it('breaks the streak when a player does not advance, and only announces breaks from 3+', () => {
    const { batches } = run([
      source({ phase: 'countdown', round: 1 }),
      reveal(1, [standing(A, 1), standing(B, 1)]),
      reveal(2, [standing(A, 2), standing(B, 1)]), // B misses at streak 1 -> silent
      reveal(3, [standing(A, 3), standing(B, 1)]),
      reveal(4, [standing(A, 3), standing(B, 2)]), // A misses at streak 3 -> announced
    ]);
    expect(batches[2].filter(c => c.type === 'streak-broken')).toEqual([]);
    expect(batches[3]).toContainEqual({ type: 'streak-tier', tier: 'streakMilestone', playerId: A, streak: 3 });
    expect(batches[4]).toContainEqual({ type: 'streak-broken', tier: 'routine', playerId: A });
  });

  it('restarts counting after a broken streak', () => {
    const steps = [
      source({ phase: 'countdown', round: 1 }),
      reveal(1, [standing(A, 1)]),
      reveal(2, [standing(A, 2)]),
      reveal(3, [standing(A, 2)]), // break at 2
      reveal(4, [standing(A, 3)]),
      reveal(5, [standing(A, 4)]),
      reveal(6, [standing(A, 5)]),
    ];
    const { batches } = run(steps);
    const milestones = batches.flat().filter(c => c.type === 'streak-tier');
    expect(milestones).toHaveLength(1);
    expect(milestones[0]).toMatchObject({ streak: 3 });
  });
});

describe('local and lobby cues', () => {
  it('emits answer-locked when this client locks its own submission', () => {
    const answering = source({ phase: 'answer', round: 1 });
    const { batches } = run([answering, { ...answering, myAnswer: 2 }]);
    expect(batches[1]).toEqual([{ type: 'answer-locked', tier: 'routine', choiceIndex: 2 }]);
  });

  it('emits player-joined for each new player and never repeats one', () => {
    const lobby = source();
    const joined: CueSource = { ...lobby, players: [...lobby.players, player(C)] };
    const { batches } = run([lobby, joined, joined]);
    expect(batches[1]).toEqual([
      { type: 'player-joined', tier: 'routine', playerId: C, nickname: 'PLAYER-C', avatar: 'duck', color: '#f59e0b' },
    ]);
    expect(batches[2]).toEqual([]);
  });
});

describe('a full recorded game', () => {
  it('produces the expected cue stream from lobby to podium', () => {
    const q = { category: 'fuel', tier: 1 as const, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] };
    const s1 = [standing(A, 1), standing(B, 0)];
    const s2 = [standing(B, 2), standing(A, 1)];
    const s3 = [standing(B, 3), standing(A, 2)];

    const { batches } = run([
      source(),
      { ...source(), players: [player(A), player(B), player(C)] },
      source({ phase: 'countdown', round: 1 }),
      source({ phase: 'read', round: 1, question: q }),
      source({ phase: 'answer', round: 1 }),
      source({ phase: 'reveal', round: 1, standings: s1 }),
      source({ phase: 'track', round: 1, standings: s1 }),
      source({ phase: 'read', round: 2, question: q, standings: s1 }),
      source({ phase: 'answer', round: 2, standings: s1 }),
      source({ phase: 'reveal', round: 2, standings: s2 }),
      source({ phase: 'track', round: 2, standings: s2 }),
      source({ phase: 'read', round: 3, question: q, standings: s2 }),
      source({ phase: 'answer', round: 3, standings: s2 }),
      source({ phase: 'reveal', round: 3, standings: s3 }),
      source({ phase: 'track', round: 3, standings: s3 }),
      source({ phase: 'results', round: 3, standings: s3 }),
    ]);

    expect(batches.map(types)).toEqual([
      [],
      ['player-joined'],
      ['phase-countdown'],
      ['phase-read'],
      ['phase-answer'],
      ['phase-reveal', 'answer-resolved', 'player-advanced'],
      ['phase-track'],
      ['phase-read'],
      ['phase-answer'],
      ['phase-reveal', 'answer-resolved', 'player-advanced', 'overtake', 'lead-changed'],
      ['final-question', 'phase-track'],
      ['phase-read'],
      ['phase-answer'],
      ['phase-reveal', 'answer-resolved', 'player-advanced', 'player-advanced'],
      ['phase-track'],
      ['phase-results', 'podium'],
    ]);
  });

  it('every emitted cue carries a valid celebration tier', () => {
    const { batches } = run([
      source({ phase: 'countdown', round: 1 }),
      source({ phase: 'reveal', round: 1, standings: [standing(A, 1), standing(B, 0)] }),
      source({ phase: 'reveal', round: 2, standings: [standing(B, 2), standing(A, 1)] }),
    ]);
    for (const cue of batches.flat()) {
      expect(CELEBRATION_TIERS).toContain(cue.tier);
    }
    expect(resolveTier(batches[2])).toBe('overtake');
  });
});

describe('final-question fires on the run-up beat', () => {
  const finalOf = (cues: Cue[]) => cues.filter(c => c.type === 'final-question');

  /** The chronological cue stream, not run()'s per-step batches. */
  const flatCues = (steps: CueSource[]): Cue[] => run(steps).batches.flat();

  it('announces the final question when the PENULTIMATE track begins', () => {
    const cues = flatCues([
      source({ phase: 'reveal', round: 2 }),
      source({ phase: 'track', round: 2 }),
    ]);
    expect(finalOf(cues)).toHaveLength(1);
    expect(finalOf(cues)[0]).toMatchObject({ tier: 'finalQuestion', round: 3 });
  });

  it('emits it BEFORE phase-track, so a listener that resolves on the track beat sees it', () => {
    const cues = flatCues([
      source({ phase: 'reveal', round: 2 }),
      source({ phase: 'track', round: 2 }),
    ]);
    const types = cues.map(c => c.type);
    expect(types.indexOf('final-question')).toBeLessThan(types.indexOf('phase-track'));
  });

  it('no longer fires at the final READ, so it cannot double-announce', () => {
    const cues = flatCues([
      source({ phase: 'track', round: 2 }),
      source({ phase: 'read', round: 3 }),
    ]);
    expect(finalOf(cues.filter((_, i) => i > 0))).toHaveLength(0);
  });

  it('fires exactly once across a whole game', () => {
    const cues = flatCues([
      source({ phase: 'reveal', round: 2 }),
      source({ phase: 'track', round: 2 }),
      source({ phase: 'read', round: 3 }),
      source({ phase: 'answer', round: 3 }),
      source({ phase: 'reveal', round: 3 }),
      source({ phase: 'track', round: 3 }),
    ]);
    expect(finalOf(cues)).toHaveLength(1);
  });

  it('falls back to the countdown when the game is a single round', () => {
    const one = (phase: Phase, round: number) => ({
      ...source({ phase, round }),
      room: { phase, round, total_rounds: 1, ends_at: null, status: 'playing' as const },
    });
    const cues = flatCues([one('lobby', 0), one('countdown', 1)]);
    expect(finalOf(cues)).toHaveLength(1);
  });

  it('seeds escalation for a client that reloads inside the final round', () => {
    const { cues } = deriveCues(
      source({ phase: 'answer', round: 3 }),
      source({ phase: 'answer', round: 3 }),
      initialDerivationState, // unseeded: this is a fresh client
    );
    expect(cues.filter(c => c.type === 'final-question')).toHaveLength(1);
  });
});

describe('answer-resolved', () => {
  const revealSource = (myAnswer: number | null, correctIndex: number) =>
    source({
      phase: 'reveal',
      round: 1,
      myAnswer,
      reveal: {
        correct_index: correctIndex,
        fun_fact: null,
        counts: [1, 0, 1, 0],
        picks: [],
        fastest: null,
        standings: [],
      },
      standings: [standing(A, 1), standing(B, 0)],
    });

  it('reports a correct local answer', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1, myAnswer: 2 }),
      revealSource(2, 2),
    ]);
    const cue = batches[1].find(c => c.type === 'answer-resolved');
    expect(cue).toMatchObject({
      type: 'answer-resolved',
      tier: 'routine',
      answered: true,
      correct: true,
      choiceIndex: 2,
      correctIndex: 2,
    });
  });

  it('reports a wrong local answer', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1, myAnswer: 0 }),
      revealSource(0, 3),
    ]);
    expect(batches[1].find(c => c.type === 'answer-resolved')).toMatchObject({
      answered: true,
      correct: false,
      choiceIndex: 0,
      correctIndex: 3,
    });
  });

  it('reports answered:false when the clock ran out', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1 }),
      revealSource(null, 3),
    ]);
    expect(batches[1].find(c => c.type === 'answer-resolved')).toMatchObject({
      answered: false,
      correct: false,
      choiceIndex: null,
    });
  });

  it('rides immediately behind phase-reveal and nowhere else', () => {
    const { batches } = run([
      source({ phase: 'countdown', round: 1 }),
      source({ phase: 'read', round: 1 }),
      source({ phase: 'answer', round: 1 }),
      // null here, not a locked-in choice: this test is about cue ORDERING,
      // and a non-null myAnswer arriving on the same snapshot as the phase
      // change would also trip the pre-existing answer-locked cue (myAnswer
      // null -> non-null), which is exercised elsewhere, not here.
      revealSource(null, 1),
      source({ phase: 'track', round: 1, standings: [standing(A, 1), standing(B, 0)] }),
    ]);
    expect(batches.map(types)).toEqual([
      ['phase-countdown'],
      ['phase-read'],
      ['phase-answer'],
      ['phase-reveal', 'answer-resolved', 'player-advanced'],
      ['phase-track'],
    ]);
  });
});

describe('pause and resume', () => {
  it('announces a pause when the status changes, with no beat change', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1 }),
      source({ phase: 'answer', round: 1, room: { phase: 'answer', round: 1, total_rounds: 3, ends_at: null, status: 'paused' } }),
    ]);
    expect(types(batches[1])).toEqual(['game-paused']);
  });

  it('announces a resume and still replays no beat', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1, room: { phase: 'answer', round: 1, total_rounds: 3, ends_at: null, status: 'paused' } }),
      source({ phase: 'answer', round: 1 }),
    ]);
    expect(types(batches[1])).toEqual(['game-resumed']);
  });

  it('seeds a client that loads straight into a paused room', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1, room: { phase: 'answer', round: 1, total_rounds: 3, ends_at: null, status: 'paused' } }),
    ]);
    expect(types(batches[0])).toContain('game-paused');
    // The beat cue still leads, so the bed is right before the duck lands.
    expect(types(batches[0])[0]).toBe('phase-answer');
  });

  it('does not re-announce a pause that has not changed', () => {
    const pausedSource = source({
      phase: 'answer', round: 1,
      room: { phase: 'answer', round: 1, total_rounds: 3, ends_at: null, status: 'paused' },
    });
    const { batches } = run([pausedSource, pausedSource, pausedSource]);
    expect(types(batches[1])).toEqual([]);
    expect(types(batches[2])).toEqual([]);
  });
});

describe('a skipped round', () => {
  it('re-fires the beat when total_rounds shrinks under an unchanged phase and round', () => {
    const { batches } = run([
      source({ phase: 'read', round: 1 }),
      source({
        phase: 'read', round: 1,
        room: { phase: 'read', round: 1, total_rounds: 2, ends_at: null, status: 'playing' },
      }),
    ]);
    expect(types(batches[1])).toEqual(['phase-read']);
  });

  it('resumes and re-fires the beat in one step when a paused room is skipped', () => {
    const { batches } = run([
      source({
        phase: 'answer', round: 1,
        room: { phase: 'answer', round: 1, total_rounds: 3, ends_at: null, status: 'paused' },
      }),
      source({
        phase: 'read', round: 1,
        room: { phase: 'read', round: 1, total_rounds: 2, ends_at: null, status: 'playing' },
      }),
    ]);
    // The resume leads so the bed un-ducks before the new question's slam.
    expect(types(batches[1])).toEqual(['game-resumed', 'phase-read']);
  });
});

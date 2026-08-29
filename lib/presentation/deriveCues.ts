import type { Phase, QuestionPublic, RevealPayload, RoomStatus, Standing } from '@/lib/types';
import type { Cue } from './cues';

/**
 * Pure derivation of presentation cues from consecutive game-store snapshots.
 *
 * Game-state code is untouched (spec decision 5): this reads structural subsets
 * of the store and returns an updated accumulator the caller threads through.
 */

/** Structural subset of RoomInfo this deriver needs. */
export interface CueRoom {
  phase: Phase;
  round: number;
  total_rounds: number;
  ends_at: string | null;
  status: RoomStatus;
}

/** Structural subset of PlayerPublic this deriver needs. */
export interface CuePlayer {
  id: string;
  nickname: string;
  avatar: string;
  color: string;
}

/** Structural subset of the game store; `GameState` is assignable to it. */
export interface CueSource {
  room: CueRoom | null;
  players: CuePlayer[];
  question: QuestionPublic | null;
  reveal: RevealPayload | null;
  standings: Standing[] | null;
  myAnswer: number | null;
}

/**
 * Accumulator carried between calls. Presentation-local only — it is never
 * persisted and never sent over the wire.
 */
export interface DerivationState {
  seeded: boolean;
  phase: Phase | null;
  round: number;
  /** Last seen room status; a change in it is what announces a pause. */
  status: RoomStatus | null;
  /** Last seen track length. `skip_question` shortens it mid-game (ADR-0038). */
  totalRounds: number;
  playerIds: string[];
  /** Standings order as of the last processed reveal. */
  order: string[];
  /** Correct-answer count per player as of the last processed reveal. */
  correct: Record<string, number>;
  /** Inferred consecutive-hit count per player. */
  streaks: Record<string, number>;
}

export const initialDerivationState: DerivationState = {
  seeded: false,
  phase: null,
  round: 0,
  status: null,
  totalRounds: 0,
  playerIds: [],
  order: [],
  correct: {},
  streaks: {},
};

export interface DeriveResult {
  cues: Cue[];
  nextState: DerivationState;
}

export function deriveCues(
  prev: CueSource,
  next: CueSource,
  state: DerivationState,
): DeriveResult {
  const room = next.room;
  if (!room) return { cues: [], nextState: state };

  // First snapshot with a room: establish the baseline, announce the current
  // beat (so a reload lands in the right visual state), derive nothing else.
  if (!state.seeded) {
    const seedCues = phaseCues(room, next);
    // A client that reloads or joins mid-final-round never saw the run-up, so
    // the escalation has to be seeded here or the world never goes neon.
    const inFinalRound =
      room.total_rounds > 0 &&
      room.round === room.total_rounds &&
      room.phase !== 'lobby' &&
      room.phase !== 'results';
    const alreadyAnnounced = seedCues.some(c => c.type === 'final-question');
    if (inFinalRound && !alreadyAnnounced) {
      seedCues.unshift({ type: 'final-question', tier: 'finalQuestion', round: room.round });
    }

    // A client reloading into a paused room never saw the pause. Pushed AFTER
    // the beat cues so the bed is established before the duck lands on it.
    if (room.status === 'paused') {
      seedCues.push({ type: 'game-paused', tier: 'routine' });
    }

    return {
      cues: seedCues,
      nextState: {
        seeded: true,
        phase: room.phase,
        round: room.round,
        status: room.status,
        totalRounds: room.total_rounds,
        playerIds: next.players.map(p => p.id),
        order: (next.standings ?? []).map(s => s.player_id),
        correct: correctMap(next.standings),
        streaks: {},
      },
    };
  }

  const cues: Cue[] = [];
  let s = state;

  const nextIds = next.players.map(p => p.id);
  for (const p of next.players) {
    if (!s.playerIds.includes(p.id)) {
      cues.push({
        type: 'player-joined',
        tier: 'routine',
        playerId: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        color: p.color,
      });
    }
  }
  if (nextIds.join(',') !== s.playerIds.join(',')) s = { ...s, playerIds: nextIds };

  if (prev.myAnswer === null && next.myAnswer !== null) {
    cues.push({ type: 'answer-locked', tier: 'routine', choiceIndex: next.myAnswer });
  }

  // A pause changes neither phase nor round, so it has to be derived from
  // status on its own. Emitted BEFORE the beat cues below, because a skip on a
  // paused room resumes and re-reads in one event, and the bed must un-duck
  // before the new question's slam lands on it.
  if (room.status !== s.status) {
    if (room.status === 'paused') {
      cues.push({ type: 'game-paused', tier: 'routine' });
    } else if (s.status === 'paused' && room.status === 'playing') {
      cues.push({ type: 'game-resumed', tier: 'routine' });
    }
    s = { ...s, status: room.status };
  }

  // `total_rounds` is in this comparison because skip_question reuses the round
  // NUMBER (ADR-0038): a skip during READ changes neither phase nor round, and
  // without this term the new question would arrive with no beat cue at all —
  // the world would never re-hold its anchors and the callout would never
  // clear. It is the only thing that changes total_rounds mid-game.
  const phaseChanged =
    room.phase !== s.phase || room.round !== s.round || room.total_rounds !== s.totalRounds;
  if (phaseChanged) {
    cues.push(...phaseCues(room, next));

    if (room.phase === 'reveal') {
      const drama = standingsCues(s, next.standings);
      cues.push(...drama.cues);
      s = drama.nextState;
    }

    s = { ...s, phase: room.phase, round: room.round, totalRounds: room.total_rounds };
  }

  return { cues, nextState: s };
}

function phaseCues(room: CueRoom, next: CueSource): Cue[] {
  const isFinal = room.total_rounds > 0 && room.round === room.total_rounds;

  switch (room.phase) {
    case 'countdown': {
      const cues: Cue[] = [];
      // A one-round game has no preceding TRACK to escalate on.
      if (room.total_rounds === 1 && room.round === 1) {
        cues.push({ type: 'final-question', tier: 'finalQuestion', round: room.round });
      }
      cues.push({ type: 'phase-countdown', tier: 'routine', endsAt: room.ends_at });
      return cues;
    }

    case 'read':
      // `final-question` no longer rides with the final READ: it fires one beat
      // earlier, on the run-up (spec decision 7), so the final question's own
      // announcement never spends its reading time.
      return [
        {
          type: 'phase-read',
          tier: 'routine',
          round: room.round,
          category: next.question?.category ?? null,
          questionTier: next.question?.tier ?? null,
          isFinal,
        },
      ];

    case 'answer':
      return [{ type: 'phase-answer', tier: 'routine', round: room.round, endsAt: room.ends_at }];

    case 'reveal': {
      const fastest = next.reveal?.fastest;
      const correctIndex = next.reveal?.correct_index ?? null;
      const answered = next.myAnswer !== null;
      return [
        {
          type: 'phase-reveal',
          tier: 'routine',
          round: room.round,
          correctIndex,
          counts: next.reveal?.counts ?? [],
          fastest: fastest
            ? {
                playerId: fastest.player_id,
                nickname: fastest.nickname,
                timeRemainingMs: fastest.time_remaining_ms,
              }
            : null,
        },
        // Rides immediately behind the reveal so a consumer processing in order
        // already has the room's outcome before the personal verdict. Derived,
        // never inferred — see ADR-0022.
        {
          type: 'answer-resolved',
          tier: 'routine',
          answered,
          correct: answered && correctIndex !== null && next.myAnswer === correctIndex,
          choiceIndex: next.myAnswer,
          correctIndex,
        },
      ];
    }

    case 'track': {
      const cues: Cue[] = [];
      // The run-up: entering the PENULTIMATE round's track beat. Emitted
      // BEFORE phase-track, because lib/staging/runtime.ts resolves the beat's
      // headline on phase-track and must already hold this cue.
      if (room.total_rounds > 1 && room.round === room.total_rounds - 1) {
        cues.push({ type: 'final-question', tier: 'finalQuestion', round: room.round + 1 });
      }
      cues.push({ type: 'phase-track', tier: 'routine', round: room.round });
      return cues;
    }

    case 'results':
      return [
        { type: 'phase-results', tier: 'routine' },
        {
          type: 'podium',
          tier: 'victory',
          top: (next.standings ?? []).slice(0, 3).map(s => ({
            playerId: s.player_id,
            nickname: s.nickname,
            avatar: s.avatar,
            color: s.color,
            correct: s.correct,
          })),
        },
      ];

    default:
      return []; // lobby has no beat of its own
  }
}

function standingsCues(state: DerivationState, standings: Standing[] | null): DeriveResult {
  if (!standings || standings.length === 0) return { cues: [], nextState: state };

  const cues: Cue[] = [];
  const order = standings.map(s => s.player_id);
  const correct: Record<string, number> = {};
  const streaks: Record<string, number> = {};

  for (const s of standings) {
    // A missing baseline means "not seen yet" — at game start everyone is on 0.
    const before = state.correct[s.player_id] ?? 0;
    correct[s.player_id] = s.correct;

    if (s.correct > before) {
      cues.push({
        type: 'player-advanced',
        tier: 'routine',
        playerId: s.player_id,
        from: before,
        to: s.correct,
      });

      const streak = (state.streaks[s.player_id] ?? 0) + 1;
      streaks[s.player_id] = streak;
      if (streak === 3 || streak === 5 || streak === 8) {
        cues.push({ type: 'streak-tier', tier: 'streakMilestone', playerId: s.player_id, streak });
      }
    } else {
      // Only announce a break that had reached a visible VFX tier.
      if ((state.streaks[s.player_id] ?? 0) >= 3) {
        cues.push({ type: 'streak-broken', tier: 'routine', playerId: s.player_id });
      }
      streaks[s.player_id] = 0;
    }
  }

  // Relative-order changes need a previous order, so nothing fires on the
  // first reveal of a game.
  if (state.order.length > 0) {
    const prevRank = rankMap(state.order);
    const nextRank = rankMap(order);

    for (const id of order) {
      const before = prevRank.get(id);
      const after = nextRank.get(id)!;
      if (before === undefined || after >= before) continue;

      const passed = order.filter(other => {
        const otherBefore = prevRank.get(other);
        const otherAfter = nextRank.get(other)!;
        return otherBefore !== undefined && otherBefore < before && otherAfter > after;
      });
      if (passed.length > 0) {
        cues.push({ type: 'overtake', tier: 'overtake', playerId: id, passed });
      }
    }

    const previousLeaderId = state.order[0];
    const leaderId = order[0];
    if (previousLeaderId && leaderId && previousLeaderId !== leaderId) {
      cues.push({ type: 'lead-changed', tier: 'overtake', playerId: leaderId, previousLeaderId });
    }
  }

  return { cues, nextState: { ...state, order, correct, streaks } };
}

function correctMap(standings: Standing[] | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of standings ?? []) map[s.player_id] = s.correct;
  return map;
}

function rankMap(order: string[]): Map<string, number> {
  return new Map(order.map((id, index) => [id, index]));
}

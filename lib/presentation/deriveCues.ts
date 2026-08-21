import type { Phase, QuestionPublic, RevealPayload, Standing } from '@/lib/types';
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
    return {
      cues: phaseCues(room, next),
      nextState: {
        seeded: true,
        phase: room.phase,
        round: room.round,
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

  const phaseChanged = room.phase !== s.phase || room.round !== s.round;
  if (phaseChanged) {
    cues.push(...phaseCues(room, next));

    // Standings only genuinely change at the reveal; track and results repeat
    // them, so deriving drama anywhere else would double-celebrate.
    if (room.phase === 'reveal') {
      const drama = standingsCues(s, next.standings);
      cues.push(...drama.cues);
      s = drama.nextState;
    }

    s = { ...s, phase: room.phase, round: room.round };
  }

  return { cues, nextState: s };
}

function phaseCues(room: CueRoom, next: CueSource): Cue[] {
  const isFinal = room.total_rounds > 0 && room.round === room.total_rounds;

  switch (room.phase) {
    case 'countdown':
      return [{ type: 'phase-countdown', tier: 'routine', endsAt: room.ends_at }];

    case 'read': {
      const cues: Cue[] = [
        {
          type: 'phase-read',
          tier: 'routine',
          round: room.round,
          category: next.question?.category ?? null,
          questionTier: next.question?.tier ?? null,
          isFinal,
        },
      ];
      if (isFinal) cues.push({ type: 'final-question', tier: 'finalQuestion', round: room.round });
      return cues;
    }

    case 'answer':
      return [{ type: 'phase-answer', tier: 'routine', round: room.round, endsAt: room.ends_at }];

    case 'reveal': {
      const fastest = next.reveal?.fastest;
      return [
        {
          type: 'phase-reveal',
          tier: 'routine',
          round: room.round,
          correctIndex: next.reveal?.correct_index ?? null,
          counts: next.reveal?.counts ?? [],
          fastest: fastest
            ? {
                playerId: fastest.player_id,
                nickname: fastest.nickname,
                timeRemainingMs: fastest.time_remaining_ms,
              }
            : null,
        },
      ];
    }

    case 'track':
      return [{ type: 'phase-track', tier: 'routine', round: room.round }];

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

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/lib/store';
import type { PhaseEvent, RoomState } from '@/lib/types';

const baseRoom = {
  id: 'r1', code: 'ABCDE', status: 'playing' as const, phase: 'read' as const,
  round: 1, total_rounds: 3, timer_seconds: 10, ends_at: null, server_now: new Date().toISOString(),
};

beforeEach(() => {
  useGameStore.setState({ room: null, players: [], question: null, reveal: null, standings: null, myAnswer: null });
});

describe('applyPhaseEvent', () => {
  it('read event sets question and clears previous reveal + myAnswer', () => {
    useGameStore.setState({ room: { ...baseRoom }, myAnswer: 2, reveal: {} as never });
    const evt: PhaseEvent = {
      phase: 'read', round: 2, ends_at: null, server_now: new Date().toISOString(),
      payload: { category: 'fuel', tier: 1, prompt: 'Q?', options: ['a','b','c','d'] },
    };
    useGameStore.getState().applyPhaseEvent(evt);
    const s = useGameStore.getState();
    expect(s.room?.phase).toBe('read');
    expect(s.room?.round).toBe(2);
    expect(s.question?.prompt).toBe('Q?');
    expect(s.reveal).toBeNull();
    expect(s.myAnswer).toBeNull();
  });

  it('reveal event stores payload and standings', () => {
    useGameStore.setState({ room: { ...baseRoom, phase: 'answer' } });
    const evt: PhaseEvent = {
      phase: 'reveal', round: 1, ends_at: null, server_now: new Date().toISOString(),
      payload: { correct_index: 0, fun_fact: null, counts: [1,0,0,0], picks: [], fastest: null, standings: [] },
    };
    useGameStore.getState().applyPhaseEvent(evt);
    expect(useGameStore.getState().reveal?.correct_index).toBe(0);
    expect(useGameStore.getState().standings).toEqual([]);
  });

  it('results event marks room finished', () => {
    useGameStore.setState({ room: { ...baseRoom, phase: 'track' } });
    const evt: PhaseEvent = {
      phase: 'results', round: 3, ends_at: null, server_now: new Date().toISOString(), payload: [],
    };
    useGameStore.getState().applyPhaseEvent(evt);
    expect(useGameStore.getState().room?.status).toBe('finished');
  });

  it('lobby event clears the whole previous race', () => {
    useGameStore.setState({
      room: { ...baseRoom, status: 'finished', phase: 'results' },
      question: { category: 'fuel', tier: 1, prompt: 'Q?', options: ['a','b','c','d'] },
      reveal: {} as never,
      standings: [{ player_id: 'p1' }] as never,
      myAnswer: 1,
    });
    const evt: PhaseEvent = {
      phase: 'lobby', round: 0, ends_at: null, server_now: new Date().toISOString(),
      status: 'lobby', total_rounds: 5, sudden_death: null, payload: null,
    };
    useGameStore.getState().applyPhaseEvent(evt);
    const s = useGameStore.getState();
    expect(s.room?.status).toBe('lobby');
    expect(s.room?.total_rounds).toBe(5);
    expect(s.room?.sudden_death).toBeNull();
    expect(s.question).toBeNull();
    expect(s.reveal).toBeNull();
    expect(s.standings).toBeNull();
    expect(s.myAnswer).toBeNull();
  });
});

describe('applyState / addPlayer', () => {
  it('snapshot replaces everything; addPlayer dedupes by id', () => {
    const snap: RoomState = {
      room: { ...baseRoom, status: 'lobby', phase: 'lobby' },
      players: [{ id: 'p1', nickname: 'A', avatar: 'duck', color: '#fff', is_host: true, is_playing: true }],
      question: null, reveal: null, standings: null,
    };
    useGameStore.getState().applyState(snap);
    useGameStore.getState().addPlayer({ id: 'p1', nickname: 'A', avatar: 'duck', color: '#fff', is_host: true, is_playing: true });
    useGameStore.getState().addPlayer({ id: 'p2', nickname: 'B', avatar: 'cat', color: '#000', is_host: false, is_playing: true });
    expect(useGameStore.getState().players.map(p => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('the P3b payload fields', () => {
  it('carries picks and current_streak through a reveal phase event', () => {
    useGameStore.setState({
      room: {
        id: 'r', code: 'ABCDE', status: 'playing', phase: 'answer', round: 1,
        total_rounds: 3, timer_seconds: 20, ends_at: null,
        server_now: new Date().toISOString(),
      },
    });

    useGameStore.getState().applyPhaseEvent({
      phase: 'reveal', round: 1, ends_at: null, server_now: new Date().toISOString(),
      payload: {
        correct_index: 2, fun_fact: null, counts: [1, 0, 2, 0], fastest: null,
        picks: [
          { player_id: 'p1', choice_index: 2 },
          { player_id: 'p2', choice_index: 0 },
          { player_id: 'p3', choice_index: 2 },
        ],
        standings: [
          {
            player_id: 'p1', nickname: 'A', avatar: 'duck', color: '#f59e0b',
            correct: 1, speed_points: 10, longest_streak: 1, current_streak: 1,
          },
        ],
      },
    });

    const { reveal, standings } = useGameStore.getState();
    expect(reveal!.picks).toHaveLength(3);
    expect(reveal!.picks[0]).toEqual({ player_id: 'p1', choice_index: 2 });
    expect(standings![0].current_streak).toBe(1);
  });

  it('does not throw on a pre-migration payload that omits both fields', () => {
    useGameStore.setState({
      room: {
        id: 'r', code: 'ABCDE', status: 'playing', phase: 'answer', round: 1,
        total_rounds: 3, timer_seconds: 20, ends_at: null,
        server_now: new Date().toISOString(),
      },
    });

    expect(() => {
      useGameStore.getState().applyPhaseEvent({
        phase: 'reveal', round: 1, ends_at: null, server_now: new Date().toISOString(),
        // Deliberately shaped like the OLD server: no picks, no current_streak.
        payload: {
          correct_index: 0, fun_fact: null, counts: [1, 0, 0, 0],
          fastest: null, standings: [],
        } as unknown as import('@/lib/types').RevealPayload,
      });
    }).not.toThrow();

    expect(useGameStore.getState().reveal!.picks).toBeUndefined();
  });
});

describe('the P0 pause fields', () => {
  it('takes status from the event rather than inferring it from the phase', () => {
    useGameStore.setState({ room: { ...baseRoom, phase: 'answer' } });

    useGameStore.getState().applyPhaseEvent({
      phase: 'answer', round: 1, ends_at: null, server_now: new Date().toISOString(),
      status: 'paused', paused_remaining_ms: 7400, total_rounds: 3,
      payload: { category: 'fuel', tier: 1, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
    });

    const room = useGameStore.getState().room!;
    expect(room.status).toBe('paused');
    expect(room.paused_remaining_ms).toBe(7400);
    expect(room.phase).toBe('answer');
  });

  it('clears the remainder and returns to playing on resume', () => {
    useGameStore.setState({
      room: { ...baseRoom, phase: 'answer', status: 'paused', paused_remaining_ms: 7400 },
    });

    useGameStore.getState().applyPhaseEvent({
      phase: 'answer', round: 1, ends_at: '2026-08-29T10:00:07.400Z',
      server_now: '2026-08-29T10:00:00.000Z',
      status: 'playing', paused_remaining_ms: null, total_rounds: 3,
      payload: { category: 'fuel', tier: 1, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
    });

    const room = useGameStore.getState().room!;
    expect(room.status).toBe('playing');
    expect(room.paused_remaining_ms).toBeNull();
    expect(room.ends_at).toBe('2026-08-29T10:00:07.400Z');
  });

  it('carries a shortened track through a skip', () => {
    useGameStore.setState({ room: { ...baseRoom, phase: 'answer', round: 1, total_rounds: 3 } });

    useGameStore.getState().applyPhaseEvent({
      phase: 'read', round: 1, ends_at: null, server_now: new Date().toISOString(),
      status: 'playing', paused_remaining_ms: null, total_rounds: 2,
      payload: { category: 'fuel', tier: 1, prompt: 'Next?', options: ['a', 'b', 'c', 'd'] },
    });

    expect(useGameStore.getState().room!.total_rounds).toBe(2);
  });

  it('falls back to the old inference on a pre-0005 payload', () => {
    useGameStore.setState({ room: { ...baseRoom, phase: 'track', total_rounds: 3 } });

    // Deliberately shaped like the OLD server: no status, no remainder, no
    // total_rounds.
    useGameStore.getState().applyPhaseEvent({
      phase: 'results', round: 3, ends_at: null,
      server_now: new Date().toISOString(), payload: [],
    });

    const room = useGameStore.getState().room!;
    expect(room.status).toBe('finished');
    expect(room.total_rounds).toBe(3);
  });
});

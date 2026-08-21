import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearCueBus, emit, on, startCueBridge } from '@/lib/presentation/cueBus';
import type { Cue } from '@/lib/presentation/cues';
import { useGameStore } from '@/lib/store';
import type { PhaseEvent, RoomState } from '@/lib/types';

const baseRoom = {
  id: 'r1',
  code: 'ABCDE',
  status: 'lobby' as const,
  phase: 'lobby' as const,
  round: 0,
  total_rounds: 2,
  timer_seconds: 10,
  ends_at: null,
  server_now: new Date().toISOString(),
};

const lobbyState: RoomState = {
  room: baseRoom,
  players: [
    { id: 'p1', nickname: 'A', avatar: 'duck', color: '#f59e0b', is_host: true, is_playing: true },
    { id: 'p2', nickname: 'B', avatar: 'cat', color: '#38bdf8', is_host: false, is_playing: true },
  ],
  question: null,
  reveal: null,
  standings: null,
};

beforeEach(() => {
  clearCueBus();
  useGameStore.setState({
    room: null, players: [], question: null, reveal: null, standings: null, myAnswer: null,
  });
});

afterEach(() => clearCueBus());

describe('cue bus', () => {
  it('delivers a cue only to handlers of that type', () => {
    const read = vi.fn();
    const track = vi.fn();
    on('phase-read', read);
    on('phase-track', track);

    const cue: Cue = {
      type: 'phase-read', tier: 'routine', round: 1, category: 'fuel', questionTier: 1, isFinal: false,
    };
    emit(cue);

    expect(read).toHaveBeenCalledWith(cue);
    expect(track).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe', () => {
    const handler = vi.fn();
    const off = on('phase-track', handler);
    emit({ type: 'phase-track', tier: 'routine', round: 1 });
    off();
    emit({ type: 'phase-track', tier: 'routine', round: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing during an emit does not skip the other handlers', () => {
    const calls: string[] = [];
    const offFirst = on('phase-track', () => {
      calls.push('first');
      offFirst();
    });
    on('phase-track', () => calls.push('second'));

    emit({ type: 'phase-track', tier: 'routine', round: 1 });
    expect(calls).toEqual(['first', 'second']);
  });
});

describe('startCueBridge', () => {
  it('emits cues derived from game-store transitions', () => {
    const seen: string[] = [];
    on('player-joined', () => seen.push('player-joined'));
    on('phase-countdown', () => seen.push('phase-countdown'));
    on('phase-reveal', () => seen.push('phase-reveal'));
    on('player-advanced', () => seen.push('player-advanced'));

    const stop = startCueBridge();

    useGameStore.getState().applyState(lobbyState);
    useGameStore.getState().addPlayer({
      id: 'p3', nickname: 'C', avatar: 'plant', color: '#34d399', is_host: false, is_playing: true,
    });

    const countdown: PhaseEvent = {
      phase: 'countdown', round: 1, ends_at: null, server_now: new Date().toISOString(), payload: null,
    };
    useGameStore.getState().applyPhaseEvent(countdown);

    const reveal: PhaseEvent = {
      phase: 'reveal', round: 1, ends_at: null, server_now: new Date().toISOString(),
      payload: {
        correct_index: 0, fun_fact: null, counts: [1, 0, 0, 0], fastest: null,
        standings: [
          { player_id: 'p1', nickname: 'A', avatar: 'duck', color: '#f59e0b', correct: 1, speed_points: 10, longest_streak: 1 },
          { player_id: 'p2', nickname: 'B', avatar: 'cat', color: '#38bdf8', correct: 0, speed_points: 0, longest_streak: 0 },
        ],
      },
    };
    useGameStore.getState().applyPhaseEvent(reveal);

    stop();
    expect(seen).toEqual(['player-joined', 'phase-countdown', 'phase-reveal', 'player-advanced']);
  });

  it('stops emitting after teardown', () => {
    const handler = vi.fn();
    on('phase-countdown', handler);
    const stop = startCueBridge();
    useGameStore.getState().applyState(lobbyState);
    stop();

    useGameStore.getState().applyPhaseEvent({
      phase: 'countdown', round: 1, ends_at: null, server_now: new Date().toISOString(), payload: null,
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

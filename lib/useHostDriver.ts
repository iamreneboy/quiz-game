'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { loadSession } from './session';
import { msUntil } from './serverTime';
import type { PhaseEvent } from './types';

/** Every host command is a `(room_id, host_key) -> phase_event` RPC. */
type HostRpc = 'pause_game' | 'resume_game' | 'skip_question' | 'end_game';

export interface HostDriver {
  /** Presentation only. The RPCs check `host_key` themselves — that is the permission. */
  isHost: boolean;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(): Promise<void>;
  end(): Promise<void>;
  /** PRD §5.4.6 — the same room, reset. `timerSeconds` omitted keeps the current one. */
  rematch(timerSeconds?: number): Promise<void>;
  error: string | null;
}

/**
 * The host's command layer (M3 P0).
 *
 * Was a pure timer through M2; it now also carries the four deliberate
 * commands behind the control strip. Every one of them returns a phase event,
 * so they all leave through the same broadcast-and-apply path the scheduler
 * uses — there is exactly one way game state reaches the room.
 */
export function useHostDriver(code: string, channel: RealtimeChannel | null): HostDriver {
  const room = useGameStore(s => s.room);
  const applyPhaseEvent = useGameStore(s => s.applyPhaseEvent);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a second advance_phase call landing while the first is
  // still in flight: an unrelated room update can rerun the scheduling
  // effect and re-arm a near-zero-delay timer before the pending RPC
  // resolves, and the redundant call can 400 if the first already moved the
  // room past a phase with no further transition (e.g. into 'results').
  const advancing = useRef(false);
  // The same guard for DELIBERATE commands, and one more job: an in-flight
  // command also blocks the scheduler, so a pause the host has already asked
  // for cannot be overtaken by a timer firing on the deadline it is about to
  // freeze.
  const commanding = useRef(false);
  const session = typeof window !== 'undefined' ? loadSession(code) : null;
  const hostKey = session?.hostKey ?? null;

  const broadcastAndApply = useCallback((evt: PhaseEvent) => {
    channel?.send({ type: 'broadcast', event: 'phase', payload: evt });
    applyPhaseEvent(evt);
  }, [channel, applyPhaseEvent]);

  const advance = useCallback(async () => {
    if (!hostKey || !room || advancing.current || commanding.current) return;
    advancing.current = true;
    try {
      const { data, error: err } = await supabase.rpc('advance_phase', {
        p_room_id: room.id, p_host_key: hostKey,
      });
      if (err) { setError(err.message); return; }
      broadcastAndApply(data as PhaseEvent);
    } finally {
      advancing.current = false;
    }
  }, [hostKey, room, broadcastAndApply]);

  /**
   * One shape for all four commands. A command arriving while another is in
   * flight is dropped rather than queued: the strip's buttons are the only
   * caller, and a double-tap must be inert, not a second command.
   */
  const command = useCallback(async (rpc: HostRpc) => {
    if (!hostKey || !room || commanding.current) return;
    commanding.current = true;
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc(rpc, {
        p_room_id: room.id, p_host_key: hostKey,
      });
      if (err) { setError(err.message); return; }
      broadcastAndApply(data as PhaseEvent);
    } finally {
      commanding.current = false;
    }
  }, [hostKey, room, broadcastAndApply]);

  // Schedule the next transition whenever the phase changes.
  //
  // A paused room falls out here on `status !== 'playing'` and the cleanup
  // below clears the pending timer — which is the whole reason 'paused' went
  // into the status enum rather than into a side flag. On resume the room
  // arrives with a fresh `ends_at`, this effect reruns, and the timer is armed
  // for exactly the frozen remainder. No beat replays; nothing double-advances.
  useEffect(() => {
    if (!hostKey || !channel || !room) return;
    if (room.status !== 'playing' || room.phase === 'results') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(advance, msUntil(room.ends_at));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [hostKey, channel, room?.phase, room?.round, room?.ends_at, room?.status, advance, room]);

  const start = useCallback(async () => {
    if (!hostKey || !room) return;
    const { data, error: err } = await supabase.rpc('start_game', {
      p_room_id: room.id, p_host_key: hostKey,
    });
    if (err) { setError(err.message); return; }
    broadcastAndApply(data as PhaseEvent);
  }, [hostKey, room, broadcastAndApply]);

  /**
   * Not routed through `command` above: that helper exists precisely because
   * the four control-strip RPCs share one `(room_id, host_key)` signature, and
   * `rematch` takes a config. It shares the `commanding` ref, which is the part
   * that matters — a double-tap must be inert, and a rematch landing while a
   * pause is in flight would reset a room the other call is still writing.
   *
   * All five arguments are named, nulls included, so PostgREST resolves the
   * overload unambiguously rather than by argument count.
   */
  const rematch = useCallback(async (timerSeconds?: number) => {
    if (!hostKey || !room || commanding.current) return;
    commanding.current = true;
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('rematch', {
        p_room_id: room.id,
        p_host_key: hostKey,
        p_timer_seconds: timerSeconds ?? null,
        p_categories: null,
        p_tier_counts: null,
      });
      if (err) { setError(err.message); return; }
      broadcastAndApply(data as PhaseEvent);
    } finally {
      commanding.current = false;
    }
  }, [hostKey, room, broadcastAndApply]);

  const pause = useCallback(() => command('pause_game'), [command]);
  const resume = useCallback(() => command('resume_game'), [command]);
  const skip = useCallback(() => command('skip_question'), [command]);
  const end = useCallback(() => command('end_game'), [command]);

  return { isHost: hostKey !== null, start, pause, resume, skip, end, rematch, error };
}

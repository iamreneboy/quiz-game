'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { loadSession } from './session';
import { msUntil } from './serverTime';
import type { PhaseEvent } from './types';

export function useHostDriver(code: string, channel: RealtimeChannel | null): { start: () => Promise<void>; error: string | null } {
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
  const session = typeof window !== 'undefined' ? loadSession(code) : null;
  const hostKey = session?.hostKey ?? null;

  const broadcastAndApply = useCallback((evt: PhaseEvent) => {
    channel?.send({ type: 'broadcast', event: 'phase', payload: evt });
    applyPhaseEvent(evt);
  }, [channel, applyPhaseEvent]);

  const advance = useCallback(async () => {
    if (!hostKey || !room || advancing.current) return;
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

  // Schedule the next transition whenever the phase changes.
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

  return { start, error };
}

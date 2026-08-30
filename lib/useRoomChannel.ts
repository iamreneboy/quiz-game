'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { usePresence, PRESENCE_TICK_MS } from './usePresence';
import { loadSession, subscribeSession } from './session';
import type { ViewerRole } from './viewer';
import type { PhaseEvent, PlayerPublic, RoomState } from './types';

/**
 * The room's realtime channel: broadcasts in, presence both ways.
 *
 * `role` is explicit rather than inferred from a missing session (ADR-0031).
 * A stage view SUBSCRIBES to presence and never TRACKS on it — a TV is not a
 * racer, and a phantom entry in the map would be counted as a connected player
 * by everything downstream.
 */
export function useRoomChannel(code: string, role: ViewerRole): RealtimeChannel | null {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const applyState = useGameStore(s => s.applyState);
  const applyPhaseEvent = useGameStore(s => s.applyPhaseEvent);
  const addPlayer = useGameStore(s => s.addPlayer);
  const setRoomMissing = useGameStore(s => s.setRoomMissing);

  /**
   * The local player id, read as an external store so a fresh join re-arms the
   * tracking effect below without anyone calling a setter — the same reason
   * app/room/[code]/page.tsx reads the session this way.
   */
  const myId = useSyncExternalStore(
    subscribeSession,
    useCallback(() => (role === 'stage' ? null : loadSession(code)?.playerId ?? null), [code, role]),
    () => null,
  );

  useEffect(() => {
    const pendingEvents: PhaseEvent[] = [];
    let ready = false;

    const ch = supabase.channel(`room:${code.toUpperCase()}`);
    ch.on('broadcast', { event: 'phase' }, ({ payload }) => {
      const evt = payload as PhaseEvent;
      if (!ready) {
        pendingEvents.push(evt);
        return;
      }
      applyPhaseEvent(evt);
    });
    ch.on('broadcast', { event: 'player_joined' }, ({ payload }) => {
      addPlayer(payload as PlayerPublic);
    });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ playerId?: string }>();
      const ids = Object.values(state)
        .flat()
        .map(m => m.playerId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      usePresence.getState().sync(ids);
    });
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        const { data, error } = await supabase.rpc('get_room_state', { p_code: code });
        if (!error && data) applyState(data as RoomState);
        setRoomMissing(!!error);
        ready = true;
        for (const evt of pendingEvents.splice(0, pendingEvents.length)) {
          applyPhaseEvent(evt);
        }
        setChannel(ch);
      }
    });

    // One coarse clock for every chip. Cleared with the channel, so nothing
    // ticks after the route unmounts.
    const ticker = setInterval(() => usePresence.getState().tick(), PRESENCE_TICK_MS);

    return () => {
      clearInterval(ticker);
      usePresence.getState().reset();
      supabase.removeChannel(ch);
      setChannel(null);
    };
  }, [code, applyState, applyPhaseEvent, addPlayer, setRoomMissing]);

  /**
   * Announce ourselves — separately, because the id is not known at subscribe
   * time for a browser that is still sitting in JoinGate. `subscribeSession`
   * re-runs this the moment a join lands.
   */
  useEffect(() => {
    if (!channel || !myId) return;
    void channel.track({ playerId: myId });
    return () => { void channel.untrack(); };
  }, [channel, myId]);

  return channel;
}

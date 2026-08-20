'use client';
import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import type { PhaseEvent, PlayerPublic, RoomState } from './types';

export function useRoomChannel(code: string): RealtimeChannel | null {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const applyState = useGameStore(s => s.applyState);
  const applyPhaseEvent = useGameStore(s => s.applyPhaseEvent);
  const addPlayer = useGameStore(s => s.addPlayer);

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
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        const { data, error } = await supabase.rpc('get_room_state', { p_code: code });
        if (!error && data) applyState(data as RoomState);
        ready = true;
        for (const evt of pendingEvents.splice(0, pendingEvents.length)) {
          applyPhaseEvent(evt);
        }
        setChannel(ch);
      }
    });
    return () => {
      supabase.removeChannel(ch);
      setChannel(null);
    };
  }, [code, applyState, applyPhaseEvent, addPlayer]);

  return channel;
}

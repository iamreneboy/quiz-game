'use client';
import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import type { PhaseEvent, PlayerPublic, RoomState } from './types';

export function useRoomChannel(code: string): RealtimeChannel | null {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const applyState = useGameStore(s => s.applyState);
  const applyPhaseEvent = useGameStore(s => s.applyPhaseEvent);
  const addPlayer = useGameStore(s => s.addPlayer);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const ch = supabase.channel(`room:${code.toUpperCase()}`);
    ch.on('broadcast', { event: 'phase' }, ({ payload }) => {
      applyPhaseEvent(payload as PhaseEvent);
    });
    ch.on('broadcast', { event: 'player_joined' }, ({ payload }) => {
      addPlayer(payload as PlayerPublic);
    });
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        const { data, error } = await supabase.rpc('get_room_state', { p_code: code });
        if (!error && data) applyState(data as RoomState);
        setChannel(ch);
      }
    });
    return () => { supabase.removeChannel(ch); };
  }, [code, applyState, applyPhaseEvent, addPlayer]);

  return channel;
}

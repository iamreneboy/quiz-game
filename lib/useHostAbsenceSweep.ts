'use client';
import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { usePresence } from './usePresence';
import { PRESENCE_REPORT_MS, electSweeper } from './presence';
import type { PhaseEvent } from './types';

/**
 * The remaining players' watch on a vanished host (ADR-0051).
 *
 * Runs on every non-host player's device and does nothing on all but one of
 * them: `electSweeper` picks a single caller from the shared presence map, so a
 * ten-player room makes one call every three seconds, not ten.
 *
 * `sweep_host_absence` returns SQL null when it changed nothing, which is the
 * overwhelmingly common case. Only a non-null result is broadcast, so the wire
 * stays as quiet as it was before this hook existed.
 *
 * The result travels through the SAME broadcast-and-apply path every host
 * command uses (lib/useHostDriver.ts). That is deliberate: there must remain
 * exactly one way game state reaches the room, whoever put it on the wire.
 */
export function useHostAbsenceSweep(
  channel: RealtimeChannel | null,
  myPlayerId: string | null,
): void {
  const roomId = useGameStore(s => s.room?.id ?? null);
  const status = useGameStore(s => s.room?.status ?? null);
  const hostPlayerId = useGameStore(s => s.players.find(p => p.is_host)?.id ?? null);
  const iAmHost = useGameStore(s =>
    !!myPlayerId && s.players.find(p => p.id === myPlayerId)?.is_host === true,
  );

  useEffect(() => {
    if (!channel || !roomId || !myPlayerId || iAmHost) return;
    // A lobby has no clock to freeze and a finished room nothing left to stop.
    if (status !== 'playing' && status !== 'paused') return;

    let live = true;
    const sweep = async () => {
      if (!live) return;
      // Re-read presence each tick rather than closing over it, so the interval
      // keeps its cadence when somebody joins or leaves.
      const snap = usePresence.getState().snapshot;
      if (!electSweeper(snap, hostPlayerId, myPlayerId)) return;

      const { data, error } = await supabase.rpc('sweep_host_absence', { p_room_id: roomId });
      if (error || !data || !live) return;
      const evt = data as PhaseEvent;
      channel.send({ type: 'broadcast', event: 'phase', payload: evt });
      useGameStore.getState().applyPhaseEvent(evt);
    };

    const id = setInterval(() => void sweep(), PRESENCE_REPORT_MS);
    return () => { live = false; clearInterval(id); };
  }, [channel, roomId, status, hostPlayerId, myPlayerId, iAmHost]);
}

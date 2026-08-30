'use client';
import { useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { usePresence } from './usePresence';
import { PRESENCE_REPORT_MS } from './presence';

/**
 * The host's roster report (ADR-0049).
 *
 * The host already drives the state machine (PRD §9), so it is the one client
 * that both holds a presence map and is allowed to write authority. One call
 * every PRESENCE_REPORT_MS, whatever the player count.
 *
 * The present list is read through `getState()` rather than subscribed to, so a
 * player joining or leaving does NOT re-arm the interval — the loop keeps its
 * cadence and simply reports whatever is true when it next fires.
 *
 * Runs in the lobby as well as in play: a racer who closes their tab before the
 * start should show as gone on the starting grid too.
 */
export function useHostPresenceReporter(hostKey: string | null): void {
  const roomId = useGameStore(s => s.room?.id ?? null);
  const status = useGameStore(s => s.room?.status ?? null);

  useEffect(() => {
    if (!hostKey || !roomId) return;
    if (status !== 'lobby' && status !== 'playing' && status !== 'paused') return;

    let live = true;
    const report = async () => {
      if (!live) return;
      const { error } = await supabase.rpc('report_presence', {
        p_room_id: roomId,
        p_host_key: hostKey,
        p_present: usePresence.getState().snapshot.present,
      });
      // A failed heartbeat is not worth a message anywhere: the next one is
      // three seconds away, and the only consequence of a miss is one extra
      // absent_report against players who are demonstrably still here.
      if (error) console.warn('[presence] report failed', error.message);
    };

    void report();
    const id = setInterval(() => void report(), PRESENCE_REPORT_MS);
    return () => { live = false; clearInterval(id); };
  }, [hostKey, roomId, status]);
}

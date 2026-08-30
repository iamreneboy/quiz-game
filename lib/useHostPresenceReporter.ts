'use client';
import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { usePresence } from './usePresence';
import { PRESENCE_REPORT_MS } from './presence';
import { isHostAbsent } from './pause';
import type { PhaseEvent } from './types';

/**
 * The host's roster report (ADR-0049), and — since M3 P3b — the host's own way
 * back into a show that paused because it lost them.
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
export function useHostPresenceReporter(
  hostKey: string | null,
  channel: RealtimeChannel | null,
): void {
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
      if (error) {
        console.warn('[presence] report failed', error.message);
        return;
      }
      if (!live) return;

      /**
       * The host is back (PRD §9: "host reconnect resumes").
       *
       * THE ORDER IS THE WHOLE MECHANISM. The heartbeat above is what makes
       * `host_absent` false server-side; resuming before it would race the
       * sweep and could be re-paused a tick later. And the flag is read from
       * the store — i.e. from the last phase event or `get_room_state`, both of
       * which predate this heartbeat — so it still says what was true when the
       * host was gone.
       *
       * `isHostAbsent` is what keeps a DELIBERATE pause deliberate: a host who
       * pressed Pause and is sitting there watching has `host_absent` false and
       * is never resumed out from under themselves.
       */
      const room = useGameStore.getState().room;
      if (!isHostAbsent(room) || !room) return;
      const { data, error: resumeError } = await supabase.rpc('resume_game', {
        p_room_id: room.id, p_host_key: hostKey,
      });
      if (resumeError || !data || !live) return;
      const evt = data as PhaseEvent;
      channel?.send({ type: 'broadcast', event: 'phase', payload: evt });
      useGameStore.getState().applyPhaseEvent(evt);
    };

    void report();
    const id = setInterval(() => void report(), PRESENCE_REPORT_MS);
    return () => { live = false; clearInterval(id); };
  }, [hostKey, roomId, status, channel]);
}

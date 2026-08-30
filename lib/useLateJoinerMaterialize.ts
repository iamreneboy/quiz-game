'use client';
import { useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { loadSession } from './session';
import type { RoomState } from './types';

/**
 * The late joiner's own materialisation, fetched (M3 P3a).
 *
 * `advance_phase` flips `is_playing` to true at the next READ inside the drawn
 * track, and that is where PRD §4 says a late joiner starts racing. NOTHING ON
 * THE WIRE CARRIES IT: `phase_event` is phase, round, deadline and payload, and
 * this plan deliberately adds no key to it (roadmap §2 — the wire stays
 * semantic). The roster only ever reaches a client through `get_room_state` on
 * subscribe or a `player_joined` broadcast, so without this the spectator would
 * sit disabled for the rest of the race and only discover they were racing by
 * reloading.
 *
 * So the one client that needs to know asks. The guard is as narrow as the
 * question: only a player who is BOTH `joined_late` and not yet playing fetches
 * at all, and only once per READ — every other browser, and this one from the
 * moment it is materialised, never calls this.
 *
 * The reply is applied through `setPlayers`, not `applyState`: a roster refresh
 * must not be able to overwrite a phase event that landed while it was in
 * flight.
 */
export function useLateJoinerMaterialize(code: string): void {
  const phase = useGameStore(s => s.room?.phase ?? null);
  const round = useGameStore(s => s.room?.round ?? 0);
  const setPlayers = useGameStore(s => s.setPlayers);

  useEffect(() => {
    if (phase !== 'read') return;
    const myId = loadSession(code)?.playerId ?? null;
    if (!myId) return;
    const me = useGameStore.getState().players.find(p => p.id === myId);
    if (!me || me.is_playing || !me.joined_late) return;

    let live = true;
    void (async () => {
      const { data, error } = await supabase.rpc('get_room_state', { p_code: code });
      if (!live || error || !data) return;
      setPlayers((data as RoomState).players);
    })();
    return () => { live = false; };
  }, [code, phase, round, setPlayers]);
}

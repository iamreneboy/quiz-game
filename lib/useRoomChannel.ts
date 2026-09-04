'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { usePresence, PRESENCE_TICK_MS } from './usePresence';
import { loadSession, subscribeSession } from './session';
import { createRoomSync, isRoomMissingError } from './roomSync';
import type { ViewerRole } from './viewer';
import type { PhaseEvent, PlayerPublic, RoomState } from './types';

/**
 * How many times a snapshot fetch is attempted before the client gives up and
 * waits for the socket to rejoin, and how long it waits between tries.
 *
 * Nothing else retries: a single failed `get_room_state` used to leave the
 * client on "Connecting…" for the rest of the race, because the only other
 * thing that ever sets room state is a broadcast, and `applyPhaseEvent` no-ops
 * while `room` is null.
 */
const RESYNC_BACKOFF_MS: readonly number[] = [400, 1200];

/**
 * The room's realtime channel: broadcasts in, presence both ways.
 *
 * `role` is explicit rather than inferred from a missing session (ADR-0031).
 * A stage view SUBSCRIBES to presence and never TRACKS on it — a TV is not a
 * racer, and a phantom entry in the map would be counted as a connected player
 * by everything downstream.
 *
 * Every SUBSCRIBED — the first join and every rejoin the socket makes after a
 * reconnect — re-fetches the whole state, and `lib/roomSync.ts` orders that
 * fetch against the broadcasts racing it. See that file for why both halves are
 * needed; a reload landing on a phase boundary is the case they exist for.
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
    const sync = createRoomSync();
    // Everything below is scoped to THIS channel. A torn-down channel's fetch
    // can still be in flight — StrictMode's remount guarantees one on every
    // dev load — and it must not reach the store belonging to its replacement.
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    // A flag left true by a previous room would otherwise render this one as a
    // typo for as long as its first fetch takes.
    setRoomMissing(false);

    const ch = supabase.channel(`room:${code.toUpperCase()}`);
    ch.on('broadcast', { event: 'phase' }, ({ payload }) => {
      if (cancelled) return;
      const evt = payload as PhaseEvent;
      if (sync.receive(evt) === 'apply') applyPhaseEvent(evt);
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

    const replay = (events: PhaseEvent[]) => {
      for (const evt of events) applyPhaseEvent(evt);
    };

    const resync = async (attempt = 0): Promise<void> => {
      sync.beginResync();
      const { data, error } = await supabase.rpc('get_room_state', { p_code: code });
      if (cancelled) return;

      if (error || !data) {
        // Only a genuine "no such room" is a verdict. Everything else is the
        // network, and the held events are worth more than the failed fetch.
        const missing = isRoomMissingError(error);
        setRoomMissing(missing);
        replay(sync.abandonResync());
        if (!missing && attempt < RESYNC_BACKOFF_MS.length) {
          retry = setTimeout(() => { void resync(attempt + 1); }, RESYNC_BACKOFF_MS[attempt]);
        }
        return;
      }

      const snapshot = data as RoomState;
      const { apply, replay: held } = sync.settle(snapshot);
      // A snapshot cannot regress a room that is not there yet. Events applied
      // while `room` was null were no-ops (lib/store.ts), so after a failed
      // first fetch the watermark can sit ahead of a store that still knows
      // nothing — and rejecting the retry's snapshot would strand it there.
      if (apply || useGameStore.getState().room === null) applyState(snapshot);
      replay(held);
      setRoomMissing(false);
    };

    ch.subscribe(status => {
      if (status !== 'SUBSCRIBED' || cancelled) return;
      // Announced before the state lands: the channel being usable and the
      // state being known are two different facts, and the join announcement
      // (ADR-0048) waits on the first one only.
      setChannel(ch);
      void resync();
    });

    // One coarse clock for every chip. Cleared with the channel, so nothing
    // ticks after the route unmounts.
    const ticker = setInterval(() => usePresence.getState().tick(), PRESENCE_TICK_MS);

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
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

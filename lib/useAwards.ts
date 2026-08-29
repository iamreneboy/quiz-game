'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { describeAwards } from './awards';
import type { Award } from './types';

/**
 * The awards, fetched once (ADR-0045).
 *
 * A fetch rather than a wire field, and a hook rather than a game-store slice,
 * for the same reason: the awards are a property of a FINISHED race, read by
 * whichever surfaces happen to be looking at it. Putting them in the store
 * would mean a fifth thing `applyPhaseEvent` has to keep true across a pause, a
 * skip and a rematch; here the whole lifetime is this hook's.
 *
 * One code path serves both the live ceremony and a reload: `enabled` flips
 * true when the room reports finished, whether that came from the phase event
 * or from `get_room_state` at subscribe.
 *
 * The result is STAMPED WITH THE ROOM IT BELONGS TO and compared at render
 * rather than cleared by an effect. A rematch flips `enabled` back to false
 * while a finished race's awards are still held, and the obvious reset —
 * `setAwards(null)` in the effect body — is a synchronous setState inside an
 * effect, which this project's lint forbids outright (`react-hooks/
 * set-state-in-effect`) and which would cost a cascading render for a value
 * that can simply be read as stale.
 *
 * The `live` flag is the standard unmount guard — a ceremony that a rematch
 * ends mid-flight must not set state on a component that is already gone.
 */
export function useAwards(roomId: string | null, enabled: boolean): Award[] | null {
  const key = roomId && enabled ? roomId : null;
  const [fetched, setFetched] = useState<{ key: string; awards: Award[] } | null>(null);

  useEffect(() => {
    if (!key) return;
    let live = true;
    void (async () => {
      const { data, error } = await supabase.rpc('awards', { p_room_id: key });
      if (!live) return;
      // An error is not worth a message on the ceremony screen: the awards are
      // a coda, and a race with no awards renders nothing at all anyway.
      setFetched({ key, awards: error ? [] : describeAwards(data) });
    })();
    return () => { live = false; };
  }, [key]);

  return fetched && fetched.key === key ? fetched.awards : null;
}

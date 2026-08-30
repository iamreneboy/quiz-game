'use client';
import { create } from 'zustand';
import {
  EMPTY_PRESENCE,
  applyPresence,
  absentReportsOf,
  connectionState,
  samePresence,
  type ConnectionState,
  type PresenceSnapshot,
} from './presence';
import { useGameStore } from './store';
import { serverNow } from './serverTime';

/**
 * The live presence map, kept out of the game store on purpose.
 *
 * `lib/store.ts` holds GAME state — things Postgres is the authority for, that
 * arrive as a phase event or a room state. Presence is neither: it is a
 * property of the websocket, it never crosses an RPC, and it must not become a
 * fifth thing `applyPhaseEvent` has to keep true across a pause, a skip and a
 * rematch (the same argument ADR-0045 made for the awards).
 */
interface PresenceState {
  snapshot: PresenceSnapshot;
  /** Coarse server-aligned clock; only the chips read it. */
  nowMs: number;
  sync(presentNow: string[]): void;
  tick(): void;
  reset(): void;
}

/**
 * How often the clock advances. Far coarser than a second because the ONLY
 * thing it decides is which side of the 60-second grace a departure sits on,
 * and every tick re-renders one chip per player.
 */
export const PRESENCE_TICK_MS = 5_000;

export const usePresence = create<PresenceState>((set, get) => ({
  snapshot: EMPTY_PRESENCE,
  nowMs: 0,

  sync(presentNow) {
    const next = applyPresence(get().snapshot, presentNow, serverNow());
    if (samePresence(next, get().snapshot)) return;
    set({ snapshot: next, nowMs: serverNow() });
  },

  tick() {
    set({ nowMs: serverNow() });
  },

  reset() {
    set({ snapshot: EMPTY_PRESENCE, nowMs: 0 });
  },
}));

/** One player's connection state, live. */
export function useConnectionState(playerId: string): ConnectionState {
  const snapshot = usePresence(s => s.snapshot);
  const nowMs = usePresence(s => s.nowMs);
  const absentReports = useGameStore(s =>
    absentReportsOf(s.players.find(p => p.id === playerId)),
  );
  return connectionState(snapshot, playerId, absentReports, nowMs || serverNow());
}

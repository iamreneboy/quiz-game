import type { PlayerPublic } from './types';

/**
 * Who is here (M3 P3a).
 *
 * Pure — no React, no store, no Supabase — because three consumers need the
 * same answer: the lobby roster, the track readout, and (in P3b) the election
 * that decides which client sweeps a vanished host.
 *
 * TWO SOURCES, ONE ANSWER. Supabase Presence is instant and local: this client
 * knows the moment a websocket goes away, but it knows nothing about the time
 * before it subscribed. `players.absent_reports` is the server's much coarser
 * view — up to `PRESENCE_REPORT_MS` stale, but it survives a reload, which is
 * exactly what a client that has just landed mid-race needs. So presence
 * answers for anyone this client has actually observed, and the server's count
 * answers for everybody else.
 *
 * The asymmetry with the SQL side is deliberate. Postgres cannot see a socket,
 * so `player_dropped()` counts missed host reports; this module can, so it uses
 * a wall clock against `RECONNECT_GRACE_MS`. The two are the same 60 seconds by
 * construction — `DROP_REPORTS * PRESENCE_REPORT_MS` — and tests/presence.test.ts
 * plus scripts/smoke.mjs both pin that identity so the hand-mirror cannot drift.
 */

/** How often the host reports the roster. Mirrors SQL `presence_report_ms()`. */
export const PRESENCE_REPORT_MS = 3_000;

/** Consecutive missed reports that mean "gone". Mirrors SQL `drop_reports()`. */
export const DROP_REPORTS = 20;

/** PRD §9's 60-second grace, expressed once. */
export const RECONNECT_GRACE_MS = DROP_REPORTS * PRESENCE_REPORT_MS;

export type ConnectionState = 'connected' | 'reconnecting' | 'dropped';

export interface PresenceSnapshot {
  /** Player ids tracked on the channel right now, sorted. */
  present: string[];
  /** ms-epoch each previously-present player stopped being present. */
  leftAt: Record<string, number>;
}

export const EMPTY_PRESENCE: PresenceSnapshot = { present: [], leftAt: {} };

/** Fold one presence sync into the snapshot. */
export function applyPresence(
  prev: PresenceSnapshot,
  presentNow: string[],
  nowMs: number,
): PresenceSnapshot {
  const present = [...new Set(presentNow)].sort();
  const isHere = new Set(present);

  const leftAt: Record<string, number> = {};
  // Departures already recorded keep their ORIGINAL timestamp: the grace runs
  // from when they left, not from the last sync that noticed they were gone.
  for (const [id, at] of Object.entries(prev.leftAt)) {
    if (!isHere.has(id)) leftAt[id] = at;
  }
  for (const id of prev.present) {
    if (!isHere.has(id) && leftAt[id] === undefined) leftAt[id] = nowMs;
  }

  return { present, leftAt };
}

/** Cheap equality so the store can skip a publish that changes nothing. */
export function samePresence(a: PresenceSnapshot, b: PresenceSnapshot): boolean {
  if (a.present.length !== b.present.length) return false;
  for (let i = 0; i < a.present.length; i++) {
    if (a.present[i] !== b.present[i]) return false;
  }
  const aKeys = Object.keys(a.leftAt);
  if (aKeys.length !== Object.keys(b.leftAt).length) return false;
  return aKeys.every(k => a.leftAt[k] === b.leftAt[k]);
}

export function connectionState(
  snap: PresenceSnapshot,
  playerId: string,
  absentReports: number,
  nowMs: number,
): ConnectionState {
  if (snap.present.includes(playerId)) return 'connected';

  const leftAt = snap.leftAt[playerId];
  if (leftAt !== undefined) {
    return nowMs - leftAt < RECONNECT_GRACE_MS ? 'reconnecting' : 'dropped';
  }

  // Never observed on this channel. That is the ordinary case for a client
  // that has only just subscribed, so it must NOT read as a drop — fall back
  // to what the host last told the server.
  if (absentReports >= DROP_REPORTS) return 'dropped';
  if (absentReports > 0) return 'reconnecting';
  return 'connected';
}

/** `absent_reports` folded to a number; absent against a pre-0009 database. */
export function absentReportsOf(player: PlayerPublic | undefined): number {
  return player?.absent_reports ?? 0;
}

/**
 * Which single client calls `sweep_host_absence` (ADR-0051).
 *
 * Deterministic and identical on every client, because it is computed from the
 * one thing every client already holds a byte-identical copy of: the presence
 * map. No negotiation, no leader-election protocol, no extra channel traffic.
 *
 * THE ELECTION IS POLITENESS, NOT SAFETY. The server guard is what makes the
 * sweep correct — it acts only on a stale `host_seen_at`, and it returns null
 * when it changes nothing. If two clients disagree for a tick and both call,
 * the second gets null and broadcasts nothing. All this saves is N calls where
 * one will do.
 *
 * Never the host: a returning host resumes through its own report loop, and a
 * host that is present has nothing to sweep. Never a stage view: it holds no
 * player id, so `myPlayerId` is null there by construction (ADR-0031).
 */
export function electSweeper(
  snap: PresenceSnapshot,
  hostPlayerId: string | null,
  myPlayerId: string | null,
): boolean {
  if (!myPlayerId) return false;
  const candidates = snap.present.filter(id => id !== hostPlayerId);
  return candidates.length > 0 && candidates[0] === myPlayerId;
}

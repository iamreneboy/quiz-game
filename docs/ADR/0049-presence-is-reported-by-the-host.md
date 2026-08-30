# ADR-0049: Presence is reported by the host, and "dropped" is a count of missed reports

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P3a — Presence & the open door

## Context

Supabase Presence tells every *client* on a room channel who else is connected,
instantly and for free. It tells Postgres nothing at all — presence lives in
the Realtime service, and this project has no server-side runtime that could
subscribe to it (PRD §9: no game server; every mutation is a SECURITY DEFINER
RPC).

Two rules need the database to know who is gone. Reclaim (PRD §9) must hand a
dropped racer's `player_key` back on a nickname match, and must refuse to do so
while that racer is demonstrably still connected. M3 P3b's host-absence sweep
must be able to say the host has stopped checking in.

Rejected alternatives:

- **A per-player heartbeat RPC.** Twenty players at one call every three seconds
  is pure write traffic for a fact one client — the host — already holds
  complete.
- **A Supabase scheduled function.** Minute granularity is far too coarse for
  "pauses within the presence timeout", and it cannot see a websocket either.
- **A wall-clock `last_seen` timestamp per player.** It is only meaningful while
  something is refreshing it; when the host vanishes nothing is, so every player
  in the room would silently age into "dropped" while sitting there connected.

## Decision

The host's client reports the roster it can see: one
`report_presence(room_id, host_key, present uuid[])` call every three seconds,
whatever the player count, host-key-checked inside the RPC like every other host
command (roadmap decision 2). The host already drives the state machine
(PRD §9), so it is the one client that both holds a presence map and is allowed
to write authority.

"Dropped" is `players.absent_reports >= 20` — **twenty consecutive reports that
did not list this player**, not an age. Twenty reports at three seconds is
PRD §9's sixty-second grace, and `lib/presence.ts` hand-mirrors both numbers
(`DROP_REPORTS`, `PRESENCE_REPORT_MS`); `tests/presence.test.ts` and
`scripts/smoke.mjs` each pin the product at 60000.

A dropped racer's `is_playing` is **not** flipped. `standings()` filters on that
column, so demoting them would erase their score and their avatar from the track
— the exact opposite of PRD §9's "60s grace with score frozen". Dropped is a
presentation state plus the gate that opens reclaim.

The client and the server answer the same question differently, on purpose.
`lib/presence.ts` uses presence for anyone it has actually observed and falls
back to `absent_reports` for everyone else — that fallback is what lets a
browser that has just landed mid-race render an honest roster.

## Consequences

- **A count cannot advance while the host is gone.** Nothing reports, so nobody
  is falsely declared dropped by the passage of time. That property is the whole
  reason this is a count and not a clock, and P3b depends on it.
- **A test can advance a minute in a loop.** `scripts/smoke.mjs` calls
  `report_presence` twenty times; no timed test was needed for reclaim.
- **The server's view lags by up to three seconds**, and is wrong for the
  duration of a host's own reconnect. Both are acceptable because the only
  consumers are a 60-second gate and a 9-second one.
- **If the host never reports, nobody is ever dropped and nobody can reclaim.**
  A room whose host has vanished is P3b's problem, not this mechanism's.
- **`rooms.host_seen_at` is written here and read nowhere in P3a.** It exists in
  this migration because `report_presence` is its only writer; M3 P3b is its
  entire consumer. It travels on `get_room_state`'s room object — not on
  `phase_event`, which is untouched — so P3b's sweeper election has a route to
  it without a new wire opening.
- Anything that adds a new player-facing "is this racer here?" surface must go
  through `connectionState` in `lib/presence.ts`, never read
  `absent_reports` directly — the presence half of the answer is the half that
  is live.

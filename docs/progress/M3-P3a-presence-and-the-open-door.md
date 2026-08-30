# M3 P3a — Presence & the open door

- **Status:** Complete. All local gates green; `0009_presence.sql` applied to the cloud project and verified there by direct query.
- **Completed:** 2026-08-30
- **Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md` (§3 "P3 — Continuity", the first three bullets)
- **Plan:** `docs/superpowers/plans/2026-08-30-m3-p3a-presence-and-the-open-door.md`
- **Branch:** `m3-p3a-presence-and-the-open-door` — isolated git worktree at `../quiz-game-m3-p3a`
- **Method:** `superpowers:executing-plans`, inline (no subagents, at the user's standing instruction), TDD per task, verified against the real local Supabase stack and in a headed browser

## Scope (from the plan)

Make the room survive its people coming and going. Three of roadmap §3's five
bullets: presence on the room channel with a readable "reconnecting" state, a
player drop whose score is frozen and whose nickname can be reclaimed, and a
late joiner who spectates and then races marked late. **Host drop and room
lifecycle are P3b's**, and P3b reads a column and an RPC this phase created.

## What was built

**Task 1 — the presence report.** `supabase/migrations/0009_presence.sql` adds
`players.absent_reports`, `players.joined_late` and `rooms.host_seen_at`, the
two hand-mirrored thresholds `presence_report_ms()` (3000) and `drop_reports()`
(20), `player_dropped(p players)`, and `report_presence(room_id, host_key,
present uuid[])`. The host reports the roster it can see once every three
seconds, whatever the player count; a player it omits has `absent_reports`
incremented, a player it lists has it reset outright. "Dropped" is twenty
consecutive omissions, not an age — nothing can advance it while the *host* is
the one who vanished, and a test can advance a minute in a loop (ADR-0049).
`player_public` gains both new keys, so they reach every surface on the one
projection every roster is already built from.

**Task 2 — `lib/presence.ts`.** Pure: no React, no store, no Supabase.
`applyPresence` folds one presence sync into a `{ present, leftAt }` snapshot,
keeping the ORIGINAL departure timestamp across later syncs so the grace runs
from when a racer left rather than from the sync that noticed. `connectionState`
answers from presence for anyone this client has observed and falls back to the
server's `absent_reports` for everyone else — the fallback is what lets a
browser that has just landed mid-race render an honest roster instead of
claiming a drop it cannot support.

**Task 3 — presence on the channel.** `lib/usePresence.ts` holds the snapshot
and a coarse 5-second clock in their own zustand store, deliberately outside
`lib/store.ts` (the same argument ADR-0045 made for the awards: presence is a
property of the websocket, not game state Postgres is authority for).
`lib/useRoomChannel.ts` gained a `ViewerRole` argument: a player TRACKS itself
on the channel, a stage view subscribes and never tracks (a TV is not a racer,
ADR-0031). `lib/useHostPresenceReporter.ts` is the host's 3-second loop, reading
the present list through `getState()` so a join or a leave never re-arms the
interval.

**Task 4 — the connection chip.** `components/PlayerConnection.tsx` renders
nothing for a connected player and real text inside a `role="status"` live
region otherwise — never colour alone. On the lobby roster and the track
readout. **The Pixi avatar is deliberately untouched.**

**Task 5 — reclaim.** `join_room`'s flat `status <> 'lobby' -> raise` became two
arms of one function (ADR-0050). An existing nickname whose player is
`player_dropped()` returns the SAME row — same id, same `player_key`, same
answers, same score — with `reclaimed: true`; anything else is a late join.
A finished room is now rejected specifically (`the race has finished`).
`lib/types.ts` gained `JoinResult`, and `JoinGate` uses it.

**Task 6 — late join.** `materialize_late_joiners(room_id)` flips `is_playing`
for every `joined_late` spectator, and `advance_phase` calls it at any READ with
`v_round <= total_rounds` — a bound that excludes the tiebreak (ADR-0043) and a
placement that excludes a skip (ADR-0038, which reuses the round number).
`start_game` clears `joined_late` and `absent_reports` for the whole room, which
is what makes a rematch a clean slate. The mark is rendered on the lobby roster,
on the track readout, and in the late joiner's own spectator copy.

**Task 7 — coverage and record.** `e2e/presence.spec.ts` is three two-context
tests; ADR-0049 and ADR-0050; this document.

## Deviations from the plan

Five, all found by running the plan's own assertions.

1. **`get_room_state` also had to be replaced, to expose `host_seen_at`.** The
   plan's Task 1 smoke asserts `prState.room.host_seen_at`, but nothing in the
   plan put that column on any projection, and the API roles have no table
   grants — so there was no route to it at all. Added as one key on
   `get_room_state`'s room object, which is a *fetch*, not the broadcast:
   `phase_event` is untouched, so the "wire stays semantic" constraint holds.
   P3b's sweeper election needs the same route, so writer and reader now live in
   one migration. `RoomInfo.host_seen_at?: string | null` mirrors it.

2. **The game-flow smoke assertion the plan rewrote is about a FINISHED room,
   not a running one.** The plan replaced `rpcFails(… /already started/i)` with a
   late-join assertion, but the line immediately above it asserts `advance_phase`
   fails with `/finished/i` — that room's race is over. It now asserts
   `/race has finished/i`, which is the behaviour P3a actually made specific
   there. The late-join arm is asserted in full in the P3a sections regardless.

3. **The reclaim fixture read the answer key after `start_game`; the draw locks
   there.** `get_room_draw` raises "the draw is locked once the race starts", so
   the fetch moved to before the start, where the MC host can still see it
   (ADR-0040).

4. **The late-join fixture drew from one category and ended in a three-way
   tie.** Two separate corrections. `['fuel']` alone exhausts tier 1 in one race,
   so the block's closing `rematch` refused (the bank holds exactly two rows per
   category/tier) — it now draws from `['fuel', 'online']`. And with nobody ever
   answering, all three racers sat on 0/0/0; `perfect_first_place_tie` is a tie
   at the TOP, not a perfect score, so the last TRACK opened SUDDEN DEATH instead
   of the results the block goes on to rematch from. One racer now answers both
   rounds correctly and wins outright.

5. **The materialisation was invisible to the late joiner's own browser** — the
   one deviation that is new code rather than a corrected fixture. `advance_phase`
   flips `is_playing` server-side, but `phase_event` carries no roster and this
   plan added no key to it, and `lib/staging/runtime.ts`'s `isLocalPlayerPlaying`
   reads `useGameStore`'s `players`, which only `applyState` (on subscribe) and
   `addPlayer` (a broadcast) ever fill. The plan's own third e2e test caught it:
   the spectator stayed disabled through round 2 while the SQL smoke passed.
   Fixed with `lib/useLateJoinerMaterialize.ts` — a `get_room_state` refetch on
   each READ, guarded so that ONLY a player who is both `joined_late` and not yet
   playing ever calls it, applied through a new narrow `setPlayers` store action
   rather than `applyState` so a roster refresh can never clobber a phase event
   that landed while it was in flight. No new wire key; the one client that needs
   the fact asks for it.

## Verification results

Run in the worktree, against the local stack (`0009_presence.sql` applied by
`docker exec` and the PostgREST cache reloaded after each of the three appends;
the file is idempotent and its second and third runs reported only
`column … already exists, skipping` notices).

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | Silent |
| `npm run lint` | Zero problems (one `no-unused-vars` warning the plan's `ljHost` binding introduced was removed, not discounted) |
| `npm test` | 600 passed, 43 files (588 before this phase; `tests/presence.test.ts` adds 12) |
| `node scripts/smoke.mjs` | Every section, ending `✅ P3a presence smoke passed` |
| `npm run build` | Clean |
| `npx playwright test e2e/presence.spec.ts --headed` | 3 passed |
| `npx playwright test e2e/presence.spec.ts --workers=1` | 3 passed (headless, after the fixture fix below) |
| `npm run test:e2e -- --workers=1` | 38 passed, 2 failed on the first run; both re-run green in isolation. `tiebreak.spec.ts:133` is one of the three specs CURRENT.md already names as environmental on this machine. `presence.spec.ts:100` was a real fixture race and was FIXED, not discounted: round 1's answer window was 5 seconds, and the spectator copy renders only during ANSWER, so a browser opened from scratch was racing the phase clock to see it — it only just won headed. The window is now 20 seconds. |

## Live-verification findings

Headed throughout — headless Chromium falls back to SwiftShader and pins the
VFX budget before a test starts (CURRENT.md).

- **The host's report cadence is real, and it is 200s.** A headed two-context
  probe counted five `report_presence` calls in ~12 seconds with gaps of
  2996 / 2988 / 2998 / 3002 ms and no non-200 response.
- **A drop is visible from another browser within the socket's own timeout.**
  Closing the joiner's context put exactly one `connection-chip` on the host's
  starting grid, `data-state="reconnecting"`, reading "Reconnecting…".
- **A mid-game reload needs no reclaim at all**, which is why reclaim itself is
  covered at the SQL level instead: localStorage survives, the session still
  works, the server-held answer lock is restored (`data-locked="true"`), and no
  chip appears on the host's screen.
- **A browser arriving during round 1 spectates and races from round 2**, sees
  "You're in from the next question — watch this one" while it waits, and is
  marked `late-badge` on the host's screen afterwards.

## Notes for phases that inherit this work

- **`rooms.host_seen_at` exists, is written ONLY by `report_presence`, and is
  read by nothing in P3a.** M3 P3b's host-absence sweep is its entire consumer.
  It reaches a client on `get_room_state`'s room object (`RoomInfo.host_seen_at`)
  — never on `phase_event`.
- **`DROP_REPORTS × PRESENCE_REPORT_MS` is a hand-mirror across two files.**
  `lib/presence.ts` and `0009_presence.sql` must move together; both
  `tests/presence.test.ts` and `scripts/smoke.mjs` pin the product at 60000, so
  a one-sided change fails a test rather than silently changing the grace.
- **`join_room` no longer raises `game already started`.** A mid-game join is a
  reclaim or a late join; only a FINISHED room is refused, and its message is
  now `the race has finished`. Anything that depended on a mid-game join failing
  is wrong.
- **`players.is_playing` now has three distinct meanings**, and only
  `joined_late` separates the second from the first: a deliberate MC (host who
  chose not to race — never materialised), an unmaterialised late joiner
  (`joined_late = true`, materialised at the next real round start), and — never
  — a dropped racer, whose `is_playing` is deliberately left alone so
  `standings()` keeps their score and their avatar (ADR-0049). Any future code
  that reads `is_playing` as "is a spectator" must say which of the three it
  means.
- **A server-side change to a PLAYER row does not reach clients on its own.**
  There is no server-side realtime and `phase_event` carries no roster, so
  `absent_reports` and `is_playing` only move on a client at `get_room_state`.
  P3a covers the one case that could not wait (`useLateJoinerMaterialize`); a
  future phase that needs a roster fact live everywhere will need a broader
  answer than a per-client refetch, and `setPlayers` is the seam for it.
- **The Pixi avatar is untouched by this phase.** A canvas treatment for a
  dropped racer is a legitimate idea and it is unowned work, **not tech debt** —
  readability lives in the DOM (PRD §9) and the chips satisfy the requirement
  there.
- **`TrackReadout` is only mounted during the TRACK beat**, so mid-race the
  chips are visible for four seconds a round; the lobby roster carries them
  continuously. A persistent in-play roster strip belongs to P5's polish pass.

## Cloud application

`0009_presence.sql` applied to `niznfbabmixesfvxlypi` via
`npx -y supabase@latest db query --linked --file supabase/migrations/0009_presence.sql`,
then verified by schema rather than by `supabase migration list --linked`, which
understates what is applied (CURRENT.md):

```
player_cols = 2   (players.absent_reports, players.joined_late)
room_cols   = 1   (rooms.host_seen_at)
fns         = 3   (report_presence, player_dropped, materialize_late_joiners)
```

Note for the next phase: **a fresh worktree cannot reach the cloud project until
`supabase/.temp/` is copied into it by hand.** It is gitignored, like
`.env.local`, and without it the linked CLI answers
`Cannot find project ref. Have you run supabase link?`.

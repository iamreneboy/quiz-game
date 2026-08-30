# M3 P3a — Presence & the Open Door Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the room survive its people coming and going — every surface can
see who is actually connected, a racer who drops keeps their place on the track
and can reclaim their run, and a browser arriving mid-race joins as a spectator
and races from the next round marked "joined late".

**Architecture:** Supabase Presence enters the codebase for the first time, and
it enters as **presentation only**: every client tracks itself on the room
channel and every client reads the same presence map, so a connection chip is
instant and costs no round trip. The *server* cannot see presence at all, and
two rules need it to — reclaim ("is this racer really gone?") and P3b's
host-absence sweep. So the host, which already drives the state machine, reports
the roster it can see: one `report_presence(room_id, host_key, present[])` call
every 3 seconds, whatever the player count. A player the host omits has
`absent_reports` incremented; twenty consecutive omissions (20 × 3s = the PRD's
60 seconds) is what "dropped" means server-side. Counting reports rather than
wall-clock seconds is deliberate — when the *host* vanishes nothing is reported,
so nobody can be falsely declared dropped by the passage of time alone, and a
test can advance the clock by calling the RPC twenty times.

`join_room`'s hard `status <> 'lobby'` rejection is replaced by two arms that
share one function: an existing nickname belonging to a dropped player is a
**reclaim** (same row, same `player_key`, same answers, same score); anything
else is a **late join** (`is_playing = false`, `joined_late = true`), which
`advance_phase` materialises at the start of the next real round.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase
(Postgres + Realtime broadcast **and presence**), zustand, `motion`, Pixi v8,
Howler, Tailwind v4, Vitest, Playwright. **No new runtime dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md`
(§3 "P3 — Continuity" is the requirement set; §2 and §4 bind every task).
PRD §9's edge-case table and PRD §4's "Late joiner / spectator" row are the
behaviour being implemented.

**P3's drill-down spec was not written, and P3 is split in two.** Roadmap §6
says P3 earns a spec because it owns "the hardest question in M3 — who pauses a
vanished host". That question is resolved in **P3b's** plan, exactly as P0
resolved skip semantics, P1 the playing-host conflict, P2a the P2a/P2b split and
P2b its own three. Roadmap §3 also says a phase whose drill-down grows past 4–8
tasks gets split; P3's five scope bullets come to fifteen tasks, so:

| Plan | Scope | Why here |
|---|---|---|
| **P3a — Presence & the open door** *(this document)* | The presence substrate, connection chips, player drop, reclaim, late join | Reclaim and late join are two arms of the **same function** (`join_room`); both need the presence substrate |
| **P3b — The vanished host** | Host-drop auto-pause, the sweeper election, auto-resume, the 5-minute graceful end, the 24h room purge | Every item needs `rooms.host_seen_at`, which P3a's `report_presence` is the only writer of |

**P3a must merge before P3b starts.** P3b reads a column and an RPC this plan
creates.

Decisions this plan owns and resolves:

| Decision | Resolved as | Where |
|---|---|---|
| **How the server learns who is connected** | **The host reports it.** One `report_presence` call every 3s regardless of player count, host-key-checked. Rejected: a per-player heartbeat RPC (20 players × 1 call/3s of pure write traffic for a fact one client already holds), and a Supabase scheduled function (minute granularity, and it cannot see a websocket either). | Task 1, ADR-0049 |
| **What "dropped" means to Postgres** | **Twenty consecutive absent reports**, not a wall-clock age. It cannot fire while the host is gone (nothing is reporting), and it is testable without waiting 60 seconds. | Task 1, ADR-0049 |
| **What "becomes a spectator" does to a dropped racer** | **Nothing to their standing.** `is_playing` is NOT flipped: `standings()` filters on it, so flipping it would erase the racer's score and their avatar from the track — the opposite of "score frozen". Dropped is a *presentation* state plus the server-side gate that opens reclaim. | Task 1, ADR-0049 |
| **Where reclaim and late join live** | **Both inside `join_room`.** One nickname lookup separates them, and the mid-game arm returns the same shape the lobby arm does, so `JoinGate` needs no second code path. | Task 5 and 6, ADR-0050 |
| **When a late joiner starts racing** | **At the next `advance_phase` that opens a READ inside the drawn track** (`v_round <= total_rounds`). The tiebreak is excluded by that bound — it is a round past the finish line that belongs to the contenders (ADR-0043), and a skip is not a new round at all (it reuses the round number, ADR-0038). | Task 6 |

## Global Constraints

Copied from the roadmap. Every task's requirements implicitly include this
section.

- **Migrations `0009+` follow the house style** set by `0003`–`0008` —
  `create or replace function` over rewrites, additive columns with defaults, no
  destructive DDL. A live cloud project (`niznfbabmixesfvxlypi`) holds real data
  behind a live Vercel deploy. **The whole of `0009_presence.sql` must be
  idempotent**: it is written across Tasks 1, 5 and 6 and re-applied after each,
  so every statement in it has to survive a second run.
- **The wire stays semantic** (PRD §3.6, §9). This plan adds **no new realtime
  event and no new `phase_event` key.** Presence rides Supabase's own presence
  channel; `absent_reports` and `joined_late` reach the client on
  `player_public`, which `get_room_state` and `join_room` already return.
- **Host authority is server-enforced on every command** (roadmap decision 2).
  `report_presence` validates `host_key` inside the RPC.
- **The Fairness Law is inviolable.** `standings`' sort clause stays
  byte-identical (ADR-0018). No task in this plan edits `standings`. A
  materialised late joiner enters it with `correct = 0` and sorts last by the
  existing clause; a dropped racer's row is untouched.
- **The celebration hierarchy extends by exactly zero rungs.** M3's one allowed
  addition was spent on `suddenDeath` (roadmap decision 6). A drop and a
  reconnect get no cue and no rung — they are chrome, not moments.
- **Rendering separation** (PRD §9): Pixi owns the world; HTML/CSS/React owns
  everything readable. The connection chips are DOM. **The Pixi avatar is
  deliberately not touched** — a canvas treatment for a dropped racer is a
  legitimate idea and it is not in this plan; readability must not depend on it.
- **Accessibility is an acceptance criterion, not a later pass.** Every chip is
  real text inside a `role="status"` live region, never colour alone.
- **No new runtime dependencies.**
- **The regression floor at the end of the phase:** every existing unit test
  plus whatever this plan adds, `npm run lint` clean (there is no known
  pre-existing error to discount — any lint error is a real one), `npx tsc
  --noEmit` silent, `npm run test:e2e -- --workers=1` green. **Use
  `--workers=1`:** `--workers=2` fails reproducibly on this machine from an
  untouched `main`, on Pixi-heavy specs, and that is environmental
  (CURRENT.md).
- **Local migrations are applied with `docker exec`, never `npx supabase db
  query`** (CURRENT.md):
  `docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/0009_presence.sql`
  followed by
  `docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"`
  — without the reload every call to a new RPC answers "Could not find the
  function … in the schema cache", which looks exactly like a migration that did
  not apply. **Do not run `supabase stop` / `supabase start`** — the stack is on
  shifted ports and a restart loses it.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0009_presence.sql` | *(new)* `players.absent_reports`, `players.joined_late`, `rooms.host_seen_at`; `presence_report_ms()`, `drop_reports()`, `player_dropped()`, `materialize_late_joiners()`, `report_presence()`; replacements for `player_public`, `join_room`, `start_game`, `advance_phase` |
| `lib/presence.ts` | *(new)* Pure. The snapshot shape, the fold of one presence sync into it, and the one function that turns presence + `absent_reports` into a `ConnectionState`. No React, no store, no Supabase |
| `lib/usePresence.ts` | *(new)* The zustand store holding the snapshot and the coarse clock, plus `useConnectionState(playerId)` |
| `lib/useHostPresenceReporter.ts` | *(new)* The host's 3-second `report_presence` loop |
| `components/PlayerConnection.tsx` | *(new)* The chip. One player, one line of readable text, or nothing |
| `tests/presence.test.ts` | *(new)* Vitest for `lib/presence.ts` |
| `e2e/presence.spec.ts` | *(new)* Two-context Playwright: a lobby drop seen from another browser; a mid-game reload that keeps a score; a late joiner who spectates then races |
| `lib/types.ts` | `PlayerPublic` gains `absent_reports` and `joined_late`; `JoinResult` is named |
| `lib/useRoomChannel.ts` | Takes a `ViewerRole`; tracks the local player on the channel; feeds presence sync into the store |
| `app/room/[code]/page.tsx` | Passes `'player'`; mounts the host reporter |
| `app/stage/[code]/page.tsx` | Passes `'stage'` — receives presence, never tracks |
| `components/TrackReadout.tsx` | A chip per rail entry |
| `components/LobbyView.tsx` | A chip per roster entry, plus the "joined late" badge |
| `components/GameView.tsx` | The late joiner's own copy while spectating |
| `scripts/smoke.mjs` | The SQL-level integration harness gains a P3a section |

---

## Task 1: The presence report

The server foundation. Everything else in this plan and all of P3b reads what
this task writes.

**Files:**
- Create: `supabase/migrations/0009_presence.sql`
- Modify: `lib/types.ts`
- Modify: `scripts/smoke.mjs` (append a new section before the final
  `console.log`)

**Interfaces:**
- Consumes: `player_public(p players)` and `rooms` / `players` as of
  `0008_the_aftermath.sql`.
- Produces:
  - SQL: `presence_report_ms() -> int` (3000), `drop_reports() -> int` (20),
    `player_dropped(p players) -> boolean`,
    `report_presence(p_room_id uuid, p_host_key uuid, p_present uuid[]) -> jsonb`
    returning `{"server_now": <timestamptz>}`.
  - Columns: `players.absent_reports int not null default 0`,
    `players.joined_late boolean not null default false`,
    `rooms.host_seen_at timestamptz` (null until the first report).
  - `player_public` gains `absent_reports` and `joined_late`.
  - TS: `PlayerPublic.absent_reports?: number`,
    `PlayerPublic.joined_late?: boolean` — both optional, because a client can
    still be talking to a pre-0009 database.

- [ ] **Step 1: Write the failing smoke assertions**

Append to `scripts/smoke.mjs`, immediately before its final
`console.log('✅ P2b rematch smoke passed');` line — put it after that line
instead if the file has grown; the only requirement is that it runs.

```js
// ---- P3a presence ----
// The host reports the roster it can see; a player it stops reporting is
// eventually dropped, by COUNT of missed reports rather than by wall clock.
const pr = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['ai-tech', 'online'], p_tier_counts: [2, 0, 0, 0],
});
const prHost = await rpc('join_room', {
  p_code: pr.code, p_nickname: 'Marshal', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: pr.host_key,
});
const prA = await rpc('join_room', {
  p_code: pr.code, p_nickname: 'Stayer', p_avatar: 'duck', p_color: '#38bdf8',
});
const prB = await rpc('join_room', {
  p_code: pr.code, p_nickname: 'Leaver', p_avatar: 'cat', p_color: '#a78bfa',
});

assert.equal(await rpc('drop_reports', {}), 20);
assert.equal(await rpc('presence_report_ms', {}), 3000);

// The thresholds are a hand-mirror of lib/presence.ts. 20 reports x 3000ms is
// the PRD's 60-second grace; if either number moves, both files move.
assert.equal((await rpc('drop_reports', {})) * (await rpc('presence_report_ms', {})), 60_000);

await rpcFails('report_presence',
  { p_room_id: pr.room_id, p_host_key: prA.player_key, p_present: [] },
  /invalid host key/i);

// Everyone present: nobody accrues anything.
await rpc('report_presence', {
  p_room_id: pr.room_id, p_host_key: pr.host_key,
  p_present: [prHost.player_id, prA.player_id, prB.player_id],
});
let prState = await rpc('get_room_state', { p_code: pr.code });
assert.ok(prState.room.host_seen_at, 'the host checked in');
for (const p of prState.players) {
  assert.equal(p.absent_reports, 0, `${p.nickname} is present`);
  assert.equal(p.joined_late, false, `${p.nickname} was here from the start`);
}

// Nineteen reports without Leaver: reconnecting, not yet dropped.
for (let i = 0; i < 19; i++) {
  await rpc('report_presence', {
    p_room_id: pr.room_id, p_host_key: pr.host_key,
    p_present: [prHost.player_id, prA.player_id],
  });
}
prState = await rpc('get_room_state', { p_code: pr.code });
const leaver19 = prState.players.find(p => p.nickname === 'Leaver');
const stayer19 = prState.players.find(p => p.nickname === 'Stayer');
assert.equal(leaver19.absent_reports, 19);
assert.equal(stayer19.absent_reports, 0, 'a present player never accrues');

// The twentieth crosses the line.
await rpc('report_presence', {
  p_room_id: pr.room_id, p_host_key: pr.host_key,
  p_present: [prHost.player_id, prA.player_id],
});
prState = await rpc('get_room_state', { p_code: pr.code });
assert.equal(prState.players.find(p => p.nickname === 'Leaver').absent_reports, 20);

// Coming back resets the count outright — a drop is not a debt.
await rpc('report_presence', {
  p_room_id: pr.room_id, p_host_key: pr.host_key,
  p_present: [prHost.player_id, prA.player_id, prB.player_id],
});
prState = await rpc('get_room_state', { p_code: pr.code });
assert.equal(prState.players.find(p => p.nickname === 'Leaver').absent_reports, 0);

console.log('✅ P3a presence smoke passed');
```

- [ ] **Step 2: Run it and watch it fail**

```
node scripts/smoke.mjs
```

Expected: FAIL at `drop_reports` with
`Could not find the function public.drop_reports` (or
`report_presence: … does not exist`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0009_presence.sql`:

```sql
-- M3 P3a — presence: who is actually connected, who dropped, who arrived late.
--
-- THE WHOLE FILE IS IDEMPOTENT. It is written across three tasks and
-- re-applied after each one, so every statement here must survive a second run.
--
-- Depends on 0008_the_aftermath.sql (rooms.used_question_ids, rematch) and,
-- through the functions it replaces, on 0006 and 0007.
--
-- NOTHING HERE TOUCHES THE WIRE. Supabase Presence carries "who is on the
-- channel" between clients; this file carries the SERVER's much coarser view of
-- the same thing, reached through player_public — which get_room_state and
-- join_room already return. No new phase_event key, no new broadcast.

-- ============ schema ============
-- absent_reports is a COUNT OF MISSED HOST REPORTS, not an age. That choice is
-- ADR-0049 and it is load-bearing twice over:
--   * when the HOST is the one who vanished nothing is reported at all, so no
--     player can be falsely declared dropped by the mere passage of time;
--   * a test can advance it twenty steps in a loop instead of waiting a minute.
alter table players add column if not exists absent_reports int not null default 0;

-- PRD §4: a late joiner spectates until the next round start and is then
-- "clearly marked joined late". The flag outlives the materialisation for
-- exactly that reason; start_game clears it when a new race begins.
alter table players add column if not exists joined_late boolean not null default false;

-- The host's own proof of life. Written ONLY by report_presence. P3a reads it
-- nowhere; M3 P3b's host-absence sweep is its entire consumer, and it lives
-- here because report_presence is its only writer.
alter table rooms add column if not exists host_seen_at timestamptz;

-- ============ thresholds ============
-- Hand-mirrored in lib/presence.ts, in the tradition of ceremony_ms() and
-- NOMINAL_MS. 20 reports x 3000ms == the PRD's 60-second grace; a change to
-- either number must move both files, and scripts/smoke.mjs pins the product.
create or replace function presence_report_ms() returns int
language sql immutable as $$ select 3000 $$;

create or replace function drop_reports() returns int
language sql immutable as $$ select 20 $$;

-- ============ player_dropped ============
-- The server's whole definition of "gone". Deliberately NOT `is_playing`:
-- standings() filters on that column, so demoting a dropped racer would erase
-- their score and their avatar from the track — the opposite of PRD §9's
-- "60s grace with score frozen". Dropped is a presentation state plus the gate
-- that opens reclaim (Task 5). See ADR-0049.
create or replace function player_dropped(p players) returns boolean
language sql immutable set search_path = public as $$
  select p.absent_reports >= drop_reports();
$$;

-- ============ player_public ============
-- Byte-identical to 0002_rpcs.sql except for TWO added keys. Both are facts
-- about a player that every surface needs to render honestly, and both already
-- travel on the one projection every roster is built from.
create or replace function player_public(p players) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'color', p.color,
    'is_host', p.is_host, 'is_playing', p.is_playing,
    'absent_reports', p.absent_reports,
    'joined_late', p.joined_late);
$$;

-- ============ report_presence ============
-- The host's roster report (ADR-0049). ONE call every presence_report_ms(),
-- whatever the player count — the host already drives the state machine
-- (PRD §9), so it is the client that both holds the presence map and is
-- allowed to write authority.
--
-- host_key checked inside the RPC, exactly as every other host command is
-- (roadmap decision 2).
--
-- No `for update`: two overlapping reports are last-writer-wins on a monotone
-- counter, and blocking a phase transition behind a heartbeat would be a much
-- worse trade than a lost increment.
create or replace function report_presence(
  p_room_id uuid, p_host_key uuid, p_present uuid[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_present uuid[] := coalesce(p_present, '{}'::uuid[]);
begin
  select * into v_room from rooms where id = p_room_id;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;

  -- A finished room has nothing to keep alive, and the ceremony must not be
  -- disturbed by a heartbeat. Answering rather than raising keeps the client
  -- loop free of a special case.
  if v_room.status = 'finished' then
    return jsonb_build_object('server_now', now());
  end if;

  update rooms set host_seen_at = now() where id = p_room_id;

  update players set absent_reports = 0
    where room_id = p_room_id and id = any(v_present) and absent_reports <> 0;

  -- `not (id = any('{}'))` is `not false` — an empty report increments
  -- everybody, which is exactly right for a host that can see nobody.
  -- The cap keeps a long absence from growing an int without bound.
  update players set absent_reports = least(absent_reports + 1, 1000)
    where room_id = p_room_id and not (id = any(v_present));

  return jsonb_build_object('server_now', now());
end $$;

-- New functions need their own grant; earlier blanket grants ran before they
-- existed.
grant execute on all functions in schema public to anon, authenticated;
```

- [ ] **Step 4: Apply it and reload the schema cache**

```bash
docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/0009_presence.sql
docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
```

Expected: a run of `ALTER TABLE` / `CREATE FUNCTION` / `GRANT` lines, no error.

- [ ] **Step 5: Run the smoke test**

```
node scripts/smoke.mjs
```

Expected: every earlier section still passes, then
`✅ P3a presence smoke passed`.

- [ ] **Step 6: Widen the client types**

In `lib/types.ts`, replace the `PlayerPublic` interface:

```ts
export interface PlayerPublic {
  id: string; nickname: string; avatar: string; color: string;
  is_host: boolean; is_playing: boolean;
  /**
   * Consecutive host reports that did NOT list this player (M3 P3a). 0 means
   * present as of the last report; `drop_reports()` (20) or more means dropped.
   * Optional — absent against a pre-0009 database, and folded to 0 by every
   * reader, which is the only safe guess.
   */
  absent_reports?: number;
  /** True for a player who joined after the race started (PRD §4). */
  joined_late?: boolean;
}
```

- [ ] **Step 7: Verify diagnostics and commit**

```bash
npx tsc --noEmit
npm run lint
npm test
git add supabase/migrations/0009_presence.sql lib/types.ts scripts/smoke.mjs
git commit -m "feat(p3a): the host reports the roster; the server counts absences"
```

---

## Task 2: `lib/presence.ts` — the pure layer

**Files:**
- Create: `lib/presence.ts`
- Create: `tests/presence.test.ts`

**Interfaces:**
- Consumes: nothing. This module imports no React, no store, no Supabase — it is
  the tested seam.
- Produces:
  - `PRESENCE_REPORT_MS: 3000`, `DROP_REPORTS: 20`, `RECONNECT_GRACE_MS: 60000`
  - `type ConnectionState = 'connected' | 'reconnecting' | 'dropped'`
  - `interface PresenceSnapshot { present: string[]; leftAt: Record<string, number> }`
  - `EMPTY_PRESENCE: PresenceSnapshot`
  - `applyPresence(prev: PresenceSnapshot, presentNow: string[], nowMs: number): PresenceSnapshot`
  - `samePresence(a: PresenceSnapshot, b: PresenceSnapshot): boolean`
  - `connectionState(snap: PresenceSnapshot, playerId: string, absentReports: number, nowMs: number): ConnectionState`

- [ ] **Step 1: Write the failing test**

Create `tests/presence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  DROP_REPORTS,
  EMPTY_PRESENCE,
  PRESENCE_REPORT_MS,
  RECONNECT_GRACE_MS,
  applyPresence,
  connectionState,
  samePresence,
} from '@/lib/presence';

describe('the thresholds', () => {
  it('mirror the SQL: twenty reports at three seconds is the PRD 60s grace', () => {
    expect(DROP_REPORTS).toBe(20);
    expect(PRESENCE_REPORT_MS).toBe(3_000);
    expect(RECONNECT_GRACE_MS).toBe(60_000);
    expect(DROP_REPORTS * PRESENCE_REPORT_MS).toBe(RECONNECT_GRACE_MS);
  });
});

describe('applyPresence', () => {
  it('records who is here, sorted, from an empty snapshot', () => {
    const next = applyPresence(EMPTY_PRESENCE, ['b', 'a'], 1_000);
    expect(next.present).toEqual(['a', 'b']);
    expect(next.leftAt).toEqual({});
  });

  it('de-duplicates a player tracked from two tabs', () => {
    expect(applyPresence(EMPTY_PRESENCE, ['a', 'a'], 1_000).present).toEqual(['a']);
  });

  it('stamps the moment somebody stops being present', () => {
    const one = applyPresence(EMPTY_PRESENCE, ['a', 'b'], 1_000);
    const two = applyPresence(one, ['a'], 5_000);
    expect(two.present).toEqual(['a']);
    expect(two.leftAt).toEqual({ b: 5_000 });
  });

  it('keeps the ORIGINAL departure time across later syncs', () => {
    const one = applyPresence(EMPTY_PRESENCE, ['a', 'b'], 1_000);
    const two = applyPresence(one, ['a'], 5_000);
    const three = applyPresence(two, ['a'], 9_000);
    expect(three.leftAt).toEqual({ b: 5_000 });
  });

  it('forgets a departure the moment the player comes back', () => {
    const one = applyPresence(EMPTY_PRESENCE, ['a', 'b'], 1_000);
    const two = applyPresence(one, ['a'], 5_000);
    const three = applyPresence(two, ['a', 'b'], 9_000);
    expect(three.leftAt).toEqual({});
  });
});

describe('samePresence', () => {
  it('is true for equal snapshots and false for any difference', () => {
    const a = applyPresence(EMPTY_PRESENCE, ['x', 'y'], 1_000);
    const b = applyPresence(EMPTY_PRESENCE, ['y', 'x'], 2_000);
    expect(samePresence(a, b)).toBe(true);
    expect(samePresence(a, applyPresence(a, ['x'], 3_000))).toBe(false);
  });
});

describe('connectionState', () => {
  const here = applyPresence(EMPTY_PRESENCE, ['a', 'b'], 1_000);

  it('is connected for anyone on the channel, whatever the server last counted', () => {
    expect(connectionState(here, 'a', 0, 2_000)).toBe('connected');
    expect(connectionState(here, 'a', 99, 2_000)).toBe('connected');
  });

  it('is reconnecting inside the grace after a departure this client saw', () => {
    const gone = applyPresence(here, ['a'], 5_000);
    expect(connectionState(gone, 'b', 0, 5_000 + RECONNECT_GRACE_MS - 1)).toBe('reconnecting');
  });

  it('is dropped once the grace has run out', () => {
    const gone = applyPresence(here, ['a'], 5_000);
    expect(connectionState(gone, 'b', 0, 5_000 + RECONNECT_GRACE_MS)).toBe('dropped');
  });

  it('falls back to the server count for a player this client never observed', () => {
    expect(connectionState(here, 'stranger', 0, 2_000)).toBe('connected');
    expect(connectionState(here, 'stranger', 1, 2_000)).toBe('reconnecting');
    expect(connectionState(here, 'stranger', DROP_REPORTS, 2_000)).toBe('dropped');
  });

  it('never claims a drop it cannot support — an empty snapshot says connected', () => {
    expect(connectionState(EMPTY_PRESENCE, 'a', 0, 2_000)).toBe('connected');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```
npx vitest run tests/presence.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/presence"`.

- [ ] **Step 3: Write the module**

Create `lib/presence.ts`:

```ts
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
```

- [ ] **Step 4: Run the test**

```
npx vitest run tests/presence.test.ts
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
npm run lint
git add lib/presence.ts tests/presence.test.ts
git commit -m "feat(p3a): the pure presence layer"
```

---

## Task 3: Presence on the channel

Track the local player, read the shared map, and start the host's report loop.

**Files:**
- Create: `lib/usePresence.ts`
- Create: `lib/useHostPresenceReporter.ts`
- Modify: `lib/useRoomChannel.ts`
- Modify: `app/room/[code]/page.tsx`
- Modify: `app/stage/[code]/page.tsx`

**Interfaces:**
- Consumes: `lib/presence.ts` (Task 2); `report_presence` (Task 1);
  `lib/viewer.ts`'s `ViewerRole`; `lib/session.ts`'s `subscribeSession` /
  `loadSession`.
- Produces:
  - `usePresence` — a zustand store, `{ snapshot, nowMs, sync(ids), tick(), reset() }`
  - `useConnectionState(playerId: string): ConnectionState`
  - `useHostPresenceReporter(code: string): void`
  - `useRoomChannel(code: string, role: ViewerRole): RealtimeChannel | null`
    — **the signature changes**; both routes must be updated in this task.

- [ ] **Step 1: Write the presence store**

Create `lib/usePresence.ts`:

```ts
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
```

- [ ] **Step 2: Wire presence into the channel**

Replace `lib/useRoomChannel.ts` in full:

```ts
'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { usePresence, PRESENCE_TICK_MS } from './usePresence';
import { loadSession, subscribeSession } from './session';
import type { ViewerRole } from './viewer';
import type { PhaseEvent, PlayerPublic, RoomState } from './types';

/**
 * The room's realtime channel: broadcasts in, presence both ways.
 *
 * `role` is explicit rather than inferred from a missing session (ADR-0031).
 * A stage view SUBSCRIBES to presence and never TRACKS on it — a TV is not a
 * racer, and a phantom entry in the map would be counted as a connected player
 * by everything downstream.
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
    const pendingEvents: PhaseEvent[] = [];
    let ready = false;

    const ch = supabase.channel(`room:${code.toUpperCase()}`);
    ch.on('broadcast', { event: 'phase' }, ({ payload }) => {
      const evt = payload as PhaseEvent;
      if (!ready) {
        pendingEvents.push(evt);
        return;
      }
      applyPhaseEvent(evt);
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
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        const { data, error } = await supabase.rpc('get_room_state', { p_code: code });
        if (!error && data) applyState(data as RoomState);
        setRoomMissing(!!error);
        ready = true;
        for (const evt of pendingEvents.splice(0, pendingEvents.length)) {
          applyPhaseEvent(evt);
        }
        setChannel(ch);
      }
    });

    // One coarse clock for every chip. Cleared with the channel, so nothing
    // ticks after the route unmounts.
    const ticker = setInterval(() => usePresence.getState().tick(), PRESENCE_TICK_MS);

    return () => {
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
```

- [ ] **Step 3: Write the host's report loop**

Create `lib/useHostPresenceReporter.ts`:

```ts
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
```

- [ ] **Step 4: Update both routes**

In `app/room/[code]/page.tsx`:

- add `import { useHostPresenceReporter } from '@/lib/useHostPresenceReporter';`
- change `const channel = useRoomChannel(code);` to
  `const channel = useRoomChannel(code, 'player');`
- immediately after the existing `const isHost = …` line, add:

```tsx
  const hostKey = typeof window !== 'undefined' ? loadSession(code)?.hostKey ?? null : null;
  useHostPresenceReporter(hostKey);
```

In `app/stage/[code]/page.tsx`, change `useRoomChannel(code);` to:

```tsx
  // 'stage' both selects the read-only shot book and keeps this screen OUT of
  // the presence map: a TV is not a racer (ADR-0031).
  useRoomChannel(code, 'stage');
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
npm run lint
npm test
```

Expected: silent, zero problems, all tests pass.

Then, headed (never headless — CURRENT.md: SwiftShader pins the VFX budget):
run `npm run dev`, open a host and a joiner in two browser profiles, and confirm
in the host's devtools network tab that `report_presence` fires roughly every
3 seconds and returns 200.

- [ ] **Step 6: Commit**

```bash
git add lib/usePresence.ts lib/useHostPresenceReporter.ts lib/useRoomChannel.ts app/room/\[code\]/page.tsx app/stage/\[code\]/page.tsx
git commit -m "feat(p3a): presence on the room channel, reported by the host"
```

---

## Task 4: The connection chip

**Files:**
- Create: `components/PlayerConnection.tsx`
- Modify: `components/TrackReadout.tsx`
- Modify: `components/LobbyView.tsx`

**Interfaces:**
- Consumes: `useConnectionState` (Task 3).
- Produces: `<PlayerConnection playerId={string} />` — renders nothing while
  connected; otherwise a `data-testid="connection-chip"` element carrying
  `data-state="reconnecting" | "dropped"`.

- [ ] **Step 1: Write the chip**

Create `components/PlayerConnection.tsx`:

```tsx
'use client';
import { useConnectionState } from '@/lib/usePresence';

/**
 * "Is this racer still here?" (PRD §9, M3 P3a).
 *
 * DOM, never canvas (cross-cutting constraint 2): the Pixi avatar is
 * deliberately untouched by this phase, so nothing readable about a drop
 * depends on the world rendering at all.
 *
 * Real text inside a live region, and never colour alone — a chip that said
 * "gone" only by turning an avatar grey would be invisible to a screen reader
 * and ambiguous to a colourblind viewer.
 *
 * Renders nothing at all for a connected player: this sits inside dense roster
 * rows, and a permanent "OK" badge on everyone would cost more than it says.
 */
export default function PlayerConnection({ playerId }: { playerId: string }) {
  const state = useConnectionState(playerId);
  if (state === 'connected') return null;

  const reconnecting = state === 'reconnecting';
  return (
    <span
      data-testid="connection-chip"
      data-state={state}
      role="status"
      aria-live="polite"
      className={
        'shrink-0 rounded-full px-1.5 py-0.5 font-display text-[10px] font-semibold ' +
        'uppercase tracking-[0.14em] ' +
        (reconnecting ? 'bg-warning/15 text-warning' : 'bg-haze/40 text-ink-mute')
      }
    >
      {reconnecting ? 'Reconnecting…' : 'Dropped'}
    </span>
  );
}
```

- [ ] **Step 2: Put it on the track readout**

In `components/TrackReadout.tsx`:

- add `import PlayerConnection from './PlayerConnection';`
- inside the `<li>`, immediately after the `{off && (…)}` block and before the
  closing `</li>`, add:

```tsx
                <PlayerConnection playerId={s.player_id} />
```

- [ ] **Step 3: Put it on the lobby roster**

In `components/LobbyView.tsx`:

- add `import PlayerConnection from '@/components/PlayerConnection';`
- inside the roster `<li>`, immediately after the
  `{p.is_host && (<span …>{p.is_playing ? 'Host' : 'MC'}</span>)}` block, add:

```tsx
              <PlayerConnection playerId={p.id} />
```

- [ ] **Step 4: Verify live, headed**

Run `npm run dev`. Open a host in one browser profile and a joiner in another,
both on `/room/<CODE>`. Close the joiner's tab.

Expected: within a second or two the host's starting-grid entry for the joiner
shows **Reconnecting…**. Re-open the joiner's tab on the same profile: the chip
disappears.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
npm run lint
git add components/PlayerConnection.tsx components/TrackReadout.tsx components/LobbyView.tsx
git commit -m "feat(p3a): a dropped racer says so, in text"
```

---

## Task 5: Reclaim

**Files:**
- Modify: `supabase/migrations/0009_presence.sql` (append; the file stays
  idempotent and is re-applied)
- Modify: `scripts/smoke.mjs`
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: `player_dropped(p players)` (Task 1).
- Produces:
  - `join_room` no longer raises `game already started`. On a room whose status
    is not `lobby` it returns
    `{ room_id, player_id, player_key, player, reclaimed: boolean }`, and it
    raises `the race has finished` on a finished room.
  - `JoinResult` in `lib/types.ts`.

- [ ] **Step 1: Write the failing smoke assertions**

In `scripts/smoke.mjs`, **first fix the now-wrong existing assertion.** Replace
line ~133:

```js
await rpcFails('join_room', { p_code: g.code, p_nickname: 'Late', p_avatar: 'cat', p_color: '#fff' }, /already started/i);
```

with:

```js
// M3 P3a opened this door: a mid-game join is a late join, not a rejection.
// The behaviour is asserted in full in the P3a reclaim/late-join sections.
const gLate = await rpc('join_room',
  { p_code: g.code, p_nickname: 'Late', p_avatar: 'cat', p_color: '#fff' });
assert.equal(gLate.player.is_playing, false, 'a late joiner spectates first');
assert.equal(gLate.player.joined_late, true);
```

Then append to the P3a section from Task 1, before its `console.log`:

```js
// -- reclaim: the same nickname takes the run back, but only once dropped
const rc = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
const rcHost = await rpc('join_room', {
  p_code: rc.code, p_nickname: 'Marshal', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: rc.host_key, p_is_playing: false,
});
const rcA = await rpc('join_room', {
  p_code: rc.code, p_nickname: 'Ghost', p_avatar: 'duck', p_color: '#38bdf8',
});
const rcB = await rpc('join_room', {
  p_code: rc.code, p_nickname: 'Anchor', p_avatar: 'cat', p_color: '#a78bfa',
});
await rpc('start_game', { p_room_id: rc.room_id, p_host_key: rc.host_key });
await rpc('advance_phase', { p_room_id: rc.room_id, p_host_key: rc.host_key }); // read
const rcRead = await rpc('advance_phase', { p_room_id: rc.room_id, p_host_key: rc.host_key });
assert.equal(rcRead.phase, 'answer');

// Ghost scores, then vanishes.
const rcDraw = await rpc('get_room_draw', { p_room_id: rc.room_id, p_host_key: rc.host_key });
const rcCorrect = rcDraw.questions[0].correct_index;
await rpc('submit_answer', {
  p_room_id: rc.room_id, p_player_key: rcA.player_key, p_round: 1, p_choice_index: rcCorrect,
});

// Still connected as far as the server knows: the nickname is taken.
await rpcFails('join_room',
  { p_code: rc.code, p_nickname: 'Ghost', p_avatar: 'duck', p_color: '#38bdf8' },
  /nickname taken/i);

for (let i = 0; i < 20; i++) {
  await rpc('report_presence', {
    p_room_id: rc.room_id, p_host_key: rc.host_key,
    p_present: [rcHost.player_id, rcB.player_id],
  });
}

const rcBack = await rpc('join_room', {
  p_code: rc.code, p_nickname: 'Ghost', p_avatar: 'robot', p_color: '#ffffff',
});
assert.equal(rcBack.reclaimed, true, 'the run was reclaimed, not restarted');
assert.equal(rcBack.player_id, rcA.player_id, 'the SAME player row');
assert.equal(rcBack.player_key, rcA.player_key, 'and the same key, so the session works');
assert.equal(rcBack.player.absent_reports, 0, 'back in the room');

// The score survived the drop, untouched.
await rpc('advance_phase', { p_room_id: rc.room_id, p_host_key: rc.host_key }); // reveal
const rcTrack = await rpc('advance_phase', { p_room_id: rc.room_id, p_host_key: rc.host_key });
assert.equal(rcTrack.phase, 'track');
assert.equal(rcTrack.payload.find(s => s.nickname === 'Ghost').correct, 1,
  'a reclaimed run keeps every answer it had');

// A reclaimed player is a normal racer again, and the nickname re-locks.
await rpcFails('join_room',
  { p_code: rc.code, p_nickname: 'Ghost', p_avatar: 'duck', p_color: '#38bdf8' },
  /nickname taken/i);

// A finished room takes nobody at all.
await rpc('end_game', { p_room_id: rc.room_id, p_host_key: rc.host_key });
await rpcFails('join_room',
  { p_code: rc.code, p_nickname: 'Latecomer', p_avatar: 'cat', p_color: '#fff' },
  /race has finished/i);
```

- [ ] **Step 2: Run it and watch it fail**

```
node scripts/smoke.mjs
```

Expected: FAIL at the first mid-game `join_room` with
`join_room: game already started`.

- [ ] **Step 3: Append `join_room` to the migration**

Append to `supabase/migrations/0009_presence.sql`:

```sql
-- ============ join_room ============
-- THE DOOR OPENS (ADR-0050). 0002's flat `status <> 'lobby' -> raise` becomes
-- two arms of one function, because the two mid-game cases differ by exactly
-- one nickname lookup:
--
--   RECLAIM   an existing nickname whose player the server can see is gone.
--             The SAME row is returned — same id, same player_key, same
--             answers — so the browser that reclaims it simply is that racer
--             again. Task 6 adds nothing here.
--   LATE JOIN anything else: a new player, spectating, flagged joined_late.
--             Materialised by advance_phase at the next round start (Task 6).
--
-- THE RECLAIM GATE IS `player_dropped`, AND THAT IS THE WHOLE SECURITY MODEL.
-- Reclaim hands out an existing player_key on a nickname match, so it must be
-- impossible while that player is demonstrably still connected — otherwise
-- anyone in the room could take over anyone else's run by typing their name.
-- Twenty consecutive missed host reports is the bar. PRD §9 asks for exactly
-- this ("can rejoin with the same nickname to reclaim their run") and the room
-- code is already a shared secret, so a party-game threat model is the right
-- one; see ADR-0050 for what this deliberately does NOT protect.
--
-- The host's OWN key is never handed out. A host who loses their localStorage
-- can reclaim their player row like anyone else and will come back as an
-- ordinary racer; recovering host authority from a lost session is out of
-- scope for M3 and is not attempted here.
create or replace function join_room(
  p_code text, p_nickname text, p_avatar text, p_color text,
  p_host_key uuid default null, p_is_playing boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_player players;
  v_is_host boolean := false;
  v_nick text := trim(p_nickname);
  v_reclaimed boolean := false;
begin
  select * into v_room from rooms where code = upper(p_code);
  if not found then raise exception 'room not found'; end if;
  if v_room.status = 'finished' then raise exception 'the race has finished'; end if;
  if length(v_nick) < 1 or length(v_nick) > 20 then
    raise exception 'nickname must be 1-20 characters';
  end if;

  -- Validated before the branch, so a wrong host key is rejected rather than
  -- quietly ignored by the mid-game arm.
  if p_host_key is not null then
    if p_host_key <> v_room.host_key then raise exception 'invalid host key'; end if;
    v_is_host := true;
  end if;

  if v_room.status <> 'lobby' then
    select * into v_player from players
      where room_id = v_room.id and nickname = v_nick;

    if found then
      if not player_dropped(v_player) then raise exception 'nickname taken'; end if;
      -- Avatar and colour are deliberately NOT overwritten: the room has been
      -- watching this racer's colours on the track all game, and a reclaim is
      -- the same racer returning, not a new one.
      update players set absent_reports = 0
        where id = v_player.id returning * into v_player;
      v_reclaimed := true;
    else
      insert into players (room_id, nickname, avatar, color, is_host, is_playing, joined_late)
      values (v_room.id, v_nick, p_avatar, p_color, false, false, true)
      returning * into v_player;
    end if;

    return jsonb_build_object(
      'room_id', v_room.id, 'player_id', v_player.id,
      'player_key', v_player.player_key, 'player', player_public(v_player),
      'reclaimed', v_reclaimed);
  end if;

  begin
    insert into players (room_id, nickname, avatar, color, is_host, is_playing)
    values (v_room.id, v_nick, p_avatar, p_color, v_is_host,
            case when v_is_host then p_is_playing else true end)
    returning * into v_player;
  exception when unique_violation then
    raise exception 'nickname taken';
  end;

  return jsonb_build_object(
    'room_id', v_room.id, 'player_id', v_player.id,
    'player_key', v_player.player_key, 'player', player_public(v_player),
    'reclaimed', false);
end $$;

grant execute on all functions in schema public to anon, authenticated;
```

- [ ] **Step 4: Re-apply and reload**

```bash
docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/0009_presence.sql
docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
node scripts/smoke.mjs
```

Expected: every section passes, including the new reclaim assertions.

- [ ] **Step 5: Name the join result in TypeScript**

Append to `lib/types.ts`:

```ts
/**
 * What `join_room` returns (M3 P3a).
 *
 * `reclaimed` is true when an existing dropped player's run was handed back
 * rather than a new player created — the caller's session is that racer's
 * session, answers and all (ADR-0050).
 */
export interface JoinResult {
  room_id: string;
  player_id: string;
  player_key: string;
  player: PlayerPublic;
  /** Absent against a pre-0009 database, where every join was a new player. */
  reclaimed?: boolean;
}
```

Then, in `components/JoinGate.tsx`, type the RPC result and use it — replace the
body of `join()`'s success path:

```tsx
    if (err) { setError(err.message); setBusy(false); return; }
    const result = data as JoinResult;
    saveSession(code, {
      roomId: result.room_id, playerId: result.player_id, playerKey: result.player_key,
    });
    onJoined();
```

and add `import type { JoinResult } from '@/lib/types';` at the top.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit
npm run lint
npm test
git add supabase/migrations/0009_presence.sql scripts/smoke.mjs lib/types.ts components/JoinGate.tsx
git commit -m "feat(p3a): a dropped racer can reclaim their run"
```

---

## Task 6: Late join

**Files:**
- Modify: `supabase/migrations/0009_presence.sql` (append)
- Modify: `scripts/smoke.mjs`
- Modify: `components/LobbyView.tsx`
- Modify: `components/TrackReadout.tsx`
- Modify: `components/GameView.tsx`

**Interfaces:**
- Consumes: `join_room`'s late-join arm (Task 5); `PlayerPublic.joined_late`
  (Task 1).
- Produces:
  - `materialize_late_joiners(p_room_id uuid) -> void`
  - `advance_phase` calls it whenever it opens a READ inside the drawn track
  - `start_game` clears `joined_late` and `absent_reports` for the whole room

- [ ] **Step 1: Write the failing smoke assertions**

Append to the P3a section in `scripts/smoke.mjs`, before its `console.log`:

```js
// -- late join: a spectator until the next round start, then a racer at zero
const lj = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [2, 0, 0, 0],
});
const ljHost = await rpc('join_room', {
  p_code: lj.code, p_nickname: 'Marshal', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: lj.host_key, p_is_playing: false,
});
const ljA = await rpc('join_room', {
  p_code: lj.code, p_nickname: 'Early1', p_avatar: 'duck', p_color: '#38bdf8',
});
await rpc('join_room', {
  p_code: lj.code, p_nickname: 'Early2', p_avatar: 'cat', p_color: '#a78bfa',
});
await rpc('start_game', { p_room_id: lj.room_id, p_host_key: lj.host_key });
await rpc('advance_phase', { p_room_id: lj.room_id, p_host_key: lj.host_key }); // read 1
await rpc('advance_phase', { p_room_id: lj.room_id, p_host_key: lj.host_key }); // answer 1

const ljLate = await rpc('join_room', {
  p_code: lj.code, p_nickname: 'Tardy', p_avatar: 'cat', p_color: '#22d3ee',
});
assert.equal(ljLate.reclaimed, false);
assert.equal(ljLate.player.is_playing, false, 'spectator on arrival');
assert.equal(ljLate.player.joined_late, true);

// A spectator may not answer, whatever they try.
await rpcFails('submit_answer',
  { p_room_id: lj.room_id, p_player_key: ljLate.player_key, p_round: 1, p_choice_index: 0 },
  /spectators cannot answer/i);

// ...and is not on the board yet.
const ljRound1 = await rpc('advance_phase', { p_room_id: lj.room_id, p_host_key: lj.host_key });
assert.equal(ljRound1.phase, 'reveal');
assert.equal(ljRound1.payload.standings.filter(s => s.nickname === 'Tardy').length, 0,
  'a spectator is not in the standings');

// The next round start materialises them, at zero.
await rpc('advance_phase', { p_room_id: lj.room_id, p_host_key: lj.host_key }); // track 1
const ljRead2 = await rpc('advance_phase', { p_room_id: lj.room_id, p_host_key: lj.host_key });
assert.equal(ljRead2.phase, 'read');
assert.equal(ljRead2.round, 2);
const ljState = await rpc('get_room_state', { p_code: lj.code });
const tardy = ljState.players.find(p => p.nickname === 'Tardy');
assert.equal(tardy.is_playing, true, 'materialised at the round start');
assert.equal(tardy.joined_late, true, 'and still marked, per PRD §4');

// They race round 2 like anybody else.
await rpc('advance_phase', { p_room_id: lj.room_id, p_host_key: lj.host_key }); // answer 2
await rpc('submit_answer', {
  p_room_id: lj.room_id, p_player_key: ljLate.player_key, p_round: 2, p_choice_index: 0,
});
const ljReveal2 = await rpc('advance_phase', { p_room_id: lj.room_id, p_host_key: lj.host_key });
assert.ok(ljReveal2.payload.standings.some(s => s.nickname === 'Tardy'),
  'a materialised late joiner is on the board');

// The MC never joined late and is never materialised — is_playing stays false.
assert.equal(ljState.players.find(p => p.nickname === 'Marshal').is_playing, false,
  'a deliberate MC is not a late joiner');
assert.equal(ljState.players.find(p => p.id === ljA.player_id).joined_late, false);

// A new race clears the mark.
await rpc('advance_phase', { p_room_id: lj.room_id, p_host_key: lj.host_key }); // track 2
await rpc('advance_phase', { p_room_id: lj.room_id, p_host_key: lj.host_key }); // results
await rpc('rematch', {
  p_room_id: lj.room_id, p_host_key: lj.host_key,
  p_timer_seconds: null, p_categories: null, p_tier_counts: null,
});
await rpc('start_game', { p_room_id: lj.room_id, p_host_key: lj.host_key });
const ljFresh = await rpc('get_room_state', { p_code: lj.code });
assert.equal(ljFresh.players.find(p => p.nickname === 'Tardy').joined_late, false,
  'nobody joined THIS race late');
```

- [ ] **Step 2: Run it and watch it fail**

```
node scripts/smoke.mjs
```

Expected: FAIL at
`AssertionError … 'materialised at the round start'` — `is_playing` is still
false, because nothing materialises anyone yet.

- [ ] **Step 3: Append the materialisation to the migration**

Append to `supabase/migrations/0009_presence.sql`:

```sql
-- ============ materialize_late_joiners ============
-- PRD §4: a late joiner "materializes on the track at the start of the next
-- round with 0 correct answers". Nothing else changes about them — the mark
-- stays, because the room is meant to see it.
create or replace function materialize_late_joiners(p_room_id uuid) returns void
language sql volatile set search_path = public as $$
  update players set is_playing = true
    where room_id = p_room_id and joined_late and not is_playing;
$$;

-- ============ advance_phase ============
-- Byte-identical to 0007_the_tiebreak.sql except for ONE added block, marked
-- below.
create or replace function advance_phase(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_phase text;
  v_round int;
  v_status text := 'playing';
  v_ends timestamptz;
  v_contenders uuid[];
  v_winner uuid;
  v_is_tiebreak boolean;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status = 'finished' then raise exception 'game finished'; end if;
  if v_room.status <> 'playing' then raise exception 'game not started'; end if;

  v_round := v_room.current_round;
  v_is_tiebreak := v_room.sudden_death_round is not null
    and v_room.current_round = v_room.sudden_death_round;

  case v_room.phase
    when 'countdown' then v_phase := 'read';
    when 'read'      then v_phase := 'answer';
    when 'answer' then
      v_phase := 'reveal';
      if v_is_tiebreak then
        select a.player_id into v_winner
        from answers a
        where a.room_id = p_room_id
          and a.round = v_room.sudden_death_round
          and a.is_correct
          and a.player_id = any(v_room.sudden_death_contenders)
        order by a.time_remaining_ms desc, a.player_id asc
        limit 1;
        update rooms set sudden_death_winner_id = v_winner where id = p_room_id;
      end if;
    when 'reveal' then
      if v_is_tiebreak then
        v_phase := 'results'; v_status := 'finished';
      else
        v_phase := 'track';
      end if;
    when 'track' then
      if v_room.current_round >= v_room.total_rounds then
        v_contenders := perfect_first_place_tie(p_room_id, v_room.total_rounds);
        if v_room.sudden_death_round is null
           and v_room.reserve_question_id is not null
           and coalesce(array_length(v_contenders, 1), 0) >= 2 then
          v_phase := 'read';
          v_round := v_room.total_rounds + 1;
          insert into room_questions (room_id, round, question_id)
          values (p_room_id, v_round, v_room.reserve_question_id)
          on conflict (room_id, round) do update set question_id = excluded.question_id;
          update rooms set sudden_death_round = v_round,
            sudden_death_contenders = v_contenders
          where id = p_room_id;
        else
          v_phase := 'results'; v_status := 'finished';
        end if;
      else
        v_phase := 'read'; v_round := v_room.current_round + 1;
      end if;
    else raise exception 'cannot advance from phase %', v_room.phase;
  end case;

  -- ===== M3 P3a: the ONLY change from 0007 =====
  -- A READ inside the drawn track is a round start, and PRD §4 says that is
  -- when a late joiner materialises. The `v_round <= total_rounds` bound is
  -- what excludes the TIEBREAK: it sits one round past the finish line and
  -- belongs to the contenders (ADR-0043), so a spectator must not walk into it.
  --
  -- skip_question deliberately does NOT do this. A skip REUSES the round number
  -- (ADR-0038) — it is the same round with a different question, already under
  -- way for everybody else — so a late joiner waits for the next real one.
  if v_phase = 'read' and v_round <= v_room.total_rounds then
    perform materialize_late_joiners(p_room_id);
  end if;
  -- ===== end of the change =====

  v_ends := case v_phase
    when 'read'    then now() + interval '3 seconds'
    when 'answer'  then now() + make_interval(secs => v_room.timer_seconds)
    when 'reveal'  then now() + interval '5 seconds'
    when 'track'   then now() + interval '4 seconds'
    when 'results' then now() + make_interval(secs => ceremony_ms()::double precision / 1000)
    else null
  end;

  update rooms set phase = v_phase, current_round = v_round,
    status = v_status, phase_ends_at = v_ends
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ start_game ============
-- Byte-identical to 0002_rpcs.sql except for ONE added statement.
--
-- A new race means nobody joined THIS one late and nobody has missed a report
-- of it yet. It matters most after a rematch (ADR-0046), which returns the room
-- to the lobby with last race's players still carrying last race's marks.
create or replace function start_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_players int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status <> 'lobby' then raise exception 'game already started'; end if;
  select count(*) into v_players from players where room_id = p_room_id and is_playing;
  if v_players < 2 then raise exception 'need at least 2 players'; end if;

  -- M3 P3a: the only change from 0002.
  update players set joined_late = false, absent_reports = 0 where room_id = p_room_id;

  update rooms set status = 'playing', phase = 'countdown', current_round = 1,
    phase_ends_at = now() + interval '3 seconds'
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

grant execute on all functions in schema public to anon, authenticated;
```

- [ ] **Step 4: Re-apply, reload, run the smoke test**

```bash
docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/0009_presence.sql
docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
node scripts/smoke.mjs
```

Expected: every section passes, including the whole late-join block.

- [ ] **Step 5: Mark the late joiner on every readable surface**

In `components/LobbyView.tsx`, inside the roster `<li>` immediately after the
`<PlayerConnection …/>` added in Task 4:

```tsx
              {p.joined_late && (
                <span
                  data-testid="late-badge"
                  className="shrink-0 rounded-full bg-neon-cyan/15 px-1.5 py-0.5
                    font-display text-[10px] font-semibold uppercase tracking-[0.14em]
                    text-neon-cyan"
                >
                  Joined late
                </span>
              )}
```

In `components/TrackReadout.tsx`, the rail is built from `standings`, which
carries no `joined_late` — look the player up in the store. Add near the other
selectors:

```tsx
  const players = useGameStore(s => s.players);
```

and inside the `<li>`, immediately after `<PlayerConnection …/>`:

```tsx
                {players.find(p => p.id === s.player_id)?.joined_late && (
                  <span
                    data-testid="late-badge"
                    className="shrink-0 text-xs font-bold text-neon-cyan"
                    title="Joined after the race started"
                  >
                    late
                  </span>
                )}
```

In `components/GameView.tsx`, the late joiner needs to be told *why* they are
watching. `spectating` is already true for them (it is `!is_playing`, resolved
in `lib/staging/staging.ts`), so this is a copy change on the existing block.
Add near the other selectors:

```tsx
  const players = useGameStore(s => s.players);
  const joinedLate = !!players.find(p => p.id === myId)?.joined_late;
```

and replace the `spectating && room.phase === 'answer'` paragraph's contents:

```tsx
          {spectating && room.phase === 'answer' && (
            <p className="text-center text-sm text-ink-mute">
              {suddenDeath
                ? 'This one is between the tied racers.'
                : joinedLate
                  ? 'You’re in from the next question — watch this one.'
                  : 'You’re watching this one.'}
            </p>
          )}
```

**Note on `myId`:** `GameView` already computes it as
`loadSession(code)?.playerId ?? null`. Reuse that binding; do not add a second.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit
npm run lint
npm test
git add supabase/migrations/0009_presence.sql scripts/smoke.mjs components/LobbyView.tsx components/TrackReadout.tsx components/GameView.tsx
git commit -m "feat(p3a): a late joiner spectates, then races from the next round"
```

---

## Task 7: Two-context coverage, the ADRs, and the record

**Files:**
- Create: `e2e/presence.spec.ts`
- Create: `docs/ADR/0049-presence-is-reported-by-the-host.md`
- Create: `docs/ADR/0050-the-door-reopens-inside-join-room.md`
- Modify: `docs/ADR/README.md`
- Modify: `docs/progress/CURRENT.md`
- Create: `docs/progress/M3-P3a-presence-and-the-open-door.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code. This task is the proof and the record.

- [ ] **Step 1: Write the Playwright spec**

Create `e2e/presence.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

/**
 * Two contexts throughout. A drop is only observable from SOMEBODY ELSE'S
 * browser, which is the one thing a single-context test cannot show.
 *
 * WHAT IS DELIBERATELY NOT HERE: reclaim-by-nickname. Its gate is twenty
 * consecutive host reports at three seconds apiece — a real minute of wall
 * clock — so it is covered at the SQL level in scripts/smoke.mjs, which can
 * call report_presence twenty times in a loop. What IS covered here is the
 * path a real player actually takes: a reload, which keeps localStorage and so
 * never needs reclaim at all.
 */
async function createRoom(host: Page, questions: number, timerSeconds: number) {
  await host.goto('/host/new');

  const minusButtons = host.getByRole('button', { name: '−' });
  const clicksPerTier = [4 - questions, 4, 3, 1];
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minusButtons.nth(i).click();
  }
  await expect(host.getByText(new RegExp(`^${questions} questions`))).toBeVisible();

  const timerSlider = host.locator('input[type=range]');
  await timerSlider.evaluate((el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(timerSeconds));
  await expect(host.getByText(`Answer timer: ${timerSeconds}s`)).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill('Hosty');
  await host.getByRole('button', { name: /create room/i }).click();
  await expect(host).toHaveURL(/\/host\/[A-Z0-9]{5}\/review$/);
  await host.getByRole('button', { name: /open the lobby/i }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  return host.url().split('/').pop()!;
}

async function join(page: Page, code: string, nickname: string) {
  await page.goto(`/room/${code}`);
  await page.getByPlaceholder('Your nickname').fill(nickname);
  await page.getByRole('button', { name: 'Join game' }).click();
}

test('a racer who leaves the lobby shows as reconnecting on everybody else’s screen', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  const code = await createRoom(host, 2, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await join(joiner, code, 'Vanisher');

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await expect(host.getByTestId('connection-chip')).toHaveCount(0);

  // The tab dies. Presence leaves the channel within the socket's own timeout.
  await joinerContext.close();

  const chip = host.getByTestId('connection-chip');
  await expect(chip).toHaveCount(1, { timeout: 30_000 });
  await expect(chip).toHaveAttribute('data-state', 'reconnecting');
  await expect(chip).toHaveText(/reconnecting/i);
});

test('a mid-game reload keeps the racer, their key and their score', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const host = page;
  const code = await createRoom(host, 2, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await join(joiner, code, 'Reloader');

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  const options = joiner.getByTestId('answer-option');
  await expect(options.first()).toBeEnabled({ timeout: 30_000 });
  await options.first().click();
  await expect(options.first()).toHaveAttribute('data-locked', 'true');

  // The tab reloads. localStorage survives, so there is no JoinGate to pass
  // and no reclaim to perform — the session simply still works.
  await joiner.reload();
  await expect(joiner.getByPlaceholder('Your nickname')).toHaveCount(0);
  await expect(joiner.getByTestId('stage-shell')).toBeVisible({ timeout: 30_000 });

  // The lock the server holds is restored, not lost.
  await expect(joiner.getByTestId('answer-option').first())
    .toHaveAttribute('data-locked', 'true', { timeout: 30_000 });

  // And nobody thinks they are gone.
  await expect(host.getByTestId('connection-chip')).toHaveCount(0, { timeout: 30_000 });

  await joinerContext.close();
});

test('a browser arriving at round 2 spectates, then races marked late', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const host = page;
  // Three questions and a short timer so round 2 arrives inside the budget.
  const code = await createRoom(host, 3, 5);

  const earlyContext = await browser.newContext();
  const early = await earlyContext.newPage();
  await join(early, code, 'Early');

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  // Wait for a live question so the room is provably past the lobby.
  await expect(early.getByTestId('answer-option').first()).toBeEnabled({ timeout: 30_000 });

  const lateContext = await browser.newContext();
  const late = await lateContext.newPage();
  await join(late, code, 'Tardy');

  // A late joiner is a spectator: the options never become enabled for them,
  // and the surface says why.
  await expect(late.getByText(/in from the next question/i)).toBeVisible({ timeout: 30_000 });

  // ...and by the next round they are racing.
  await expect(late.getByTestId('answer-option').first()).toBeEnabled({ timeout: 60_000 });
  await expect(late.getByText('Q2/3')).toBeVisible();

  // The mark survives, on the readable layer, on somebody else's screen.
  await expect(host.getByTestId('late-badge').first()).toBeVisible({ timeout: 60_000 });

  await lateContext.close();
  await earlyContext.close();
});
```

- [ ] **Step 2: Run it, headed**

```
npx playwright test e2e/presence.spec.ts --workers=1 --headed
```

Expected: 3 passed. If the late-join test times out waiting for `Q2/3`, check
first that `advance_phase` really materialises — `node scripts/smoke.mjs` is the
faster diagnosis.

- [ ] **Step 3: Run the whole floor**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run test:e2e -- --workers=1
```

Expected: silent, zero problems, all unit tests pass, a clean build, and the
whole Playwright suite green. **`--workers=1` is required** — `--workers=2`
fails reproducibly on this machine from an untouched `main` (CURRENT.md).

- [ ] **Step 4: Write ADR-0049**

Create `docs/ADR/0049-presence-is-reported-by-the-host.md`:

```markdown
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
  entire consumer.
- Anything that adds a new player-facing "is this racer here?" surface must go
  through `connectionState` in `lib/presence.ts`, never read
  `absent_reports` directly — the presence half of the answer is the half that
  is live.
```

- [ ] **Step 5: Write ADR-0050**

Create `docs/ADR/0050-the-door-reopens-inside-join-room.md`:

```markdown
# ADR-0050: The door reopens inside `join_room` — reclaim and late join are one function

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P3a — Presence & the open door

## Context

`join_room` had one line standing between the room and everything PRD §9 and §4
ask for: `if v_room.status <> 'lobby' then raise exception 'game already
started'`. Two different features have to get past it — a dropped racer
reclaiming their run, and a browser arriving mid-race as a late joiner — and
they differ from each other by exactly one nickname lookup.

The alternative was two new RPCs (`reclaim_player`, `join_late`), which would
have duplicated the room lookup, the nickname validation, the unique-violation
handling and the return shape three ways, and forced `JoinGate` to choose
between them before it knows which case it is in.

## Decision

One function, two arms behind the existing status check.

- **Reclaim:** the nickname already exists in this room AND `player_dropped()`
  is true. The *same* `players` row is returned — same id, same `player_key`,
  same answers — with `absent_reports` reset. Avatar and colour are deliberately
  not overwritten: the room has been watching those colours all race.
- **Late join:** anything else. A new player, `is_playing = false`,
  `joined_late = true`, materialised by `advance_phase` at the next READ inside
  the drawn track.

The return shape gains one key, `reclaimed`, so a caller can tell the two apart;
everything else is byte-identical to the lobby arm, so `JoinGate` needs no
second code path.

`status = 'finished'` is now rejected outright (`the race has finished`), which
it never was before — the old check folded it in with "already started".

**The reclaim gate is the whole security model, and it is a party-game model.**
Reclaim hands out an existing `player_key` on a nickname match. It is impossible
while that player is connected, because `player_dropped()` requires twenty
consecutive missed host reports (ADR-0049). It is *not* impossible for somebody
in the room who waits a minute after a racer drops and then types their
nickname. The room code is already a shared secret handed round an office, PRD
§9 asks for reclaim in exactly these words, and the thing at stake is a quiz
score.

The host's own key is never handed out. A host who loses their localStorage
reclaims their player row like anyone else and comes back as an ordinary racer;
recovering *host authority* from a lost session is out of scope for M3.

## Consequences

- **`join_room` no longer raises `game already started`.** One assertion in
  `scripts/smoke.mjs` asserted that rejection and now asserts a late join
  instead. Anything else that depended on a mid-game join failing is wrong now.
- **A reclaimed session is the original session.** No merge, no re-scoring, no
  new row — which is why `answers`' `(room_id, round, player_id)` primary key
  keeps working and why the standings need no special case.
- **`joined_late` outlives materialisation** so PRD §4's "clearly marked" can be
  honoured for the rest of the race. `start_game` clears it, which is what makes
  a rematch (ADR-0046) a clean slate.
- **A skip does not materialise anyone.** `skip_question` reuses the round
  number (ADR-0038), so it is the same round with a different question, already
  under way; a spectator waits for the next real round start.
- **The tiebreak never materialises anyone.** `advance_phase`'s bound is
  `v_round <= total_rounds`, and sudden death sits at `total_rounds + 1`
  (ADR-0043).
```

- [ ] **Step 6: Index the ADRs**

Append two rows to the index table in `docs/ADR/README.md`:

```markdown
| [0049](0049-presence-is-reported-by-the-host.md) | Presence is reported by the host, and "dropped" is a count of missed reports | M3 P3a |
| [0050](0050-the-door-reopens-inside-join-room.md) | The door reopens inside `join_room` — reclaim and late join are one function | M3 P3a |
```

- [ ] **Step 7: Write the phase record and update the tracker**

Create `docs/progress/M3-P3a-presence-and-the-open-door.md` following the shape
of `docs/progress/M3-P2b-the-aftermath.md`: scope, what was built, deviations,
verification results (the exact commands and their output), live-verification
findings, and a "Notes for phases that inherit this work" section that must
carry at minimum:

- `rooms.host_seen_at` exists and is written only by `report_presence`; P3b is
  its consumer.
- The `DROP_REPORTS × PRESENCE_REPORT_MS` hand-mirror between `lib/presence.ts`
  and `0009_presence.sql`, and the two tests that pin it.
- `join_room` no longer raises `game already started`.
- `players.is_playing` now has three distinct meanings — a deliberate MC, an
  unmaterialised late joiner, and (never) a dropped racer — and only
  `joined_late` separates the second from the first.
- The Pixi avatar is untouched by this phase; a canvas treatment for a dropped
  racer is unowned work, not debt.

Then edit `docs/progress/CURRENT.md`:

- "Current phase" becomes `M3 P3a complete → docs/progress/M3-P3a-presence-and-the-open-door.md`
- "Last completed" names P3a; "Next" names **M3 P3b — The vanished host** and
  notes P4 is still independent and unstarted.
- Add a Notes bullet for the `is_playing` three-meanings trap and one for the
  hand-mirrored thresholds.

- [ ] **Step 8: Commit, merge, push, clean up**

```bash
git add e2e/presence.spec.ts docs/ADR/0049-presence-is-reported-by-the-host.md docs/ADR/0050-the-door-reopens-inside-join-room.md docs/ADR/README.md docs/progress/M3-P3a-presence-and-the-open-door.md docs/progress/CURRENT.md
git commit -m "test: two-context coverage for presence; record M3 P3a"
git checkout main
git merge --no-ff <branch>
git push
git worktree remove <path>
git branch -d <branch>
```

- [ ] **Step 9: Apply the migration to the cloud project**

Per CURRENT.md, remote SQL goes through the linked CLI (the `docker exec` path
is local only):

```bash
npx -y supabase@latest db query --linked --file supabase/migrations/0009_presence.sql
```

Then verify by schema rather than by `supabase migration list --linked`, which
understates what is applied:

```bash
npx -y supabase@latest db query --linked --file - <<'SQL'
select
  (select count(*) from information_schema.columns
    where table_name = 'players' and column_name in ('absent_reports','joined_late')) as player_cols,
  (select count(*) from information_schema.columns
    where table_name = 'rooms' and column_name = 'host_seen_at') as room_cols,
  (select count(*) from pg_proc
    where proname in ('report_presence','player_dropped','materialize_late_joiners')) as fns;
SQL
```

Expected: `player_cols = 2`, `room_cols = 1`, `fns = 3`. Record the result in
the progress doc.

---

## Self-review

**Spec coverage.** Roadmap §3 "P3 — Continuity" has five bullets. This plan
covers three in full — presence on the room channel with a "reconnecting"
avatar (Tasks 3–4), player drop with a frozen score and nickname reclaim
(Tasks 1, 5), and late join (Task 6) — and none of host drop or room lifecycle,
which are P3b's, named as such in the header table. Of the exit criteria, "a
player who reloads mid-game reclaims their score" and "a browser joining at
round 5 spectates and races from round 6 marked late" are Task 7's Playwright
tests; "two-context Playwright coverage for the drop and reclaim paths" is Task
7's first two tests plus the smoke-level reclaim, with the reason for that split
written into the spec's own header comment.

**Deliberately not built, and why.** The Pixi avatar gets no dropped-racer
treatment: cross-cutting constraint 2 puts readability in the DOM, the chips
satisfy the requirement there, and a canvas state would be new world work
outside this plan's shape. `TrackReadout` is only mounted during the TRACK beat,
so mid-race the chips are visible for four seconds a round; the lobby roster
carries them continuously. A persistent in-play roster strip is a real idea and
it belongs to P5's polish pass, not here.

**Type consistency.** `connectionState(snap, playerId, absentReports, nowMs)`
has the same argument order in `lib/presence.ts`, `tests/presence.test.ts` and
`lib/usePresence.ts`. `PresenceSnapshot` is `{ present, leftAt }` everywhere.
The SQL `drop_reports()`/`presence_report_ms()` pair maps to
`DROP_REPORTS`/`PRESENCE_REPORT_MS`. `useRoomChannel(code, role)`'s new second
argument is applied at both of its two call sites in the same task that changes
the signature.
</content>
</invoke>

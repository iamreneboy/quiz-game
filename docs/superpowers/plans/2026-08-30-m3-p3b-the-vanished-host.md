# M3 P3b — The Vanished Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A room survives losing the one client that drives it — the show
auto-pauses when the host's tab dies, says so on all three surfaces, resumes the
moment the host comes back, ends gracefully with the standings it has if the
host is gone for five minutes — and rooms stop accumulating forever.

**Architecture:** A departed host cannot call its own RPC, so the roadmap's
hardest question is *who acts*. The answer is **neither** of the two it
suggested outright: the acting client has no authority at all. It is a
**trigger** for a condition the server evaluates against a clock the *host
itself* wrote. `sweep_host_absence(room_id)` takes no key, because it grants
nothing — it pauses only if `rooms.host_seen_at` (P3a's `report_presence`, the
host's own heartbeat) is more than nine seconds stale, and ends the race only
past five minutes. A client with a live host cannot pause a thing with it. The
presence map then picks *one* caller, deterministically and identically on every
client, so N players do not fire N sweeps.

The pause reason is **derived, never stored**: `phase_event` gains one boolean,
`host_absent`, computed from the same `host_seen_at` the sweep reads. That is
why `pause_game`, `resume_game`, `skip_question` and `end_game` are not touched
at all — a stored `paused_reason` would have meant replacing four functions and
keeping a second fact true across every one of them, and it would still have
been wrong for a room that was deliberately paused and *then* lost its host.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase
(Postgres + Realtime), zustand, `motion`, Tailwind v4, Vitest, Playwright.
**No new runtime dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md`
(§3 "P3 — Continuity" is the requirement set; §2 and §4 bind every task).
PRD §9's edge-case table rows "Host disconnects" and "Room lifecycle" are the
behaviour being implemented.

**Parent plan:** `docs/superpowers/plans/2026-08-30-m3-p3a-presence-and-the-open-door.md`.
**P3a must be merged and applied before this plan starts** — every task here
reads `rooms.host_seen_at` and `lib/presence.ts`, both of which P3a creates.

Decisions this plan owns and resolves — including the one roadmap §3 named as
P3's hardest:

| Decision | Resolved as | Where |
|---|---|---|
| **Who pauses a vanished host** | **A remaining client triggers; the server decides.** `sweep_host_absence(room_id)` needs no key because it grants no authority: it acts only on a `host_seen_at` the host itself last wrote, nine seconds stale. Rejected: giving a client the host key (it would then hold *every* host power); a Supabase scheduled function (minute granularity cannot meet "within the presence timeout", and free-tier pg_cron is one more moving part for one predicate). | Task 1, ADR-0051 |
| **Which client triggers it** | **The lowest-sorted present non-host player id**, computed identically on every client from the shared presence map. Pure, unit-tested, no negotiation, no leader-election protocol. The server guard is the real safety; the election is only politeness about call volume. | Task 3, ADR-0051 |
| **How a surface knows WHY it is paused** | **A derived boolean on the wire, `host_absent`** — computed inside `phase_event` from `host_seen_at`, never stored. A room deliberately paused and then abandoned correctly changes its own story. | Task 2, ADR-0052 |
| **When the host auto-resumes** | **From inside the report loop**, immediately after a successful `report_presence`, and only if the room state it holds says `host_absent`. That ordering is the point: the heartbeat that proves the host is back is the same call that must precede the resume, and a deliberate pause is never auto-resumed. | Task 5 |
| **How rooms are purged** | **A statement-level `before insert` trigger on `rooms`** calling `purge_rooms()`. PRD §9 offers "scheduled function or cleanup on access"; this is cleanup on access with no function duplicated and no scheduler to own. | Task 7 |

## Global Constraints

Copied from the roadmap. Every task's requirements implicitly include this
section.

- **Migrations `0010+` follow the house style** — `create or replace function`
  over rewrites, additive columns with defaults, no destructive DDL. A live
  cloud project (`niznfbabmixesfvxlypi`) holds real data behind a live Vercel
  deploy. **`0010_the_vanished_host.sql` must be idempotent**: it is written
  across Tasks 1 and 7 and re-applied after each.
- **The wire stays semantic** (PRD §3.6, §9). This plan opens `phase_event` for
  the fifth time, by exactly one key — `host_absent`, a boolean about the game's
  situation, not about any renderer. It earns the justification ADR-0018,
  ADR-0028, ADR-0037 and ADR-0042 demanded of the first four; that is ADR-0052.
  No new cue and no new broadcast event.
- **Host authority is server-enforced on every command** (roadmap decision 2).
  `sweep_host_absence` is the first mutating RPC with no key, and it is only
  admissible because it grants the caller nothing: read ADR-0051 before adding
  a second one.
- **Freeze-and-shift is the one pause model** (roadmap decision 3). The sweep
  writes the identical rows `pause_game` writes — `status = 'paused'`,
  `paused_remaining_ms`, `phase_ends_at = null`. That reuse is the whole reason
  P0 came first.
- **The Fairness Law is inviolable.** `standings`' sort clause stays
  byte-identical (ADR-0018). The five-minute graceful end goes through the same
  `end_room_now` path `end_game` does, so the standings it lands on are the ones
  the host's own End race button would have produced.
- **The celebration hierarchy extends by exactly zero rungs.** A host vanishing
  is not a moment; it reuses P0's `game-paused` / `game-resumed` cues, both
  `routine`.
- **Rendering separation** (PRD §9): the pause notice is DOM, on all three
  surfaces, through the existing `PauseCard`.
- **Accessibility is an acceptance criterion, not a later pass.** The notice is
  real text in the existing `role="status" aria-live="polite"` region; the
  changed reason must re-announce.
- **No new runtime dependencies.**
- **The regression floor at the end of the phase:** every existing unit test
  plus whatever this plan adds, `npm run lint` clean, `npx tsc --noEmit` silent,
  `npm run test:e2e -- --workers=1` green (**`--workers=1`** — `--workers=2`
  fails reproducibly on this machine from an untouched `main`; CURRENT.md).
- **Local migrations go through `docker exec`, never `npx supabase db query`**
  (CURRENT.md):
  `docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/0010_the_vanished_host.sql`
  then
  `docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"`.
  **Do not run `supabase stop` / `supabase start`.**

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0010_the_vanished_host.sql` | *(new)* `host_absence_pause_ms()`, `host_absence_end_ms()`, `host_absent(rooms)`, `end_room_now()`, `sweep_host_absence()`, `purge_rooms()` + its trigger; replacements for `phase_event`, `get_room_state`, `end_game` |
| `lib/useHostAbsenceSweep.ts` | *(new)* The elected client's 3-second sweep loop |
| `tests/hostAbsence.test.ts` | *(new)* Vitest for `electSweeper` and `isHostAbsent` |
| `lib/presence.ts` | Gains `electSweeper` — pure, alongside the rest of the presence logic |
| `lib/pause.ts` | Gains `isHostAbsent(room)` beside `isPaused` — the client's one reading of the new field |
| `lib/types.ts` | `RoomInfo` and `PhaseEvent` gain `host_absent?: boolean` |
| `lib/store.ts` | `applyPhaseEvent` carries it |
| `lib/useHostPresenceReporter.ts` | Auto-resume, after the heartbeat that earns it |
| `components/PauseCard.tsx` | Two stories, one card |
| `app/room/[code]/page.tsx` | Mounts the sweep |
| `scripts/smoke.mjs` | The integration harness gains a P3b section |
| `e2e/host-absence.spec.ts` | *(new)* Two-context Playwright: the host's tab dies, every other surface pauses, the host returns and the show continues |

---

## Task 1: The sweep

**Files:**
- Create: `supabase/migrations/0010_the_vanished_host.sql`
- Modify: `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `rooms.host_seen_at` and `report_presence` (P3a, `0009_presence.sql`);
  `phase_event`, `get_room_state`, `end_game` as of `0007_the_tiebreak.sql`;
  `ceremony_ms()`.
- Produces:
  - `host_absence_pause_ms() -> int` (9000), `host_absence_end_ms() -> int` (300000)
  - `host_absent(r rooms) -> boolean`
  - `end_room_now(p_room_id uuid) -> rooms` — the finish, extracted from
    `end_game` so two callers share one definition
  - `sweep_host_absence(p_room_id uuid) -> jsonb` — a phase event when it
    changed something, **SQL `null` when it did not**
  - `phase_event` and `get_room_state` gain `host_absent`

- [x] **Step 1: Write the failing smoke assertions**

Append to `scripts/smoke.mjs`, after P3a's section:

```js
// ---- P3b the vanished host ----
// The sweep takes NO host key, because it grants nothing: it acts only on a
// host_seen_at the host itself last wrote (ADR-0051).
assert.equal(await rpc('host_absence_pause_ms', {}), 9_000);
assert.equal(await rpc('host_absence_end_ms', {}), 300_000);

const vh = await rpc('create_room', {
  p_timer_seconds: 20, p_categories: ['fuel'], p_tier_counts: [2, 0, 0, 0],
});
const vhHost = await rpc('join_room', {
  p_code: vh.code, p_nickname: 'Marshal', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: vh.host_key, p_is_playing: false,
});
const vhA = await rpc('join_room', {
  p_code: vh.code, p_nickname: 'Racer1', p_avatar: 'duck', p_color: '#38bdf8',
});
await rpc('join_room', {
  p_code: vh.code, p_nickname: 'Racer2', p_avatar: 'cat', p_color: '#a78bfa',
});

// A room whose host has NEVER reported is not swept: host_seen_at is null, and
// "never checked in" must not read as "vanished" (every pre-0009 room is that).
await rpc('start_game', { p_room_id: vh.room_id, p_host_key: vh.host_key });
assert.equal(await rpc('sweep_host_absence', { p_room_id: vh.room_id }), null,
  'a room with no heartbeat at all is left alone');

// A FRESH heartbeat is likewise no cause to act.
await rpc('report_presence', {
  p_room_id: vh.room_id, p_host_key: vh.host_key, p_present: [vhHost.player_id, vhA.player_id],
});
assert.equal(await rpc('sweep_host_absence', { p_room_id: vh.room_id }), null,
  'a live host is not swept');

let vhState = await rpc('get_room_state', { p_code: vh.code });
assert.equal(vhState.room.status, 'playing');
assert.equal(vhState.room.host_absent, false, 'the host is here');

// Get into a beat with a real deadline so the freeze has something to freeze.
await rpc('advance_phase', { p_room_id: vh.room_id, p_host_key: vh.host_key }); // read
const vhAnswer = await rpc('advance_phase', { p_room_id: vh.room_id, p_host_key: vh.host_key });
assert.equal(vhAnswer.phase, 'answer');
assert.equal(vhAnswer.host_absent, false);

// Now stop reporting and wait past the threshold. This is the ONE wall-clock
// wait in the harness; the five-minute branch is covered by code path rather
// than by a timed test (see the plan's self-review).
await new Promise(r => setTimeout(r, 10_000));

const vhPaused = await rpc('sweep_host_absence', { p_room_id: vh.room_id });
assert.ok(vhPaused, 'a stale host is swept');
assert.equal(vhPaused.status, 'paused');
assert.equal(vhPaused.host_absent, true, 'and the wire says why');
assert.equal(vhPaused.phase, 'answer', 'freeze-and-shift: the beat does not move');
assert.equal(vhPaused.ends_at, null);
assert.ok(vhPaused.paused_remaining_ms > 0, 'the remainder is frozen, not zeroed');

// IDEMPOTENT: a second sweep of an already-paused room changes nothing, and
// must NOT recompute the remainder from the deadline the first one nulled.
assert.equal(await rpc('sweep_host_absence', { p_room_id: vh.room_id }), null,
  'sweeping a paused room is inert');
vhState = await rpc('get_room_state', { p_code: vh.code });
assert.equal(vhState.room.paused_remaining_ms, vhPaused.paused_remaining_ms,
  'the frozen remainder survives a second sweep');

// Answers are refused while paused, exactly as they are for a deliberate pause.
await rpcFails('submit_answer',
  { p_room_id: vh.room_id, p_player_key: vhA.player_key, p_round: 1, p_choice_index: 0 },
  /not accepting answers/i);

// The host comes back: one heartbeat clears host_absent, and the ordinary
// resume_game path takes it from there.
await rpc('report_presence', {
  p_room_id: vh.room_id, p_host_key: vh.host_key, p_present: [vhHost.player_id, vhA.player_id],
});
vhState = await rpc('get_room_state', { p_code: vh.code });
assert.equal(vhState.room.host_absent, false, 'one heartbeat is enough');
assert.equal(vhState.room.status, 'paused', 'but the sweep does not un-pause itself');

const vhResumed = await rpc('resume_game', { p_room_id: vh.room_id, p_host_key: vh.host_key });
assert.equal(vhResumed.status, 'playing');
assert.equal(vhResumed.host_absent, false);
assert.ok(vhResumed.ends_at, 'the deadline is shifted, not replayed');

// A finished room is never swept.
await rpc('end_game', { p_room_id: vh.room_id, p_host_key: vh.host_key });
assert.equal(await rpc('sweep_host_absence', { p_room_id: vh.room_id }), null,
  'a finished room is out of the sweep’s reach');

console.log('✅ P3b host-absence smoke passed');
```

- [x] **Step 2: Run it and watch it fail**

```
node scripts/smoke.mjs
```

Expected: FAIL at `host_absence_pause_ms` with
`Could not find the function public.host_absence_pause_ms in the schema cache`.

- [x] **Step 3: Write the migration**

Create `supabase/migrations/0010_the_vanished_host.sql`:

```sql
-- M3 P3b — the vanished host: auto-pause, auto-resume, the graceful end, and
-- the 24-hour room purge.
--
-- THE WHOLE FILE IS IDEMPOTENT. It is written across two tasks and re-applied
-- after each one.
--
-- Depends on 0009_presence.sql (rooms.host_seen_at, report_presence) and,
-- through the functions it replaces, on 0007_the_tiebreak.sql.

-- ============ thresholds ============
-- Three missed reports at 0009's presence_report_ms(). Short enough that
-- "pauses within the presence timeout" is true, long enough that ordinary
-- network jitter on a phone cannot fake a vanished host.
create or replace function host_absence_pause_ms() returns int
language sql immutable as $$ select 9000 $$;

-- PRD §9: "If the host is gone > 5 min, the room ends gracefully with current
-- standings."
create or replace function host_absence_end_ms() returns int
language sql immutable as $$ select 300000 $$;

-- ============ host_absent ============
-- DERIVED, NEVER STORED (ADR-0052). A stored `paused_reason` would have meant
-- replacing pause_game, resume_game, skip_question and end_game to keep it
-- true, and it would still have been WRONG for the one case that matters most:
-- a room the host paused deliberately and then walked away from. This predicate
-- simply tells the truth at the moment it is asked.
--
-- A null host_seen_at is NOT absence. Every room created before 0009 has one,
-- and "has never checked in" is not "has vanished".
create or replace function host_absent(r rooms) returns boolean
language sql stable set search_path = public as $$
  select r.host_seen_at is not null
     and now() - r.host_seen_at > make_interval(
           secs => host_absence_pause_ms()::double precision / 1000);
$$;

-- ============ phase_event ============
-- THE WIRE'S FIFTH OPENING (ADR-0052). Byte-identical to
-- 0007_the_tiebreak.sql except for ONE added key.
--
-- host_absent is on the wire because no client can compute it. Presence would
-- tell a client the host's SOCKET is gone; it would not tell it whether the
-- server has acted, and it tells a client that has only just subscribed
-- nothing at all. The pause card has to say which of two very different things
-- happened — "the host stopped the clock" or "we lost the host" — on every
-- surface including a television that just powered on.
create or replace function phase_event(v_room rooms) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'phase', v_room.phase,
    'round', v_room.current_round,
    'ends_at', v_room.phase_ends_at,
    'server_now', now(),
    'status', v_room.status,
    'paused_remaining_ms', v_room.paused_remaining_ms,
    'total_rounds', v_room.total_rounds,
    'host_absent', host_absent(v_room),
    'sudden_death', case when v_room.sudden_death_round is null then null else
      jsonb_build_object(
        'round', v_room.sudden_death_round,
        'contenders', to_jsonb(coalesce(v_room.sudden_death_contenders, '{}'::uuid[])),
        'winner_id', v_room.sudden_death_winner_id)
      end,
    'payload', case v_room.phase
      when 'read'    then question_public(v_room.id, v_room.current_round)
      when 'answer'  then question_public(v_room.id, v_room.current_round)
      when 'reveal'  then build_reveal(v_room.id, v_room.current_round)
      when 'track'   then standings(v_room.id, scoring_round(v_room.id, v_room.current_round))
      when 'results' then final_standings(v_room.id, scoring_round(v_room.id, v_room.current_round))
      else null
    end);
$$;

-- ============ get_room_state ============
-- Byte-identical to 0007_the_tiebreak.sql except for the same one added room
-- key. A client that reloads into an abandoned room must land on the right
-- notice, not on the generic one.
create or replace function get_room_state(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
begin
  select * into v_room from rooms where code = upper(p_code);
  if not found then raise exception 'room not found'; end if;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'status', v_room.status,
      'phase', v_room.phase, 'round', v_room.current_round,
      'total_rounds', v_room.total_rounds, 'timer_seconds', v_room.timer_seconds,
      'ends_at', v_room.phase_ends_at, 'server_now', now(),
      'paused_remaining_ms', v_room.paused_remaining_ms,
      'host_absent', host_absent(v_room),
      'sudden_death', case when v_room.sudden_death_round is null then null else
        jsonb_build_object(
          'round', v_room.sudden_death_round,
          'contenders', to_jsonb(coalesce(v_room.sudden_death_contenders, '{}'::uuid[])),
          'winner_id', v_room.sudden_death_winner_id)
        end),
    'players', (
      select coalesce(jsonb_agg(player_public(p) order by p.joined_at), '[]'::jsonb)
      from players p where p.room_id = v_room.id),
    'question', case when v_room.phase in ('read','answer')
      then question_public(v_room.id, v_room.current_round) else null end,
    'reveal', case when v_room.phase in ('reveal','track')
      then build_reveal(v_room.id, v_room.current_round) else null end,
    'standings', case
      when v_room.status = 'lobby' then null
      when v_room.status = 'finished'
        then final_standings(v_room.id, scoring_round(v_room.id, v_room.current_round))
      else standings(v_room.id, scoring_round(v_room.id,
        case when v_room.phase in ('read','answer')
          then v_room.current_round - 1 else v_room.current_round end))
      end);
end $$;

-- ============ end_room_now ============
-- The finish, lifted verbatim out of 0007's end_game so that TWO callers share
-- ONE definition of what ending a race means. The five-minute graceful end must
-- land on exactly the standings the host's own End race button would have
-- produced — extracting it is what makes that true by construction rather than
-- by two bodies staying in step.
--
-- No key check and no status check here: this is the mechanism, not the
-- command. Both callers below do their own authorisation first.
create or replace function end_room_now(p_room_id uuid) returns rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_round int;
begin
  select * into v_room from rooms where id = p_room_id;
  v_round := v_room.current_round;

  -- A round is RESOLVED only once its outcome has been shown. COUNTDOWN, READ
  -- and ANSWER are in flight: their partial answers are discarded exactly as
  -- skip_question discards them, and the standings stop at the previous round.
  if v_room.phase in ('countdown','read','answer') then
    delete from answers where room_id = p_room_id and round = v_round;
    v_round := greatest(0, v_round - 1);
  end if;

  -- total_rounds is deliberately left alone: the size of the draw is a fact
  -- about the room, and moving it here would jump the podium's track metric at
  -- the moment the ceremony starts drawing.
  update rooms set status = 'finished', phase = 'results', current_round = v_round,
    phase_ends_at = now() + make_interval(secs => ceremony_ms()::double precision / 1000),
    paused_remaining_ms = null
  where id = p_room_id returning * into v_room;

  return v_room;
end $$;

-- ============ end_game ============
-- Now a thin command over end_room_now. The guards are unchanged from
-- 0007_the_tiebreak.sql; only the body moved.
create or replace function end_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status not in ('playing','paused') then raise exception 'game not running'; end if;

  return phase_event(end_room_now(p_room_id));
end $$;

-- ============ sweep_host_absence ============
-- THE ONE MUTATING RPC IN THIS PROJECT WITH NO KEY, and ADR-0051 is the whole
-- argument for why that is admissible.
--
-- A departed host cannot call its own RPC, so somebody else must. That somebody
-- is granted NOTHING: this function's authority comes entirely from
-- rooms.host_seen_at, which only the real host key can refresh
-- (report_presence, 0009). A caller whose host is alive cannot pause anything;
-- a caller whose host is dead can do exactly one thing, and it is the thing the
-- host would have done. There is no key to leak, because there is no power to
-- borrow.
--
-- Returns SQL null when nothing changed. The caller broadcasts only on a
-- non-null result, so a herd of sweeps produces at most one phase event.
create or replace function sweep_host_absence(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_gone_ms bigint;
  v_remaining int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found then raise exception 'room not found'; end if;

  -- A lobby has no clock to freeze and a finished room has nothing left to
  -- stop. Both are silent no-ops rather than errors: the sweep runs on a timer
  -- and its callers must never have to special-case a phase.
  if v_room.status not in ('playing','paused') then return null; end if;

  -- Never checked in is not vanished (see host_absent above).
  if v_room.host_seen_at is null then return null; end if;

  v_gone_ms := floor(extract(epoch from (now() - v_room.host_seen_at)) * 1000);

  -- PRD §9: past five minutes the show is over. Through the SAME path the
  -- host's own End race button uses, so the standings are identical.
  if v_gone_ms >= host_absence_end_ms() then
    return phase_event(end_room_now(p_room_id));
  end if;

  if v_gone_ms < host_absence_pause_ms() then return null; end if;

  -- Already stopped. Recomputing the remainder here would read it from the
  -- phase_ends_at the FIRST pause nulled, i.e. 0 — destroying the freeze. This
  -- is the identical trap pause_game guards, for the identical reason.
  if v_room.status = 'paused' then return null; end if;

  -- Freeze-and-shift, byte-for-byte pause_game's (roadmap decision 3). Nothing
  -- about the model changes because the pause was involuntary.
  v_remaining := greatest(0,
    coalesce(ceil(extract(epoch from (v_room.phase_ends_at - now())) * 1000), 0))::int;

  update rooms set status = 'paused', paused_remaining_ms = v_remaining,
    phase_ends_at = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

grant execute on all functions in schema public to anon, authenticated;
```

- [x] **Step 4: Apply it and reload the schema cache**

```bash
docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/0010_the_vanished_host.sql
docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
```

- [x] **Step 5: Run the smoke test**

```
node scripts/smoke.mjs
```

Expected: every earlier section still passes (the `end_game` extraction is
exercised by P0's, P2a's and P2b's sections), then
`✅ P3b host-absence smoke passed`. The run is ~10 seconds longer than before,
by design.

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/0010_the_vanished_host.sql scripts/smoke.mjs
git commit -m "feat(p3b): the server sweeps a vanished host on its own heartbeat"
```

---

## Task 2: `host_absent` reaches the client

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.ts`
- Modify: `lib/pause.ts`
- Modify: `tests/pause.test.ts`

**Interfaces:**
- Consumes: Task 1's `host_absent` key on `phase_event` and `get_room_state`.
- Produces:
  - `RoomInfo.host_absent?: boolean`, `PhaseEvent.host_absent?: boolean`
  - `isHostAbsent(room): boolean` in `lib/pause.ts`
  - `applyPhaseEvent` carries `host_absent` onto the room

- [x] **Step 1: Write the failing test**

Append to `tests/pause.test.ts`:

```ts
import { isHostAbsent } from '@/lib/pause';

describe('isHostAbsent', () => {
  it('is false with no room, and false while playing', () => {
    expect(isHostAbsent(null)).toBe(false);
    expect(isHostAbsent(room({ status: 'playing', host_absent: true }))).toBe(false);
  });

  it('is false for a pause the host issued deliberately', () => {
    expect(isHostAbsent(room({ status: 'paused', host_absent: false }))).toBe(false);
  });

  it('is true only for a paused room whose host has stopped checking in', () => {
    expect(isHostAbsent(room({ status: 'paused', host_absent: true }))).toBe(true);
  });

  it('folds an absent field to false — a pre-0010 database says nothing', () => {
    expect(isHostAbsent(room({ status: 'paused' }))).toBe(false);
  });
});
```

The shared `room()` factory at the top of that file needs the new field to be
assignable; because it spreads `Partial<RoomInfo>`, adding `host_absent` to
`RoomInfo` in Step 3 is enough — no change to the factory.

- [x] **Step 2: Run it and watch it fail**

```
npx vitest run tests/pause.test.ts
```

Expected: FAIL — `"isHostAbsent" is not exported by "lib/pause.ts"`.

- [x] **Step 3: Widen the types**

In `lib/types.ts`, add to `PhaseEvent`, immediately after
`paused_remaining_ms`:

```ts
  /**
   * True when the server has not heard from the host for longer than
   * `host_absence_pause_ms()` (M3 P3b, ADR-0052). DERIVED on every read, never
   * stored — so a room the host paused deliberately and then abandoned
   * correctly changes its own story. Absent against a pre-0010 database, where
   * it folds to false and the pause card falls back to the deliberate wording.
   */
  host_absent?: boolean;
```

and the identical field, with a one-line comment pointing at the same ADR, to
`RoomInfo` immediately after its `paused_remaining_ms`.

- [x] **Step 4: Carry it in the store**

In `lib/store.ts`, inside `applyPhaseEvent`'s `next.room` object, immediately
after the `paused_remaining_ms` line:

```ts
        // Absence is derived server-side on every read (ADR-0052), so a stale
        // value is impossible: whatever the last event said is what was true
        // when the server built it. An absent key folds to false — a pre-0010
        // database has no opinion, and "the host is here" is the safe one.
        host_absent: e.host_absent ?? false,
```

- [x] **Step 5: Read it in `lib/pause.ts`**

Add to `PausableRoom`:

```ts
  host_absent?: boolean;
```

and append the predicate:

```ts
/**
 * Paused BECAUSE the host vanished, rather than because the host said so
 * (ADR-0052).
 *
 * Both halves matter. `host_absent` alone is true for a room that is still
 * running while the host's phone is in a tunnel and the sweep has not yet
 * fired — nothing should be announced there. And a paused room with a present
 * host is P0's deliberate pause, which has its own words.
 */
export function isHostAbsent(
  room: { status: RoomStatus; host_absent?: boolean } | null | undefined,
): boolean {
  return room?.status === 'paused' && room.host_absent === true;
}
```

- [x] **Step 6: Run the test and commit**

```bash
npx vitest run tests/pause.test.ts
npx tsc --noEmit
npm run lint
git add lib/types.ts lib/store.ts lib/pause.ts tests/pause.test.ts
git commit -m "feat(p3b): host_absent on the wire and in the store"
```

---

## Task 3: The election

**Files:**
- Modify: `lib/presence.ts`
- Create: `tests/hostAbsence.test.ts`

**Interfaces:**
- Consumes: `PresenceSnapshot` from P3a.
- Produces:
  `electSweeper(snap: PresenceSnapshot, hostPlayerId: string | null, myPlayerId: string | null): boolean`

- [x] **Step 1: Write the failing test**

Create `tests/hostAbsence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EMPTY_PRESENCE, applyPresence, electSweeper } from '@/lib/presence';

const snapOf = (ids: string[]) => applyPresence(EMPTY_PRESENCE, ids, 1_000);

describe('electSweeper', () => {
  it('elects the lowest-sorted present player who is not the host', () => {
    const snap = snapOf(['host', 'c', 'a', 'b']);
    expect(electSweeper(snap, 'host', 'a')).toBe(true);
    expect(electSweeper(snap, 'host', 'b')).toBe(false);
    expect(electSweeper(snap, 'host', 'c')).toBe(false);
  });

  it('never elects the host itself — the host has its own resume path', () => {
    expect(electSweeper(snapOf(['a', 'host']), 'host', 'host')).toBe(false);
    // Even when the host would sort first.
    expect(electSweeper(snapOf(['aaa', 'zzz']), 'aaa', 'aaa')).toBe(false);
    expect(electSweeper(snapOf(['aaa', 'zzz']), 'aaa', 'zzz')).toBe(true);
  });

  it('elects nobody without a local player id — a stage view never sweeps', () => {
    expect(electSweeper(snapOf(['a', 'b']), 'host', null)).toBe(false);
  });

  it('elects a player who is not in the presence map at all: nobody', () => {
    expect(electSweeper(snapOf(['a', 'b']), 'host', 'ghost')).toBe(false);
  });

  it('elects the only remaining player', () => {
    expect(electSweeper(snapOf(['solo']), 'host', 'solo')).toBe(true);
  });

  it('elects nobody from an empty map', () => {
    expect(electSweeper(EMPTY_PRESENCE, 'host', 'a')).toBe(false);
  });

  it('works when the host id is unknown — every present client is a candidate', () => {
    expect(electSweeper(snapOf(['a', 'b']), null, 'a')).toBe(true);
    expect(electSweeper(snapOf(['a', 'b']), null, 'b')).toBe(false);
  });

  it('agrees with itself across every client, which is the whole point', () => {
    const snap = snapOf(['m', 'host', 'z', 'd']);
    const elected = ['m', 'z', 'd'].filter(id => electSweeper(snap, 'host', id));
    expect(elected).toEqual(['d']);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

```
npx vitest run tests/hostAbsence.test.ts
```

Expected: FAIL — `"electSweeper" is not exported by "lib/presence.ts"`.

- [x] **Step 3: Write the function**

Append to `lib/presence.ts`:

```ts
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
```

`snap.present` is already sorted by `applyPresence`, so `candidates[0]` is the
lowest-sorted candidate; the test's `agrees with itself` case is what pins that.

- [x] **Step 4: Run and commit**

```bash
npx vitest run tests/hostAbsence.test.ts
npx tsc --noEmit
npm run lint
git add lib/presence.ts tests/hostAbsence.test.ts
git commit -m "feat(p3b): one client sweeps, elected from the presence map"
```

---

## Task 4: The sweep loop

**Files:**
- Create: `lib/useHostAbsenceSweep.ts`
- Modify: `app/room/[code]/page.tsx`

**Interfaces:**
- Consumes: `electSweeper` (Task 3); `sweep_host_absence` (Task 1);
  `usePresence`, `PRESENCE_REPORT_MS` (P3a); `useGameStore.applyPhaseEvent`.
- Produces: `useHostAbsenceSweep(channel: RealtimeChannel | null, myPlayerId: string | null): void`

- [x] **Step 1: Write the hook**

Create `lib/useHostAbsenceSweep.ts`:

```ts
'use client';
import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { usePresence } from './usePresence';
import { PRESENCE_REPORT_MS, electSweeper } from './presence';
import type { PhaseEvent } from './types';

/**
 * The remaining players' watch on a vanished host (ADR-0051).
 *
 * Runs on every non-host player's device and does nothing on all but one of
 * them: `electSweeper` picks a single caller from the shared presence map, so a
 * ten-player room makes one call every three seconds, not ten.
 *
 * `sweep_host_absence` returns SQL null when it changed nothing, which is the
 * overwhelmingly common case. Only a non-null result is broadcast, so the wire
 * stays as quiet as it was before this hook existed.
 *
 * The result travels through the SAME broadcast-and-apply path every host
 * command uses (lib/useHostDriver.ts). That is deliberate: there must remain
 * exactly one way game state reaches the room, whoever put it on the wire.
 */
export function useHostAbsenceSweep(
  channel: RealtimeChannel | null,
  myPlayerId: string | null,
): void {
  const roomId = useGameStore(s => s.room?.id ?? null);
  const status = useGameStore(s => s.room?.status ?? null);
  const hostPlayerId = useGameStore(s => s.players.find(p => p.is_host)?.id ?? null);
  const iAmHost = useGameStore(s =>
    !!myPlayerId && s.players.find(p => p.id === myPlayerId)?.is_host === true,
  );

  useEffect(() => {
    if (!channel || !roomId || !myPlayerId || iAmHost) return;
    // A lobby has no clock to freeze and a finished room nothing left to stop.
    if (status !== 'playing' && status !== 'paused') return;

    let live = true;
    const sweep = async () => {
      if (!live) return;
      // Re-read presence each tick rather than closing over it, so the interval
      // keeps its cadence when somebody joins or leaves.
      const snap = usePresence.getState().snapshot;
      if (!electSweeper(snap, hostPlayerId, myPlayerId)) return;

      const { data, error } = await supabase.rpc('sweep_host_absence', { p_room_id: roomId });
      if (error || !data || !live) return;
      const evt = data as PhaseEvent;
      channel.send({ type: 'broadcast', event: 'phase', payload: evt });
      useGameStore.getState().applyPhaseEvent(evt);
    };

    const id = setInterval(() => void sweep(), PRESENCE_REPORT_MS);
    return () => { live = false; clearInterval(id); };
  }, [channel, roomId, status, hostPlayerId, myPlayerId, iAmHost]);
}
```

**Note the deliberate absence of a leading `void sweep()`** before the interval,
unlike the host reporter: an immediate sweep on every mount would fire a burst
of RPCs every time a room's status changes. The threshold is nine seconds; a
first call three seconds in costs nothing.

- [x] **Step 2: Mount it**

In `app/room/[code]/page.tsx`:

- add `import { useHostAbsenceSweep } from '@/lib/useHostAbsenceSweep';`
- immediately after the `useHostPresenceReporter(hostKey);` line added in P3a:

```tsx
  const myPlayerId = typeof window !== 'undefined' ? loadSession(code)?.playerId ?? null : null;
  useHostAbsenceSweep(channel, myPlayerId);
```

The stage route deliberately does not mount it: a TV holds no player id, so it
could never be elected anyway, and a room whose only remaining surface is a
stage view is left paused until somebody arrives — recorded as a known limit in
ADR-0051.

- [x] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npm run lint
npm test
git add lib/useHostAbsenceSweep.ts app/room/\[code\]/page.tsx
git commit -m "feat(p3b): the elected client watches for a vanished host"
```

---

## Task 5: The host comes back

**Files:**
- Modify: `lib/useHostPresenceReporter.ts`

**Interfaces:**
- Consumes: `report_presence` (P3a); `resume_game` (0005); `isHostAbsent`
  (Task 2).
- Produces: no new export. `useHostPresenceReporter` resumes an absence pause
  after the heartbeat that clears it.

- [x] **Step 1: Add the auto-resume**

In `lib/useHostPresenceReporter.ts`, replace the `report` closure and the
effect's dependency list:

```ts
    let live = true;
    const report = async () => {
      if (!live) return;
      const { error } = await supabase.rpc('report_presence', {
        p_room_id: roomId,
        p_host_key: hostKey,
        p_present: usePresence.getState().snapshot.present,
      });
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
```

This needs three new imports and one new parameter. The full signature becomes:

```ts
export function useHostPresenceReporter(
  hostKey: string | null,
  channel: RealtimeChannel | null,
): void
```

with `import type { RealtimeChannel } from '@supabase/supabase-js';`,
`import { isHostAbsent } from './pause';` and
`import type { PhaseEvent } from './types';` added, and `channel` appended to
the effect's dependency array.

- [x] **Step 2: Pass the channel**

In `app/room/[code]/page.tsx`, change the call added in P3a:

```tsx
  useHostPresenceReporter(hostKey, channel);
```

- [x] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npm run lint
npm test
git add lib/useHostPresenceReporter.ts app/room/\[code\]/page.tsx
git commit -m "feat(p3b): a returning host resumes the show it interrupted"
```

---

## Task 6: The card says why

**Files:**
- Modify: `components/PauseCard.tsx`

**Interfaces:**
- Consumes: `isPaused`, `isHostAbsent` (Task 2).
- Produces: `PauseCard` renders two stories, distinguished by
  `data-reason="host" | "absence"`.

- [x] **Step 1: Rewrite the card**

Replace `components/PauseCard.tsx` in full:

```tsx
'use client';
import { useGameStore } from '@/lib/store';
import { isHostAbsent, isPaused } from '@/lib/pause';

/**
 * Why the show stopped (M3 P0, extended in M3 P3b).
 *
 * TWO STORIES, ONE CARD. A deliberate pause is reassuring — somebody is in
 * control and will be back in a moment. An absence pause is not the same
 * message at all, and a room told the wrong one either panics for no reason or
 * waits patiently for a host who is never coming back.
 *
 * The same component on all three surfaces. The stage view is read-only but
 * must still say why nothing is happening, and rendering it inside
 * `[data-surface="stage"]` rescales it for a television with no variant prop —
 * every size here resolves through a theme variable that scope overrides
 * (ADR-0035).
 *
 * Read-only everywhere, host included: the controls live on the strip, so there
 * is exactly one place a command can be issued from. The absence variant offers
 * no button on purpose — there is nothing a player could usefully press, and
 * the room recovers by itself the moment the host's tab comes back
 * (lib/useHostPresenceReporter.ts) or ends itself after five minutes
 * (`sweep_host_absence`).
 */
export default function PauseCard() {
  const room = useGameStore(s => s.room);
  if (!isPaused(room)) return null;

  const absent = isHostAbsent(room);

  return (
    <div
      data-testid="pause-card"
      data-reason={absent ? 'absence' : 'host'}
      className="pointer-events-auto fixed inset-0 z-20 grid place-items-center
        bg-void/70 p-6 backdrop-blur-sm"
    >
      <div
        role="status"
        aria-live="polite"
        className="max-w-md rounded-panel border border-haze bg-night/80 px-8 py-7 text-center"
      >
        <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-warning">
          {absent ? 'Signal lost' : 'Race suspended'}
        </p>
        <p className="mt-2 font-display text-hero font-black text-ink">
          {absent ? 'Host disconnected' : 'Paused'}
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          {absent
            ? 'We’ve lost the host. The race is held exactly where it stopped and picks up the moment they’re back.'
            : 'The host stopped the clock. Nothing is lost — the question resumes exactly where it left off.'}
        </p>
      </div>
    </div>
  );
}
```

**The `key` question.** `aria-live="polite"` announces changed *content*, and
both headline and body change together when a deliberate pause becomes an
absence pause, so no `key` churn is needed — the region re-announces on its own.
Verify this in Step 2 rather than assuming it.

- [x] **Step 2: Verify live, headed**

Run `npm run dev` and open three surfaces on one room: host, a joiner, and
`/stage/<CODE>` — all in separate browser profiles. Start the race, get into an
ANSWER beat, then close the host's tab.

Expected, within ~12 seconds: the joiner and the stage both show the card with
**Host disconnected**, and `data-reason="absence"` in the DOM. Re-open the
host's tab on the same profile at `/room/<CODE>`: within ~3 seconds the card
clears everywhere and the ANSWER beat continues from its frozen remainder — the
ring resumes at the number it froze at, it does not restart.

Then, separately: press Pause on the host's strip and confirm the card reads
**Paused** with `data-reason="host"`, and that nothing auto-resumes it.

- [x] **Step 3: Commit**

```bash
npx tsc --noEmit
npm run lint
git add components/PauseCard.tsx
git commit -m "feat(p3b): the pause card tells the room which pause it is"
```

---

## Task 7: The room purge

**Files:**
- Modify: `supabase/migrations/0010_the_vanished_host.sql` (append)
- Modify: `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `rooms.created_at` (0001).
- Produces: `purge_rooms() -> int` and a statement-level `before insert` trigger
  on `rooms` that calls it.

- [x] **Step 1: Write the failing smoke assertions**

Append to the P3b section in `scripts/smoke.mjs`, before its `console.log`:

```js
// -- the 24-hour purge (PRD §9)
// A fresh room is never swept, however many rooms are created around it.
const keep = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
assert.equal(typeof (await rpc('purge_rooms', {})), 'number',
  'purge_rooms reports how many it took');
const keepState = await rpc('get_room_state', { p_code: keep.code });
assert.equal(keepState.room.code, keep.code, 'today’s room survives');

// Creating a room runs the sweep — that is PRD §9's "cleanup on access".
await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
await rpc('get_room_state', { p_code: keep.code }); // still there afterwards
```

The 24-hour boundary itself cannot be crossed from this harness — the anon role
has no table grants, so `created_at` cannot be backdated through an RPC. Verify
it once by hand instead, in Step 4, and record the result in the progress doc.

- [x] **Step 2: Append the purge to the migration**

Append to `supabase/migrations/0010_the_vanished_host.sql`:

```sql
-- ============ purge_rooms ============
-- PRD §9: "rooms expire and are purged 24h after creation (Supabase scheduled
-- function or cleanup on access)". This is cleanup on access.
--
-- The cascades do all the work: players, room_questions, answers and a room's
-- custom questions (0006's `questions.room_id … on delete cascade`) all go with
-- the row — which is also what finally bounds `rooms.used_question_ids`, the
-- unbounded array M3 P2b left behind.
--
-- Exposed as a plain RPC as well as a trigger so a future pg_cron job, or a
-- host tool, can call it without duplicating the predicate.
create or replace function purge_rooms() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  with gone as (
    delete from rooms where created_at < now() - interval '24 hours' returning 1
  )
  select count(*) into v_n from gone;
  return v_n;
end $$;

create index if not exists idx_rooms_created_at on rooms (created_at);

-- The trigger, rather than a `perform purge_rooms()` inside create_room: that
-- would have meant re-stating 0006's whole 75-line create_room to add one line,
-- and it would have missed rematch and any future room writer. STATEMENT-level,
-- so create_room's code-collision retry loop cannot make it run per row; and it
-- cannot recurse, because a DELETE fires no INSERT trigger.
create or replace function trg_purge_rooms() returns trigger
language plpgsql set search_path = public as $$
begin
  perform purge_rooms();
  return null;
end $$;

drop trigger if exists rooms_purge_expired on rooms;
create trigger rooms_purge_expired
  before insert on rooms
  for each statement
  execute function trg_purge_rooms();

grant execute on all functions in schema public to anon, authenticated;
```

- [x] **Step 3: Re-apply, reload, run the smoke test**

```bash
docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/0010_the_vanished_host.sql
docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
node scripts/smoke.mjs
```

Expected: every section passes.

- [x] **Step 4: Verify the boundary by hand**

The harness cannot backdate a room, so cross the line directly against the local
stack once:

```bash
docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "
  select count(*) as before from rooms;
  update rooms set created_at = now() - interval '25 hours'
    where code = (select code from rooms order by created_at limit 1);
  select purge_rooms() as purged;
  select count(*) as after from rooms;
"
```

Expected: `purged` is at least 1 and `after` is `before` minus that number.
Then confirm the trigger fires on its own:

```bash
docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "
  update rooms set created_at = now() - interval '25 hours';
  select count(*) as stale from rooms;
  insert into rooms (code, timer_seconds, total_rounds) values ('ZZZZY', 10, 1);
  select count(*) as after_insert from rooms;
"
```

Expected: `after_insert` is 1 — every stale room went, and only the new one
remains. Record both outputs in the progress doc.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/0010_the_vanished_host.sql scripts/smoke.mjs
git commit -m "feat(p3b): rooms are purged 24h after creation"
```

---

## Task 8: Two-context coverage, the ADRs, and the record

**Files:**
- Create: `e2e/host-absence.spec.ts`
- Create: `docs/ADR/0051-a-vanished-host-is-swept-by-any-client.md`
- Create: `docs/ADR/0052-the-wires-fifth-opening.md`
- Modify: `docs/ADR/README.md`
- Modify: `docs/progress/CURRENT.md`
- Create: `docs/progress/M3-P3b-the-vanished-host.md`

- [x] **Step 1: Write the Playwright spec**

Create `e2e/host-absence.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

/**
 * The host's own context is created explicitly rather than taken from the
 * `page` fixture, because this spec has to KILL the host's tab and then bring
 * it back with its localStorage intact — the session is what makes it the host,
 * so a fresh context would come back as a stranger.
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

test('losing the host pauses every other surface, and getting them back resumes it', async ({ browser }) => {
  test.setTimeout(180_000);

  const hostContext = await browser.newContext();
  let host = await hostContext.newPage();
  // 20s answers so the freeze has a visible remainder to hold.
  const code = await createRoom(host, 2, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();

  const stageContext = await browser.newContext();
  const stage = await stageContext.newPage();
  await stage.goto(`/stage/${code}`);

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  const options = joiner.getByTestId('answer-option');
  await expect(options.first()).toBeEnabled({ timeout: 30_000 });
  const ringBefore = Number(await joiner.getByRole('timer').innerText());
  expect(ringBefore).toBeGreaterThan(0);

  // The host's tab dies. Its heartbeat stops; the joiner is the only remaining
  // player, so it is the elected sweeper.
  await host.close();

  // The pause lands on every remaining surface, and says WHICH pause it is.
  const joinerCard = joiner.getByTestId('pause-card');
  await expect(joinerCard).toBeVisible({ timeout: 40_000 });
  await expect(joinerCard).toHaveAttribute('data-reason', 'absence');
  await expect(joinerCard).toContainText(/host disconnected/i);

  const stageCard = stage.getByTestId('pause-card');
  await expect(stageCard).toBeVisible({ timeout: 40_000 });
  await expect(stageCard).toHaveAttribute('data-reason', 'absence');

  // FROZEN, not settled: the ring still shows a number, and the same one two
  // seconds later. Answers are refused.
  const ringAtPause = await joiner.getByRole('timer').innerText();
  expect(Number(ringAtPause)).toBeGreaterThan(0);
  await joiner.waitForTimeout(2_000);
  await expect(joiner.getByRole('timer')).toHaveText(ringAtPause);
  await expect(options.first()).toBeDisabled();

  // The host comes back, in the SAME context, so the session is intact.
  host = await hostContext.newPage();
  await host.goto(`/room/${code}`);

  // Its first heartbeat clears host_absent; the resume rides straight behind.
  await expect(joinerCard).toBeHidden({ timeout: 40_000 });
  await expect(stageCard).toBeHidden({ timeout: 20_000 });
  await expect(options.first()).toBeEnabled({ timeout: 20_000 });

  // The beat CONTINUED — it did not replay. The ring picks up at or below where
  // it froze, never back at the top.
  const ringAfter = Number(await joiner.getByRole('timer').innerText());
  expect(ringAfter).toBeLessThanOrEqual(Number(ringAtPause));

  // ...and the round is still the one it was.
  await expect(joiner.getByText('Q1/2')).toBeVisible();

  // The race still finishes normally from here.
  await options.first().click();
  await expect(options.first()).toHaveAttribute('data-locked', 'true');

  await stageContext.close();
  await joinerContext.close();
  await hostContext.close();
});

test('a deliberate pause is never auto-resumed out from under the host', async ({ browser }) => {
  test.setTimeout(120_000);

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  const code = await createRoom(host, 2, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();
  await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 30_000 });

  await host.getByTestId('host-pause').click();

  const card = joiner.getByTestId('pause-card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toHaveAttribute('data-reason', 'host');
  await expect(card).toContainText(/paused/i);

  // Four heartbeats and four sweep ticks later it is still paused, because the
  // host is right there.
  await joiner.waitForTimeout(15_000);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-reason', 'host');

  await host.getByTestId('host-resume').click();
  await expect(card).toBeHidden({ timeout: 20_000 });

  await joinerContext.close();
  await hostContext.close();
});
```

- [x] **Step 2: Run it, headed**

```
npx playwright test e2e/host-absence.spec.ts --workers=1 --headed
```

Expected: 2 passed. If the first test never sees the card, check in order:
`report_presence` was firing before the host closed (devtools network on the
host), then `sweep_host_absence` is firing on the joiner, then that it is
returning non-null (`node scripts/smoke.mjs` isolates the server half).

- [x] **Step 3: Run the whole floor**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run test:e2e -- --workers=1
```

Expected: silent, zero problems, every unit test passing, a clean build, and the
whole Playwright suite green at `--workers=1`.

- [x] **Step 4: Write ADR-0051**

Create `docs/ADR/0051-a-vanished-host-is-swept-by-any-client.md`:

```markdown
# ADR-0051: A vanished host is swept by an elected client against the host's own heartbeat

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P3b — The vanished host

## Context

PRD §9 requires that losing the host auto-pauses the game and that the room ends
gracefully if the host is gone for more than five minutes. The host's client is
the only thing that drives the state machine (PRD §9: no game server), and every
mutating RPC in this project is gated on `host_key` (roadmap decision 2). A
departed host can call nothing.

The roadmap named this "the phase's hardest question" and offered two answers.
Both are wrong on inspection:

- **"The senior remaining client by presence acts."** A remaining client has no
  host key, and giving it one would hand it *every* host power — pause, skip,
  end, rematch — to solve a problem about one of them.
- **"A Supabase scheduled function does."** pg_cron's minute granularity cannot
  meet "pauses within the presence timeout"; it is another moving part to own on
  a free tier; and it would still be evaluating the very same predicate this
  decision evaluates, just later.

## Decision

**The acting client triggers; the server decides.** `sweep_host_absence(room_id)`
takes no key — and needs none, because it grants the caller nothing. Its
authority comes entirely from `rooms.host_seen_at`, which only the real host key
can refresh (`report_presence`, ADR-0049). It pauses only if that timestamp is
more than `host_absence_pause_ms()` (9s, three missed reports) stale, and ends
the race only past `host_absence_end_ms()` (5 min, PRD §9). A caller whose host
is alive can do nothing at all; a caller whose host is dead can do exactly the
one thing the host would have done.

The pause it writes is byte-for-byte `pause_game`'s freeze-and-shift — same
`status`, same `paused_remaining_ms`, same nulled `phase_ends_at` (roadmap
decision 3). It returns SQL `null` when it changed nothing, so a caller
broadcasts at most one phase event.

The graceful end goes through `end_room_now(room_id)`, extracted from `end_game`
so both share one definition. That extraction is what makes "the standings the
host's own End race button would have produced" true by construction.

**Who calls it** is decided by `electSweeper` in `lib/presence.ts`: the
lowest-sorted present player id that is not the host, computed identically on
every client from the shared presence map. No negotiation, no protocol, no extra
traffic. The election is *politeness about call volume, not safety* — the server
guard is the safety, and two clients that disagree for a tick simply produce one
null.

The host's return is handled on the host's own side, not here:
`useHostPresenceReporter` resumes an absence pause immediately after the
heartbeat that clears it, and never resumes a deliberate one (ADR-0052's
`host_absent` is what tells the two apart).

## Consequences

- **This is the project's only mutating RPC with no host key, and the bar for a
  second one is this argument.** A keyless RPC is admissible exactly when the
  caller gains nothing the data did not already entitle anyone to. Anything that
  needs the *caller* to be somebody takes a key.
- **A room whose only remaining surface is a stage view is never swept.** A TV
  holds no player id (ADR-0031) so it can never be elected, and
  `useHostAbsenceSweep` is not mounted there. The room stays paused until a
  player arrives — or, past 24 hours, is purged. Deliberate: making a read-only
  screen a writer would undo ADR-0032.
- **A room with no clients at all is never swept either.** It sits paused or
  playing until the purge takes it. Nothing observes it, so nothing is wrong.
- **Nine seconds is three missed reports.** Lowering it risks a phone on a bad
  connection faking a vanished host; raising it makes the pause feel slow. If
  `presence_report_ms()` ever moves, this threshold has to move with it.
- **The five-minute branch is not covered by a timed test.** It shares
  `end_room_now` with `end_game`, which P0's, P2a's and P2b's smoke sections all
  exercise; only the threshold comparison is untested by execution. That is a
  deliberate trade against a five-minute test.
```

- [x] **Step 5: Write ADR-0052**

Create `docs/ADR/0052-the-wires-fifth-opening.md`:

```markdown
# ADR-0052: The wire's fifth opening — `host_absent`, derived and never stored

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P3b — The vanished host

## Context

M3 P3b gives a room two ways to be paused. One is a host pressing Pause; the
other is the room losing its host. They call for very different words on screen
— "the host stopped the clock, back in a moment" versus "we've lost the host" —
and a room told the wrong one either panics for nothing or waits for somebody
who is never coming back.

No client can work out which is which. Presence would tell a client the host's
*socket* is gone, but not whether the server has acted on it, and it tells a
client that has only just subscribed — a TV that just powered on, a phone that
reloaded — nothing at all. `rooms.host_seen_at` is server-side.

The obvious shape is a stored `paused_reason` column set by whoever paused. It
was rejected for two reasons. It would have meant `create or replace` on
`pause_game`, `resume_game`, `skip_question` and `end_game` purely to keep a
second fact in step across four functions. And it would still have been wrong
for the case that matters most: a host who pauses deliberately and *then* walks
away leaves a room whose stored reason says "host" forever, telling everybody to
sit tight for somebody who has gone.

## Decision

`phase_event` and `get_room_state` gain one key, `host_absent`, computed on
every read by `host_absent(rooms)` from the same `host_seen_at`
`sweep_host_absence` acts on. Nothing is stored and no pause-writing function is
touched.

This is the wire's fifth opening, after ADR-0018 (`picks`, `current_streak`),
ADR-0028 (`answered`, `avg_answer_ms`), ADR-0037 (`status`,
`paused_remaining_ms`, `total_rounds`) and ADR-0042 (`sudden_death`). It earns
the same justification those demanded: it is semantic — a fact about the game's
situation, not about any renderer — and it is not derivable client-side by any
means, which is the test the previous four had to pass.

The client reads it through one predicate, `isHostAbsent(room)` in
`lib/pause.ts`, which requires *both* `status === 'paused'` and
`host_absent === true`. Neither half alone means anything useful: a running room
whose host is briefly in a tunnel should announce nothing, and a paused room
with a present host is P0's deliberate pause.

An absent key folds to `false`. A pre-0010 database has no opinion, and "the
host is here" is the safe guess — it falls back to the wording P0 already
shipped.

## Consequences

- **A room's story can change without the room changing.** A deliberate pause
  becomes an absence pause on the next phase event or state read, with no write
  anywhere. That is the behaviour a stored reason could not give.
- **`host_absent` is only as fresh as the last event.** A client sitting in a
  long pause holds whatever the pausing event said until something else
  broadcasts. In practice the sweep and the resume are both broadcasters, so the
  two transitions that matter each carry their own update.
- **The host's auto-resume depends on reading a *stale* value on purpose.**
  `useHostPresenceReporter` heartbeats first — which makes `host_absent` false
  server-side — and then reads the flag from the store, i.e. from before that
  heartbeat. That ordering is what distinguishes a returning host from one who
  never left, and any future reordering of those two calls breaks it.
- **Four functions were not touched, and must stay untouched for this reason.**
  If a later phase adds a `paused_reason` column after all, this ADR is what it
  supersedes.
```

- [x] **Step 6: Index the ADRs**

Append to `docs/ADR/README.md`:

```markdown
| [0051](0051-a-vanished-host-is-swept-by-any-client.md) | A vanished host is swept by an elected client against the host's own heartbeat | M3 P3b |
| [0052](0052-the-wires-fifth-opening.md) | The wire's fifth opening — `host_absent`, derived and never stored | M3 P3b |
```

- [x] **Step 7: Write the phase record and update the tracker**

Create `docs/progress/M3-P3b-the-vanished-host.md` in the shape of
`docs/progress/M3-P2b-the-aftermath.md`: scope, what was built, deviations,
verification results with the exact commands and output, live-verification
findings (Task 6 Step 2 and Task 7 Step 4 in full), and "Notes for phases that
inherit this work", carrying at minimum:

- `sweep_host_absence` is the project's only keyless mutating RPC, and ADR-0051
  is the bar for a second.
- `host_absent` is derived per read; a stored `paused_reason` was rejected and
  the four pause-writing functions are deliberately untouched.
- The auto-resume's heartbeat-then-read ordering is load-bearing.
- Nine seconds is three of `presence_report_ms()`; the two move together.
- A room with only a stage view, or no clients at all, is never swept.
- The purge finally bounds `rooms.used_question_ids`, closing M3 P2b's note.

Then edit `docs/progress/CURRENT.md`:

- "Current phase" becomes `M3 P3b complete → docs/progress/M3-P3b-the-vanished-host.md`,
  and note that **M3 P3 is now finished end to end; PRD §9's edge-case table is
  closed.**
- "Next" is **M3 P4 — The bank**, then P5 once P4 merges.
- Move the `rooms.used_question_ids` grows without bound bullet from Notes into
  a resolved note pointing at the purge.
- Add a Notes bullet for the keyless-RPC precedent and one for the auto-resume
  ordering.

- [x] **Step 8: Commit, merge, push, clean up**

```bash
git add e2e/host-absence.spec.ts docs/ADR/0051-a-vanished-host-is-swept-by-any-client.md docs/ADR/0052-the-wires-fifth-opening.md docs/ADR/README.md docs/progress/M3-P3b-the-vanished-host.md docs/progress/CURRENT.md
git commit -m "test: two-context coverage for the vanished host; record M3 P3b"
git checkout main
git merge --no-ff <branch>
git push
git worktree remove <path>
git branch -d <branch>
```

- [x] **Step 9: Apply the migration to the cloud project**

```bash
npx -y supabase@latest db query --linked --file supabase/migrations/0010_the_vanished_host.sql
```

Then verify by schema, not by `supabase migration list --linked`:

```bash
npx -y supabase@latest db query --linked --file - <<'SQL'
select
  (select count(*) from pg_proc where proname in
    ('host_absence_pause_ms','host_absence_end_ms','host_absent',
     'end_room_now','sweep_host_absence','purge_rooms','trg_purge_rooms')) as fns,
  (select count(*) from pg_trigger where tgname = 'rooms_purge_expired') as trg;
SQL
```

Expected: `fns = 7`, `trg = 1`. Then re-run the two-context Playwright suite
pointed at the cloud project — swap the commented cloud block into `.env.local`,
restart `npm run dev`, and run
`npm run test:e2e -- --workers=1 e2e/host-absence.spec.ts e2e/presence.spec.ts`.
**This matters more here than in most phases:** M3 P2a's `player_joined` bug was
a latency-ordering fault that only a remote database exposed (ADR-0048), and
this phase adds three new timing-sensitive client loops. Record the result.

---

## Self-review

**Spec coverage.** Roadmap §3 "P3 — Continuity" has five bullets. P3a covered
presence, player drop and late join; this plan covers the remaining two — host
drop (auto-pause through P0's exact path in Task 1, on-screen notice in Task 6,
resume on reconnect in Task 5, graceful end past five minutes in Task 1) and
room lifecycle (Task 7). The phase's named decision — *who calls pause when the
host is the one who vanished* — is resolved in Task 1 and ADR-0051 rather than
deferred. Of the exit criteria: "killing the host's tab pauses every other
surface within the presence timeout, and resuming continues the exact beat" is
Task 8's first Playwright test, assertion by assertion; "rooms older than 24h
are gone" is Task 7 Step 4, verified by hand against the local database with the
reason the harness cannot do it stated in the task; the drop and reclaim paths
were P3a's.

**Known gaps, stated rather than hidden.** The five-minute graceful end is not
executed by any test — it shares `end_room_now` with `end_game`, which three
existing smoke sections exercise, so only the threshold comparison is untested,
and a five-minute test was judged a bad trade. The 24-hour purge boundary is
verified by hand rather than by `scripts/smoke.mjs`, because the anon role has
no table grants and `created_at` cannot be backdated through an RPC. Both are
written into ADR-0051 and the task steps, not left for a reader to discover.

**Type consistency.** `sweep_host_absence(p_room_id)` has one parameter
everywhere — SQL, smoke, `lib/useHostAbsenceSweep.ts`.
`electSweeper(snap, hostPlayerId, myPlayerId)` has the same argument order in
`lib/presence.ts`, `tests/hostAbsence.test.ts` and the hook.
`isHostAbsent(room)` takes the room, not the boolean, in `lib/pause.ts`,
`tests/pause.test.ts`, `components/PauseCard.tsx` and
`lib/useHostPresenceReporter.ts`. `host_absent` is the field name in SQL, in
`PhaseEvent`, in `RoomInfo` and in the store. `useHostPresenceReporter`'s
signature grows a second parameter in Task 5 and its single call site is updated
in the same task.
</content>

# M3 P0 — Host Authority & the Control Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the host real control of a running game — pause, resume, skip a
question, end the game — enforced server-side on every command, and show a
paused room correctly on all three surfaces (player, host, stage).

**Architecture:** `'paused'` joins the `rooms.status` enum, which buys most of
the correct behaviour free: `useHostDriver` already returns early on
`status !== 'playing'` (stops scheduling) and `advance_phase` already raises on
it (cannot advance). Freeze-and-shift is the pause model — `pause_game` stores
the remaining ms on the room and clears `phase_ends_at`; `resume_game` writes a
fresh `phase_ends_at = now() + remaining`. Because `ends_at: null` is read
everywhere as "beat settled" (`elapsedIn`), the stored remainder travels on the
wire and one new pure helper, `beatRemainingMs(room)`, becomes the single answer
to "how much of this beat is left" — swapped into the two runtimes that own a
clock. The control strip and the pause card are DOM, never canvas.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase
(Postgres + Realtime broadcast), zustand, `motion`, Pixi v8, Howler, Tailwind
v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md`
(§3 "P0 — Host authority & the control strip" is the requirement set; §2 and §4
bind every task). P0's own drill-down spec was not written — the one decision
§6 said it would own, *skip semantics*, is resolved in this plan (Task 1,
ADR-0038) and everything else in §3's scope block was already settled.

## Global Constraints

Copied from the roadmap. Every task's requirements implicitly include this
section.

- **Migrations `0005+` follow the house style set by `0003_reveal_picks.sql` and
  `0004_ceremony.sql`** — `create or replace function` over rewrites, additive
  columns with defaults, no destructive DDL. A live cloud project
  (`niznfbabmixesfvxlypi`) holds real data behind a live Vercel deploy.
- **The wire stays semantic** (PRD §3.6, §9). New realtime events describe game
  meaning (`game-paused`, `game-resumed`), never coordinates, sprite frames or
  renderer concepts. Every new payload field earns the justification ADR-0018
  and ADR-0028 demanded — that is ADR-0037 in Task 2.
- **Host authority is server-enforced on every command.** Each of the four new
  RPCs validates `host_key` inside the RPC. A client-side `isHost` check is
  presentation, never permission.
- **Freeze-and-shift is the one pause model.** ADR-0014's `ends_at` derivation
  is left untouched.
- **The Fairness Law is inviolable.** `standings`' sort clause stays
  byte-identical (ADR-0018). No task in this plan edits `standings`.
- **The celebration hierarchy extends by exactly zero rungs in P0.** Pause and
  resume are `tier: 'routine'`.
- **Rendering separation** (PRD §9): Pixi owns the world; HTML/CSS/React owns
  everything readable and interactive. The control strip and the pause card are
  DOM.
- **Accessibility is an acceptance criterion, not a later pass.** Every new
  control is keyboard-operable with a visible focus ring; the pause card is a
  live region.
- **No new runtime dependencies.**
- **The regression floor at the end of the phase:** 429 unit tests plus whatever
  this plan adds, `npm run lint` clean (there is no known pre-existing error to
  discount — any lint error is a real one), `npx tsc --noEmit` silent, and
  `npm run test:e2e -- --workers=2` green.

## Environment notes (read before Task 1)

- **Do not run `supabase stop` or `supabase start`.** Windows/Hyper-V reserves
  TCP 54024–54423, which covers every default Supabase port; the running stack
  is on shifted ports and a restart would bind the reserved defaults, fail, and
  lose it. `supabase status` prints `config.toml`'s defaults, not the live
  bindings — do not trust it.
- **Live local bindings:** API `http://127.0.0.1:55321` (matches `.env.local`),
  Postgres `127.0.0.1:55322`, container `supabase_db_quiz-game`.
- **Apply local SQL** by piping into the container, which needs neither the
  Supabase CLI nor a host `psql`:
  ```bash
  docker exec -i supabase_db_quiz-game \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    < supabase/migrations/0005_host_authority.sql
  ```
- **Apply cloud SQL** (only at the end of the phase, deliberately) with
  `npx -y supabase@latest db query --linked --file supabase/migrations/0005_host_authority.sql`.
- **Playwright:** always `--workers=2`. The default worker count on this machine
  is flaky under load, timing out on unrelated pre-existing lobby/countdown
  assertions in a different subset of tests each run.

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `supabase/migrations/0005_host_authority.sql` | The `'paused'` status, `paused_remaining_ms`, the four host commands, `submit_answer`'s status guard, and the three new `phase_event` fields |
| `lib/pause.ts` | Pure. The single answer to "how much of this beat is left" and "is this room paused" |
| `components/HostControlStrip.tsx` | Host-only DOM control strip: pause/resume, skip, end (with confirmation) |
| `components/PauseCard.tsx` | The "why the show stopped" card, shared by all three surfaces |
| `tests/pause.test.ts` | Unit tests for `lib/pause.ts` |
| `e2e/host-control.spec.ts` | Two-context Playwright coverage: pause, skip, end |
| `docs/ADR/0037-the-wires-third-opening.md` | Why `status`, `paused_remaining_ms` and `total_rounds` join the phase event |
| `docs/ADR/0038-a-skipped-round-shortens-the-track.md` | Why a skip renumbers and decrements rather than leaving a hole |
| `docs/progress/M3-P0-host-authority.md` | Phase record, written when the last task lands |

**Modified files**

| File | Change |
|---|---|
| `lib/types.ts` | `RoomStatus`; three new `PhaseEvent` fields; `RoomInfo.paused_remaining_ms` |
| `lib/store.ts` | `applyPhaseEvent` honours `e.status`, carries `paused_remaining_ms` and `total_rounds` |
| `lib/staging/staging.ts` | `StagingInput.paused`; a paused ANSWER's options are not `live` |
| `lib/staging/runtime.ts` | Beat remainder comes from `beatRemainingMs` |
| `lib/audio/runtime.ts` | Tension ramp remainder comes from `beatRemainingMs`; sustained duck while paused |
| `lib/audio/state.ts` | `AudioState.paused`, set on sight from the two new cues |
| `lib/audio/mixer.ts` | `setSustainedDuck(on)` alongside the existing timed `duck(ms)` |
| `lib/presentation/cues.ts` | `GamePausedCue`, `GameResumedCue` |
| `lib/presentation/deriveCues.ts` | Status transitions emit the two cues; a `total_rounds` change is a beat change |
| `lib/useHostDriver.ts` | Promoted from a pure timer into the host command layer |
| `components/GameView.tsx` | Clears the *current* round's answer lock on READ (a skipped round reuses its number) |
| `components/QuestionCard.tsx` | One new test hook, `data-testid="question-prompt"` |
| `app/room/[code]/page.tsx` | Mounts the control strip and the pause card |
| `components/stage/StageBroadcast.tsx` | Mounts the pause card inside the stage surface |
| `scripts/smoke.mjs` | Grows the P0 integration section |
| `tests/store.test.ts`, `tests/staging.test.ts`, `tests/deriveCues.test.ts`, `tests/audioState.test.ts` | Coverage for the above |
| `docs/progress/CURRENT.md`, `docs/ADR/README.md` | Tracker and ADR index |

---

### Task 1: Migration 0005 — the paused status and the four host commands

Everything server-side, verified by the integration harness before a single
line of client code moves. `scripts/smoke.mjs` is the harness the roadmap (§5)
says each M3 phase extends; SQL-level integration testing is new for M3 because
these commands have no client-side representation to unit-test.

**Files:**
- Create: `supabase/migrations/0005_host_authority.sql`
- Create: `docs/ADR/0038-a-skipped-round-shortens-the-track.md`
- Modify: `scripts/smoke.mjs` (append a P0 section)
- Modify: `docs/ADR/README.md` (index row)

**Interfaces:**
- Consumes: `phase_event(rooms)`, `standings(uuid,int)`, `question_public`,
  `build_reveal` from `0002_rpcs.sql`/`0003`/`0004`.
- Produces, for Task 2 and Task 6:
  - `pause_game(p_room_id uuid, p_host_key uuid) returns jsonb`
  - `resume_game(p_room_id uuid, p_host_key uuid) returns jsonb`
  - `skip_question(p_room_id uuid, p_host_key uuid) returns jsonb`
  - `end_game(p_room_id uuid, p_host_key uuid) returns jsonb`
  - All four return a `phase_event`-shaped object, which now carries three more
    keys: `status` (text), `paused_remaining_ms` (int|null), `total_rounds`
    (int).
  - `get_room_state(p_code text)`'s `room` object gains
    `paused_remaining_ms`.

- [ ] **Step 1: Write the failing integration assertions**

Append to the very end of `scripts/smoke.mjs`. This runs before the migration
exists, so it must fail.

```js
// ---- P0: host authority ----
// A fresh 3-round room so skip has a tail to renumber and answers to discard.
const c = await rpc('create_room', {
  p_timer_seconds: 20, p_categories: ['fuel', 'ai-tech'], p_tier_counts: [3, 0, 0, 0],
});
const ch = await rpc('join_room', { p_code: c.code, p_nickname: 'Chief', p_avatar: 'robot', p_color: '#f59e0b', p_host_key: c.host_key });
const cp = await rpc('join_room', { p_code: c.code, p_nickname: 'Pat', p_avatar: 'duck', p_color: '#38bdf8' });

await rpc('start_game', { p_room_id: c.room_id, p_host_key: c.host_key });
await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // read
let e = await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // answer
assert.equal(e.phase, 'answer');
assert.equal(e.status, 'playing', 'phase_event carries status');
assert.equal(e.total_rounds, 3, 'phase_event carries total_rounds');

// -- pause freezes the remainder and clears the deadline
const paused = await rpc('pause_game', { p_room_id: c.room_id, p_host_key: c.host_key });
assert.equal(paused.status, 'paused');
assert.equal(paused.ends_at, null, 'a paused room has no live deadline');
assert.ok(paused.paused_remaining_ms > 15_000 && paused.paused_remaining_ms <= 20_000,
  `remainder should be most of the 20s timer, got ${paused.paused_remaining_ms}`);

// -- the status guard: no answers while paused
await rpcFails('submit_answer',
  { p_room_id: c.room_id, p_player_key: cp.player_key, p_round: 1, p_choice_index: 0 },
  /not accepting answers/i);

// -- advance_phase cannot run past a pause
await rpcFails('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }, /not started/i);

// -- pause is idempotent: a second call must not overwrite the remainder with 0
const again = await rpc('pause_game', { p_room_id: c.room_id, p_host_key: c.host_key });
assert.equal(again.paused_remaining_ms, paused.paused_remaining_ms, 'double pause keeps the remainder');

// -- host authority is server-enforced
await rpcFails('resume_game', { p_room_id: c.room_id, p_host_key: ch.player_key }, /invalid host key/i);
await rpcFails('skip_question', { p_room_id: c.room_id, p_host_key: ch.player_key }, /invalid host key/i);
await rpcFails('end_game', { p_room_id: c.room_id, p_host_key: ch.player_key }, /invalid host key/i);

// -- resume shifts the deadline forward by exactly the frozen remainder
const resumed = await rpc('resume_game', { p_room_id: c.room_id, p_host_key: c.host_key });
assert.equal(resumed.status, 'playing');
assert.equal(resumed.paused_remaining_ms, null);
assert.equal(resumed.phase, 'answer', 'resume replays no beat');
assert.equal(resumed.round, 1, 'resume does not advance');
const shiftMs = new Date(resumed.ends_at) - new Date(resumed.server_now);
assert.ok(Math.abs(shiftMs - paused.paused_remaining_ms) < 1500,
  `resumed deadline should restore the remainder, got ${shiftMs}`);

// -- answers flow again after a resume
await rpc('submit_answer', { p_room_id: c.room_id, p_player_key: cp.player_key, p_round: 1, p_choice_index: 0 });

// -- skip discards the round, renumbers the tail and shortens the track
const skipped = await rpc('skip_question', { p_room_id: c.room_id, p_host_key: c.host_key });
assert.equal(skipped.phase, 'read', 'skip lands on the next READ');
assert.equal(skipped.round, 1, 'the round NUMBER is reused - the tail moved down');
assert.equal(skipped.total_rounds, 2, 'the track is one segment shorter');
assert.equal(skipped.status, 'playing', 'skipping a paused room resumes it');
assert.ok(skipped.payload.prompt, 'the new round has a real question');

// -- the discarded round left no answers behind
await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // answer
await rpc('submit_answer', { p_room_id: c.room_id, p_player_key: cp.player_key, p_round: 1, p_choice_index: 0 });
e = await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // reveal
assert.equal(e.payload.counts.reduce((a, b) => a + b, 0), 1,
  'exactly one answer for the reused round number');

// -- end_game reaches the ceremony from mid-round with resolved standings only
e = await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // track (round 1 resolved)
e = await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // read, round 2
e = await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // answer, round 2
await rpc('submit_answer', { p_room_id: c.room_id, p_player_key: ch.player_key, p_round: 2, p_choice_index: 0 });

const ended = await rpc('end_game', { p_room_id: c.room_id, p_host_key: c.host_key });
assert.equal(ended.phase, 'results');
assert.equal(ended.status, 'finished');
assert.ok(ended.ends_at, 'the ceremony gets its 9s deadline');
assert.equal(ended.round, 1, 'the in-flight round is discarded, not counted');
const pat = ended.payload.find(s => s.nickname === 'Pat');
const chief = ended.payload.find(s => s.nickname === 'Chief');
assert.equal(pat.correct, 1, 'the resolved round counts');
assert.equal(chief.correct, 0, "the in-flight round's answer was discarded");

// -- a finished game takes no more commands
await rpcFails('pause_game', { p_room_id: c.room_id, p_host_key: c.host_key }, /not running/i);
await rpcFails('skip_question', { p_room_id: c.room_id, p_host_key: c.host_key }, /not running/i);

// -- get_room_state exposes the paused remainder
const st = await rpc('get_room_state', { p_code: c.code });
assert.equal(st.room.paused_remaining_ms, null);

console.log('✅ P0 host-authority smoke passed');
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node scripts/smoke.mjs`
Expected: FAIL — `pause_game: Could not find the function public.pause_game(p_host_key, p_room_id) in the schema cache`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0005_host_authority.sql`:

```sql
-- M3 P0 — host authority: pause, resume, skip, end.
-- Roadmap decision 1: M3 opens the backend, additively. No destructive DDL:
-- one CHECK constraint is widened, one nullable column is added, four
-- functions are replaced and four are new.

-- ============ schema ============
-- The 'paused' status is deliberately in the STATUS enum rather than a side
-- flag. Two existing behaviours then come free:
--   * lib/useHostDriver.ts returns early on `status !== 'playing'`, so a paused
--     room schedules nothing;
--   * advance_phase already raises 'game not started' on any non-'playing'
--     status, so a paused room cannot be advanced by a stale timer.
-- submit_answer is the one place the trick does not cover; it is guarded below.
alter table rooms drop constraint if exists rooms_status_check;
alter table rooms add constraint rooms_status_check
  check (status in ('lobby','playing','paused','finished'));

-- Freeze-and-shift (roadmap decision 3): pause_game stores what was left and
-- clears phase_ends_at; resume_game writes now() + remaining. ADR-0014's
-- derivation is untouched — a paused room simply has no live deadline.
alter table rooms add column if not exists paused_remaining_ms int;

-- ============ phase_event ============
-- Byte-identical to 0002_rpcs.sql except for THREE added keys. See ADR-0037.
--   status              — the client can no longer INFER status from phase: a
--                         paused room's phase does not change.
--   paused_remaining_ms — `ends_at: null` reads as "beat settled" everywhere
--                         (lib/staging/beats.ts elapsedIn), which would blank a
--                         paused ANSWER's ring and drop its tension to 0. The
--                         frozen remainder is what makes a freeze a freeze.
--   total_rounds        — skip_question changes the track length mid-game, and
--                         the phase event is the only thing that reaches every
--                         client.
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
    'payload', case v_room.phase
      when 'read'    then question_public(v_room.id, v_room.current_round)
      when 'answer'  then question_public(v_room.id, v_room.current_round)
      when 'reveal'  then build_reveal(v_room.id, v_room.current_round)
      when 'track'   then standings(v_room.id, v_room.current_round)
      when 'results' then standings(v_room.id, v_room.current_round)
      else null
    end);
$$;

-- ============ get_room_state ============
-- Byte-identical to 0002_rpcs.sql except for one added room key. A client that
-- reloads into a paused room must land on the frozen remainder, not on zero.
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
      'paused_remaining_ms', v_room.paused_remaining_ms),
    'players', (
      select coalesce(jsonb_agg(player_public(p) order by p.joined_at), '[]'::jsonb)
      from players p where p.room_id = v_room.id),
    'question', case when v_room.phase in ('read','answer')
      then question_public(v_room.id, v_room.current_round) else null end,
    'reveal', case when v_room.phase in ('reveal','track')
      then build_reveal(v_room.id, v_room.current_round) else null end,
    'standings', case when v_room.status <> 'lobby'
      then standings(v_room.id, case when v_room.phase in ('read','answer')
        then v_room.current_round - 1 else v_room.current_round end)
      else null end);
end $$;

-- ============ submit_answer ============
-- Byte-identical to 0002_rpcs.sql except for ONE added term in the guard.
-- The status enum trick covers useHostDriver and advance_phase; it does NOT
-- cover this function, which checked `phase = 'answer'` without consulting
-- status — so a paused room mid-ANSWER would have kept accepting answers.
create or replace function submit_answer(
  p_room_id uuid, p_player_key uuid, p_round int, p_choice_index int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_player players;
  v_q questions;
  v_remaining_ms int;
  v_total_ms int;
  v_correct boolean;
  v_points int;
begin
  select * into v_room from rooms where id = p_room_id for share;
  if not found then raise exception 'room not found'; end if;
  if v_room.status <> 'playing'
     or v_room.phase <> 'answer'
     or v_room.current_round <> p_round then
    raise exception 'not accepting answers';
  end if;
  v_remaining_ms := ceil(extract(epoch from (v_room.phase_ends_at - now())) * 1000);
  if v_remaining_ms < -300 then raise exception 'too late'; end if;  -- 300ms grace
  v_remaining_ms := greatest(v_remaining_ms, 0);

  select * into v_player from players
    where room_id = p_room_id and player_key = p_player_key;
  if not found then raise exception 'player not found'; end if;
  if not v_player.is_playing then raise exception 'spectators cannot answer'; end if;
  if p_choice_index < 0 or p_choice_index > 3 then raise exception 'invalid choice'; end if;

  select q.* into v_q from room_questions rq
    join questions q on q.id = rq.question_id
    where rq.room_id = p_room_id and rq.round = p_round;

  v_correct := (v_q.correct_index = p_choice_index);
  v_total_ms := v_room.timer_seconds * 1000;
  v_points := case when v_correct
    then floor(v_remaining_ms::numeric / v_total_ms * 100)::int * v_q.tier
    else 0 end;

  begin
    insert into answers (room_id, round, player_id, choice_index, is_correct,
                         time_remaining_ms, speed_points)
    values (p_room_id, p_round, v_player.id, p_choice_index, v_correct,
            v_remaining_ms, v_points);
  exception when unique_violation then
    raise exception 'already answered';
  end;

  return jsonb_build_object('locked', true);
end $$;

-- ============ pause_game ============
create or replace function pause_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_remaining int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;

  -- IDEMPOTENT, AND THAT IS LOAD-BEARING. A second pause would compute its
  -- remainder from the phase_ends_at the FIRST pause already nulled, i.e. 0 —
  -- destroying the frozen remainder. A double-tap on the strip must be inert.
  if v_room.status = 'paused' then return phase_event(v_room); end if;
  if v_room.status <> 'playing' then raise exception 'game not running'; end if;

  v_remaining := greatest(0,
    coalesce(ceil(extract(epoch from (v_room.phase_ends_at - now())) * 1000), 0))::int;

  update rooms set status = 'paused', paused_remaining_ms = v_remaining,
    phase_ends_at = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ resume_game ============
create or replace function resume_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status = 'playing' then return phase_event(v_room); end if;
  if v_room.status <> 'paused' then raise exception 'game not paused'; end if;

  -- The shift. Phase and round are untouched, so no client replays a beat:
  -- every consumer derives its position from the new deadline (ADR-0014).
  update rooms set status = 'playing',
    phase_ends_at = now()
      + make_interval(secs => coalesce(v_room.paused_remaining_ms, 0)::double precision / 1000),
    paused_remaining_ms = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ skip_question ============
-- A skipped round SHORTENS THE TRACK (ADR-0038): its question and answers are
-- deleted, the tail renumbers down, and total_rounds drops by one. The round
-- NUMBER is reused, so the host lands on a fresh READ at the same label with
-- one fewer segment ahead. The alternative — leaving the row in place — makes
-- the finish line unreachable for the rest of the game.
create or replace function skip_question(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_round int;
  v_total int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status not in ('playing','paused') then raise exception 'game not running'; end if;
  if v_room.phase not in ('read','answer','reveal') then
    raise exception 'cannot skip from phase %', v_room.phase;
  end if;

  v_round := v_room.current_round;
  v_total := v_room.total_rounds - 1;

  delete from answers where room_id = p_room_id and round = v_round;
  delete from room_questions where room_id = p_room_id and round = v_round;

  -- Renumber the tail down one, VIA THE NEGATIVE SPACE. The primary key
  -- (room_id, round) is not deferrable, so a single `round = round - 1` can
  -- transiently collide with a row the statement has not reached yet — the
  -- update order is not guaranteed. Negative round numbers can never collide
  -- with positive ones, so two passes are provably safe.
  update room_questions set round = -round
    where room_id = p_room_id and round > v_round;
  update room_questions set round = (-round) - 1
    where room_id = p_room_id and round < 0;

  if v_round > v_total then
    -- The skipped round was the last one: the race ends here, at the ceremony,
    -- with the 9-second deadline 0004_ceremony.sql established.
    update rooms set total_rounds = v_total, current_round = v_total,
      status = 'finished', phase = 'results',
      phase_ends_at = now() + interval '9 seconds', paused_remaining_ms = null
    where id = p_room_id returning * into v_room;
  else
    -- Skipping RESUMES a paused room: the host asked to move on, not to hold.
    update rooms set total_rounds = v_total, status = 'playing', phase = 'read',
      phase_ends_at = now() + interval '3 seconds', paused_remaining_ms = null
    where id = p_room_id returning * into v_room;
  end if;

  return phase_event(v_room);
end $$;

-- ============ end_game ============
-- Straight to the ceremony from wherever the room stands.
create or replace function end_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_round int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status not in ('playing','paused') then raise exception 'game not running'; end if;

  v_round := v_room.current_round;

  -- A round is RESOLVED only once its outcome has been shown. COUNTDOWN, READ
  -- and ANSWER are in flight: their partial answers are discarded exactly as
  -- skip_question discards them, and the standings stop at the previous round.
  -- REVEAL and TRACK have already told the room what happened, so they count.
  if v_room.phase in ('countdown','read','answer') then
    delete from answers where room_id = p_room_id and round = v_round;
    v_round := greatest(0, v_round - 1);
  end if;

  -- total_rounds is deliberately left alone: the size of the draw is a fact
  -- about the room, and moving it here would jump the podium's track metric at
  -- the moment the ceremony starts drawing.
  update rooms set status = 'finished', phase = 'results', current_round = v_round,
    phase_ends_at = now() + interval '9 seconds', paused_remaining_ms = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- New functions need their own grant; 0002's blanket grant ran before they
-- existed.
grant execute on all functions in schema public to anon, authenticated;
```

- [ ] **Step 4: Apply it locally**

Run:
```bash
docker exec -i supabase_db_quiz-game \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/migrations/0005_host_authority.sql
```
Expected: `ALTER TABLE` / `CREATE FUNCTION` / `GRANT` lines, no `ERROR:`.

- [ ] **Step 5: Run the integration harness and verify it passes**

Run: `node scripts/smoke.mjs`
Expected: PASS, ending with
```
✅ lobby smoke passed
✅ game-flow smoke passed
✅ P0 host-authority smoke passed
```

If PostgREST reports `Could not find the function ... in the schema cache` for a
function that clearly exists, its schema cache is stale — `docker restart
supabase_rest_quiz-game` and re-run. (Do **not** run `supabase stop`/`start`.)

- [ ] **Step 6: Write ADR-0038**

Create `docs/ADR/0038-a-skipped-round-shortens-the-track.md`:

```markdown
# ADR-0038: A skipped round shortens the track

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P0 — Host authority & the control strip

## Context

Track length is question count: `trackMetrics(totalRounds)` in
`lib/world/geometry.ts` makes `segments = total_rounds` and
`length = segments * SEGMENT_WIDTH`, and `markerAnchors` places a player on the
segment equal to their correct-answer count. So a host skipping a question is
not free — the M3 roadmap named this as the decision P0 owns.

Two candidates:

1. **Leave the round in place.** Delete only its answers, advance
   `current_round`, touch nothing else.
2. **Shorten the track.** Delete the round's question and answers, renumber the
   tail down one, decrement `total_rounds`.

## Decision

Option 2. `skip_question` deletes `room_questions` and `answers` for the current
round, renumbers every later round down by one, and decrements
`total_rounds`. The round *number* is reused, so the host lands on a fresh READ
at the same label with one fewer segment ahead of the field. If the skipped
round was the last one, the room goes straight to the ceremony.

The renumber runs as two passes through the negative round space, because the
`(room_id, round)` primary key is not deferrable and a single `round = round - 1`
can transiently collide with a row the statement has not reached yet.

## Consequences

- **The finish line stays reachable.** Under option 1 the maximum attainable
  correct count is `total_rounds - 1`, so nobody ever crosses the line the whole
  world metaphor is built around.
- **Streaks bridge the skip.** `longest_streak` and `current_streak` iterate
  `room_questions` in round order and treat a round with no answer as a miss.
  Under option 1 the skipped row survives and silently breaks every player's
  streak; deleting it is what keeps the sequence honest either way, and
  renumbering keeps it contiguous.
- **The track visibly shortens mid-race.** `trackMetrics` recomputes, the camera
  re-clamps and the finish line steps one segment closer. This is the price, and
  it reads as the host cutting the race short rather than as a glitch.
- **`total_rounds` is now mutable mid-game**, which it never was. Two consumers
  must respect that: `lib/store.ts` carries it on every phase event (ADR-0037),
  and `lib/presentation/deriveCues.ts` treats a change in it as a beat change,
  because a skip during READ changes neither phase nor round.
- **A skip that makes the current round the new final round does not fire the
  final-question run-up**, which normally rides the *previous* TRACK beat
  (ADR-0021). `deriveCues`' seed path already covers "in the final round without
  having seen the run-up"; the live path does not. Left as known behaviour for
  P0 — the escalation is missing, nothing is broken — and recorded in
  `docs/progress/CURRENT.md`.
- **P2's rematch must respect the shortened draw**: a room that skipped
  questions has fewer `room_questions` rows than it was created with.
```

- [ ] **Step 7: Add the ADR index row**

In `docs/ADR/README.md`, append to the index table:

```markdown
| [0038](0038-a-skipped-round-shortens-the-track.md) | A skipped round shortens the track | M3 P0 |
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0005_host_authority.sql scripts/smoke.mjs \
  docs/ADR/0038-a-skipped-round-shortens-the-track.md docs/ADR/README.md
git commit -m "feat(db): host authority commands — pause, resume, skip, end"
```

---

### Task 2: The wire — three new phase-event fields

The client stops inferring `status` from `phase` (which is exactly wrong for a
paused room, whose phase does not change) and starts carrying the frozen
remainder and the live track length.

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.ts:37-62` (`applyPhaseEvent`)
- Test: `tests/store.test.ts`
- Create: `docs/ADR/0037-the-wires-third-opening.md`
- Modify: `docs/ADR/README.md`

**Interfaces:**
- Consumes: Task 1's `phase_event` keys `status`, `paused_remaining_ms`,
  `total_rounds`.
- Produces, for every later task:
  - `export type RoomStatus = 'lobby' | 'playing' | 'paused' | 'finished'`
  - `PhaseEvent` gains `status?: RoomStatus`, `paused_remaining_ms?: number | null`,
    `total_rounds?: number` — all three optional with documented fallbacks,
    exactly as `Standing.answered` is (a pre-0005 database must not throw).
  - `RoomInfo` gains `paused_remaining_ms?: number | null`; its `status` widens
    to `RoomStatus`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/store.test.ts`:

```ts
describe('the P0 pause fields', () => {
  it('takes status from the event rather than inferring it from the phase', () => {
    useGameStore.setState({ room: { ...baseRoom, phase: 'answer' } });

    useGameStore.getState().applyPhaseEvent({
      phase: 'answer', round: 1, ends_at: null, server_now: new Date().toISOString(),
      status: 'paused', paused_remaining_ms: 7400, total_rounds: 3,
      payload: { category: 'fuel', tier: 1, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
    });

    const room = useGameStore.getState().room!;
    expect(room.status).toBe('paused');
    expect(room.paused_remaining_ms).toBe(7400);
    expect(room.phase).toBe('answer');
  });

  it('clears the remainder and returns to playing on resume', () => {
    useGameStore.setState({
      room: { ...baseRoom, phase: 'answer', status: 'paused', paused_remaining_ms: 7400 },
    });

    useGameStore.getState().applyPhaseEvent({
      phase: 'answer', round: 1, ends_at: '2026-08-29T10:00:07.400Z',
      server_now: '2026-08-29T10:00:00.000Z',
      status: 'playing', paused_remaining_ms: null, total_rounds: 3,
      payload: { category: 'fuel', tier: 1, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
    });

    const room = useGameStore.getState().room!;
    expect(room.status).toBe('playing');
    expect(room.paused_remaining_ms).toBeNull();
    expect(room.ends_at).toBe('2026-08-29T10:00:07.400Z');
  });

  it('carries a shortened track through a skip', () => {
    useGameStore.setState({ room: { ...baseRoom, phase: 'answer', round: 1, total_rounds: 3 } });

    useGameStore.getState().applyPhaseEvent({
      phase: 'read', round: 1, ends_at: null, server_now: new Date().toISOString(),
      status: 'playing', paused_remaining_ms: null, total_rounds: 2,
      payload: { category: 'fuel', tier: 1, prompt: 'Next?', options: ['a', 'b', 'c', 'd'] },
    });

    expect(useGameStore.getState().room!.total_rounds).toBe(2);
  });

  it('falls back to the old inference on a pre-0005 payload', () => {
    useGameStore.setState({ room: { ...baseRoom, phase: 'track', total_rounds: 3 } });

    // Deliberately shaped like the OLD server: no status, no remainder, no
    // total_rounds.
    useGameStore.getState().applyPhaseEvent({
      phase: 'results', round: 3, ends_at: null,
      server_now: new Date().toISOString(), payload: [],
    });

    const room = useGameStore.getState().room!;
    expect(room.status).toBe('finished');
    expect(room.total_rounds).toBe(3);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL — TypeScript rejects `status`/`paused_remaining_ms`/`total_rounds`
on `PhaseEvent` (`Object literal may only specify known properties`), and the
first test's `expect(room.status).toBe('paused')` receives `'playing'`.

- [ ] **Step 3: Widen the types**

In `lib/types.ts`, replace the `PhaseEvent` and `RoomInfo` lines:

```ts
export type RoomStatus = 'lobby'|'playing'|'paused'|'finished';

export interface PhaseEvent {
  phase: Phase; round: number; ends_at: string|null; server_now: string;
  /**
   * The room's status. Optional so a pre-0005 database does not throw; when it
   * is absent `applyPhaseEvent` falls back to the old inference. It exists
   * because status can no longer BE inferred from phase: a paused room's phase
   * does not change (ADR-0037).
   */
  status?: RoomStatus;
  /** ms frozen at the pause. Null while playing. Absent pre-0005. */
  paused_remaining_ms?: number|null;
  /** The live track length — `skip_question` shortens it mid-game. Absent pre-0005. */
  total_rounds?: number;
  payload: QuestionPublic|RevealPayload|Standing[]|null;
}

export interface RoomInfo {
  id: string; code: string; status: RoomStatus; phase: Phase; round: number;
  total_rounds: number; timer_seconds: number; ends_at: string|null;
  server_now: string;
  /** ms frozen at the pause. Null while playing. Absent against a pre-0005 database. */
  paused_remaining_ms?: number|null;
}
```

- [ ] **Step 4: Stop inferring status in the store**

In `lib/store.ts`, replace the `next` initialiser inside `applyPhaseEvent`:

```ts
    const next: Partial<GameState> = {
      room: {
        ...room, phase: e.phase, round: e.round, ends_at: e.ends_at,
        server_now: e.server_now,
        // Status arrives on the wire from 0005 onward. A paused room keeps its
        // phase, so the old `phase === 'results' ? 'finished' : 'playing'`
        // inference cannot see a pause at all — it survives only as the
        // pre-0005 fallback (ADR-0037).
        status: e.status ?? (e.phase === 'results' ? 'finished' : 'playing'),
        paused_remaining_ms: e.paused_remaining_ms ?? null,
        // skip_question shortens the track mid-game, so this is no longer fixed
        // at room creation (ADR-0038).
        total_rounds: e.total_rounds ?? room.total_rounds,
      },
    };
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run tests/store.test.ts && npx tsc --noEmit`
Expected: PASS (all `store.test.ts` tests green) and silent `tsc`.

- [ ] **Step 6: Write ADR-0037**

Create `docs/ADR/0037-the-wires-third-opening.md`:

```markdown
# ADR-0037: The wire's third opening — `status`, `paused_remaining_ms`, `total_rounds`

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P0 — Host authority & the control strip

## Context

M2's roadmap forbade protocol changes; M3's roadmap inverts that but keeps the
bar ADR-0018 and ADR-0028 set — every new payload field earns a written
justification, and the wire stays semantic.

`phase_event` is the only thing that reaches every client. Pause needs it to
carry three things it did not.

## Decision

`phase_event` gains `status`, `paused_remaining_ms` and `total_rounds`. All
three are optional on the client type with documented fallbacks, so a pre-0005
database degrades rather than throws — the same treatment `picks` and
`current_streak` got in ADR-0018.

### `status`

`lib/store.ts` derived status from phase: `e.phase === 'results' ? 'finished'
: 'playing'`. A paused room's phase does not change, so that inference cannot
represent a pause at all — and worse, it would actively overwrite `'paused'`
back to `'playing'` on the very event announcing the pause. Status has to be
stated, not inferred.

### `paused_remaining_ms`

Freeze-and-shift clears `phase_ends_at`, and `ends_at: null` is read everywhere
as *beat settled*: `elapsedIn(totalMs, null)` returns `totalMs`. Without the
remainder, pausing mid-ANSWER would blank the timer ring's numeral
(`secondsLeft` is null when `remainingMs` is null) and drop `tensionAt` to 0 —
the room would go calm and finished-looking at the exact moment it is meant to
hold its breath. The remainder is what makes a freeze a freeze, and it is
game meaning, not a renderer concept: "this much of the question is still owed."

### `total_rounds`

`skip_question` shortens the track mid-game (ADR-0038). `total_rounds` was
previously fixed at room creation and delivered once, by `get_room_state`;
after a skip that snapshot is stale on every client that does not reload.

## Consequences

- `RoomInfo.status` widens to `'lobby' | 'playing' | 'paused' | 'finished'`.
  Every consumer that compared against `'playing'` now has a fourth case to
  consider; `useHostDriver`'s scheduling guard and `advance_phase`'s status
  check both already do the right thing with it, which is why the status enum
  was chosen over a side flag.
- `total_rounds` is mutable at runtime. `lib/presentation/deriveCues.ts` must
  treat a change in it as a beat change, because a skip during READ alters
  neither phase nor round.
- The three fields are additive; no existing field changed meaning, so
  `question_public`, `build_reveal` and `standings` are untouched and the
  Fairness Law is not in the blast radius.
```

- [ ] **Step 7: Add the ADR index row**

In `docs/ADR/README.md`, insert above the ADR-0038 row:

```markdown
| [0037](0037-the-wires-third-opening.md) | The wire's third opening — `status`, `paused_remaining_ms`, `total_rounds` | M3 P0 |
```

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/store.ts tests/store.test.ts \
  docs/ADR/0037-the-wires-third-opening.md docs/ADR/README.md
git commit -m "feat: carry status, paused remainder and track length on the phase event"
```

---

### Task 3: The frozen beat — `lib/pause.ts` and the two runtimes

One pure helper becomes the single answer to "how much of this beat is left",
and the two runtimes that own a clock read it instead of `ends_at`. This is what
makes player, host and stage freeze at *the same* beat position rather than all
jumping to "settled".

**Files:**
- Create: `lib/pause.ts`
- Test: `tests/pause.test.ts`
- Modify: `lib/staging/staging.ts` (`StagingInput`, `stagingAt`)
- Modify: `tests/staging.test.ts` (the shared `base` object)
- Modify: `lib/staging/runtime.ts:100-115`
- Modify: `lib/audio/runtime.ts:86-89`

**Interfaces:**
- Consumes: `RoomStatus`, `RoomInfo` (Task 2); `msUntil` from `lib/serverTime.ts`.
- Produces, for Task 7:
  - `beatRemainingMs(room: PausableRoom | null): number | null`
  - `isPaused(room: { status: RoomStatus } | null): boolean`
  - `StagingInput.paused: boolean` (required) and the rule that a paused ANSWER
    reports `optionsMode: 'dim'`, which is what disables `AnswerButtons`
    including its `window`-level 1-4 shortcut.

- [ ] **Step 1: Write the failing test**

Create `tests/pause.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { noteServerTime } from '@/lib/serverTime';
import { beatRemainingMs, isPaused } from '@/lib/pause';
import type { RoomInfo } from '@/lib/types';

const room = (over: Partial<RoomInfo> = {}): RoomInfo => ({
  id: 'r', code: 'ABCDE', status: 'playing', phase: 'answer', round: 1,
  total_rounds: 3, timer_seconds: 20, ends_at: null,
  server_now: '2026-08-29T10:00:00.000Z', paused_remaining_ms: null,
  ...over,
});

beforeEach(() => {
  // Pin the client/server offset so msUntil is deterministic.
  noteServerTime(new Date(Date.now()).toISOString());
});

describe('beatRemainingMs', () => {
  it('is null with no room at all', () => {
    expect(beatRemainingMs(null)).toBeNull();
  });

  it('is null while playing with no deadline — the beat is settled or unknown', () => {
    expect(beatRemainingMs(room({ ends_at: null }))).toBeNull();
  });

  it('counts down from the live deadline while playing', () => {
    const endsAt = new Date(Date.now() + 5_000).toISOString();
    const left = beatRemainingMs(room({ ends_at: endsAt }))!;
    expect(left).toBeGreaterThan(4_000);
    expect(left).toBeLessThanOrEqual(5_000);
  });

  it('returns the FROZEN remainder while paused, ignoring the null deadline', () => {
    expect(beatRemainingMs(room({ status: 'paused', ends_at: null, paused_remaining_ms: 7_400 })))
      .toBe(7_400);
  });

  it('returns the frozen remainder even if a stale deadline is still attached', () => {
    const endsAt = new Date(Date.now() + 5_000).toISOString();
    expect(beatRemainingMs(room({ status: 'paused', ends_at: endsAt, paused_remaining_ms: 7_400 })))
      .toBe(7_400);
  });

  it('treats a paused room with no stored remainder as zero, never as unknown', () => {
    expect(beatRemainingMs(room({ status: 'paused', paused_remaining_ms: null }))).toBe(0);
  });
});

describe('isPaused', () => {
  it('is true only for the paused status', () => {
    expect(isPaused(null)).toBe(false);
    expect(isPaused(room({ status: 'playing' }))).toBe(false);
    expect(isPaused(room({ status: 'finished' }))).toBe(false);
    expect(isPaused(room({ status: 'paused' }))).toBe(true);
  });
});
```

Append to `tests/staging.test.ts`:

```ts
describe('a paused beat', () => {
  it('holds the ANSWER stagger at the frozen remainder', () => {
    const live = at({ remainingMs: 6_000 });
    const frozen = at({ remainingMs: 6_000, paused: true });
    expect(frozen.secondsLeft).toBe(live.secondsLeft);
    expect(frozen.tensionStep).toBe(live.tensionStep);
  });

  it('takes the options out of live mode, which is what disables the 1-4 shortcut', () => {
    expect(at({ remainingMs: 6_000 }).steps.optionsMode).toBe('live');
    expect(at({ remainingMs: 6_000, paused: true }).steps.optionsMode).toBe('dim');
  });

  it('leaves every other beat alone — REVEAL has no input to gate', () => {
    const frozen = at({ phase: 'reveal', remainingMs: 2_000, paused: true });
    expect(frozen.steps.optionsMode).toBe('result');
    expect(frozen.reveal.rows).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/pause.test.ts tests/staging.test.ts`
Expected: FAIL — `Cannot find module '@/lib/pause'`, and `paused` is not a
property of `StagingInput`.

- [ ] **Step 3: Write `lib/pause.ts`**

```ts
import { msUntil } from './serverTime';
import type { RoomStatus } from './types';

/**
 * Freeze-and-shift, on the client side (M3 roadmap decision 3).
 *
 * Pure — no store, no React, no DOM — because four different clocks need the
 * same answer: the staging ticker, the audio tension ramp, the timer ring
 * (through `stagingAt`) and the world's grade.
 *
 * `pause_game` clears `phase_ends_at` and stores what was left, so a paused
 * room genuinely HAS no live deadline. That is what keeps ADR-0014's derivation
 * untouched. But `ends_at: null` means "settled or unknown" to every consumer
 * (`elapsedIn`), which would collapse a paused ANSWER to a blank ring and zero
 * tension — the opposite of a freeze. This is the one place that difference is
 * resolved.
 */

/** Structural subset of `RoomInfo`; matched by shape so this module stays decoupled. */
export interface PausableRoom {
  status: RoomStatus;
  ends_at: string | null;
  paused_remaining_ms?: number | null;
}

export function isPaused(room: { status: RoomStatus } | null | undefined): boolean {
  return room?.status === 'paused';
}

/**
 * ms left in the current beat: the frozen remainder while paused, the live
 * deadline otherwise, `null` when there is no deadline to read.
 *
 * A paused room with no stored remainder returns 0, never null: the remainder
 * is absent only against a pre-0005 database, and "the beat is over" is a far
 * better guess there than "unknown", which would leave the ring blank forever.
 */
export function beatRemainingMs(room: PausableRoom | null | undefined): number | null {
  if (!room) return null;
  if (room.status === 'paused') return room.paused_remaining_ms ?? 0;
  return room.ends_at ? msUntil(room.ends_at) : null;
}
```

- [ ] **Step 4: Teach `stagingAt` about a paused beat**

In `lib/staging/staging.ts`, add the field to `StagingInput` (after
`isPlaying`):

```ts
  /** False for a spectator or a non-playing MC host. */
  isPlaying: boolean;
  /** True while the host has the room paused. */
  paused: boolean;
```

and replace the body of `stagingAt`:

```ts
export function stagingAt(input: StagingInput): StagingState {
  const beat = beatFor(input.phase);
  const totalMs = beatTotalMs(beat, input.timerSeconds);
  const elapsed = elapsedIn(totalMs, input.remainingMs);
  const isAnswer = beat === 'answer';

  // A paused room accepts no answers (submit_answer's status guard), so the
  // options must leave 'live'. This is not staging gating input (ADR-0016): it
  // is the SERVER's authority reaching the surface, and it has to reach it
  // here — AnswerButtons' 1-4 shortcut is a `window` keydown listener, which no
  // overlay or backdrop can intercept.
  const steps = stepsAt(beat, elapsed);
  const staged =
    input.paused && steps.optionsMode === 'live'
      ? { ...steps, optionsMode: 'dim' as const }
      : steps;

  return {
    beat,
    round: input.round,
    steps: staged,
    reveal: beat === 'reveal' ? revealStepsAt(elapsed) : NO_REVEAL,
    tensionStep: isAnswer ? tensionStep(tensionAt(input.remainingMs, totalMs)) : 0,
    secondsLeft:
      isAnswer && input.remainingMs !== null
        ? Math.max(0, Math.ceil(input.remainingMs / 1000))
        : null,
    lockedChoice: input.myAnswer,
    spectating: !input.isPlaying,
  };
}
```

Add `paused: false` to the shared `base` object at the top of
`tests/staging.test.ts`.

- [ ] **Step 5: Point the staging runtime at the helper**

In `lib/staging/runtime.ts`, replace the `msUntil` import with:

```ts
import { beatRemainingMs, isPaused } from '@/lib/pause';
```

(remove the now-unused `import { msUntil } from '@/lib/serverTime';`), and
replace the body of `computeAndPublishDiscrete`:

```ts
  const computeAndPublishDiscrete = () => {
    const { room, myAnswer } = useGameStore.getState();
    // The FROZEN remainder while paused, the live deadline otherwise — one
    // helper so the ring, the vignette and the audio ramp cannot disagree.
    const remainingMs = beatRemainingMs(room);
    const timerSeconds = room?.timer_seconds ?? 0;
    publish(
      stagingAt({
        phase: room?.phase ?? null,
        round: room?.round ?? 0,
        remainingMs,
        timerSeconds,
        myAnswer,
        isPlaying: isLocalPlayerPlaying(),
        paused: isPaused(room),
      }),
    );
    return { room, myAnswer, remainingMs, timerSeconds };
  };
```

The rAF loop below already reads `remainingMs` from this return value, so
`--timer-frac` and `--tension` freeze with everything else — no further change.

- [ ] **Step 6: Point the audio ramp at the helper**

In `lib/audio/runtime.ts`, replace the `msUntil` import with
`import { beatRemainingMs } from '@/lib/pause';` and replace line 88:

```ts
    // Same frozen-or-live remainder the vignette uses, so a paused room holds
    // its stems exactly where the picture holds its ramp.
    const raw = tensionAt(beatRemainingMs(room), totalMs);
```

- [ ] **Step 7: Leave the other four `msUntil` call sites alone — deliberately**

`grep -rn "msUntil" lib/ components/` finds six call sites outside
`serverTime.ts`. Two are switched above. The other four stay, and a reviewer
should be able to see why without asking:

- `lib/ceremony/runtime.ts`, `lib/world/runtime.ts`'s `ceremonySteps`,
  `components/ResultsView.tsx`, `components/stage/StageResults.tsx` — all four
  are the **ceremony** clock, and a room at `phase = 'results'` has
  `status = 'finished'`. `pause_game` raises `game not running` on it, so a
  paused ceremony does not exist and routing it through `beatRemainingMs` would
  add a branch that can never be taken.
- `components/GameView.tsx`'s `Countdown` and
  `components/stage/StageBroadcast.tsx`'s `StageCountdown` each own a private
  `setInterval` over `endsAt`. A pause during COUNTDOWN swaps the numeral for
  the pause card (Task 7) rather than freezing it: the component unmounts, its
  interval is cleared, and on resume a fresh `ends_at` remounts it at the
  restored remainder. Threading a frozen value into those two components would
  mean writing state from an effect, which is the exact shape
  `react-hooks/set-state-in-effect` exists to prevent and which CURRENT.md
  records as already having been paid off once. A three-second beat is not
  worth reopening it.
- `lib/useHostDriver.ts` schedules on `msUntil(room.ends_at)` and never runs at
  all while paused (`status !== 'playing'` returns early).

- [ ] **Step 8: Run the tests and the type check**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS — all previously-green tests plus 9 new ones (6 in
`pause.test.ts`, 3 in `staging.test.ts`), silent `tsc`, zero lint problems.

- [ ] **Step 9: Commit**

```bash
git add lib/pause.ts tests/pause.test.ts lib/staging/staging.ts \
  tests/staging.test.ts lib/staging/runtime.ts lib/audio/runtime.ts
git commit -m "feat: freeze the beat at the paused remainder instead of settling it"
```

---

### Task 4: The cues — `game-paused`, `game-resumed`, and a skip that re-fires the beat

Two semantic cues join the vocabulary, and the deriver learns that a change in
`total_rounds` is a beat change. Without the second half, a skip during READ
emits nothing at all: phase and round are both unchanged.

**Files:**
- Modify: `lib/presentation/cues.ts`
- Modify: `lib/presentation/deriveCues.ts`
- Test: `tests/deriveCues.test.ts`

**Interfaces:**
- Consumes: `RoomStatus` (Task 2).
- Produces, for Task 5:
  - `GamePausedCue = { type: 'game-paused'; tier: 'routine' }`
  - `GameResumedCue = { type: 'game-resumed'; tier: 'routine' }`
  - Both added to the `Cue` union.
  - `CueRoom` gains `status: RoomStatus`; `DerivationState` gains
    `status: RoomStatus | null` and `totalRounds: number`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/deriveCues.test.ts`:

```ts
describe('pause and resume', () => {
  it('announces a pause when the status changes, with no beat change', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1 }),
      source({ phase: 'answer', round: 1, room: { phase: 'answer', round: 1, total_rounds: 3, ends_at: null, status: 'paused' } }),
    ]);
    expect(types(batches[1])).toEqual(['game-paused']);
  });

  it('announces a resume and still replays no beat', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1, room: { phase: 'answer', round: 1, total_rounds: 3, ends_at: null, status: 'paused' } }),
      source({ phase: 'answer', round: 1 }),
    ]);
    expect(types(batches[1])).toEqual(['game-resumed']);
  });

  it('seeds a client that loads straight into a paused room', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1, room: { phase: 'answer', round: 1, total_rounds: 3, ends_at: null, status: 'paused' } }),
    ]);
    expect(types(batches[0])).toContain('game-paused');
    // The beat cue still leads, so the bed is right before the duck lands.
    expect(types(batches[0])[0]).toBe('phase-answer');
  });

  it('does not re-announce a pause that has not changed', () => {
    const pausedSource = source({
      phase: 'answer', round: 1,
      room: { phase: 'answer', round: 1, total_rounds: 3, ends_at: null, status: 'paused' },
    });
    const { batches } = run([pausedSource, pausedSource, pausedSource]);
    expect(types(batches[1])).toEqual([]);
    expect(types(batches[2])).toEqual([]);
  });
});

describe('a skipped round', () => {
  it('re-fires the beat when total_rounds shrinks under an unchanged phase and round', () => {
    const { batches } = run([
      source({ phase: 'read', round: 1 }),
      source({
        phase: 'read', round: 1,
        room: { phase: 'read', round: 1, total_rounds: 2, ends_at: null, status: 'playing' },
      }),
    ]);
    expect(types(batches[1])).toEqual(['phase-read']);
  });

  it('resumes and re-fires the beat in one step when a paused room is skipped', () => {
    const { batches } = run([
      source({
        phase: 'answer', round: 1,
        room: { phase: 'answer', round: 1, total_rounds: 3, ends_at: null, status: 'paused' },
      }),
      source({
        phase: 'read', round: 1,
        room: { phase: 'read', round: 1, total_rounds: 2, ends_at: null, status: 'playing' },
      }),
    ]);
    // The resume leads so the bed un-ducks before the new question's slam.
    expect(types(batches[1])).toEqual(['game-resumed', 'phase-read']);
  });
});
```

Also update the shared `source()` helper at the top of the file so every
existing test compiles against the widened `CueRoom`:

```ts
function source(over: Partial<CueSource> & { phase?: Phase; round?: number } = {}): CueSource {
  const { phase = 'lobby', round = 0, ...rest } = over;
  return {
    room: { phase, round, total_rounds: 3, ends_at: null, status: 'playing' },
    players: [player(A), player(B)],
    question: null,
    reveal: null,
    standings: null,
    myAnswer: null,
    ...rest,
  };
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/deriveCues.test.ts`
Expected: FAIL — `status` is not a property of `CueRoom`, and the pause tests
receive `[]`.

- [ ] **Step 3: Add the two cues**

In `lib/presentation/cues.ts`, add a section above `/* ── Union ── */`:

```ts
/* ── Host authority ──────────────────────────────────────────────────────── */

/**
 * The host stopped the show. `routine` on purpose: a pause is not a
 * celebration, and M3's roadmap (decision 6) reserves the one new rung on the
 * hierarchy for P2's sudden death.
 */
export interface GamePausedCue {
  type: 'game-paused';
  tier: 'routine';
}

export interface GameResumedCue {
  type: 'game-resumed';
  tier: 'routine';
}
```

and add both to the union:

```ts
export type Cue =
  | PhaseCountdownCue
  ...
  | PlayerJoinedCue
  | PodiumCue
  | GamePausedCue
  | GameResumedCue;
```

- [ ] **Step 4: Derive them**

In `lib/presentation/deriveCues.ts`:

Widen `CueRoom`:

```ts
/** Structural subset of RoomInfo this deriver needs. */
export interface CueRoom {
  phase: Phase;
  round: number;
  total_rounds: number;
  ends_at: string | null;
  status: RoomStatus;
}
```
(add `import type { Phase, QuestionPublic, RevealPayload, RoomStatus, Standing } from '@/lib/types';`)

Widen the accumulator:

```ts
export interface DerivationState {
  seeded: boolean;
  phase: Phase | null;
  round: number;
  /** Last seen room status; a change in it is what announces a pause. */
  status: RoomStatus | null;
  /** Last seen track length. `skip_question` shortens it mid-game (ADR-0038). */
  totalRounds: number;
  playerIds: string[];
  order: string[];
  correct: Record<string, number>;
  streaks: Record<string, number>;
}

export const initialDerivationState: DerivationState = {
  seeded: false,
  phase: null,
  round: 0,
  status: null,
  totalRounds: 0,
  playerIds: [],
  order: [],
  correct: {},
  streaks: {},
};
```

In the seed branch, append the pause cue after the beat cues and record both new
fields:

```ts
  if (!state.seeded) {
    const seedCues = phaseCues(room, next);
    const inFinalRound =
      room.total_rounds > 0 &&
      room.round === room.total_rounds &&
      room.phase !== 'lobby' &&
      room.phase !== 'results';
    const alreadyAnnounced = seedCues.some(c => c.type === 'final-question');
    if (inFinalRound && !alreadyAnnounced) {
      seedCues.unshift({ type: 'final-question', tier: 'finalQuestion', round: room.round });
    }

    // A client reloading into a paused room never saw the pause. Pushed AFTER
    // the beat cues so the bed is established before the duck lands on it.
    if (room.status === 'paused') {
      seedCues.push({ type: 'game-paused', tier: 'routine' });
    }

    return {
      cues: seedCues,
      nextState: {
        seeded: true,
        phase: room.phase,
        round: room.round,
        status: room.status,
        totalRounds: room.total_rounds,
        playerIds: next.players.map(p => p.id),
        order: (next.standings ?? []).map(s => s.player_id),
        correct: correctMap(next.standings),
        streaks: {},
      },
    };
  }
```

In the live path, insert the status block immediately before the
`phaseChanged` block and widen `phaseChanged`:

```ts
  // A pause changes neither phase nor round, so it has to be derived from
  // status on its own. Emitted BEFORE the beat cues below, because a skip on a
  // paused room resumes and re-reads in one event, and the bed must un-duck
  // before the new question's slam lands on it.
  if (room.status !== s.status) {
    if (room.status === 'paused') {
      cues.push({ type: 'game-paused', tier: 'routine' });
    } else if (s.status === 'paused' && room.status === 'playing') {
      cues.push({ type: 'game-resumed', tier: 'routine' });
    }
    s = { ...s, status: room.status };
  }

  // `total_rounds` is in this comparison because skip_question reuses the round
  // NUMBER (ADR-0038): a skip during READ changes neither phase nor round, and
  // without this term the new question would arrive with no beat cue at all —
  // the world would never re-hold its anchors and the callout would never
  // clear. It is the only thing that changes total_rounds mid-game.
  const phaseChanged =
    room.phase !== s.phase || room.round !== s.round || room.total_rounds !== s.totalRounds;
  if (phaseChanged) {
    cues.push(...phaseCues(room, next));

    if (room.phase === 'reveal') {
      const drama = standingsCues(s, next.standings);
      cues.push(...drama.cues);
      s = drama.nextState;
    }

    s = { ...s, phase: room.phase, round: room.round, totalRounds: room.total_rounds };
  }
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run tests/deriveCues.test.ts tests/cueBus.test.ts && npx tsc --noEmit`
Expected: PASS. `tests/cueBus.test.ts` builds its own room literal — add
`status: 'playing'` to it if `tsc` flags it.

- [ ] **Step 6: Commit**

```bash
git add lib/presentation/cues.ts lib/presentation/deriveCues.ts tests/deriveCues.test.ts tests/cueBus.test.ts
git commit -m "feat: game-paused and game-resumed cues; a skip re-fires its beat"
```

---

### Task 5: Audio — the bed ducks while paused

The roadmap's one audio requirement for P0. The mixer's existing `duck(ms)` is a
timed dip sized to a sting; a pause needs a *held* duck with no known end, so
the two are separated rather than one being abused for the other.

**Files:**
- Modify: `lib/audio/state.ts`
- Modify: `lib/audio/mixer.ts`
- Modify: `lib/audio/runtime.ts`
- Test: `tests/audioState.test.ts`

**Interfaces:**
- Consumes: `GamePausedCue`, `GameResumedCue` (Task 4).
- Produces: `AudioState.paused: boolean`; `Mixer.setSustainedDuck(on: boolean): void`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/audioState.test.ts`:

```ts
const gamePaused: Cue = { type: 'game-paused', tier: 'routine' };
const gameResumed: Cue = { type: 'game-resumed', tier: 'routine' };

describe('pause', () => {
  it('starts un-paused', () => {
    expect(initialAudioState.paused).toBe(false);
  });

  it('holds and releases the duck', () => {
    const held = run([answer, gamePaused]);
    expect(held.state.paused).toBe(true);
    expect(run([answer, gamePaused, gameResumed]).state.paused).toBe(false);
  });

  it('is set on SIGHT, so a seed batch into a paused room still ducks', () => {
    // catchUp true is the reload path: stings are suppressed, state is not.
    const { state, stings } = run([answer, gamePaused], { ...initialAudioState });
    expect(state.paused).toBe(true);
    expect(stings).toEqual([]);
  });

  it('makes no sound of its own — a pause is silence, not a sting', () => {
    expect(run([answer, gamePaused, gameResumed]).stings).toEqual(['answer-open']);
  });

  it('leaves the bed and the pending drama queue untouched', () => {
    const { state } = run([read, answer, reveal, overtake, gamePaused]);
    expect(state.bed).toBe('round');
    expect(state.pending.map(c => c.type)).toEqual(['overtake']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/audioState.test.ts`
Expected: FAIL — `'game-paused'` is not assignable to `Cue`'s discriminant in
this file until Task 4 landed (it has), then
`Property 'paused' does not exist on type 'AudioState'`.

- [ ] **Step 3: Add `paused` to the audio state machine**

In `lib/audio/state.ts`:

```ts
export const AUDIO_CUE_TYPES: readonly CueType[] = [
  'phase-countdown', 'phase-read', 'phase-answer', 'phase-reveal', 'phase-track', 'phase-results',
  'answer-locked', 'answer-resolved', 'player-joined', 'podium',
  'game-paused', 'game-resumed',
  ...DRAMA_TYPES,
];

export interface AudioState {
  bed: MusicBed;
  escalated: boolean;
  pending: DramaCue[];
  catchUp: boolean;
  /** True while the host has the room paused; the bed holds a sustained duck. */
  paused: boolean;
}

export const initialAudioState: AudioState = {
  bed: 'lobby',
  escalated: false,
  pending: [],
  catchUp: true,
  paused: false,
};
```

and in `applyCue`, immediately after the `final-question` line:

```ts
  if (cue.type === 'final-question') next = { ...next, escalated: true };

  // Set on SIGHT, for the same reason `escalated` is (ADR-0021, ADR-0024): a
  // reload seeds `game-paused` in the catch-up batch, where stings are
  // suppressed but bed state still has to land.
  if (cue.type === 'game-paused') next = { ...next, paused: true };
  else if (cue.type === 'game-resumed') next = { ...next, paused: false };
```

`stingFor` needs no case — its `default: return null` already means deliberate
silence, which is the right answer here: a pause is an absence of show, not a
moment in it.

- [ ] **Step 4: Give the mixer a sustained duck**

In `lib/audio/mixer.ts`, add to the `Mixer` interface after `duck(ms)`:

```ts
  /** A duck with no known end — held until released. Independent of `duck(ms)`. */
  setSustainedDuck(on: boolean): void;
```

add `setSustainedDuck() {},` to `DEAD`, and replace the duck bookkeeping in
`createMixer`. Change the two state variables:

```ts
  let duckMultiplier = 1;
  let duckTimer: ReturnType<typeof setTimeout> | null = null;
```

to:

```ts
  // Two independent reasons to duck: a timed dip under a sting, and a
  // sustained hold while the room is paused. Either one is enough, and
  // releasing one must not lift the other.
  let timedDuck = false;
  let sustainedDuck = false;
  let duckTimer: ReturnType<typeof setTimeout> | null = null;
  const duckMultiplier = () => (timedDuck || sustainedDuck ? DUCK_GAIN : 1);
```

update `applyStem`'s target line:

```ts
    const target = (targets.get(id) ?? 0) * duckMultiplier();
```

and replace the `duck` method, adding `setSustainedDuck` beside it:

```ts
    duck(ms) {
      timedDuck = true;
      applyBedStems(DUCK_ATTACK_MS);
      if (duckTimer) clearTimeout(duckTimer);
      duckTimer = setTimeout(() => {
        timedDuck = false;
        applyBedStems(DUCK_RELEASE_MS);
        duckTimer = null;
      }, Math.max(0, ms));
    },

    setSustainedDuck(on) {
      if (sustainedDuck === on) return;
      sustainedDuck = on;
      applyBedStems(on ? DUCK_ATTACK_MS : DUCK_RELEASE_MS);
    },
```

- [ ] **Step 5: Wire it in the audio runtime**

In `lib/audio/runtime.ts`, extend `syncBed` so one call keeps both the bed and
the duck in step:

```ts
  const syncBed = () => {
    mixer.setBed(state.bed, state.escalated);
    mixer.setSustainedDuck(state.paused);
  };
```

No other change: `syncBed()` is already called once at startup and after every
cue.

- [ ] **Step 6: Run the tests, type check and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS — everything green, silent `tsc`, zero lint problems.

- [ ] **Step 7: Commit**

```bash
git add lib/audio/state.ts lib/audio/mixer.ts lib/audio/runtime.ts tests/audioState.test.ts
git commit -m "feat(audio): the bed holds a sustained duck while paused"
```

---

### Task 6: `useHostDriver` becomes the host command layer

The hook stops being a pure timer. The `advancing` ref that closed the
intermittent `advance_phase` 400 stays exactly as it is; a second ref keeps
deliberate host commands from racing each other and from being overtaken by the
scheduler.

**Files:**
- Modify: `lib/useHostDriver.ts` (whole file)

**Interfaces:**
- Consumes: `PhaseEvent` (Task 2).
- Produces, for Task 7:
  ```ts
  export interface HostDriver {
    isHost: boolean;
    start(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    skip(): Promise<void>;
    end(): Promise<void>;
    error: string | null;
  }
  export function useHostDriver(code: string, channel: RealtimeChannel | null): HostDriver;
  ```

**Note on tests:** this file gets no unit test, for the reason CURRENT.md
already records for the `advancing` ref — the repo has no React-hook test
infrastructure (`vitest.config.mts` includes only `tests/**/*.test.ts`, and
there is no `@testing-library/react`/jsdom), and building it to pin a timing
guard is out of proportion. Verification is `tsc`, lint, and Task 8's
two-context Playwright coverage, which exercises every command for real.

- [ ] **Step 1: Rewrite the hook**

Replace `lib/useHostDriver.ts` entirely:

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useGameStore } from './store';
import { loadSession } from './session';
import { msUntil } from './serverTime';
import type { PhaseEvent } from './types';

/** Every host command is a `(room_id, host_key) -> phase_event` RPC. */
type HostRpc = 'pause_game' | 'resume_game' | 'skip_question' | 'end_game';

export interface HostDriver {
  /** Presentation only. The RPCs check `host_key` themselves — that is the permission. */
  isHost: boolean;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(): Promise<void>;
  end(): Promise<void>;
  error: string | null;
}

/**
 * The host's command layer (M3 P0).
 *
 * Was a pure timer through M2; it now also carries the four deliberate
 * commands behind the control strip. Every one of them returns a phase event,
 * so they all leave through the same broadcast-and-apply path the scheduler
 * uses — there is exactly one way game state reaches the room.
 */
export function useHostDriver(code: string, channel: RealtimeChannel | null): HostDriver {
  const room = useGameStore(s => s.room);
  const applyPhaseEvent = useGameStore(s => s.applyPhaseEvent);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a second advance_phase call landing while the first is
  // still in flight: an unrelated room update can rerun the scheduling
  // effect and re-arm a near-zero-delay timer before the pending RPC
  // resolves, and the redundant call can 400 if the first already moved the
  // room past a phase with no further transition (e.g. into 'results').
  const advancing = useRef(false);
  // The same guard for DELIBERATE commands, and one more job: an in-flight
  // command also blocks the scheduler, so a pause the host has already asked
  // for cannot be overtaken by a timer firing on the deadline it is about to
  // freeze.
  const commanding = useRef(false);
  const session = typeof window !== 'undefined' ? loadSession(code) : null;
  const hostKey = session?.hostKey ?? null;

  const broadcastAndApply = useCallback((evt: PhaseEvent) => {
    channel?.send({ type: 'broadcast', event: 'phase', payload: evt });
    applyPhaseEvent(evt);
  }, [channel, applyPhaseEvent]);

  const advance = useCallback(async () => {
    if (!hostKey || !room || advancing.current || commanding.current) return;
    advancing.current = true;
    try {
      const { data, error: err } = await supabase.rpc('advance_phase', {
        p_room_id: room.id, p_host_key: hostKey,
      });
      if (err) { setError(err.message); return; }
      broadcastAndApply(data as PhaseEvent);
    } finally {
      advancing.current = false;
    }
  }, [hostKey, room, broadcastAndApply]);

  /**
   * One shape for all four commands. A command arriving while another is in
   * flight is dropped rather than queued: the strip's buttons are the only
   * caller, and a double-tap must be inert, not a second command.
   */
  const command = useCallback(async (rpc: HostRpc) => {
    if (!hostKey || !room || commanding.current) return;
    commanding.current = true;
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc(rpc, {
        p_room_id: room.id, p_host_key: hostKey,
      });
      if (err) { setError(err.message); return; }
      broadcastAndApply(data as PhaseEvent);
    } finally {
      commanding.current = false;
    }
  }, [hostKey, room, broadcastAndApply]);

  // Schedule the next transition whenever the phase changes.
  //
  // A paused room falls out here on `status !== 'playing'` and the cleanup
  // below clears the pending timer — which is the whole reason 'paused' went
  // into the status enum rather than into a side flag. On resume the room
  // arrives with a fresh `ends_at`, this effect reruns, and the timer is armed
  // for exactly the frozen remainder. No beat replays; nothing double-advances.
  useEffect(() => {
    if (!hostKey || !channel || !room) return;
    if (room.status !== 'playing' || room.phase === 'results') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(advance, msUntil(room.ends_at));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [hostKey, channel, room?.phase, room?.round, room?.ends_at, room?.status, advance, room]);

  const start = useCallback(async () => {
    if (!hostKey || !room) return;
    const { data, error: err } = await supabase.rpc('start_game', {
      p_room_id: room.id, p_host_key: hostKey,
    });
    if (err) { setError(err.message); return; }
    broadcastAndApply(data as PhaseEvent);
  }, [hostKey, room, broadcastAndApply]);

  const pause = useCallback(() => command('pause_game'), [command]);
  const resume = useCallback(() => command('resume_game'), [command]);
  const skip = useCallback(() => command('skip_question'), [command]);
  const end = useCallback(() => command('end_game'), [command]);

  return { isHost: hostKey !== null, start, pause, resume, skip, end, error };
}
```

- [ ] **Step 2: Verify the call site still compiles**

`app/room/[code]/page.tsx` destructures `{ start, error: hostError }`, which the
new return type still satisfies.

Run: `npx tsc --noEmit && npm run lint`
Expected: silent `tsc`, zero lint problems. In particular the exhaustive-deps
rule must stay quiet on the scheduling effect — its dependency list is unchanged.

- [ ] **Step 3: Commit**

```bash
git add lib/useHostDriver.ts
git commit -m "feat: promote useHostDriver from a timer into the host command layer"
```

---

### Task 7: The control strip and the pause card, on all three surfaces

The readable, interactive half. All DOM — cross-cutting constraint 2 puts the
control strip, the pause card and everything else new in M3 outside the canvas.

**Files:**
- Create: `components/PauseCard.tsx`
- Create: `components/HostControlStrip.tsx`
- Modify: `app/room/[code]/page.tsx`
- Modify: `components/stage/StageBroadcast.tsx`
- Modify: `components/GameView.tsx:48-51` (the answer-lock clear)

**Interfaces:**
- Consumes: `HostDriver` (Task 6), `isPaused` (Task 3), `useGameStore`,
  `components/ui/Button`.
- Produces, for Task 8's e2e spec, these stable test hooks:
  - `data-testid="pause-card"` on the card, on every surface
  - `data-testid="host-strip"` on the strip
  - `data-testid="host-pause"`, `host-resume`, `host-skip`, `host-end`,
    `host-end-confirm`, `host-end-cancel` on the buttons
  - `data-testid="host-strip-error"` on the error line

- [ ] **Step 1: Fix the answer lock a skip would resurrect**

`skip_question` reuses the round number, so `loadAnswerLock(code, round)` can
hand back a lock committed against the *discarded* question. In
`components/GameView.tsx`, replace the clear effect:

```tsx
  // A new READ means a new question. Clear the CURRENT round's key as well as
  // the previous one: skip_question reuses the round NUMBER (ADR-0038), so
  // without this the lock committed against the discarded question is restored
  // over its replacement. Always safe — a READ for round N always precedes any
  // answer for round N.
  useEffect(() => {
    if (phase !== 'read') return;
    clearAnswerLock(code, round);
    if (round > 1) clearAnswerLock(code, round - 1);
  }, [code, phase, round]);
```

- [ ] **Step 2: Write the pause card**

Create `components/PauseCard.tsx`:

```tsx
'use client';
import { useGameStore } from '@/lib/store';
import { isPaused } from '@/lib/pause';

/**
 * Why the show stopped (M3 P0).
 *
 * The same component on all three surfaces. The stage view is read-only but
 * must still say why nothing is happening, and rendering it inside
 * `[data-surface="stage"]` rescales it for a television with no variant prop —
 * every size here resolves through a theme variable that scope overrides
 * (ADR-0035).
 *
 * Read-only everywhere, host included: the controls live on the strip, so
 * there is exactly one place a command can be issued from.
 */
export default function PauseCard() {
  const room = useGameStore(s => s.room);
  if (!isPaused(room)) return null;

  return (
    <div
      data-testid="pause-card"
      className="pointer-events-auto fixed inset-0 z-20 grid place-items-center
        bg-void/70 p-6 backdrop-blur-sm"
    >
      <div
        role="status"
        aria-live="polite"
        className="max-w-md rounded-panel border border-haze bg-night/80 px-8 py-7 text-center"
      >
        <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-warning">
          Race suspended
        </p>
        <p className="mt-2 font-display text-hero font-black text-ink">Paused</p>
        <p className="mt-3 text-sm text-ink-dim">
          The host stopped the clock. Nothing is lost — the question resumes
          exactly where it left off.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the control strip**

Create `components/HostControlStrip.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useGameStore } from '@/lib/store';
import type { HostDriver } from '@/lib/useHostDriver';
import Button from './ui/Button';

/**
 * The host's controls (PRD §4's host variant, M3 P0).
 *
 * Slim, fixed to the bottom, and OVER the player view rather than beside it:
 * the host is usually also racing, so this cannot cost the answer grid its
 * space. DOM, never canvas (cross-cutting constraint 2).
 *
 * `isHost` gates only what is drawn. Permission is the `host_key` check inside
 * each RPC (roadmap decision 2) — this component could be rendered for anyone
 * and every button would still fail server-side.
 */
export default function HostControlStrip({ driver }: { driver: HostDriver }) {
  const room = useGameStore(s => s.room);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  if (!room || room.status === 'lobby' || room.status === 'finished') return null;

  const paused = room.status === 'paused';
  // Skipping only makes sense while a question is in play. By TRACK the round
  // has already resolved; there is nothing left to discard.
  const canSkip = room.phase === 'read' || room.phase === 'answer' || room.phase === 'reveal';

  return (
    <div
      data-testid="host-strip"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-haze bg-abyss/90
        px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md"
    >
      {driver.error && (
        <p data-testid="host-strip-error" className="pb-2 text-center text-xs text-wrong">
          {driver.error}
        </p>
      )}

      {confirmingEnd ? (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-dim">
            End the race now and go to the results?
          </p>
          <Button
            data-testid="host-end-cancel"
            variant="ghost"
            onClick={() => setConfirmingEnd(false)}
          >
            Keep racing
          </Button>
          <Button
            data-testid="host-end-confirm"
            onClick={() => {
              setConfirmingEnd(false);
              void driver.end();
            }}
          >
            End race
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Button
            data-testid={paused ? 'host-resume' : 'host-pause'}
            variant={paused ? 'primary' : 'ghost'}
            aria-pressed={paused}
            onClick={() => void (paused ? driver.resume() : driver.pause())}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            data-testid="host-skip"
            variant="ghost"
            disabled={!canSkip}
            onClick={() => void driver.skip()}
          >
            Skip question
          </Button>
          <Button
            data-testid="host-end"
            variant="quiet"
            onClick={() => setConfirmingEnd(true)}
          >
            End race
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Mount both on the player route**

In `app/room/[code]/page.tsx`:

Replace the imports and the driver destructure:

```tsx
import HostControlStrip from '@/components/HostControlStrip';
import PauseCard from '@/components/PauseCard';
```

```tsx
  const driver = useHostDriver(code, channel);
```

Replace the `LobbyView` line so it reads from the driver:

```tsx
  } else if (room.status === 'lobby') {
    content = <LobbyView code={code} isHost={isHost} onStart={driver.start} startError={driver.error} />;
```

and replace the returned tree:

```tsx
  return (
    <div className="relative min-h-screen">
      {/* Mounted through results: the podium ceremony is a canvas beat (P5a). */}
      {room && <PixiStage code={code} role="player" />}
      <TensionFrame />
      <SettingsControl />
      <Suspense fallback={null}>
        <PerfOverlay />
      </Suspense>
      {/*
        The strip reserves its own height at the bottom of the readable column
        so a fixed bar can never sit on top of the answer grid. z-order is
        content (10) < pause card (20) < strip (30): the host must still be able
        to reach Resume through the card that is telling everyone why they are
        waiting.
      */}
      <div className={`relative z-10 ${isHost ? 'pb-16' : ''}`}>{content}</div>
      <PauseCard />
      {isHost && <HostControlStrip driver={driver} />}
    </div>
  );
```

- [ ] **Step 5: Mount the pause card on the stage**

In `components/stage/StageBroadcast.tsx`, import it
(`import PauseCard from '@/components/PauseCard';`) and add it as the first
child of the non-results root, immediately inside the
`data-surface="stage"` div:

```tsx
    <div
      data-testid="stage-broadcast"
      data-beat={beat}
      data-surface="stage"
      className="pointer-events-none fixed inset-0 z-10 p-[5%]"
    >
      {/*
        Inside the stage surface on purpose: every size in PauseCard resolves
        through a theme variable this scope overrides, so the TV gets a
        television-sized card with no variant prop (ADR-0035). The results
        branch above needs none — a finished room cannot be paused.
      */}
      <PauseCard />

      <header className="flex items-start justify-between gap-6">
```

- [ ] **Step 6: Verify by hand, headed, against the local stack**

Headless Chromium cannot be trusted for this — it falls back to SwiftShader and
pins the VFX budget before a test starts.

Run `npm run dev`, then in a real browser:

1. Create a room at `/host/new`, join from a second browser profile, start.
2. During ANSWER, click **Pause** on the host.
   - Both browsers show `pause-card`.
   - The timer ring holds a fixed numeral on both — it does **not** blank or
     run to 0.
   - The answer buttons dim and go disabled; pressing `2` does nothing.
   - Open `/stage/<code>` in a third tab: it shows the pause card too.
3. Click **Resume**. The ring continues from the frozen number; no beat replays
   and the round does not double-advance.
4. During READ, click **Skip question**. A new prompt appears and the round
   label's denominator drops by one on every surface.
5. Click **End race**, then **End race** again in the confirmation. All three
   surfaces reach the ceremony.

- [ ] **Step 7: Type check and lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: silent `tsc`, zero lint problems, all unit tests green.

- [ ] **Step 8: Commit**

```bash
git add components/PauseCard.tsx components/HostControlStrip.tsx \
  components/GameView.tsx app/room/[code]/page.tsx components/stage/StageBroadcast.tsx
git commit -m "feat: the host control strip and the pause card on all three surfaces"
```

---

### Task 8: Two-context Playwright coverage, the regression floor, and the record

P0 cannot be honestly verified from a single context — the whole point is that
one browser's command reaches another browser's screen.

**Files:**
- Create: `e2e/host-control.spec.ts`
- Modify: `components/QuestionCard.tsx:67` (one `data-testid`)
- Modify: `docs/progress/CURRENT.md`
- Create: `docs/progress/M3-P0-host-authority.md`

- [ ] **Step 1: Write the spec**

Create `e2e/host-control.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

/**
 * Two contexts throughout: the host's command has to be observed on somebody
 * else's screen, which is the one thing a single-context test cannot show.
 */
async function createRoom(host: Page, questions: number, timerSeconds: number) {
  await host.goto('/host/new');

  // The four tier steppers start at 4,4,3,1. Walk them down to the count asked
  // for, all in tier 1, so the game is short and the draw is deterministic.
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
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  return host.url().split('/').pop()!;
}

test('a pause freezes every surface at the same beat, and a resume continues it', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  // 20s answers so there is room to pause mid-ANSWER and read the frozen ring.
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

  // Get into ANSWER on the joiner, which is where the freeze has to be visible.
  const options = joiner.getByTestId('answer-option');
  await expect(options.first()).toBeEnabled({ timeout: 20_000 });

  const ringBefore = await joiner.getByRole('timer').innerText();
  await host.getByTestId('host-pause').click();

  // The card lands on all three surfaces.
  await expect(joiner.getByTestId('pause-card')).toBeVisible({ timeout: 10_000 });
  await expect(host.getByTestId('pause-card')).toBeVisible();
  await expect(stage.getByTestId('pause-card')).toBeVisible({ timeout: 10_000 });

  // FROZEN, not settled: the ring still shows a number, and the same one two
  // seconds later. A settled beat would blank it (secondsLeft null) instead.
  const ringAtPause = await joiner.getByRole('timer').innerText();
  expect(Number(ringAtPause)).toBeGreaterThan(0);
  expect(Number(ringAtPause)).toBeLessThanOrEqual(Number(ringBefore));
  await joiner.waitForTimeout(2_000);
  await expect(joiner.getByRole('timer')).toHaveText(ringAtPause);

  // Answers are refused while paused — including the window-level 1-4 shortcut.
  await expect(options.first()).toBeDisabled();
  await joiner.keyboard.press('2');
  await expect(options.nth(1)).not.toHaveAttribute('data-locked', 'true');

  // Resume continues from the frozen remainder; no beat replays.
  await host.getByTestId('host-resume').click();
  await expect(joiner.getByTestId('pause-card')).toBeHidden({ timeout: 10_000 });
  await expect(stage.getByTestId('pause-card')).toBeHidden();
  await expect(options.first()).toBeEnabled();
  await expect(joiner.locator('[data-testid="stage-shell"][data-beat="answer"]')).toBeVisible();

  await options.first().click();
  await expect(options.first()).toHaveAttribute('data-locked', 'true');

  await stageContext.close();
  await joinerContext.close();
});

test('skipping a question shortens the track for everyone', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  const code = await createRoom(host, 3, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  // Wait for a live question, then read the prompt so the swap is provable.
  await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 20_000 });
  await expect(joiner.getByText('Q1/3')).toBeVisible();
  const before = await joiner.getByTestId('question-prompt').innerText();

  await host.getByTestId('host-skip').click();

  // The load-bearing assertion: the round NUMBER is reused and the denominator
  // drops, which is exactly ADR-0038's shortening. QuestionCard's badge row is
  // mounted for the whole of READ/ANSWER/REVEAL, so this cannot false-pass on a
  // detached element the way a `not.toHaveText` on the prompt can — the prompt
  // itself is absent for the first 460ms of the READ stagger.
  await expect(joiner.getByText('Q1/2')).toBeVisible({ timeout: 10_000 });

  // ...and the question really was replaced, not just relabelled.
  const prompt = joiner.getByTestId('question-prompt');
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await expect(prompt).not.toHaveText(before);

  await joinerContext.close();
});

test('ending the race takes every surface to the ceremony', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  const code = await createRoom(host, 3, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 20_000 });
  await joiner.getByTestId('answer-option').first().click();

  // The confirmation is a real gate: the first click ends nothing.
  await host.getByTestId('host-end').click();
  await expect(host.getByTestId('host-end-confirm')).toBeVisible();
  await host.getByTestId('host-end-cancel').click();
  await expect(host.getByTestId('host-end-confirm')).toBeHidden();
  await expect(joiner.getByTestId('results-board')).toHaveCount(0);

  await host.getByTestId('host-end').click();
  await host.getByTestId('host-end-confirm').click();

  await expect(host.getByTestId('results-board')).toBeAttached({ timeout: 20_000 });
  await expect(joiner.getByTestId('results-board')).toBeAttached({ timeout: 20_000 });
  await expect(joiner.getByTestId('results-row')).toHaveCount(2);
  // The strip retires with the race.
  await expect(host.getByTestId('host-strip')).toHaveCount(0);

  await joinerContext.close();
});
```

- [ ] **Step 2: Add the one missing test hook**

`TimerRing` already carries `role="timer"`, and `QuestionCard` already renders
the `Q{round}/{totalRounds}` label the skip test asserts on. The prompt has no
hook. In `components/QuestionCard.tsx`, add one attribute to the `motion.h2` —
no visual change, no copy change:

```tsx
          <motion.h2
            key={`${round}:${question.prompt}`}
            data-testid="question-prompt"
            initial={{ opacity: 0, y: 16 }}
```

- [ ] **Step 3: Run the new spec**

Run: `npm run test:e2e -- --workers=2 e2e/host-control.spec.ts`
Expected: 3 passed.

Run it headed once as well — CURRENT.md records that headless Chromium falls
back to SwiftShader and pins the VFX budget, and every M2 phase from P2 on
verified headed for exactly this reason:
`npm run test:e2e -- --workers=2 --headed e2e/host-control.spec.ts`

- [ ] **Step 4: Run the full regression floor**

Run, in order:
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e -- --workers=2
node scripts/smoke.mjs
```
Expected: unit tests green (429 plus this plan's additions), silent `tsc`, zero
lint problems, a clean build, all Playwright specs passing at `--workers=2`, and
all three smoke sections passing. Record the actual counts — they go into the
progress doc verbatim, not as an estimate.

- [ ] **Step 5: Apply the migration to the cloud project**

Only now, with everything green locally.

Run:
```bash
npx -y supabase@latest db query --linked --file supabase/migrations/0005_host_authority.sql
```
Expected: no `ERROR:`. If the project has been paused by the free tier, restore
it from the dashboard first. Then re-run `node scripts/smoke.mjs` with the cloud
block swapped into `.env.local` to confirm the deployed stack has the commands,
and swap `.env.local` back to the local block afterwards.

- [ ] **Step 6: Write the phase record**

Create `docs/progress/M3-P0-host-authority.md` following the shape of the
existing `docs/progress/P*.md` files: scope, what was built, deviations from
this plan, and the verification results from Step 4 with real numbers. Include:

- the skip-semantics resolution and its pointer to ADR-0038;
- the three new wire fields and their pointer to ADR-0037;
- the **known behaviour** that a skip which makes the current round the new
  final round does not fire the `final-question` escalation, because that cue
  rides the previous TRACK beat (ADR-0021) and a skip lands past it;
- the note that `useHostDriver` still has no unit test, and why.

- [ ] **Step 7: Update the tracker**

In `docs/progress/CURRENT.md`:

- Set **Current phase** to `M3 P0 complete` with a link to
  `M3-P0-host-authority.md`, and **Active task** to `None`.
- Add a note recording that `total_rounds` is mutable mid-game from now on
  (ADR-0038) — any consumer that snapshots it is wrong.
- Add to **Tech debt / known issues**: the missing final-question escalation
  after a skip into the new final round.

- [ ] **Step 8: Commit**

```bash
git add e2e/host-control.spec.ts components/QuestionCard.tsx \
  docs/progress/CURRENT.md docs/progress/M3-P0-host-authority.md
git commit -m "test: two-context coverage for pause, skip and end; record M3 P0"
```

---

## Exit criteria (roadmap §3, P0)

Check each against the work above before declaring the phase done:

| Criterion | Where it is met | How it is proven |
|---|---|---|
| Host pauses mid-ANSWER and player, host and stage all freeze at the same beat position | Tasks 1, 3, 7 | `e2e/host-control.spec.ts` test 1 — the card on three surfaces, the ring holding the same numeral two seconds apart |
| Resume continues from exactly the frozen remainder, no beat replay, no double-advance | Tasks 1, 6 | `scripts/smoke.mjs` (`shiftMs ≈ paused_remaining_ms`, phase and round unchanged) + e2e test 1 |
| Answers are rejected while paused | Task 1 (`submit_answer` status guard), Task 3 (options leave `live`) | smoke `rpcFails(/not accepting answers/)` + e2e keyboard-shortcut assertion |
| Skip discards the current round and lands cleanly on the next | Task 1, ADR-0038 | smoke (`total_rounds` 3→2, one answer for the reused number) + e2e test 2 |
| End-game reaches the ceremony with correct standings | Task 1 | smoke (`Pat` 1 correct, `Chief` 0 — the in-flight round discarded) + e2e test 3 |
| Two-context Playwright coverage | Task 8 | three specs, each driving two or three browser contexts |
| `game-paused` / `game-resumed` cues, the bed ducks | Tasks 4, 5 | `tests/deriveCues.test.ts`, `tests/audioState.test.ts` |
| Accessibility | Task 7 | strip buttons are `components/ui/Button` (focus-visible ring, disabled states), pause toggle carries `aria-pressed`, pause card is `role="status" aria-live="polite"` |
| Regression floor | Task 8 Step 4 | recorded counts in the progress doc |

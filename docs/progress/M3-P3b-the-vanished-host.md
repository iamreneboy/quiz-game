# M3 P3b — The vanished host

- **Status:** Complete. `0010_the_vanished_host.sql` applied to the cloud project and verified there by direct query; the two-context specs re-run green against it. Every local gate green except one browser test that flaked under full-suite load and passes in isolation — named and analysed under Verification results rather than re-run into a green line.
- **Completed:** 2026-08-30
- **Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md` (§3 "P3 — Continuity", the remaining two bullets)
- **Plan:** `docs/superpowers/plans/2026-08-30-m3-p3b-the-vanished-host.md`
- **Branch:** `m3-p3b-the-vanished-host` — isolated git worktree at `../quiz-game-p3b`
- **Method:** `superpowers:executing-plans`, inline (no subagents, at the user's standing instruction), TDD per task, verified against the real local Supabase stack and in a headed browser

## Scope (from the plan)

Make the room survive losing the one client that drives it. Roadmap §3's
remaining two bullets, after P3a took the first three:

- **Host drop.** The show auto-pauses when the host's tab dies, says so on all
  three surfaces, resumes the moment the host is back, and ends gracefully with
  the standings it has if the host is gone five minutes.
- **Room lifecycle.** Rooms stop accumulating forever — purged 24h after
  creation.

The phase's named hardest question — *who calls pause when the host is the one
who vanished* — is resolved here rather than deferred (ADR-0051).

## What was built

**`supabase/migrations/0010_the_vanished_host.sql`** (new, idempotent, written
across two tasks and re-applied after each):

- `host_absence_pause_ms()` → 9000 (three of 0009's `presence_report_ms()`) and
  `host_absence_end_ms()` → 300000 (PRD §9's five minutes).
- `host_absent(rooms)` — the derived predicate. A null `host_seen_at` is *not*
  absence: "has never checked in" is every pre-0009 room, and it is not "has
  vanished".
- `phase_event` and `get_room_state` gain exactly one key, `host_absent`
  (ADR-0052 — the wire's fifth opening).
- `end_room_now(room_id)` — the finish, lifted verbatim out of `end_game` so the
  graceful end and the host's own End race button share one definition rather
  than two bodies that must stay in step. Revoked from `public`, `anon` and
  `authenticated`; both callers are `security definer`.
- `end_game` becomes a thin command over it, guards unchanged.
- `sweep_host_absence(room_id)` — the keyless trigger. Returns SQL `null` when
  it changed nothing, so a herd of callers produces at most one phase event.
  Silent no-op on a lobby, a finished room, a null heartbeat, a fresh heartbeat,
  and an already-paused room (that last is the freeze-destroying trap
  `pause_game` guards, for the identical reason).
- `purge_rooms()` + `idx_rooms_created_at` + a statement-level `before insert`
  trigger on `rooms`. PRD §9's "cleanup on access", with no scheduler to own.

**Client:**

- `lib/presence.ts` gains `electSweeper(snap, hostPlayerId, myPlayerId)` — pure,
  deterministic, identical on every client, so ten players make one call per
  tick rather than ten.
- `lib/pause.ts` gains `isHostAbsent(room)` — requires *both* `status ===
  'paused'` and `host_absent === true`.
- `lib/types.ts` / `lib/store.ts` carry `host_absent`, folding an absent key to
  `false`.
- `lib/useHostAbsenceSweep.ts` (new) — the elected client's 3-second loop,
  broadcasting through the same broadcast-and-apply path every host command
  uses. Deliberately no leading `void sweep()`: an immediate sweep on every
  mount would burst RPCs on each status change, and the threshold is nine
  seconds anyway.
- `lib/useHostPresenceReporter.ts` — auto-resume, *after* the heartbeat that
  earns it, and only when `isHostAbsent` says the pause was involuntary.
- `components/PauseCard.tsx` — two stories, one card, `data-reason="host" |
  "absence"`.

## Deviations from the plan

Three, all recorded in the code at the point of the change.

1. **`get_room_state` was rebased on `0009_presence.sql`, not on the
   `0007_the_tiebreak.sql` body the plan quoted.** 0009 is the live definition
   and it had already added `host_seen_at` to the same room object; applying the
   plan verbatim would have silently dropped that key back off the projection —
   and `host_seen_at` is exactly what this phase's predicate reads. Caught by
   diffing the plan's copy against the live function before applying, not by a
   failing test. Written into ADR-0052 as a standing obligation for any future
   replacement of that function.

2. **`end_room_now` is revoked from `public, anon, authenticated`; the plan's
   blanket `grant execute on all functions` would have exposed it.** ADR-0051
   admits a keyless RPC only when the caller gains nothing — and `end_room_now`
   is the *mechanism*, with no key check and no status check, so a reachable one
   would let any client end any race. That is precisely what the ADR's own bar
   excludes, so leaving it granted would have contradicted the decision the
   plan was implementing.

   **`public` had to be in the revoke list, and that was found by checking
   rather than by assuming.** Postgres grants `EXECUTE` on every new function to
   `PUBLIC` by default, so the first attempt —
   `revoke … from anon, authenticated` — left the function fully reachable:
   `has_function_privilege('anon','end_room_now(uuid)','execute')` still
   answered `t`. With `public` added it answers `f`, while
   `sweep_host_absence` stays `t` and the whole smoke flow (which ends a race
   through `end_game`) still passes.

3. **Task 6 Step 2's three-profile manual check was performed as the headed
   Playwright run of Task 8 Step 2 instead**, which drives the identical three
   surfaces (host tab, joiner, `/stage/<CODE>`) in a real headed browser and
   asserts each thing the manual step asked to be seen — `data-reason`, the
   wording, the frozen ring, the continued (not replayed) beat, and the
   deliberate pause never auto-resuming. Findings below.

One further, smaller note: `tests/pause.test.ts` takes `isHostAbsent` on the
existing top-of-file import rather than the appended `import` the plan showed,
which would have sat below the test bodies.

## Verification results

Run in the worktree, against the real local Supabase stack.

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | silent |
| Lint | `npm run lint` | zero problems |
| Unit | `npm test` | **612 passed** (44 files) — 600 before this phase, +12 from `tests/hostAbsence.test.ts` (8) and `tests/pause.test.ts` (4) |
| Build | `npm run build` | clean |
| SQL integration | `node scripts/smoke.mjs` | all 11 sections pass, ending `✅ P3b host-absence smoke passed` |
| Two-context, headed | `npx playwright test e2e/host-absence.spec.ts --workers=1 --headed` | **2 passed (1.2m)** |
| Full browser suite | `npm run test:e2e -- --workers=1` | **41 passed, 1 failed (13.4m)** — the failure is `e2e/stage.spec.ts:44`, and it is the documented load flake, not a regression; see below |

The smoke run is ~10s longer than before by design: the one wall-clock wait in
the harness is the 10s that carries `host_seen_at` past the 9s threshold.

**On the one failing browser test.** `e2e/stage.spec.ts:44` ("the stage view
follows a live game without a session") failed at line 124 — an
`expect(optionAfter.y).toBeCloseTo(optionBefore.y, 0)` sub-pixel layout-stability
measurement taken across a phase transition on the stage surface. It was
**re-run in isolation immediately afterwards and passed, 4/4 in that file**. It
is not a P3b regression by inspection either: nothing in this phase touches the
stage surface's layout, the stage route does not mount `useHostAbsenceSweep`,
and `PauseCard` — the one component P3b changed that renders on a television —
returns null unless the room is paused, which it is not at any point in that
test. This matches the flake signature CURRENT.md already records for this exact
spec under load (an animated element measured or clicked mid-transition). Called
out rather than quietly re-run into a green line.

## Live-verification findings

**Task 8 Step 2 — headed, three surfaces, both tests passed.** Killing the
host's tab mid-ANSWER put the card on both the joiner and the stage inside the
40s allowance with `data-reason="absence"` and the words *Host disconnected*;
the ring held a non-zero number and read the *same* number two seconds later
(frozen, not settled) while the options were disabled; reopening the host in the
same browser context — session intact, so it came back as the host — cleared the
card on both surfaces, re-enabled the options, and the ring resumed at or below
where it froze on round Q1/2 rather than restarting. The second test then held a
*deliberate* pause through 15 seconds (four heartbeats and four sweep ticks)
with `data-reason="host"` and no auto-resume, exactly as `isHostAbsent`'s two
conditions require.

`aria-live` re-announcement needed no `key` churn, as the plan predicted: the
headline and body change together, so the region re-announces on content change
alone.

**Task 7 Step 4 — the 24-hour boundary, by hand against the local stack.** The
harness cannot backdate a room (the anon role has no table grants), so this was
crossed directly:

```
 before
--------
    892
UPDATE 1
 purged
--------
      1
 after
-------
    891
```

Then the trigger, firing on its own:

```
UPDATE 891
 stale
-------
   891
INSERT 0 1
 after_insert
--------------
            1
```

Every stale room went on the insert; only the new one remained. Note the side
effect: this reclaimed 891 accumulated local smoke-test rooms in one statement,
which is the debt the purge exists to bound.

**A pre-existing hydration warning was observed in the dev-server log during the
headed run** and is *not* this phase's: `app/room/[code]/page.tsx:131` renders
`className={\`relative z-10 ${isHost ? 'pb-16' : ''}\`}` from a
`typeof window !== 'undefined'` read, so server and client markup differ. It
predates P3b and was left alone.

## Cloud application

`0010_the_vanished_host.sql` was applied to `niznfbabmixesfvxlypi` after the
branch merged:

```
npx -y supabase@latest db query --linked --file supabase/migrations/0010_the_vanished_host.sql
```

Verified by direct query rather than by `supabase migration list --linked`
(which understates what is applied — `db query --linked --file` does not write
the migration history table):

```
 fns | trg | anon_end_room_now | anon_sweep
-----+-----+-------------------+------------
   7 |   1 | f                 | t
```

All seven functions present, the `rooms_purge_expired` trigger in place, and the
`end_room_now` revoke holding on cloud exactly as it does locally.

**Then the two-context browser specs were re-run pointed at the cloud project**
— `.env.local` swapped to the cloud block, `npm run dev` restarted by
Playwright's `webServer`:

```
npx playwright test e2e/host-absence.spec.ts e2e/presence.spec.ts --workers=1
  5 passed (3.1m)
```

This mattered more here than in most phases: M3 P2a's `player_joined` bug was a
latency-ordering fault that only a remote database exposed (ADR-0048), and this
phase adds three timing-sensitive client loops — the sweep interval, the
report-then-resume ordering, and the elected caller re-reading presence each
tick. All three hold across a real `ap-northeast-1` round trip. `.env.local` was
restored to the local stack afterwards.

## Notes for phases that inherit this work

- **`sweep_host_absence` is the project's only keyless mutating RPC, and
  ADR-0051 is the bar for a second.** A keyless RPC is admissible exactly when
  the caller gains nothing the data did not already entitle anyone to. Anything
  that needs the *caller* to be somebody takes a key.
- **A `security definer` helper that skips the guards must be revoked from
  `public`, not just from `anon`/`authenticated`.** Postgres grants EXECUTE to
  PUBLIC by default; `end_room_now` is the first function in this project to
  need that walk-back, and `has_function_privilege` is how to check it rather
  than trusting the revoke.
- **`host_absent` is derived per read, never stored.** A stored `paused_reason`
  was rejected, and `pause_game`, `resume_game`, `skip_question` and `end_game`
  are deliberately untouched — that is what lets a room the host paused
  deliberately and then abandoned change its own story.
- **The auto-resume's heartbeat-then-read ordering is load-bearing.**
  `useHostPresenceReporter` reports first (which clears `host_absent`
  server-side) and *then* reads the flag from the store, i.e. from before that
  heartbeat. Reordering those two calls breaks the distinction between a
  returning host and one who never left.
- **Nine seconds is three of `presence_report_ms()`.** A fourth hand-mirror in
  the `NOMINAL_MS` / `ceremony_ms()` tradition: if the report cadence moves,
  `host_absence_pause_ms()` moves with it.
- **A room with only a stage view, or with no clients at all, is never swept.**
  A TV holds no player id so it can never be elected, and `useHostAbsenceSweep`
  is not mounted on that route. Such a room sits until the purge takes it.
- **Any replacement of `get_room_state` or `phase_event` must carry every key
  the LIVE definition has, not the one a plan quotes.** This phase nearly
  dropped `host_seen_at` that way; the functions have now been replaced by six
  migrations in a row and each one re-states the whole body.
- **The purge finally bounds `rooms.used_question_ids`**, closing the unbounded-
  growth note M3 P2b left behind: the array dies with the row.

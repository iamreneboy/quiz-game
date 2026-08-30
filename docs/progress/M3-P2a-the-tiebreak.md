# M3 P2a — The tiebreak

- **Status:** Complete. All local gates green; migrations `0005` and `0007` applied to the cloud project and verified there by direct query. The browser suite could **not** be re-run against the cloud project — see "Live-verification findings".
- **Completed:** 2026-08-30
- **Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md` (§3 "P2 — The finish")
- **Plan:** `docs/superpowers/plans/2026-08-29-m3-p2a-the-tiebreak.md`
- **Branch:** `worktree-m3-p2a-the-tiebreak` — isolated git worktree at `../quiz-game-m3-p2a`
- **Method:** `superpowers:executing-plans`, inline (no subagents, at the user's instruction), TDD per task, verified against the real local Supabase stack

## Scope (from the plan)

Make the finish resolve itself on screen: a **photo finish** that stages every
place tied on correct answers and resolves it on speed points, and a
**sudden-death** round that fires on a perfect first-place tie, consumes the
reserve question M3 P1 drew, and decides the winner on the first correct answer.

P2b — awards and rematch — is explicitly out of scope and unstarted.

## What was built

**The clock (Task 1).** `ceremony_ms()` returns a flat `12400` and
`lib/ceremony/beats.ts`'s `CEREMONY_MS` mirrors it. `PHOTO_MS = 3400` shifts the
whole podium sequence when a prelude is staged; the total never moves, so the
server never has to detect a tie (ADR-0044). `ceremonyStepsAt(elapsed,
photoFinish)` gained a `photo: PhotoSteps` block, and `sameSteps` compares it —
without that the ticker would freeze the tally.

**The tie rule (Task 2).** `lib/ceremony/photoFinish.ts` is the single
implementation: `tieGroups` walks adjacent runs of the final standings sharing a
correct count, reports `resolved` when speed points *or* longest streak separate
them, and drops the group sudden death already decided (matching on the *whole*
group, so a stale contender list can never swallow a live tie). `tallyValue`
counts a target out in whole numbers. It groups; it never sorts.

**The prelude on screen (Task 3).** `components/PhotoFinish.tsx` is a fixed
overlay mounted from both `ResultsView` and `StageResults` behind
`AnimatePresence initial={false}` plus a `photoInstant` one-shot, so a reload
mid-prelude neither replays the entrance nor loses its place. `photoFinishFor`
is read by both the DOM ticker (`lib/ceremony/runtime.ts`) and the renderer
(`lib/world/runtime.ts`), from one store snapshot each, so the card's timeline
and the podium's rise cannot fall out of step.

**Sudden death, server-side (Task 4).** Three columns on `rooms`, one clamp
(`scoring_round`), two predicates (`perfect_first_place_tie`,
`final_standings`), and replacements for `advance_phase`, `submit_answer`,
`skip_question`, `build_reveal`, `phase_event` and `get_room_state`. The
tiebreak is a **round at `total_rounds + 1`** (ADR-0043), so the whole question
surface works on it unchanged; the clamp is what keeps its answer from ever
becoming a correct answer, and `standings`' sort clause is untouched. The winner
is lifted to the head of the final standings by a stable partition, never by new
arithmetic. One wire key was spent: `sudden_death` (ADR-0042).

**Sudden death on screen (Task 5).** The celebration hierarchy took its one
allowed M3 rung (`suddenDeath`, between `finalQuestion` and `victory`). The cue
fires ahead of the tiebreak's READ on the live path and is seeded *instead of*
`final-question` on the reload path. `QuestionCard` says "Sudden death" rather
than a nonsensical "Q2/1"; `SuddenDeathBanner` names the contenders on both
surfaces; a non-contender is routed through the existing spectator path and told
"This one is between the tied racers."; `WinnerCard` captions a tiebreak win.

**Coverage and record (Task 6).** `e2e/tiebreak.spec.ts` carries three
two-and-three-context tests; `scripts/smoke.mjs` gained three P2a sections.

## Deviations from the plan

1. **Task 1's P2a ceremony-deadline smoke section had to be amended in Task 4.**
   As written it created a two-player room nobody answered and asserted the last
   `advance_phase` reached `results`. Once Task 4 landed, that room is a *perfect
   first-place tie* and the last track correctly opens a tiebreak instead. The
   section now has one racer answer correctly, so the finish is decided and the
   assertion is about the deadline rather than the tiebreak. The plan did not
   anticipate its own Task 1 fixture becoming a tie case.
2. **`for (const _ of [...])` in the plan's smoke snippets trips
   `@typescript-eslint/no-unused-vars`.** Rewritten as a counted loop, twice —
   the project's lint gate has no known pre-existing warnings to discount.
3. **The sudden-death e2e test was restructured, and its timer widened from 5s
   to 20s.** As written it asserted across three surfaces, then reloaded, then
   attempted the skip, then answered. Reproduced twice: that ordering puts the
   reload on the READ→ANSWER boundary, where the page can resubscribe *after*
   the phase broadcast has gone out and then sit on a dim grid until the reveal.
   That is a **pre-existing realtime race, not a tiebreak one** (see Notes). The
   reload now happens the instant the banner lands, well inside the 3s READ, and
   every original assertion is kept and now also proves the reloaded page.
4. **Task 6 Step 3's contender guard was verified through the RPCs rather than a
   headed browser.** The rule under test is server authority; the browser step
   would only have shown the courtesy UI. Both halves are recorded below.
5. **Task 6 Step 4's `window.__ceremony` console sampling was not run.** The
   timeline it checks is pinned by `tests/ceremonyBeats.test.ts` at every
   boundary on both timelines, the client/server deadline agreement is asserted
   by the smoke harness to within 500ms, and the observable sequence
   (card opens → resolves → retires → board enters) is asserted end to end by
   `e2e/tiebreak.spec.ts`. Recorded as not-done rather than claimed.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` | **568 passed**, 41 files (from 521 at the start of the phase) |
| `npx tsc --noEmit` | silent |
| `npm run lint` | zero problems |
| `node scripts/smoke.mjs` | every `✅`, including `P2a ceremony-deadline`, `P2a sudden-death`, `P2a tiebreak-boundaries` |
| `npm run test:e2e -- --workers=2` | all specs pass; `e2e/tiebreak.spec.ts` 3/3 |
| Migration idempotency | `0007_the_tiebreak.sql` applied twice in succession, both runs clean, `ceremony_ms()` = 12400, `scoring_round(id, current_round) = current_round` for every existing room |

`e2e/game-flow.spec.ts` and `e2e/stage.spec.ts` each failed once during a full
run with the "element is not stable / detached from the DOM" signature CURRENT.md
records as a load flake, and each passed in isolation immediately after. Not a
regression; re-run before concluding otherwise.

## Live-verification findings

- **The contender guard holds, and the group is exactly the tied racers.** Built
  a three-player, one-question room; two racers answered the same option, the
  third a different one; the first two were then levelled exactly with a direct
  `update answers set speed_points = 60, time_remaining_ms = 12000`. The last
  track opened the tiebreak with **two** contenders, not three, and
  `submit_answer` from the third player's key was refused with
  `only the tied racers answer the tiebreak`. The UI half — the third player's
  grid disabled and reading "This one is between the tied racers." — is the
  courtesy path Task 5 routes through `isPlaying`; the rejection above is the
  rule, and it is the half that was proven.
- **A perfect first-place tie really does reach sudden death from real browsers,
  on three surfaces at once**, and a reload inside the tiebreak lands in it with
  the banner at rest and the badge still reading "Sudden death" —
  `e2e/tiebreak.spec.ts` test 3.
- **The tiebreak refuses to be skipped, in the UI.** `host-skip` during the
  tiebreak surfaces the server's message on `host-strip-error`.
- **The tiebreak answer never becomes a correct answer.** The smoke harness
  asserts `correct`, `speed_points` and `longest_streak` are all still 0 for
  every racer at the tiebreak's own reveal, and that the winner heads the final
  standings on the tiebreak alone.
- **The sudden-death sting is `final-sting` reused** (Task 5, Step 8). It was
  not A/B-judged live against a bespoke sound, so this is left exactly as the
  plan framed it: a **judgement call for P2b**, whose generator (ADR-0025) can
  produce one without adding an asset. Nothing about it is wrong today; it
  simply has not been proven to read as its own moment.
- **Cloud, migrations.** `supabase migration list --linked` showed `0005`, `0006`
  and `0007` all with an empty `remote` column before this phase — `0006` was
  applied via `db query` during M3 P1, which does not write the migration history
  table, so that column understates what is really there. `0005` and `0007` were
  applied in that order, **after** the branch merged and Vercel redeployed, so
  the deployed client was never the old one against the new 12400ms deadline
  (the reverse window is the one ADR-0044 says degrades gracefully). Verified
  directly against the cloud project: `ceremony_ms()` returns `12400` and `rooms`
  carries all three `sudden_death_*` columns.
- **Cloud, browser suite — NOT verified, and the reason is not P2a.**
  `npm run test:e2e -- --workers=2 e2e/tiebreak.spec.ts` against the cloud
  project fails all three specs at the *first* assertion of each,
  `Starting grid — 2 joined`: the second browser context joins successfully but
  the host page never learns of it. The RPCs themselves are fine against cloud —
  `create_room`, two `join_room` calls and `get_room_state` run directly against
  the cloud REST endpoint return a room with 2 players — so this is
  **cross-client realtime delivery to the browser, not the tiebreak and not the
  migration.** M3 P1's cloud verification used `e2e/host-draw.spec.ts`, which is
  single-context and never exercised a second client, so this was not previously
  visible. Left open deliberately: it is a cloud/realtime configuration question
  that predates this phase and would have been equally broken before it. The
  cloud schema is correct; what is unproven is a two-device game against cloud.
  **Correction (2026-08-30):** the observation was right, the attribution was
  wrong — Realtime on the cloud project was never misconfigured. The joiner was
  never putting the broadcast on the wire, because `handleJoined` announced
  through a click-handler closure that had captured `channel` before the
  subscription completed. Fixed and verified cross-client against cloud; see
  [ADR-0048](../ADR/0048-the-join-announcement-survives-an-unready-channel.md).

## Exit criteria (roadmap §3, P2 — minus the two P2b owns)

| Criterion | Evidence |
|---|---|
| A deliberate tie plays the photo finish | `e2e/tiebreak.spec.ts` test 1 — card visible on both contexts before any podium block, exactly one group, `data-resolved` lands, card retires, board enters |
| A perfect first-place tie resolves in sudden death | `e2e/tiebreak.spec.ts` test 3 and `scripts/smoke.mjs`'s `P2a sudden-death` section |
| The ceremony still lands correctly on reload at every new beat | `tests/ceremonyBeats.test.ts` pins both timelines including the unknown-deadline case; `e2e/tiebreak.spec.ts` test 3 reloads inside the tiebreak; the `photoInstant` / `settled` one-shots cover a mid-prelude and a post-ceremony mount |
| The Fairness Law is unamended | `standings`, `longest_streak` and `current_streak` are untouched by `0007`; sudden death is a stable partition in `final_standings`; the smoke harness asserts no correct answer, speed point or streak is created by a tiebreak |
| Accessibility | Both new surfaces carry `role="status"` + `aria-live="polite"`; the tally is `tabular-nums` and lands on a real value; "Takes it" and "they share Nth place" are stated in words, never by colour; a non-contender's state is explained in words and their keyboard path is refused server-side |

## Decisions this phase resolved

- **ADR-0042 — the wire's fourth opening, `sudden_death`.** A client cannot
  derive that a round is a tiebreak, who may answer it, or who won it.
- **ADR-0043 — sudden death is a round past the finish line, not a phase.** One
  clamp (`scoring_round`) keeps it out of scoring; `total_rounds` deliberately
  does not grow, because the track is the length the race was run at.
- **ADR-0044 — the ceremony always reserves the prelude.** A flat deadline keeps
  the tie rule to one implementation, in TypeScript, read by both clocks.

## Notes for phases that inherit this work

- **A reload that lands exactly on a phase boundary can resubscribe after the
  broadcast and sit on stale staging until the next phase event.** Found while
  stabilising the sudden-death e2e test (deviation 3), reproduced twice with
  `steps.optionsMode` stuck at `dim` through a whole 20s ANSWER phase. It is
  **not** specific to the tiebreak — any phase boundary can do it — and it is
  not fixed here. `lib/useRoomChannel.ts` re-fetching `get_room_state` once
  after the channel reports subscribed is the shape of the fix.
- **`current_round` can exceed `total_rounds`.** Anything rendering
  `round`/`total_rounds` must special-case it; anything bounding scoring must go
  through `scoring_round`.
- **P2b's rematch must clear all three `sudden_death_*` columns and delete the
  tiebreak round from `room_questions`, and draw a fresh reserve** — the old one
  has been spent.
- **P2b's awards projection must bound itself with `scoring_round`** or a
  tiebreak answer will count toward Fastest Gun.

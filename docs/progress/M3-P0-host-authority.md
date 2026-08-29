# M3 P0 — Host authority & the control strip

- **Status:** Implementation complete; all gates green, verified against both local and cloud Supabase
- **Completed:** 2026-08-29
- **Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md` (§3 "P0 — Host authority & the control strip")
- **Plan:** `docs/superpowers/plans/2026-08-29-m3-p0-host-authority.md`
- **Branch:** `worktree-m3-p0-host-authority` — isolated git worktree at `.claude/worktrees/m3-p0-host-authority`
- **Method:** `superpowers:executing-plans`, TDD per task, headed Playwright verification against the real local Supabase stack, migration verified against both the local stack and the linked cloud project

## Scope (from the plan)

Give the host real control of a running game — pause, resume, skip a question,
end the game — enforced server-side on every command, and show a paused room
correctly on all three surfaces (player, host, stage). `'paused'` joins
`rooms.status`; freeze-and-shift is the pause model (`pause_game` stores the
remaining ms and clears `phase_ends_at`, `resume_game` writes a fresh deadline
from it); a skip renumbers the track down by one segment rather than leaving a
hole (ADR-0038, resolving the one decision the roadmap left open for this
phase).

## What was built

8 tasks, executed sequentially with a test/typecheck/lint pass after each and
a commit per task:

| # | Task | Key files |
|---|---|---|
| 1 | Migration 0005 — the paused status and the four host commands | `supabase/migrations/0005_host_authority.sql`, `scripts/smoke.mjs`, `docs/ADR/0038` |
| 2 | The wire — three new phase-event fields | `lib/types.ts`, `lib/store.ts`, `tests/store.test.ts`, `docs/ADR/0037` |
| 3 | The frozen beat — `lib/pause.ts` and the two runtimes | `lib/pause.ts`, `lib/staging/staging.ts`, `lib/staging/runtime.ts`, `lib/audio/runtime.ts`, `tests/pause.test.ts`, `tests/staging.test.ts` |
| 4 | The cues — `game-paused`, `game-resumed`, and a skip that re-fires the beat | `lib/presentation/cues.ts`, `lib/presentation/deriveCues.ts`, `tests/deriveCues.test.ts` |
| 5 | Audio — the bed ducks while paused | `lib/audio/state.ts`, `lib/audio/mixer.ts`, `lib/audio/runtime.ts`, `tests/audioState.test.ts` |
| 6 | `useHostDriver` becomes the host command layer | `lib/useHostDriver.ts` |
| 7 | The control strip and the pause card, on all three surfaces | `components/PauseCard.tsx`, `components/HostControlStrip.tsx`, `components/GameView.tsx`, `app/room/[code]/page.tsx`, `components/stage/StageBroadcast.tsx` |
| 8 | Two-context Playwright coverage, the regression floor, and the record | `e2e/host-control.spec.ts`, `components/QuestionCard.tsx`, this file, `docs/progress/CURRENT.md` |

Unit suite went 470 (this worktree's baseline, ahead of CURRENT.md's
last-recorded 429) → 495. Two ADRs:
[0037](../ADR/0037-the-wires-third-opening.md) (why `status`,
`paused_remaining_ms` and `total_rounds` join the phase event) and
[0038](../ADR/0038-a-skipped-round-shortens-the-track.md) (why a skip
renumbers and decrements rather than leaving a hole).

## Deviations from the plan

1. **Task 7 Step 6's manual, headed-browser verification was not performed by
   hand.** This execution has no direct mouse/keyboard control of a real
   browser window. Task 8's headed Playwright run (`--headed`) exercises the
   identical flows — pause landing on all three surfaces, the ring holding a
   frozen numeral, answers disabled including the 1-4 shortcut, resume
   continuing without a replay, skip, and end with its confirmation — with real
   assertions instead of eyeballing, so the same ground got covered by a
   stronger check.

2. **`e2e/host-control.spec.ts`'s "question really was replaced" assertion
   needed a filter, not a bare `getByTestId`.** `QuestionCard`'s prompt is
   wrapped in `AnimatePresence` keyed on `${round}:${prompt}`; during a skip
   the exiting old `<h2 data-testid="question-prompt">` and the entering new
   one briefly coexist in the DOM, so a bare `getByTestId('question-prompt')`
   is a strict-mode race — reproduced deterministically on a repeat run.
   Fixed by locating `.filter({ hasNotText: before })` instead, which is
   robust to either render order. This is a test-authoring fix, not a product
   bug: the "Q1/2" denominator assertion immediately above it, which is the
   plan's own load-bearing check for the shortened track, was never affected.

3. **`scripts/smoke.mjs`'s P0 section had a flaky assumption, found and fixed
   during Step 4's regression floor.** The section draws 3 tier-1 questions
   from `['fuel', 'ai-tech']` and has both players submit `p_choice_index: 0`,
   assuming that choice is always correct — true for the two tier-1 `fuel`
   questions the pre-existing game-flow smoke section relies on, but the
   pool here also contains `ai-tech`'s "What does www stand for", whose
   `correct_index` is `3`. When that question landed on the round the skip
   test resolves, `pat.correct` came back `0` against a hardcoded expectation
   of `1` — reproduced deterministically via a standalone repro script and
   confirmed against the seed data directly. The migration itself was verified
   correct throughout (the repro's full pause → resume → skip → end sequence
   matched expectations exactly whenever the drawn question was one of the
   three `correct_index: 0` candidates). Fixed by reading `correct_index` off
   the reveal payload the flow already receives and computing the expected
   `pat.correct` from it, rather than assuming — the `chief.correct` assertion
   was never at risk, since `end_game` discards the in-flight round's answers
   regardless of correctness. Confirmed deterministic across 5 consecutive
   local runs after the fix.

## Verification

All gates green on the final tree, local and cloud:

| Command | Result |
|---|---|
| `npx tsc --noEmit` | silent |
| `npm run lint` | zero problems |
| `npx vitest run` | 495 passed (38 files) |
| `npm run build` | compiled clean |
| `npm run test:e2e -- --workers=2` | 28 passed |
| `npm run test:e2e -- --workers=2 --headed e2e/host-control.spec.ts` | 3 passed |
| `node scripts/smoke.mjs` (local stack) | lobby, game-flow, P0 host-authority all passed — 5 consecutive runs after the fix above |
| `node scripts/smoke.mjs` (cloud project `niznfbabmixesfvxlypi`) | all three sections passed |

Migration 0005 applied to both the local stack (`docker exec` into
`supabase_db_quiz-game`) and the linked cloud project (`supabase db query
--linked`), the latter confirmed `ACTIVE_HEALTHY` (not paused) before the
run.

## Known and accepted (not P0 defects)

- **A skip that makes the current round the new final round does not fire the
  final-question run-up.** That escalation rides the *previous* TRACK beat
  (ADR-0021); a skip lands past it. `deriveCues`' seed path already covers "in
  the final round without having seen the run-up" for a reload, but the live
  path does not. Documented in ADR-0038 and in CURRENT.md's tech debt.
- **`lib/useHostDriver.ts` has no unit test**, for the same reason the
  pre-existing `advancing` ref never got one: this repo has no React-hook test
  infrastructure (`vitest.config.mts` includes only `tests/**/*.test.ts`, no
  `@testing-library/react`/jsdom), and building that infra to pin the new
  `commanding` ref's timing guard would be out of proportion. Verification is
  `tsc`, lint, and Task 8's two-context Playwright coverage, which exercises
  every command for real.
- **`total_rounds` is now mutable mid-game.** Any future consumer that
  snapshots it at room creation rather than reading it off the live phase
  event or store is wrong. `lib/store.ts` and `lib/presentation/deriveCues.ts`
  both already treat it as live (ADR-0037, ADR-0038).

## Carried forward

- `lib/useHostDriver.ts`'s intermittent `advance_phase` 400 (closed by
  inference in an earlier phase) was not seen again during this phase's
  verification, including the headed e2e runs.
- The e2e suite remains sensitive to machine load at the default worker
  count; `--workers=2` is required, as recorded in CURRENT.md.

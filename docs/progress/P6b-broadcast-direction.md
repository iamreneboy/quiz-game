# P6b — Broadcast direction

- **Status:** Implementation complete; all gates green and live-verified headed at three viewport sizes
- **Completed:** 2026-08-24
- **Spec:** `docs/superpowers/specs/2026-08-24-m2-p6b-broadcast-direction-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md`)
- **Plan:** `docs/superpowers/plans/2026-08-24-m2-p6b-broadcast-direction.md`
- **Branch:** `worktree-p6b-broadcast-direction` — isolated git worktree at `.claude/worktrees/p6b-broadcast-direction`
- **Method:** `superpowers:executing-plans`, TDD per task, live headed Playwright verification against the real local Supabase stack

## Scope (from the spec)

Direct the stage view for a television: give the world-framing pipeline a
vertical contract, give the stage its own camera shot book and broadcast
layout, and clear the two framing debt entries living in the same code
(`MAX_STACK_RISE` at every aspect ratio, and the winner's podium rig clipped by
the retreated results band). Also picks up two adjacent debt entries the same
files touch: `TRACK_MARGIN`'s run-off, and the confetti budget seed.

## What was built

8 tasks, executed sequentially with a typecheck/lint/unit pass after each and a
commit per task:

| # | Task | Key files |
|---|---|---|
| 1 | The stack rise limit | `lib/world/framing.ts`, `lib/world/geometry.ts`, `lib/world/podium.ts`, `lib/world/runtime.ts`, `tests/framing.test.ts` |
| 2 | The podium vertical fit and the room shot | `lib/world/framing.ts`, `tests/framing.test.ts` |
| 3 | Widen the run-off | `lib/world/geometry.ts`, `tests/geometry.test.ts` |
| 4 | The stage shot book | `lib/world/director.ts`, `lib/world/camera.ts`, `lib/world/runtime.ts`, `lib/presentation/tokens.ts`, `app/globals.css`, `components/PixiStage.tsx`, `tests/director.test.ts` |
| 5 | The title-safe broadcast frame | `app/globals.css`, `components/LowerThird.tsx`, `components/stage/StageBroadcast.tsx`, `tests/tokens.test.ts`, `e2e/stage.spec.ts` |
| 6 | The reveal fills columns | `components/stage/StageOptions.tsx`, `components/stage/StageBroadcast.tsx`, `e2e/stage.spec.ts` |
| 7 | Split the ceremony, seed the confetti budget | `lib/world/vfxBudget.ts`, `lib/world/runtime.ts`, `components/PixiStage.tsx`, `components/stage/StageBroadcast.tsx`, `components/stage/StageResults.tsx`, `tests/vfxBudget.test.ts`, `e2e/stage.spec.ts` |
| 8 | ADRs, phase record, tracker | `docs/ADR/0033`–`0036`, this file, `docs/progress/CURRENT.md` |

Unit suite went 444 → 467. Four ADRs: [0033](../ADR/0033-the-vertical-framing-contract-is-two-levers.md),
[0034](../ADR/0034-the-stage-ceremony-splits-horizontally.md),
[0035](../ADR/0035-the-stage-rescales-by-scoped-token-override.md),
[0036](../ADR/0036-the-shot-book-is-role-selected.md).

`geometry.ts` stayed viewport-free throughout: it takes the rise limit as a
plain `number`, defaulted to `MAX_STACK_RISE`, so every pre-existing caller and
test kept asserting today's behaviour unchanged. 16:9 is bit-for-bit unchanged,
asserted by exact equality in both directions (`stackRiseLimit(1920×1080) ===
MAX_STACK_RISE`; `frameTarget('podium').span === 921.6`).

## Deviations from the plan

1. **The plan itself split spec §1's task 1 into two tasks** (stacks, then
   podium), because a reviewer can meaningfully reject one while approving the
   other. Eight tasks executed, scope identical. This was declared in the plan,
   not invented during execution.

2. **The aspect sweep's floored branch asserts a different invariant than spec
   §3.3 predicted.** The spec said that where `stackRiseLimit` is floored,
   `offscreenPlayerIds` would name the clipped players. It does not, and must
   not: that function reports only rigs **entirely** off canvas, deliberately,
   because the 28vh question band clips heads by design and flagging the whole
   field there would be noise (its own docstring says so). What actually holds
   is weaker but true — nobody vanishes, and the clip is a trim. Measured worst
   case across the 4:3→32:9 sweep is **19px off a 668px rig (2.8%) at
   3816×1080**; only four of ~200 sampled viewports clip at all, all past
   3.48:1. The sweep asserts `offscreenPlayerIds(...) === []` plus a 5%-of-rig
   bound instead. Recorded in ADR-0033.

3. **`RevealPanel` renders *above* the option columns on the stage, not below.**
   The plan put it below. The floor is bottom-anchored (`bottom-[5%]`), so a
   panel below the columns pushed the whole row up by its own height at the
   reveal — a 32px move, i.e. exactly the ADR-0019 violation the new e2e
   measurement exists to catch. Reordering fixes it: the panel grows the floor
   upward into empty backdrop and the answers stay put.

4. **The e2e "in place" measurement waits for the entrance to settle.** The
   plan compared raw bounding boxes; the ANSWER-time box was captured mid-stagger
   and carried the variant's own `y: 14` mount-in offset, producing a false 14px
   "reflow". A `settledBox` helper (two consecutive agreeing reads) makes the
   comparison meaningful.

5. **`director.ts`'s "expire together" comment was misleading and was
   corrected.** The camera transient and the DOM callout do not overlap in time
   at all — the callout deliberately lands `ARENA_AT_MS` later, on the arena
   beat. They share one hold *duration*. `STAGE_DRAMA_HOLD_MS` is exported so
   `LowerThird` cannot drift from it.

6. **`e2e/stage.spec.ts`'s READ-beat assertion was loosened to `/^(read|answer)$/`.**
   READ lasts 3s (`supabase/migrations/0002_rpcs.sql`) and Playwright's attribute
   poll backs off to 1s intervals, so under full-suite load a single poll can
   straddle the whole beat — it failed three times running under load and passed
   every time in isolation. The beat machinery is still asserted exactly at
   answer, reveal, track and results, all longer or terminal.

7. **The stage `data-testid="stage-band"` hook is gone**, replaced by
   `stage-floor`, because the centred band it named no longer exists. The two
   e2e assertions that used it now target the floor.

8. **`fieldAnchors` is also called from the cue subscriber**, one line the plan
   did not mention; it passes `stackRiseLimit` off `app.screen` too, so the
   anchors a `Sequence` is built against match the anchors the tick renders.

## Verification

All five gates on the final tree:

| Command | Result |
|---|---|
| `npx tsc --noEmit` | silent |
| `npm run lint` | zero problems |
| `npx vitest run` | 467 passed (37 files) |
| `npm run build` | compiled clean |
| `npm run test:e2e -- --workers=2` | 25 passed |

## Live-verification findings

Driven headed against the real local Supabase stack, eight players in the
lobby, at three viewport sizes. Screenshots and measured values, not
impressions.

**1920×1080 (spec §11.2 step 2)**

- READ/ANSWER framing is visibly a wide: the world fills the backdrop with the
  prompt laid over it, where the player view's `pack` shot is a tighter crop.
- The final-question push-in is **still moving 2.5s into the beat** — rig widths
  and the finish-post x differ measurably between a t+0.7s and a t+2.5s frame.
- The overtake callout ("ANA PASSES BO") is a **full-bleed strip on the
  horizon** with its accent bar at the screen edge, breaking out of the 5%
  title-safe inset as designed.
- Callout hold, measured mount-to-unmount on both surfaces simultaneously:
  **stage `variant="strip"` 1951–2462ms vs player `variant="card"`
  1344–1400ms** (targets 2200 and 1200 plus detection overhead).
- The reveal fills columns with **no answer changing position** — asserted in
  e2e, and visible in the frames.
- At the ceremony the canvas is **1075×1080** (full height, 56% width) with the
  board at x=1171; the winner's rig is **not clipped**.

**2560×1080 and 3440×1440 (step 3)**

- An eight-way tie stack is **fully on canvas at both**. Topmost head lands
  ~90px from the top at 2560×1080 and ~203px at 3440×1440. CURRENT.md recorded
  screen y −227.8 and −314.3 respectively before this phase.
- Ceremony canvas 1434×1080 and 1926×1440, both full height; winner unclipped.

**Player ceremony, 1920×1080 (step 4)**

- The player surface still retreats to 50vh, and the winner's podium rig is
  **unclipped** — the defect CURRENT.md has tracked since P5a, re-confirmed in
  P5b and again in P6a, is fixed. This is the surface the podium vertical fit
  exists for; the stage's horizontal split removes the stage's own worst case
  but not this one.

**Late-mount confetti under a reduced profile (step 5)**

- A stage view opened ~30s into an already-settled ceremony, with
  `cb:settings:profile = reduced` set before first mount, shows **zero confetti
  particles** (`allowanceFor('minimal').confetti === 0`). Before the seed the
  budget started `full` and a one-shot burst had no chance to self-correct.
  `data-entered` read `"true"` immediately, no replayed entrance.

**Eight-player lobby (step 6)**

- Four columns at full 90-unit spacing; adjacent same-row rigs **touch and do
  not overlap**. Previously 51 units, overlapping by about a third of a rim.

## Known and accepted (not P6b defects)

- **The twenty-player grid still compresses to 30 units.** A fixed run-off
  cannot hold ten columns at a full rig width. The `TRACK_MARGIN` debt entry is
  **narrowed, not retired**, and `tests/geometry.test.ts` asserts the 30 so it
  cannot regress silently.
- **Inside `[data-surface="stage"]`, `p-8` does not mean what it means
  elsewhere.** That is ADR-0035's stated cost, and `app/globals.css` says so at
  the block. Anyone editing a shared component needs to know.
- **The stage prompt overlaps the pack when the field is centred.** That is the
  intended relationship on this surface — the world is the backdrop and the
  question is laid over it (spec §5) — not a layout bug.
- **The option columns read as four large mostly-empty boxes during ANSWER.**
  That is the reserved height ADR-0019 requires; the distribution grows into it
  at the reveal.
- **`e2e/stage.spec.ts` remains sensitive to machine load** in the documented
  way — see CURRENT.md's note on worker count.

## Carried forward

- The off-screen marker still carries no direction (P2 debt, untouched — it
  changes a pure module's return type and every caller).
- `lib/useHostDriver.ts`'s intermittent `advance_phase` 400 was not seen again
  across roughly fifteen headed playthroughs run during this phase's
  verification.

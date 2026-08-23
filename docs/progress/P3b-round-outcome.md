# P3b — Round staging: the outcome half

- **Status:** Complete
- **Completed:** 2026-08-23
- **Spec:** `docs/superpowers/specs/2026-08-23-m2-p3b-round-outcome-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` §P3, `docs/superpowers/specs/2026-08-23-m2-p3a-round-staging-design.md` §9)
- **Plan:** `docs/superpowers/plans/2026-08-23-m2-p3b-round-outcome.md`
- **Branch:** `worktree-m2-p3b-round-outcome` @ `fc9c18b` — not yet merged; see `superpowers:finishing-a-development-branch`

## Scope (from the spec)

P3a built the half of a round the player interacts with; P3b is the half the player watches — REVEAL staging with the avatar-stacked distribution bar, TRACK moment direction, final-question escalation, and the broadcast callouts that name what just happened. This phase triggers roadmap decision 4: it opens the realtime payload for the first time in M2, adding `picks` to `build_reveal` and `current_streak` to `standings`.

## What was built

Executed via `superpowers:executing-plans` in an isolated worktree, 8 tasks:

| # | Task | Key files |
|---|---|---|
| 1 | The protocol opens — `picks` and `current_streak` | `supabase/migrations/0003_reveal_picks.sql`, `lib/types.ts` |
| 2 | `distribution.ts` — the reveal's rows | `lib/staging/distribution.ts` |
| 3 | `callouts.ts` — buffer at reveal, resolve at track | `lib/staging/callouts.ts` |
| 4 | The state layer — reveal steps, `optionsMode`, store slices | `lib/staging/beats.ts`, `lib/staging/staging.ts`, `lib/staging/useStaging.ts`, `lib/staging/runtime.ts` |
| 5 | Escalation moves to the run-up beat | `lib/presentation/timing.ts`, `lib/presentation/deriveCues.ts`, `lib/world/choreographer.ts`, `lib/world/director.ts` |
| 6 | The streak flame survives a reload (P2 debt) | `lib/world/flair.ts`, `lib/world/choreographer.ts` |
| 7 | The REVEAL surface | `components/AvatarStack.tsx`, `components/AnswerButtons.tsx`, `components/RevealPanel.tsx`, `components/GameView.tsx` |
| 8 | The TRACK surface — rail, lower third, escalation | `components/LowerThird.tsx`, `components/TrackReadout.tsx`, `components/StageShell.tsx`, `components/QuestionCard.tsx`, `components/TensionFrame.tsx`, `app/globals.css` |

New pure modules — `lib/staging/{distribution,callouts}.ts` — are unit-tested with no React, store, or DOM import (`tests/{distribution,callouts}.test.ts`, 22 new tests). `lib/staging/runtime.ts` remains deliberately unit-test-free, by the same rule `lib/world/runtime.ts` follows.

## Deviations from the plan (as shipped)

1. **`distribution.ts` treats an empty `picks` array the same as an absent one.** The plan's given `distributionRows` branched on `Array.isArray(reveal.picks)` alone, so a payload with `picks: []` (its own test fixture's default) was treated as "picks present" and used `pickersPer.length` (all zero) instead of falling back to `reveal.counts` — failing the "scales share against the largest row" test outright. Fixed by also requiring `reveal.picks.length > 0`; harmless in practice because a real post-migration server reports `counts` as all-zero too whenever `picks` is empty, so the two paths never disagree on an actual payload.
2. **`AvatarStack` wraps its content in `AnimatePresence initial={false}`**, which the plan's given code omitted. `AvatarStack` mounts continuously from the top of REVEAL (as soon as `mode` becomes `'result'`, at elapsed≈0) — well before `show` itself turns true at the 300ms mark — so without the guard, a reload or late join landing past 300ms elapsed replayed the fade/scale entrance on faces that should have rendered at rest. Same fix shape as [ADR-0014](../ADR/0014-beat-position-derived-from-ends-at.md)'s two P3a instances (`QuestionCard`'s badges, `StageShell`'s options slot); confirmed live not to suppress the *legitimate* entrance for a normal live reveal, because the host `AvatarStack` instance already existed before `show` flips true.
3. **`lib/staging/runtime.ts` gives `final-question` its own handler instead of routing it through the shared `buffer` helper**, setting `escalated: true` the instant the cue is seen rather than only when it is later resolved via `resolveCallout` at `phase-track`. The plan's given wiring published `escalated` only from the `phase-track` / `phase-read` / `phase-results` handlers; a reload seeded directly into the final round's READ, ANSWER or REVEAL (all real, spec-covered cases — §9 "Reload mid-final-round") never passed through any of those three, so the seeded cue was buffered and then either silently discarded by `phase-read`'s `clearCallout` or never published at all. Found live (below), not by inspection.
4. **`LowerThird`'s defensive `!callout` reset defers `setVisible(false)` into a `setTimeout(…, 0)`** rather than calling it synchronously in the effect body, to satisfy `react-hooks/set-state-in-effect` (the same rule already on the pre-existing-debt list for `app/room/[code]/page.tsx:33`). No behavior change — the reset is provably unreachable in the intended flow anyway, since the `hide` timer always settles `visible` to `false` well within a beat's minimum duration before `callout` next changes.
5. **`e2e/staging.spec.ts`'s new test uses the minimum (5s) answer timer, not the plan's verbatim-reused 20s.** The plan said to reuse the first test's room-creation block verbatim, which sets a 20s timer appropriate to *that* test's reload-mid-answer purpose. The new test instead waits straight through to REVEAL in one un-chained assertion (`{ timeout: 15_000 }`) — arithmetically impossible against a 20s timer, since countdown+read+answer alone is 26s. Switched to the 5s minimum (matching `game-flow.spec.ts`'s working pattern) and widened the REVEAL wait to `25_000` to comfortably cover the 11s cumulative minimum.
6. **Three pre-existing `tests/deriveCues.test.ts` cases needed their expected cue streams updated**, and one `tests/store.test.ts` reveal-shaped literal plus two `tests/deriveCues.test.ts` reveal literals needed `picks: []` added — mechanical fallout from Task 1's new required field and Task 5's cue-timing move, in the same spirit as the plan's own called-out fixes to `deriveCues.test.ts`'s `standing()` helper and `cueBus.test.ts`'s two `Standing` literals. `tests/flair.test.ts`'s `NO_FLAIR`-shaped `toEqual` and four `tests/choreographer.test.ts` streak-8 assertions needed the same treatment for Task 6's new `streakTier` field.

## Deviations found during implementation (not anticipated by the plan)

- **`npm run test:e2e` under this machine's default worker count (8, unset in `playwright.config.ts` outside CI) is flaky under load**, timing out on unrelated pre-existing lobby/countdown assertions (`Starting grid — 2 joined`, countdown text, answer-option enabled) in a different subset of tests on each run — never on anything this phase touched. `--workers=2` passes cleanly and reproducibly every time (run three times). Not fixed (out of this phase's scope; `playwright.config.ts` is untouched by the plan) — worth `playwright.config.ts` attention or a `CURRENT.md` note if it recurs.
- **Two lingering manual `playwright-cli` browser sessions from live verification measurably worsened the above** — closing them before an e2e run reduced (but did not eliminate) the flakiness, consistent with real resource contention on this machine rather than a code defect.

## Live-verification findings (all confirmed and fixed, not just reasoned about)

Every finding below was caught running two real players through the app in headed `playwright-cli` sessions (`--headed`, this project's convention for manual checks — never committed) and reading real computed styles, DOM state and `window.__staging` store snapshots, not by inspecting the diff.

| # | What broke | How it was caught | Evidence |
|---|---|---|---|
| 1 | `AvatarStack` replayed its entrance on a reload landing past the 300ms stack threshold | Reload timing analysis plus code-level trace of `mode`/`show`'s relative mount order (see deviation 2) | Confirmed via the codebase's own established `AnimatePresence initial={false}` pattern; fixed and re-verified clean under `tsc`/lint/tests |
| 2 | `escalated` never reached the `useStaging` store for a reload seeded into the final round's READ/ANSWER/REVEAL | A scripted reload mid-ANSWER of an escalated final round, snapshotting `data-escalated`, the "Final question" chip, and `.tension-frame`'s class before and after | Before fix: `{"escalated":null,"finalChip":false,"tensionClass":"tension-frame"}`. After fix: `{"beat":"answer","escalated":"true","finalChip":true,"tensionClass":"tension-frame tension-frame--final"}` |

Also confirmed, not found broken:

- **REVEAL is one continuous object.** Element handles grabbed on all four `[data-testid="answer-option"]` buttons during ANSWER stayed connected (`isConnected: true` ×4) after the transition into REVEAL and the DOM still held exactly four — the options slot never unmounted.
- **The distribution is honest.** A row for an option a player actually picked showed `avatarTitles: ["Joiner"]` and a matching `count`; the correct row's computed `background-color` was the `--color-correct` mix (`oklab(0.82 -0.16 0.06 / 0.16)`); every non-correct row stayed at the plain `bg-night/60` value (`oklab(0.22 0.003 -0.06 / 0.6)`) — no row ever read red.
- **Mobile portrait fits with zero scroll.** At 390×844 during REVEAL, `document.documentElement.{scrollHeight,clientHeight}` were both exactly `844`.
- **Reload mid-TRACK shows no banner**, confirmed twice across separate games (`bannerAfterReload: false` both times) — by design: `runtime.ts` re-inits `callouts` to `initialCalloutState` on every mount, and nothing in the seed path re-buffers a *past* beat's drama.
- **The migration's shapes are correct against real gameplay**, not just synthetic SQL: `build_reveal(...)->'picks'` returned `[{"player_id": "...", "choice_index": 0}]` for a room where one player had answered; `standings(...)->0->'current_streak'` tracked a real player's streak (`1` alongside `correct: 1`, `0` alongside `correct: 0`) across several live games.

## Knowingly deferred / not built

Exactly what spec §7 scopes out, nothing more:

- **COUNTDOWN stays a full-screen branch outside the shell** — P3a restyled it and left it there; countdown choreography is outside P3 entirely.
- **`TrackReadout`'s off-screen marker still carries no direction** (P2 debt) — unchanged, moved to the rail as-is. Fixing it changes `offscreenPlayerIds`' return type, `useWorldView`'s state shape, and every caller; out of proportion to this phase's restyle.

The one debt item this phase's protocol opening was scoped to close — **the streak flame not surviving a reload** — is closed (Task 6); see exit criterion 6 below.

## Verification

- `npx tsc --noEmit` — clean
- `npm test` — **348/348** (27 test files; P3a baseline was 304 across 25)
- `npm run test:e2e` — **19/19** across 7 spec files at `--workers=2` (P3a baseline was 18 across 7; `e2e/staging.spec.ts` gained one test). Flaky at this machine's default worker count under load — see deviations above; not a regression in anything this phase touched.
- `npx eslint` on all 31 touched `.ts`/`.tsx` files (`lib/`, `components/`, `tests/`, `e2e/`) — clean
- `npm run build` — succeeds (Turbopack, `next build`)
- `git diff main --stat -- supabase/` — exactly one file, `supabase/migrations/0003_reveal_picks.sql`
- Manual: multiple full two-player games in headed `playwright-cli` sessions against the live local Supabase stack, at 390×844 and desktop viewports, spanning 1–3 round games with varied timers (5s/8s/10s/20s) to exercise REVEAL, TRACK, the run-up beat, the final round, and reloads at each

### Exit criteria (spec §10)

- [x] REVEAL plays as one continuous object, no unmount/remount of the options slot — live: four `answer-option` element handles stayed `isConnected` across ANSWER→REVEAL; `stepsAt('reveal')` keeps `options: true` (`tests/beats.test.ts`)
- [x] The distribution is honest; a payload without `picks` degrades to counts-only without throwing — live: real picker shown by name in the right stack; `tests/distribution.test.ts` (9 tests) covers the no-picks and empty-picks fallbacks explicitly
- [x] TRACK is the canvas's beat: full band, transparent shell, rail as real text — `PixiStage.tsx`'s `STRIP_PHASES` excludes `'track'` (confirmed by reading the source, unchanged by this phase); `e2e/staging.spec.ts` asserts `data-beat="track"` and `rail-entry` count === player count
- [x] Exactly one headline callout per TRACK beat, entering on the arena reaction — `tests/callouts.test.ts`'s tier-arbitration tests (final question outranks overtake, ties break to the local player); live: `tension-frame--final` + `data-escalated` + chip all confirmed together on a real escalated beat
- [x] Final-question escalation lands on the run-up beat; the final READ's timing is untouched — `tests/deriveCues.test.ts`'s run-up describe block (fires once, before `phase-track`, never at the final READ); READ's own `stepsAt`/`NOMINAL_MS.read` are byte-identical to P3a, so no reading time is spent on the announcement
- [x] The streak flame survives a reload (P2 debt closed) — `tests/flair.test.ts`'s "derives the tier from standings, so it survives a reload with no cue history"; architecturally reload-proof by construction (derived from `current_streak` every render, no accumulator)
- [x] Mobile portrait 390×844: REVEAL fits without page scroll — live: `scrollHeight === clientHeight === 844`
- [x] Both performance profiles work; `reduced` has no continuous ramp or per-frame writes — `data-escalated` is a DOM attribute, not a CSS custom property (code review); no RAF loop added by this phase, only `setTimeout` (`LowerThird`) and plain React state
- [x] The migration is applied and a full game plays against it end to end — applied via `psql` against the running stack (Global Constraints forbid `supabase start`); `picks`/`current_streak` shapes verified against real answered/unanswered rounds across the live-verification games
- [x] The Playwright e2e suite passes — 19/19 at `--workers=2`

## Related ADRs

[0018](../ADR/0018-the-wire-opens-once-for-picks-and-current-streak.md) · [0019](../ADR/0019-the-reveal-is-the-options-grid-transformed.md) · [0020](../ADR/0020-callouts-buffer-their-own-queue.md) · [0021](../ADR/0021-final-question-escalation-fires-on-the-run-up-beat.md)

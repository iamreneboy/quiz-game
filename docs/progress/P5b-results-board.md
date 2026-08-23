# P5b — Results board

- **Status:** Implementation complete; all eight exit criteria met and live-verified
- **Completed:** 2026-08-24
- **Spec:** `docs/superpowers/specs/2026-08-23-m2-p5b-results-board-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md`)
- **Plan:** `docs/superpowers/plans/2026-08-24-m2-p5b-results-board.md`
- **Branch:** `worktree-m2-p5b-results-board` — isolated git worktree at `.claude/worktrees/m2-p5b-results-board`
- **Method:** `superpowers:executing-plans`, live browser verification throughout via headed `playwright-cli` against the real local Supabase stack

## Scope (from the spec)

P5b replaces M1's unstyled results table with a winner card and a full results board in the design language, carrying the two stat fields migration 0004 added (`answered`, `avg_answer_ms`) as accuracy and average answer time. The board enters after the ceremony's `board` beat (6s in) but is readable in the accessibility tree from the ceremony's first frame — the readability counterpart to P3a's "staging never gates input" (ADR-0016). No wire change, no new store, no canvas change.

## What was built

5 tasks, executed sequentially with a full test/typecheck pass after each and a commit per task:

| # | Task | Key files |
|---|---|---|
| 1 | Derived result stats | `lib/results/stats.ts`, `tests/resultStats.test.ts` |
| 2 | The results table | `components/ResultsTable.tsx`, `components/ResultsView.tsx` |
| 3 | The winner card and the exit | `components/WinnerCard.tsx`, `components/ResultsView.tsx` |
| 4 | End-to-end coverage | `e2e/game-flow.spec.ts` |
| 5 | Verify the phase and record the decision | `docs/ADR/0030`, this file, `docs/progress/CURRENT.md` |

`lib/results/stats.ts` is pure and unit-tested with no React, store or DOM import (`tests/resultStats.test.ts` — 11 tests). `ResultsTable` and `WinnerCard` are both unconditionally rendered and staged with `opacity` alone via `motion` variants (ADR-0030), matching the idiom `components/AvatarStack.tsx` already established. `ResultsView` is the shell: it reads `--ceremony-band` for its top spacer (published by `components/PixiStage.tsx`, ADR-0015) and `useCeremony`'s `steps.board` for staging, computing a one-shot `settled` flag alongside.

## Deviations from the plan (as shipped)

**One deviation, anticipated and flagged in the plan itself before implementation — confirmed correct by direct source reading, not just executed as written.** The plan's own Self-Review states that spec §6 claims "a reload past the ceremony lands with `steps.board` already true... no replay," and that this is not what `lib/ceremony/runtime.ts` actually does: it publishes from a `requestAnimationFrame` tick started in a `useEffect`, so `useCeremony`'s store holds `NO_CEREMONY` on first render regardless of how far in the past `ends_at` is, and `board` only flips true a frame later. Before writing any component code, `lib/ceremony/runtime.ts` was read directly to confirm this claim rather than taking the plan's word for it — the store literally initializes to `NO_CEREMONY` (`lib/ceremony/useCeremony.ts:21`) and `startCeremonyRuntime` calls `requestAnimationFrame(tick)` once at the end of its body, so the first `publish` cannot land before React's first paint. The claim held exactly as stated. Because nothing in `ResultsTable` or `WinnerCard` mounts conditionally, the established fix for this replay trap (`AnimatePresence initial={false}`, used three times already: P3a's `QuestionCard` badges, P3a's `StageShell` options slot, P3b's `AvatarStack`) has no conditional mount to attach to. The fix implemented instead is the `settled` one-shot in `ResultsView` (Task 2 Step 3): a lazy `useState` initializer that re-derives "is the board beat already over" from the same `ends_at`, the same `elapsedIn`, and the same `BOARD_AT` constant the runtime itself uses — read once, never updated, so it cannot desync from the runtime's own eventual answer. Argued fully in [ADR-0030](../ADR/0030-the-results-board-is-present-before-it-is-visible.md).

**One small, unplanned fix, done at explicit request before the final commit.** `vitest.config.ts` used ESM `import`/`export` syntax loaded through Node's CommonJS path (no `"type": "module"` in `package.json`), which `vitest run` flagged on every invocation: *"Your Vite config uses features that are unsupported by `configLoader: 'native'`... ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)."* Confirmed pre-existing — present in the very first baseline `npm test` run at the start of this session, before any P5b code was touched. Fixed by renaming to `vitest.config.mts` (native ESM, Vitest's documented config extension) and replacing the CommonJS-only `__dirname` with `import.meta.dirname` (Node ≥20.11; the installed runtime is v24.16.0). `npm test` (429 tests) and `npx tsc --noEmit` both pass clean afterward, with the alias resolution (`@/lib/...`) unaffected. Scoped as its own commit, separate from P5b's feature work, since it is unrelated tooling hygiene rather than part of the results-board build.

## Deviations from the spec the plan itself already made (executed as planned, recorded here per Task 5's own instruction)

- **The winner card omits an unknown stat rather than printing a dash.** A one-line summary reading "9/12 correct · — · — avg" was judged worse than one reading "9/12 correct" — the grid of dashes belongs in the table, where the column header says what the dash is a dash *for*. Implemented in `WinnerCard.tsx` via `{accuracy !== null && <> · {formatAccuracy(accuracy)}</>}` (and the equivalent for the average), not `formatAccuracy(accuracy)` unconditionally. Confirmed live against the pre-0004 schema check below: the winner card read exactly `"1/1 correct"` with neither suffix clause present.
- **The rank column header reads "Rank," not the spec sketch's `#`.** Spec §7's "spelled out, never abbreviated" rule was followed over §5's ASCII sketch, matching the same treatment given to Accuracy/Avg time/Best streak.

## Deviations found during implementation (not anticipated by the plan)

None. The plan's interfaces (`resultStats`, `formatAccuracy`, `formatAvg`, `NO_VALUE`, the `{ show, instant }` prop pair, all `data-testid` hooks) were consumed exactly as specified with no adjustment needed across Tasks 2–4.

## Live-verification findings

Every task's DOM-visible and accessibility-tree behavior was checked in a **headed** `playwright-cli` session against the real local Supabase stack — never headless Chromium, which `CURRENT.md` already documents as unusable for anything frame- or timing-sensitive on this canvas. Manual round-trip latency between CLI commands (observed at roughly 3–8s per command, sometimes more) made hand-timing the ceremony's 6-second pre-board window unreliable directly; the same technique P5a's verification used was reused here — re-arming a room's `phase_ends_at` via direct `docker exec psql` between checks — including one deliberately oversized re-arm (`+30s`, against a 9s ceremony) that clamps `elapsedIn` to exactly 0, turning a race into a 20-second window with zero timing risk.

Three rooms carried the manual pass: `FDYZY` (2 players, general staging/focus/reload checks), `RCKVX` (3 players — `Hosty` and `Speedy` answered the single Warm-Up question, `Ghost` joined and never answered, giving one row of each kind in the same board), and `JCXBX` (2 players — `B` and a 20-character `ReallyLongNicknameOK`, the join form's actual maximum, for the truncation check).

| # | What was exercised | How | Result |
|---|---|---|---|
| 1 | Pre-board accessibility + focus (spec decision 1, decision 5; exit criterion 5) | `RCKVX` re-armed to `phase_ends_at = now() + 30s` (clamps ceremony elapsed to 0), reloaded, then a single atomic `run-code` call read `results-board`'s `data-entered`, counted `results-row` elements, and focused the "Back to home" link | `{"entered":"false","rowCount":3}`, and `exit.evaluate(el => el === document.activeElement)` returned `true` — the full field and the exit are both present and usable while the board is still invisible |
| 2 | Board entrance (exit criterion 1) | Same room, `run-code` polled `data-entered` a few seconds later | Flipped to `"true"`; a screenshot at that point showed the podium's spotlight already active (elapsed had reached ~4s by then) with the winner card and table still fully opaque underneath, i.e. the same frame model P5a's own ceremony already established |
| 3 | Mixed accuracy/dash (exit criterion 2) | `RCKVX` settled screenshot + `innerText()` on each `results-row` | `Hosty`: `1 · 100% · 8.3s · 1`; `Speedy`: `1 · 100% · 9.8s · 1`; `Ghost`: `0 · — (not answered) · — (not answered) · 0`. Winner card read `"1/1 correct · 100% · 8.3s avg"` |
| 4 | Pre-0004 degradation (exit criterion 3) | `docker exec -i supabase_db_quiz-game psql -U postgres -d postgres < supabase/migrations/0003_reveal_picks.sql`, reload `RCKVX` (no replay needed — `standings()` is computed live from `players`/`answers`, not cached) | `Hosty`'s row — a player who genuinely answered and scored 1/1 — read `1 · — · — · 1`: correct survives, accuracy and average both degrade, by the same `answered ?? 0` path a never-submitted player takes. Winner card read `"1/1 correct"` with neither `· accuracy` nor `· avg` clause. Restored via `0004_ceremony.sql`; reload brought back the exact `100% · 8.3s` / `100% · 9.8s` / `— · —` figures from check 3, unchanged |
| 5 | Narrow portrait (exit criterion 4) | `JCXBX` (players `B` and `ReallyLongNicknameOK`, the join form's 20-char max) resized to 360×740; `document.documentElement.scrollWidth` vs `clientWidth` read via `run-code` | `{"scrollWidth":360,"clientWidth":360}` — no horizontal overflow. Screenshot confirmed accuracy/avg/streak collapsed under the nickname (`Rank`/`Player`/`Correct` only as columns) and `ReallyLongNicknameOK` rendered as `ReallyLongNick…` (truncated); the same name rendered in full, untruncated, at 1280px width |
| 6 | Reduced-motion profile (exit criterion 6) | `RCKVX`, settings popover → Motion → "Reduced motion", then re-armed deadline in the past and reloaded | `document.documentElement.dataset.profile === "reduced"` confirmed; board read `{"entered":"true","rowCount":3}` — fully present. The `motion` library's own console advisory ("You have Reduced Motion enabled...") fired, same benign notice already seen in `e2e/settings.spec.ts`'s reduced-motion runs; not a defect |
| 7 | Reload-settle, no replay (exit criterion 7) | Multiple reloads of `RCKVX` and `FDYZY` against a `phase_ends_at` minutes in the past; `data-entered` read immediately post-reload, and two screenshots taken back-to-back | `data-entered` read `"true"` on the very first post-reload check every time (never observed transitioning from `"false"`); the two back-to-back screenshots were pixel-identical — winner card and table both at full opacity in both, no visible fade |
| 8 | Full suite (exit criterion 8) | `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:e2e -- --workers=2` — run once before the manual pass and once after, bracketing the migration revert/restore | 429/429 unit tests; `tsc` silent; lint reports only the one known pre-existing `app/room/[code]/page.tsx:40` error; `next build` compiles clean with no warnings; 21/21 e2e both times |

## Podium clipping (`CURRENT.md` tech debt, carried from P5a)

Re-checked per Task 5 Step 3's instruction: **the clipping still reproduces, unchanged.** Every settled screenshot taken during this phase's verification shows the winner's rig cropped at the top of the 50vh canvas — visible in `RCKVX`'s screenshots (the mug-avatar winner's handle and upper body cut off by the frame edge) exactly as P5a's progress doc first measured it (`screen y ≈ −80` on a 1280×360 canvas). Nothing in P5b touches `lib/world/framing.ts` or the band retreat's timing, so no regression and no improvement was expected or found.

**Judgement on whether the retreat is still worth its price, now that the board it makes room for is real:** yes, more clearly than before. In P5a the retreat was reserving space for a board that did not exist yet; the cost (a cropped winner rig) was being paid against a hypothetical benefit. With the board now built — a headline card plus a full, accessible, six-column table, both confirmed working end to end above — the retreat is paying for something concrete and load-bearing, not a placeholder. The clipping remains a real, unaddressed visual defect and should still be fixed as its own scoped task (per P5a's finding, the honest fix is vertical-headroom reasoning in the podium camera shot or a change to when the retreat happens, both real design decisions), but nothing observed during this phase suggests the retreat itself should be reconsidered or reverted.

## `reduced` profile and `MotionConfig` (for Task 5 Step 6's record)

`components/MotionProvider.tsx` sets `reducedMotion={profile === 'reduced' ? 'always' : 'never'}` on `MotionConfig`. This is the mechanism `ResultsTable.tsx`'s row lift (`y: 8 → 0`) relies on being suppressed without the component doing anything about it — confirmed live in check 6 above: with the profile switched to `reduced`, the board still reached `data-entered: true` with all three rows present, and (per `MotionConfig`'s documented behavior, which this project already depends on elsewhere) transforms are stripped globally while opacity is left alone, which is exactly what `ResultsTable`'s own `reduced` branch additionally assumes when it drops `delayChildren`/`staggerChildren` from the rows' shared transition — the two mechanisms are independent (one component-level, one provider-level) and both apply simultaneously under `reduced`.

## Verification

```
npm test                       → 34 test files, 429 tests passed
npx tsc --noEmit                → clean
npm run lint                    → 1 problem (the known pre-existing app/room/[code]/page.tsx:40 error only)
npm run build                   → compiled successfully, no warnings
npm run test:e2e -- --workers=2 → 21 passed
```

All eight exit criteria from the spec were live-verified with a headed browser; see the Live-verification findings table above.

# M2 P5b — Results board

| | |
|---|---|
| Status | Approved design — ready for implementation planning |
| Parent | `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` (P5), `docs/PRD.md` §8–§9 |
| Date | 2026-08-23 |
| Baseline | **P5a merged.** The ceremony plays on canvas, `--ceremony-band` publishes the band height, `useCeremony` publishes ceremony steps, and migration 0004 has put `answered` and `avg_answer_ms` on `Standing`. `ResultsView` is still M1's unstyled table (`components/ResultsView.tsx`), wrapped by P5a in the band spacer. |
| Sibling | **P5a — Podium ceremony** (`2026-08-23-m2-p5a-podium-ceremony-design.md`). P5a is the canvas half and lands first. |

## 1. Purpose

P5a makes the game *end* like a game show. P5b makes the record of it *read* like one: a winner card and a full results table in the design language, carrying the two stats the roadmap asked for and the wire did not previously have.

This is also the phase where the ceremony stops being decoration and becomes accountable to accessibility. The roadmap's exit criterion is explicit: "results remain fully readable/accessible in HTML."

## 2. Decisions

1. **The table is in the DOM from the first frame, at `opacity: 0`.** Not conditionally mounted. `opacity: 0` keeps content in the accessibility tree, unlike `display: none` or `visibility: hidden` — so a screen-reader user has the full results while a sighted user is still watching the podium rise.
2. **Staged opacity is a `motion` variant target, never a Tailwind class.** Inline animated styles outrank a class regardless of specificity; this project has already shipped that bug once ([ADR-0017](../../ADR/0017-answer-selection-is-form-not-hue.md)).
3. **Accuracy is `correct / answered`, and renders `—` when `answered` is 0.** A player who never submitted must not read as 0% — that is a judgement, not a fact.
4. **Narrow screens collapse, they do not scroll.** Below `sm`, accuracy and average time move to a secondary line under the nickname rather than into a horizontally scrolling table.
5. **The exit link is mounted and focusable throughout the ceremony**, applying [ADR-0016](../../ADR/0016-staging-never-gates-input.md)'s "staging never gates input" to the last screen.

## 3. Module layout

```
lib/results/
  stats.ts        # PURE, tested: Standing → { accuracy, avgSeconds } + formatting

components/
  ResultsView.tsx     # rewritten: band spacer, winner card, board
  WinnerCard.tsx      # the headline
  ResultsTable.tsx    # the full field
```

No new store, no new runtime. `useCeremony` (P5a) supplies `steps.board`; `useGameStore` supplies `standings` and `room`. `stats.ts` imports types only — no React, no store, no DOM.

## 4. Stats

```ts
// lib/results/stats.ts
export interface ResultStats {
  /** 0..1, or null when the player never submitted / the field is absent. */
  accuracy: number | null;
  /** Seconds, or null on the same conditions. */
  avgSeconds: number | null;
}

export function resultStats(standing: Standing): ResultStats;
export function formatAccuracy(accuracy: number | null): string;  // "90%" | "—"
export function formatAvg(avgSeconds: number | null): string;      // "4.2s" | "—"
```

Both fields are optional on `Standing` (P5a §3.2) because a pre-0004 database omits them. `resultStats` returns `null` for an absent field exactly as it does for `answered === 0`, so the fallback and the honest-unknown case take one code path and render identically. That is the degrade shape [ADR-0018](../../ADR/0018-the-wire-opens-once-for-picks-and-current-streak.md) asks a protocol opening to leave behind.

Rounding: accuracy to whole percent, average to one decimal second. Both `tabular-nums`, as every number in this app already is.

## 5. Layout

```
┌────────────────────────────────────────┐
│                                        │  ← --ceremony-band spacer
│        (P5a's canvas: podium)          │    100vh → 50vh at steps.board
│                                        │
├────────────────────────────────────────┤
│   RACE COMPLETE                        │
│   🏆 Ada wins                          │  ← WinnerCard (Panel)
│   9/12 correct · 90% · 4.2s avg        │
├────────────────────────────────────────┤
│  #  Player   Correct Accuracy Avg time Streak │
│  🥇 Ada          9      90%     4.2s      5   │  ← ResultsTable (Panel)
│  🥈 Bo           8      73%     5.1s      4   │
│  🥉 Cy           8      67%     6.8s      3   │
│  4  Dee          5      45%     7.9s      2   │
├────────────────────────────────────────┤
│              Back to home              │
└────────────────────────────────────────┘
```

The top spacer reads `--ceremony-band` — the property P5a publishes — so the board and the podium cannot overlap and no second source of truth exists for the band height.

Both surfaces are `Panel` (`components/ui/Panel.tsx`), the glassmorphic primitive P0 created for exactly this reuse. The winner's nickname takes their accent colour, as today; medals are the existing `🥇🥈🥉`.

Below `sm`:

```
🥇 Ada                        9
   90% · 4.2s avg · 5 streak
```

The local player's row keeps a distinguishing treatment, as M1's already does (`ResultsView.tsx:40`) — restyled to the design system rather than `bg-slate-900`.

## 6. Staging and motion

The board enters after `steps.board` (P5a's `BOARD_AT`, 6000 ms into the ceremony):

- `WinnerCard` fades and lifts in first.
- `ResultsTable` rows stagger at `DURATION`-scale delays, `staggerChildren` in the P3a idiom.
- Everything runs on `EASE.settle` from `lib/presentation/tokens.ts`.

**Two lessons from `CURRENT.md` are load-bearing here, and both have bitten this project already:**

1. **Never a co-located opacity class.** Any state a `motion` component's own `variants` touch must be the variant's target value (decision 2, ADR-0017).
2. **`AnimatePresence initial={false}`.** Anything mounting conditionally off ceremony state replays its entrance on every reload otherwise. This would be the fourth occurrence of that exact shape — after P3a's `QuestionCard` badges, P3a's `StageShell` options slot, and P3b's `AvatarStack` — so it is checked by default here rather than found live. See [ADR-0014](../../ADR/0014-beat-position-derived-from-ends-at.md) for why the fix must stay one-shot.

Because the table is always mounted (decision 1), the conditional-mount trap applies to the *winner card's* entrance and the row stagger, not to the table's existence. A reload past the ceremony lands with `steps.board` already true and everything at its settled variant target — no replay.

**Reduced motion.** The `reduced` profile drops the stagger and the lift: rows appear together, opacity only. The board is information, and information is the last thing a motion preference should cost anyone.

## 7. Accessibility

- The table is a real `<table>` with `<caption>`, `<th scope="col">`, and `scope="row"` on the rank cell.
- The local player's row carries `aria-current="true"` in addition to its visual treatment.
- Medals are decorative: `aria-hidden` on the emoji, with the numeric rank as the row header's text so "1" is announced rather than "trophy".
- Header text is spelled out — "Accuracy", "Avg time", "Best streak" — never abbreviated to fit. If a column is too narrow for its full label, the collapse in decision 4 is the answer, not a shorter word.
- `—` cells carry an accessible label ("not answered") rather than announcing a dash.
- The exit link is reachable by keyboard from the first frame of the ceremony (decision 5).

## 8. Edge cases

- **A player who never answered a question.** `answered === 0` → accuracy and average both `—`; correct is `0`, which is a fact and renders as one.
- **Pre-0004 database.** Both columns render `—` for everyone. The table is otherwise complete. Same code path as the above by construction (§4).
- **A single-player game.** Winner card and a one-row table. No special case.
- **A 20-player field (PRD §13).** The board scrolls vertically, as any long table does. The winner card stays above it.
- **Tied players.** They render in the Fairness Law's order with distinct ranks; P5b introduces no tie display of its own, matching the podium's `slice(0, 3)` (P5a §6).
- **Reload after the ceremony.** `steps.board` is already true; everything is at its settled target. No replay (§6).
- **No WebGL.** The board is the whole screen and reads correctly; the spacer collapses because P5a's canvas never mounts.

## 9. Testing

**Vitest — `tests/resultStats.test.ts`**
1. Accuracy and average for a normal player.
2. `answered === 0` yields `null` for both, formatted as `—`.
3. Absent fields (pre-0004 shape) yield `null` for both, by the same path.
4. Rounding: whole percent, one decimal second.

**Playwright — extend `e2e/game-flow.spec.ts`**
5. A completed game shows the winner's nickname in the winner card.
6. The table renders all six columns and one row per playing player.
7. The exit link is focusable before the board has entered.

The existing suite is the regression floor and must pass at `--workers=2` (`CURRENT.md`).

**Manual**: a headed pass at narrow portrait, confirming the collapse reads and nothing scrolls horizontally.

## 10. Scope boundaries

Out of scope, deliberately:

- **Everything canvas.** The podium, spotlight, confetti, camera and band publication are P5a.
- **Rematch, awards, photo-finish, sudden death** — M3 (roadmap §3, PRD §12).
- **Per-round breakdowns or answer histories.** The board shows the game's totals.
- **Sharing, export, or permalinks** to a result.
- **Any further wire change.** The two fields migration 0004 added are the whole budget; anything else renders `—`.
- **`COUNTDOWN` choreography**, still the standing intentionally-skipped item from P2.

## 11. Exit criteria

1. A finished game shows a winner card and a full results table in the design language, entering after the ceremony's `board` beat.
2. Accuracy and average answer time render correctly, and render `—` — not `0%` — for a player who never submitted.
3. Against a pre-0004 database the board renders completely, with both new columns showing `—`.
4. Narrow portrait collapses the secondary stats under the nickname; the page never scrolls horizontally.
5. The full results are in the accessibility tree from the first frame of the ceremony, and the exit link is keyboard-reachable throughout.
6. The `reduced` profile drops the stagger and lift; the board still appears.
7. Reloading after the ceremony shows the settled board with no entrance replay.
8. `npm test` passes; `npm run test:e2e -- --workers=2` passes.

## 12. Expected ADRs

- **The results board is present before it is visible** — why the table mounts at `opacity: 0` from the first frame rather than at the `board` beat, what that buys for screen readers, and why it is the readability twin of ADR-0016's input rule.

Only one is expected. P5b's other significant choices are applications of decisions already recorded — ADR-0017 for the variant-target rule, ADR-0014 for the replay trap, ADR-0018 for the `—` degrade — and re-arguing them would dilute the originals rather than add to them.

# ADR-0030: The results board is present before it is visible

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P5b — Results board

## Context

The ceremony withholds the result for six seconds because withholding it is the point. But the roadmap's exit criterion for this phase is that results stay fully readable and accessible in HTML, and a screen-reader user gets nothing from a podium rising on a canvas. Mounting the board at the `board` beat would have made the two goals trade against each other; `display: none` and `visibility: hidden` would have done the same thing more quietly, since both remove content from the accessibility tree.

## Decision

The winner card and the results table are rendered from the results phase's first frame and staged with `opacity` alone — a `motion` variant target, never a Tailwind class (ADR-0017). Nothing about the board mounts conditionally.

## Consequences

- The full results are in the accessibility tree while the podium is still rising; the drama is a purely visual layer over content that was always there. This is the readability twin of ADR-0016's input rule, and the exit link's treatment (spec decision 5) is the same argument applied to focus. Confirmed live: with a room's `phase_ends_at` re-armed so the client landed at ~1s of ceremony elapsed, `results-board` read `data-entered="false"` while all three `results-row` elements and the "Back to home" link were simultaneously present and focusable in the DOM.
- Because nothing mounts conditionally, `AnimatePresence initial={false}` — the fix for the replay trap in P3a's `QuestionCard` badges, P3a's `StageShell` options slot and P3b's `AvatarStack` — has no purchase here. The trap still exists: `lib/ceremony/runtime.ts` publishes from a rAF tick started in an effect, so `steps.board` is false on the board's first render even after a reload into a long-finished ceremony. The fix is the one-shot `settled` derivation in `ResultsView`, which re-reads the same `ends_at` through the same `elapsedIn`/`BOARD_AT` the runtime uses. Any future component staged off `useCeremony` inherits this, and the answer depends on whether it mounts conditionally: `AnimatePresence initial={false}` if it does, a mount-time derivation if it does not.
- The board occupies layout below the band spacer for the whole ceremony, so the page is scrollable and focusable past the fold from the first frame. That is intended, not a side effect.
- What this forbids later: staging any part of the board with `display`, `visibility`, `hidden`, or conditional mounting, and putting an opacity class on any element the variants touch.

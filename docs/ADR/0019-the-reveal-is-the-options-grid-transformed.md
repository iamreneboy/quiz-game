# ADR-0019: The reveal is the options grid transformed, not a second widget

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P3b — Round staging: the outcome half

## Context

M1's `RevealPanel` was a second widget: its own correct-answer stamp, its own four-row distribution bar with its own bars and counts, rendered below wherever the (already-retired) answer buttons used to be. P3b adds a fastest-answer stamp, a fun fact, and now an avatar-stacked distribution — more content into the same portrait budget that P3a's spec was already built to protect (`docs/superpowers/specs/2026-08-23-m2-p3a-round-staging-design.md`). A second full-height widget stacked under a retired button grid does not fit; it would require the options to unmount, and REVEAL's four rows to independently reconstruct which option was which, in what order, with what accent.

The options grid the player just used to answer already has all four options in their answer-locked positions, index-stable, shape-and-accent-coded. Building REVEAL as a separate component throws that structure away and rebuilds it a few hundred milliseconds later — costing both layout budget and a visible discontinuity where the buttons the player was just looking at disappear and something else takes their place.

## Decision

The reveal is the same four buttons, transformed in place. `lib/staging/beats.ts`'s `stepsAt('reveal', …)` keeps `options: true` (previously it retired them) and introduces `optionsMode: 'result'` alongside `'dim'` (READ) and `'live'` (ANSWER). `components/AnswerButtons.tsx` reads `mode` and, in `'result'` mode, renders each button as a result row on the identical `motion.button` element: a `color-mix`'d share-fill bar behind the content, the correct row tinted with `--color-correct`, an `AvatarStack` of who picked it, the count, and a `correct` badge — with no red, no ✗, on any row (spec decision 2: everyone is shown, on every option; tone is carried by treatment, not omission). `components/RevealPanel.tsx` shrinks to only what the transformed grid cannot carry itself: the textual "Correct answer" confirmation, the fastest-answer stamp, and the fun fact.

Because the element identity does not change and `components/StageShell.tsx`'s options slot is already wrapped in `AnimatePresence` (P3a, [ADR-0014](0014-beat-position-derived-from-ends-at.md)), the ANSWER→REVEAL transition is a `motion` variant change on the same node, not an unmount/remount — confirmed live: element handles grabbed on all four `[data-testid="answer-option"]` buttons during ANSWER stayed `isConnected` after REVEAL began.

## Consequences

REVEAL's layout budget is one grid plus a caption, not two independent widgets — this is what makes stacks, the stamp and the fun fact fit inside ~72vh in portrait (spec §6). The buttons stay disabled throughout REVEAL by the same `disabled` expression that already covers every non-`'live'` mode, so staging still never gates input ([ADR-0016](0016-staging-never-gates-input.md)) by construction rather than by a new check. The cost: `AnswerButtons` now carries both a live-answering mode and a result-rendering mode in one component, so a future beat that needs yet another treatment of the same four options (there is no such beat currently planned) would grow a third `mode` branch here rather than a new component — an acceptable trade for the transform being the whole point of this decision.

# ADR-0026: The podium is a fourth anchor layout

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P5a — Podium ceremony

## Context

The ceremony needs the top three players standing on blocks of different heights, under a spotlight, with medals, the YOU ring, and the off-screen readout all still working. `lib/world/runtime.ts:81`'s `fieldAnchors()` already dispatches on phase between `gridAnchors`, `startLineAnchors` and `markerAnchors` — three ways of answering the same question, "where does everyone stand." A second Pixi scene for results would have duplicated the entire avatar pipeline (rigs, flair, medals, the movement grammar, the off-screen readout) for one beat of the game.

## Decision

Results adds a fourth branch: `podiumAnchors()` (`lib/world/podium.ts`), reusing the exact `MarkerAnchor` shape the other three layouts produce. `fieldAnchors` dispatches to it when `phase === 'results'`; everything downstream — `avatarStates`, `Avatars.apply`, `flairFor`, `offscreenPlayerIds` — runs unchanged, because none of it knows or cares which layout produced the anchors it was handed.

Two things this layout must get right that a naive port would not:

1. **`podiumX` is the finish line itself**, not out in the run-off the spec first proposed (`finish + TRACK_MARGIN * 0.45`). `TRACK_MARGIN` is only 260 world units and `camera.ts`'s `MIN_SPAN_SEGMENTS * SEGMENT_WIDTH` is 800, so `clampCamera` pins the camera's right edge at `metrics.maxX` — a podium placed deep in the run-off would be framed off the right of the canvas. Same root cause as the `TRACK_MARGIN` tech debt already in `CURRENT.md` (a P1 constant sized against content that no longer matches it); avoided here by not depending on the run-off at all, rather than inherited.
2. **`podiumAnchors` preserves each anchor's `row`, never forcing it to `0`.** `flairFor` computes `edgeHolder = contested && row === 0` (`lib/world/flair.ts:73`). Two podium players tied on `correct` share a `markerAnchors` segment with rows 0 and 1; forcing `row: 0` on both podium anchors would light the turbo flame on both instead of the one actually holding the edge. `segment` is preserved for the same reason — it is what `contested` counts occupants of.

## Consequences

**What this constrains for later ceremony work.** A photo-finish, an awards sequence, or any other M3 ceremony beat that needs the field standing somewhere non-standard is another anchor layout and another beat in `lib/ceremony/beats.ts`, never a new renderer. The avatar pipeline does not know how many layouts exist; it only ever sees `MarkerAnchor[]`.

**A load-bearing correction to the spec's own premise, found by reading the choreographer rather than assuming it.** Spec §6 and this phase's plan both claimed: "the existing movement grammar animates the lift... `avatarStates` already interpolates toward anchors." That is false outside an active choreographer `Sequence`. `avatarStates` (`lib/world/choreographer.ts:288-297`) only calls `sampleMovement` — the function that actually eases a position — when a `Sequence` exists for that beat; a `Sequence` is only ever constructed by `beginSequence`, which is only ever invoked on a `phase-track` cue (`lib/world/runtime.ts`). Outside a running sequence, `avatarStates` copies an anchor's raw `x`/`y` straight through with **zero interpolation**. Since the podium's bronze/silver/gold thresholds are elapsed-time boundaries inside the results phase — not cues — and nothing subscribes to `phase-results` to start a sequence, the anchors `podiumAnchors` was originally going to hand back would have made every block and its rig **pop** into place in a single frame, not rise.

The fix does not touch the choreographer at all. `lib/ceremony/beats.ts`'s `CeremonySteps.rise` is a **linear** 0..1 progress per place, computed purely from elapsed time (`riseAt`); `lib/world/podium.ts` applies `cubicBezierEase(EASE.settle, …)` — the same curve `lib/world/movement.ts` gives a travelling avatar — when it turns that progress into a world-space `y`. Because `podiumAnchors` is recomputed fresh every tick from the current elapsed time, the anchor's own `y` already glides smoothly frame to frame; `avatarStates`' "just copy the anchor through" behavior, which looked like the bug, is exactly what renders it correctly once the anchor itself is a continuous function of time instead of a step function. `PodiumBlock.riseProgress` (not a `risen` boolean) carries the same eased value into `lib/world/render/Podium.ts`, so the block and the rig standing on it read one shared number and cannot drift apart into two independently-timed animations.

This is the general technique for any **future time-driven (not cue-driven) anchor layout**: don't reach for a new choreographer sequence — make the anchor position itself a continuous function of elapsed time, eased where it is converted to world space, and the existing "dumb by contract" renderers (`Avatars`, and now `Podium`) render it correctly with no new choreography code, exactly as the spec wanted, just not for the reason the spec gave.
